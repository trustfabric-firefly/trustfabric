# claude integration (NIST AI RMF)

from __future__ import annotations

import json
import re
from datetime import datetime, timezone #timestamps LLM interactions (NIST Measure)
from typing import Any

from anthropic import APIStatusError
from fastapi import HTTPException, status

from app.core.config import settings
from app.domain.models import AISystem, LLMInteractionLog, RiskTier
from app.services.copilot_disclaimer import COPILOT_ADVISORY_DISCLAIMER
from app.services.llm_resilience import (
    anthropic_client,
    build_system_recommendation_fallback,
    parse_json_payload,
    provider_error_detail,
    with_transport_retries,
)
from app.services.store import store


PROMPT_TEMPLATE_VERSION = "v1-nist"
MAX_INPUT_CHARS = 4000


# builds prompt (NIST Map)
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
5) 3–8 clarifying questions to ask the system owner that would improve the risk assessment.

Respond in strict JSON with the following keys:
- "suggested_model_type": string
- "suggested_data_sensitivity": string
- "suggested_risk_tier": string
- "suggested_policies": array of strings
- "rationale": string
- "clarifying_questions": array of strings

Respond in strict JSON with the following keys only. Return only JSON.
Remember: your output is advisory only. Human reviewers make the final decisions.
""".strip()

    if len(base) > MAX_INPUT_CHARS:
        base = base[: MAX_INPUT_CHARS - 200] + "\n\n[Prompt too long]"
    return base


def generate_recommendations_for_system(system_id: int, user_id: str, organization_id: str) -> dict:
    system = store.get_system(system_id, organization_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    if not settings.claude_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Claude API key not configured on server",
        )

    prompt = _build_prompt(system)
    client = anthropic_client()
    now = datetime.now(timezone.utc)

    parsed_obj: dict[str, Any] | None = None
    raw = ""
    try:
        for attempt in range(2):
            attempt_prompt = prompt
            if attempt == 1:
                attempt_prompt = f"{prompt}\n\nReturn ONLY a valid JSON object."

            message = with_transport_retries(
                "claude",
                lambda attempt_prompt=attempt_prompt: client.messages.create(
                    model=settings.anthropic_model,
                    max_tokens=1200,
                    temperature=0.2,
                    messages=[{"role": "user", "content": attempt_prompt}],
                ),
            )
            text_parts = [c.text for c in message.content if getattr(c, "type", "") == "text"]
            raw = "".join(text_parts).strip()
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
                input_summary="Claude call failed",
                model_name=settings.anthropic_model,
                response_summary="transport error",
                success=False,
            ),
            organization_id,
        )
        raise
    except APIStatusError as exc:  # pragma: no cover - network error handling
        error_detail = f"{type(exc).__name__}: {exc}"
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=system_id,
                prompt_template_version=PROMPT_TEMPLATE_VERSION,
                input_summary=f"Claude call failed: {type(exc).__name__}",
                model_name=settings.anthropic_model,
                response_summary=error_detail[:1000],
                success=False,
            ),
            organization_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=provider_error_detail("Claude API call failed", exc),
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
                input_summary="Claude returned invalid JSON payload; fallback used",
                model_name=settings.anthropic_model,
                response_summary=(raw[:500] + "...") if len(raw) > 500 else raw,
                success=True,
            ),
            organization_id,
        )

    summary = raw[:1000] + "..." if len(raw) > 1000 else raw

    # logs LLM interaction (NIST Measure)
    store.log_llm_interaction(
        LLMInteractionLog(
            timestamp=now,
            user_id=user_id,
            system_id=system_id,
            prompt_template_version=PROMPT_TEMPLATE_VERSION,
            input_summary=f"System {system_id} ({system.name})",
            model_name=settings.anthropic_model,
            response_summary=summary,
            success=True,
        ),
        organization_id,
    )

    return {
        "raw_response": raw,
        "model": settings.anthropic_model,
        "provider": "claude",
        "disclaimer": COPILOT_ADVISORY_DISCLAIMER,
        "nist_ai_rmf_functions": ["Govern", "Map", "Measure", "Manage"],
        "system_risk_hint": {
            "current_risk_tier": system.risk_tier or RiskTier.tier2,
            "data_sensitivity": system.data_sensitivity,
        },
    }


def _extract_json_object(raw: str) -> dict[str, Any]:
    # Handle plain JSON and markdown-fenced JSON responses.
    cleaned = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
    candidate = fenced.group(1).strip() if fenced else cleaned
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Claude policy response was not valid JSON",
    )


def explain_missing_controls(system_id: int, user_id: str, organization_id: str) -> dict:
    """Generate a plain-English explanation of what governance controls a system is missing
    and concrete action steps to become compliant. (Stretch goal — NIST Manage function.)"""
    system = store.get_system(system_id, organization_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    if not settings.claude_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Claude API key not configured on server",
        )

    from app.services.policies import required_policies_for_risk

    required = required_policies_for_risk(system.risk_tier) if system.risk_tier else []
    missing = [p for p in required if p not in (system.required_policies or [])]
    # Also surface any required policies that are simply not yet documented
    all_required = system.required_policies or []
    present = [p for p in all_required]

    prompt_text = f"""You are a governance compliance advisor using the NIST AI Risk Management Framework.

