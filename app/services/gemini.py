from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from google.genai import types

from app.core.config import settings
from app.domain.models import AISystem, LLMInteractionLog, RiskTier
from app.services.copilot_disclaimer import COPILOT_ADVISORY_DISCLAIMER
from app.services.llm_resilience import (
    build_system_recommendation_fallback,
    gemini_client,
    parse_json_payload,
    provider_error_detail,
    with_transport_retries,
)
from app.services.store import store


PROMPT_TEMPLATE_VERSION = "v1-nist"
MAX_INPUT_CHARS = 4000
POLICY_PROMPT_TEMPLATE_VERSION = "v1-policy-generator"


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


def _build_policy_prompt(prompt: str, history: list[str] | None = None) -> str:
    compact_history = (history or [])[-6:]
    history_block = "\n".join(f"- {item}" for item in compact_history if item.strip()) or "- (none)"
    user_prompt = prompt.strip()[:MAX_INPUT_CHARS]
    return f"""
You are an enterprise AI governance policy assistant.
Generate one policy in strict JSON format.

Conversation context:
{history_block}

User request:
{user_prompt}

Return strict JSON with keys:
- content: string (short explanation for user)
- policy: object with:
  - name: string
  - description: string
  - category: one of [model_restrictions, feature_control, security, quality_control, data_privacy, access_control, cost_management, compliance]
  - severity: one of [low, medium, high]
  - applies_to: array of strings
  - creation_method: "ai_generated"
- rules: object (machine-friendly enforcement fields)

Return only JSON.
""".strip()


def generate_recommendations_for_system(system_id: int, user_id: str, organization_id: str) -> dict:
    system = store.get_system(system_id, organization_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key not configured on server",
        )

    prompt = _build_prompt(system)
    now = datetime.now(timezone.utc)
    client = gemini_client()

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
            response = with_transport_retries(
                "gemini",
                lambda attempt_prompt=attempt_prompt: client.models.generate_content(
                    model=settings.gemini_model,
                    contents=attempt_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=1200,
                        response_mime_type="application/json",
                        response_schema=schema,
                    ),
                ),
            )

            # Prefer SDK-parsed JSON when available; avoids partial text payloads.
            if getattr(response, "parsed", None) is not None:
                parsed_obj = _coerce_parsed_payload(response.parsed)
            if parsed_obj is not None:
                raw = json.dumps(parsed_obj, separators=(",", ":"))
                break

            raw = (response.text or "").strip()
            parsed_obj = parse_json_payload(raw)
            if parsed_obj is not None:
                raw = json.dumps(parsed_obj, separators=(",", ":"))
                break
    except HTTPException:
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=system_id,
                prompt_template_version=PROMPT_TEMPLATE_VERSION,
                input_summary="Gemini call failed",
                model_name=settings.gemini_model,
                response_summary="transport error",
                success=False,
            ),
            organization_id,
        )
        raise
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
            ),
            organization_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=provider_error_detail("Gemini API call failed", exc),
        ) from exc

    if parsed_obj is None:
        parsed_obj = build_system_recommendation_fallback(system, raw)
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
            ),
            organization_id,
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
        ),
        organization_id,
    )

    return {
        "raw_response": raw,
        "model": settings.gemini_model,
        "provider": "gemini",
        "disclaimer": COPILOT_ADVISORY_DISCLAIMER,
        "nist_ai_rmf_functions": ["Govern", "Map", "Measure", "Manage"],
        "system_risk_hint": {
            "current_risk_tier": system.risk_tier or RiskTier.tier2,
            "data_sensitivity": system.data_sensitivity,
        },
    }


def generate_policy_recommendation(
    prompt: str,
    user_id: str,
    history: list[str] | None = None,
    organization_id: str | None = None,
) -> dict:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key not configured on server",
        )

    org_id = organization_id or settings.default_organization_id
    llm_prompt = _build_policy_prompt(prompt, history)
    user_prompt = prompt.strip()[:MAX_INPUT_CHARS]
    now = datetime.now(timezone.utc)
    client = gemini_client()

    schema: dict[str, Any] = {
        "type": "object",
        "required": ["content", "policy", "rules"],
        "properties": {
            "content": {"type": "string"},
            "policy": {
                "type": "object",
                "required": [
                    "name",
                    "description",
                    "category",
                    "severity",
                    "applies_to",
                    "creation_method",
                ],
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "category": {"type": "string"},
                    "severity": {"type": "string"},
                    "applies_to": {"type": "array", "items": {"type": "string"}},
                    "creation_method": {"type": "string"},
                },
            },
            "rules": {"type": "object"},
        },
    }

    parsed_obj: dict[str, Any] | None = None
    raw = ""
    try:
        for attempt in range(2):
            attempt_prompt = llm_prompt
            if attempt == 1:
                attempt_prompt = f"{llm_prompt}\n\nReturn ONLY a valid JSON object matching the schema."
            response = with_transport_retries(
                "gemini",
                lambda attempt_prompt=attempt_prompt: client.models.generate_content(
                    model=settings.gemini_model,
                    contents=attempt_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=1200,
                        response_mime_type="application/json",
                        response_schema=schema,
                    ),
                ),
            )

            if getattr(response, "parsed", None) is not None:
                parsed_obj = _coerce_parsed_payload(response.parsed)
            if parsed_obj is not None:
                raw = json.dumps(parsed_obj, separators=(",", ":"))
                break

            raw = (response.text or "").strip()
            parsed_obj = parse_json_payload(raw)
            if parsed_obj is not None:
                break
    except HTTPException:
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=None,
                prompt_template_version=POLICY_PROMPT_TEMPLATE_VERSION,
                input_summary="Policy generation call failed",
                model_name=settings.gemini_model,
                response_summary="transport error",
                success=False,
            ),
            org_id,
        )
        raise
    except Exception as exc:  # pragma: no cover - network/provider error handling
        provider_error = str(exc).strip() or type(exc).__name__
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=None,
                prompt_template_version=POLICY_PROMPT_TEMPLATE_VERSION,
                input_summary="Policy generation call failed",
                model_name=settings.gemini_model,
                response_summary=provider_error[:1000],
                success=False,
            ),
            org_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=provider_error_detail("Gemini API call failed", exc),
        ) from exc

    if parsed_obj is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini policy response was not valid JSON",
        )

    store.log_llm_interaction(
        LLMInteractionLog(
            timestamp=now,
            user_id=user_id,
            system_id=None,
            prompt_template_version=POLICY_PROMPT_TEMPLATE_VERSION,
            input_summary=user_prompt[:200],
            model_name=settings.gemini_model,
            response_summary=raw[:1000] + ("..." if len(raw) > 1000 else ""),
            success=True,
        ),
        org_id,
    )
    parsed_obj.setdefault("disclaimer", COPILOT_ADVISORY_DISCLAIMER)
    parsed_obj.setdefault("provider", "gemini")
    parsed_obj.setdefault("model", settings.gemini_model)
    return parsed_obj
