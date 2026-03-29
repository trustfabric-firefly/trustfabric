from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from google import genai
from google.genai import types

from app.core.config import settings
from app.domain.models import DataSensitivity
from app.domain.models import AISystem, LLMInteractionLog, RiskTier
from app.services.store import store


PROMPT_TEMPLATE_VERSION = "v1-nist"
MAX_INPUT_CHARS = 4000


def _parse_json_payload(text: str) -> dict[str, Any] | None:
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


def _coerce_parsed_payload(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            return dumped if isinstance(dumped, dict) else None
        except Exception:
            return None
    if hasattr(value, "__dict__"):
        raw = getattr(value, "__dict__", None)
        return raw if isinstance(raw, dict) else None
    return None


def _build_fallback_payload(system: AISystem, raw_text: str) -> dict[str, Any]:
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


def _build_prompt(system: AISystem) -> str:
    base = f"""
You are a governance copilot helping organizations manage AI risk using the NIST AI Risk Management Framework (AI RMF).

You are assisting with a single AI system from an internal registry.

System record:
- Name: {system.name}
- Description: {system.description}
- Owner: {system.owner}
- Business unit: {system.business_unit}
- Model type: {system.model_type}
- Data sensitivity: {system.data_sensitivity}
- External integrations: {", ".join(system.external_integrations) or "None listed"}

Using the NIST AI RMF functions (Govern, Map, Measure, Manage), provide:
1) Suggested model type (one of: LLM, ML, Agent, Other) and short rationale.
2) Suggested data sensitivity classification (Low, Medium, High) and rationale.
3) Suggested risk tier (Tier 1/2/3) with brief justification tied to impact and data sensitivity.
4) Suggested required governance controls for this system, chosen from:
   - logging_required
   - human_review_required
   - pii_restrictions
5) 3-8 clarifying questions to ask the system owner that would improve the risk assessment.

Respond in strict JSON with the following keys:
- "suggested_model_type": string
- "suggested_data_sensitivity": string
- "suggested_risk_tier": string
- "suggested_policies": array of strings
- "rationale": string
- "clarifying_questions": array of strings

Remember: your output is advisory only. Human reviewers make the final decisions.
""".strip()

    if len(base) > MAX_INPUT_CHARS:
        base = base[: MAX_INPUT_CHARS - 200] + "\n\n[Prompt too long]"
    return base


def generate_recommendations_for_system(system_id: int, user_id: str) -> dict:
    system = store.get_system(system_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key not configured on server",
        )

    prompt = _build_prompt(system)
    now = datetime.now(timezone.utc)

    client = genai.Client(api_key=settings.gemini_api_key)

    schema: dict[str, Any] = {
        "type": "object",
        "required": [
            "suggested_model_type",
            "suggested_data_sensitivity",
            "suggested_risk_tier",
            "suggested_policies",
            "rationale",
            "clarifying_questions",
        ],
        "properties": {
            "suggested_model_type": {"type": "string"},
            "suggested_data_sensitivity": {"type": "string"},
            "suggested_risk_tier": {"type": "string"},
            "suggested_policies": {
                "type": "array",
                "items": {"type": "string"},
            },
            "rationale": {"type": "string"},
            "clarifying_questions": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
    }

    parsed_obj: dict[str, Any] | None = None
    raw = ""
    try:
        for attempt in range(2):
            attempt_prompt = prompt
            if attempt == 1:
                attempt_prompt = (
                    f"{prompt}\n\nReturn ONLY a valid JSON object matching the schema."
                )
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=attempt_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=1200,
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )

            # Prefer SDK-parsed JSON when available; avoids partial text payloads.
            if getattr(response, "parsed", None) is not None:
                parsed_obj = _coerce_parsed_payload(response.parsed)
            if parsed_obj is not None:
                raw = json.dumps(parsed_obj, separators=(",", ":"))
                break

            raw = (response.text or "").strip()
            parsed_obj = _parse_json_payload(raw)
            if parsed_obj is not None:
                raw = json.dumps(parsed_obj, separators=(",", ":"))
                break
    except Exception as exc:  # pragma: no cover - network/provider error handling
        provider_error = str(exc).strip() or type(exc).__name__
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=system_id,
                prompt_template_version=PROMPT_TEMPLATE_VERSION,
                input_summary=f"Gemini call failed: {type(exc).__name__}",
                model_name=settings.gemini_model,
                response_summary=provider_error,
                success=False,
            )
        )
        detail = "Gemini API call failed"
        if settings.app_env.lower() in {"dev", "local", "development"}:
            detail = f"{detail}: {provider_error[:500]}"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc

    if parsed_obj is None:
        parsed_obj = _build_fallback_payload(system, raw)
        raw = json.dumps(parsed_obj, separators=(",", ":"))
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=system_id,
                prompt_template_version=PROMPT_TEMPLATE_VERSION,
                input_summary="Gemini returned invalid JSON payload; fallback used",
                model_name=settings.gemini_model,
                response_summary=(raw[:500] + "...") if len(raw) > 500 else raw,
                success=True,
            )
        )

    if len(raw) > 1000:
        summary = raw[:1000] + "..."
    else:
        summary = raw

    store.log_llm_interaction(
        LLMInteractionLog(
            timestamp=now,
            user_id=user_id,
            system_id=system_id,
            prompt_template_version=PROMPT_TEMPLATE_VERSION,
            input_summary=f"System {system_id} ({system.name})",
            model_name=settings.gemini_model,
            response_summary=summary,
            success=True,
        )
    )

    return {
        "raw_response": raw,
        "model": settings.gemini_model,
        "provider": "gemini",
        "disclaimer": "AI-generated recommendations for governance only. Human review required before applying.",
        "nist_ai_rmf_functions": ["Govern", "Map", "Measure", "Manage"],
        "system_risk_hint": {
            "current_risk_tier": system.risk_tier or RiskTier.tier2,
            "data_sensitivity": system.data_sensitivity,
        },
    }
