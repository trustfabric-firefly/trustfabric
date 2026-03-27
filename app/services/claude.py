# claude integration (NIST AI RMF)

from __future__ import annotations

from datetime import datetime, timezone #timestamps LLM interactions (NIST Measure)

from anthropic import Anthropic, APIStatusError
from fastapi import HTTPException, status

from app.core.config import settings
from app.domain.models import AISystem, LLMInteractionLog, RiskTier
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

Remember: your output is advisory only. Human reviewers make the final decisions.
""".strip()

    if len(base) > MAX_INPUT_CHARS:
        base = base[: MAX_INPUT_CHARS - 200] + "\n\n[Prompt too long]"
    return base


def generate_recommendations_for_system(system_id: int, user_id: str) -> dict:
    system = store.get_system(system_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    if not settings.claude_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Claude API key not configured on server",
        )

    prompt = _build_prompt(system)

    client = Anthropic(api_key=settings.claude_api_key)
    now = datetime.now(timezone.utc)

    try:
        message = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=800,
            temperature=0.2,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )
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
            )
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude API call failed ({error_detail})",
        ) from exc

    text_parts = [c.text for c in message.content if getattr(c, "type", "") == "text"]
    raw = "".join(text_parts).strip()

    if len(raw) > 1000:
        summary = raw[:1000] + "..."
    else:
        summary = raw

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
        )
    )

    # Let the frontend handle JSON parsing/validation of output (NIST Manage)
    return {
        "raw_response": raw,
        "model": settings.anthropic_model,
        "disclaimer": "AI-generated recommendations for governance only. Human review required before applying.",
        "nist_ai_rmf_functions": ["Govern", "Map", "Measure", "Manage"],
        "system_risk_hint": {
            "current_risk_tier": system.risk_tier or RiskTier.tier2,
            "data_sensitivity": system.data_sensitivity,
        },
    }

