from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

from anthropic import APIConnectionError as AnthropicAPIConnectionError
from anthropic import APIStatusError as AnthropicAPIStatusError
from anthropic import APITimeoutError as AnthropicAPITimeoutError
from anthropic import Anthropic
from fastapi import HTTPException, status
from google import genai
from google.genai import types as genai_types
from openai import APIConnectionError as OpenAIAPIConnectionError
from openai import APIError as OpenAIAPIError
from openai import APITimeoutError as OpenAIAPITimeoutError
from openai import OpenAI

from app.core.config import settings
from app.domain.models import AISystem, DataSensitivity, RiskTier

T = TypeVar("T")


def parse_json_payload(text: str) -> dict[str, Any] | None:
    candidate = text.strip()
    if not candidate:
        return None
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    first_brace = candidate.find("{")
    if first_brace < 0:
        return None
    depth = 0
    end_index = -1
    for idx in range(first_brace, len(candidate)):
        if candidate[idx] == "{":
            depth += 1
        elif candidate[idx] == "}":
            depth -= 1
            if depth == 0:
                end_index = idx
                break
    if end_index < 0:
        return None

    try:
        parsed = json.loads(candidate[first_brace : end_index + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def build_system_recommendation_fallback(system: AISystem, raw_text: str) -> dict[str, Any]:
    if system.data_sensitivity == DataSensitivity.high:
        policies = ["logging_required", "human_review_required", "pii_restrictions"]
    elif system.data_sensitivity == DataSensitivity.medium:
        policies = ["logging_required", "human_review_required"]
    else:
        policies = ["logging_required"]

    return {
        "suggested_model_type": str(system.model_type),
        "suggested_data_sensitivity": str(system.data_sensitivity),
        "suggested_risk_tier": str(system.risk_tier or RiskTier.tier2),
        "suggested_policies": policies,
        "rationale": (
            "Structured fallback generated because provider returned malformed JSON. "
            f"Original model output excerpt: {(raw_text[:300] + '...') if len(raw_text) > 300 else raw_text}"
        ),
        "clarifying_questions": [
            "Which user groups can access this system?",
            "What human review step is required before high-impact actions?",
            "What logging and retention controls are currently in place?",
        ],
    }


def provider_error_detail(prefix: str, exc: Exception) -> str:
    provider_error = str(exc).strip() or type(exc).__name__
    detail = prefix
    if settings.app_env.lower() in {"dev", "local", "development"}:
        detail = f"{detail}: {provider_error[:500]}"
    return detail


def is_retryable_transport_error(exc: Exception) -> bool:
    if isinstance(
        exc,
        (
            OpenAIAPITimeoutError,
            OpenAIAPIConnectionError,
            AnthropicAPITimeoutError,
            AnthropicAPIConnectionError,
        ),
    ):
        return True

    status_code = getattr(exc, "status_code", None)
    if status_code is None and isinstance(exc, OpenAIAPIError):
        status_code = getattr(exc, "status_code", None)
    if status_code is None and isinstance(exc, AnthropicAPIStatusError):
        status_code = exc.status_code

    if status_code in (408, 429, 500, 502, 503, 504):
        return True

    message = str(exc).lower()
    return any(
        token in message
        for token in ("timeout", "timed out", "429", "502", "503", "504", "connection error")
    )


def openai_client() -> OpenAI:
    return OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        timeout=settings.copilot_timeout_seconds,
        max_retries=0,
    )


def anthropic_client() -> Anthropic:
    return Anthropic(
        api_key=settings.claude_api_key,
        timeout=settings.copilot_timeout_seconds,
        max_retries=0,
    )


def gemini_client() -> genai.Client:
    timeout_ms = int(settings.copilot_timeout_seconds * 1000)
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=genai_types.HttpOptions(timeout=timeout_ms),
    )


@dataclass
class _CircuitState:
    consecutive_failures: int = 0
    open_until: float = 0.0


@dataclass
class ProviderCircuitBreaker:
    failure_threshold: int = 5
    recovery_seconds: int = 300
    _states: dict[str, _CircuitState] = field(default_factory=dict)

    def _state(self, provider: str) -> _CircuitState:
        if provider not in self._states:
            self._states[provider] = _CircuitState()
        return self._states[provider]

    def is_open(self, provider: str, *, now: float | None = None) -> bool:
        state = self._state(provider)
        current = now if now is not None else time.monotonic()
        if state.open_until and current < state.open_until:
            return True
        if state.open_until and current >= state.open_until:
            state.open_until = 0.0
            state.consecutive_failures = 0
        return False

    def assert_closed(self, provider: str) -> None:
        if self.is_open(provider):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Copilot provider '{provider}' temporarily unavailable (circuit open)",
            )

    def record_success(self, provider: str) -> None:
        state = self._state(provider)
        state.consecutive_failures = 0
        state.open_until = 0.0

    def record_failure(self, provider: str) -> None:
        state = self._state(provider)
        state.consecutive_failures += 1
        if state.consecutive_failures >= settings.copilot_circuit_failure_threshold:
            state.open_until = time.monotonic() + settings.copilot_circuit_recovery_seconds

    def reset(self) -> None:
        self._states.clear()


provider_circuit = ProviderCircuitBreaker()


def with_transport_retries(provider: str, operation: Callable[[], T]) -> T:
    """Run a provider HTTP call with bounded retries on transient failures."""
    attempts = max(1, settings.copilot_transport_retries + 1)
    last_exc: Exception | None = None

    for attempt in range(attempts):
        try:
            result = operation()
            provider_circuit.record_success(provider)
            return result
        except HTTPException:
            raise
        except Exception as exc:
            last_exc = exc
            if not is_retryable_transport_error(exc) or attempt >= attempts - 1:
                break
            delay = settings.copilot_retry_backoff_seconds * (2**attempt)
            time.sleep(delay)

    provider_circuit.record_failure(provider)
    if isinstance(last_exc, AnthropicAPIStatusError):
        code = status.HTTP_503_SERVICE_UNAVAILABLE if last_exc.status_code == 503 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(
            status_code=code,
            detail=provider_error_detail(f"{provider} API call failed", last_exc),
        ) from last_exc
    if isinstance(last_exc, OpenAIAPIError):
        code = status.HTTP_503_SERVICE_UNAVAILABLE if getattr(last_exc, "status_code", None) == 503 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(
            status_code=code,
            detail=provider_error_detail(f"{provider} API call failed", last_exc),
        ) from last_exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=provider_error_detail(f"{provider} API call failed", last_exc or RuntimeError("unknown")),
    ) from last_exc