An AI system in the organization's registry is flagged as "Missing Required Controls".

System details:
- Name: {system.name}
- Description: {system.description}
- Risk tier: {system.risk_tier or 'Not assigned'}
- Data sensitivity: {system.data_sensitivity}
- Business unit: {system.business_unit}
- Required policies: {[p.value for p in all_required] or 'None defined'}
- Missing controls: {[p.value for p in missing] or 'General incompleteness'}
- missing_required_controls flag: {system.missing_required_controls}

Write a response in strict JSON with these keys:
- "summary": 2–3 sentence plain-English explanation of what is missing and why it matters
- "missing_controls": array of objects, each with "control" (name) and "why_required" (1 sentence)
- "action_steps": array of 3–6 concrete numbered steps the system owner should take
- "risk_if_ignored": 1–2 sentences on the consequence of not addressing this
- "nist_functions": array of NIST AI RMF functions this addresses (Govern/Map/Measure/Manage)

Keep the language clear and actionable. This output is shown directly to system owners.""".strip()

    client = anthropic_client()
    now = datetime.now(timezone.utc)

    try:
        message = with_transport_retries(
            "claude",
            lambda: client.messages.create(
                model=settings.anthropic_model,
                max_tokens=900,
                temperature=0.2,
                messages=[{"role": "user", "content": prompt_text}],
            ),
        )
    except HTTPException:
        store.log_llm_interaction(LLMInteractionLog(
            timestamp=now, user_id=user_id, system_id=system_id,
            prompt_template_version="v1-explain-missing",
            input_summary=f"explain_missing for system {system_id}",
            model_name=settings.anthropic_model,
            response_summary="transport error", success=False,
        ), organization_id)
        raise
    except APIStatusError as exc:
        store.log_llm_interaction(LLMInteractionLog(
            timestamp=now, user_id=user_id, system_id=system_id,
            prompt_template_version="v1-explain-missing",
            input_summary=f"explain_missing for system {system_id}",
            model_name=settings.anthropic_model,
            response_summary=str(exc)[:500], success=False,
        ), organization_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=provider_error_detail("Claude API call failed", exc)) from exc

    text_parts = [c.text for c in message.content if getattr(c, "type", "") == "text"]
    raw = "".join(text_parts).strip()

    store.log_llm_interaction(LLMInteractionLog(
        timestamp=now, user_id=user_id, system_id=system_id,
        prompt_template_version="v1-explain-missing",
        input_summary=f"System {system_id} ({system.name}) — missing controls explanation",
        model_name=settings.anthropic_model,
        response_summary=raw[:1000] + ("..." if len(raw) > 1000 else ""),
        success=True,
    ), organization_id)

    payload = _extract_json_object(raw)
    return {
        **payload,
        "system_name": system.name,
        "risk_tier": system.risk_tier,
        "disclaimer": COPILOT_ADVISORY_DISCLAIMER,
    }


def generate_policy_recommendation(
    prompt: str,
    user_id: str,
    history: list[str] | None = None,
    organization_id: str | None = None,
) -> dict:
    org_id = organization_id or settings.default_organization_id
    if not settings.claude_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Claude API key not configured on server",
        )

    compact_history = (history or [])[-6:]
    history_block = "\n".join(f"- {item}" for item in compact_history if item.strip()) or "- (none)"
    user_prompt = prompt.strip()[:MAX_INPUT_CHARS]
    llm_prompt = f"""
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
""".strip()

    client = anthropic_client()
    now = datetime.now(timezone.utc)
    try:
        message = with_transport_retries(
            "claude",
            lambda: client.messages.create(
                model=settings.anthropic_model,
                max_tokens=1000,
                temperature=0.2,
                messages=[{"role": "user", "content": llm_prompt}],
            ),
        )
    except HTTPException:
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=None,
                prompt_template_version="v1-policy-generator",
                input_summary="Policy generation call failed",
                model_name=settings.anthropic_model,
                response_summary="transport error",
                success=False,
            ),
            org_id,
        )
        raise
    except APIStatusError as exc:
        error_detail = f"{type(exc).__name__}: {exc}"
        store.log_llm_interaction(
            LLMInteractionLog(
                timestamp=now,
                user_id=user_id,
                system_id=None,
                prompt_template_version="v1-policy-generator",
                input_summary="Policy generation call failed",
                model_name=settings.anthropic_model,
                response_summary=error_detail[:1000],
                success=False,
            ),
            org_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=provider_error_detail("Claude API call failed", exc),
        ) from exc

    text_parts = [c.text for c in message.content if getattr(c, "type", "") == "text"]
    raw = "".join(text_parts).strip()
    payload = _extract_json_object(raw)

    store.log_llm_interaction(
        LLMInteractionLog(
            timestamp=now,
            user_id=user_id,
            system_id=None,
            prompt_template_version="v1-policy-generator",
            input_summary=user_prompt[:200],
            model_name=settings.anthropic_model,
            response_summary=raw[:1000] + ("..." if len(raw) > 1000 else ""),
            success=True,
        ),
        org_id,
    )
    payload.setdefault("disclaimer", COPILOT_ADVISORY_DISCLAIMER)
    payload.setdefault("provider", "claude")
    payload.setdefault("model", settings.anthropic_model)
    return payload

