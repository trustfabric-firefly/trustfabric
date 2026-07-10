from __future__ import annotations

import time
from unittest.mock import patch

import pytest
from anthropic import APIStatusError
from fastapi import HTTPException, status

from app.core.config import settings
from app.services import copilot
from app.services.llm_resilience import (
    ProviderCircuitBreaker,
    build_system_recommendation_fallback,
    is_retryable_transport_error,
    parse_json_payload,
    provider_circuit,
    with_transport_retries,
)


@pytest.fixture(autouse=True)
def _allow_copilot_quota():
    with patch("app.services.copilot.assert_copilot_allowed"), patch(
        "app.services.copilot.record_copilot_usage"
    ):
        yield


@pytest.fixture(autouse=True)
def _reset_circuit():
    provider_circuit.reset()
    yield
    provider_circuit.reset()


def test_parse_json_payload_extracts_embedded_object():
    raw = 'Here is the result:\n{"a": 1, "b": "two"}'
    assert parse_json_payload(raw) == {"a": 1, "b": "two"}


def test_is_retryable_transport_error_for_timeout_message():
    assert is_retryable_transport_error(TimeoutError("request timed out")) is True


def test_is_retryable_transport_error_for_anthropic_429():
    class _Exc(Exception):
        status_code = 429

    assert is_retryable_transport_error(_Exc("rate limited")) is True


def test_circuit_opens_after_threshold(monkeypatch: pytest.MonkeyPatch):
    breaker = ProviderCircuitBreaker()
    monkeypatch.setattr(settings, "copilot_circuit_failure_threshold", 2)
    monkeypatch.setattr(settings, "copilot_circuit_recovery_seconds", 60)
    now = 1000.0
    with patch("app.services.llm_resilience.time.monotonic", return_value=now):
        breaker.record_failure("openai")
        breaker.record_failure("openai")
        assert breaker.is_open("openai", now=now) is True


def test_circuit_recovers_after_cooldown(monkeypatch: pytest.MonkeyPatch):
    breaker = ProviderCircuitBreaker()
    monkeypatch.setattr(settings, "copilot_circuit_failure_threshold", 1)
    monkeypatch.setattr(settings, "copilot_circuit_recovery_seconds", 30)
    opened_at = 1000.0
    with patch("app.services.llm_resilience.time.monotonic", return_value=opened_at):
        breaker.record_failure("gemini")
        assert breaker.is_open("gemini", now=opened_at) is True
    with patch("app.services.llm_resilience.time.monotonic", return_value=opened_at + 31):
        assert breaker.is_open("gemini", now=opened_at + 31) is False


def test_with_transport_retries_succeeds_and_resets_circuit():
    provider_circuit.reset()
    provider_circuit.record_failure("claude")
    result = with_transport_retries("claude", lambda: "ok")
    assert result == "ok"
    assert provider_circuit._state("claude").consecutive_failures == 0


def test_with_transport_retries_raises_after_exhaustion(monkeypatch: pytest.MonkeyPatch):
    provider_circuit.reset()
    monkeypatch.setattr(settings, "copilot_transport_retries", 1)
    monkeypatch.setattr(settings, "copilot_retry_backoff_seconds", 0)

    def _fail() -> str:
        raise TimeoutError("timed out")

    with patch("app.services.llm_resilience.time.sleep"):
        with pytest.raises(HTTPException) as exc:
            with_transport_retries("openai", _fail)
    assert exc.value.status_code == status.HTTP_502_BAD_GATEWAY


def test_copilot_skips_open_circuit_provider(monkeypatch: pytest.MonkeyPatch):
    provider_circuit.reset()
    monkeypatch.setattr(settings, "copilot_provider", "auto")
    provider_circuit.record_failure("openai")
    provider_circuit.record_failure("openai")
    provider_circuit.record_failure("openai")
    provider_circuit.record_failure("openai")
    provider_circuit.record_failure("openai")

    with patch.object(copilot, "generate_with_openai") as openai_fn:
        with patch.object(
            copilot, "generate_with_gemini", return_value={"summary": "ok", "provider": "gemini"}
        ):
            result = copilot.generate_recommendations_for_system(1, "u1", "org-1")
    openai_fn.assert_not_called()
    assert result["provider"] == "gemini"


def test_build_system_recommendation_fallback_high_sensitivity():
    from datetime import datetime

    from app.domain.models import AISystem, DataSensitivity, ModelType, RiskTier

    now = datetime.utcnow()
    system = AISystem(
        id=1,
        organization_id="org",
        name="Test",
        description="d",
        owner="o",
        business_unit="bu",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.high,
        risk_tier=RiskTier.tier1,
        created_at=now,
        updated_at=now,
    )
    payload = build_system_recommendation_fallback(system, "not json")
    assert "pii_restrictions" in payload["suggested_policies"]
