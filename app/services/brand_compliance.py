# Brand compliance scanner — analyses AI-generated marketing images against brand guidelines
# Uses OpenAI-compatible vision endpoint (NVIDIA Llama 4 Maverick or similar)

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from openai import APIError, OpenAI

from app.core.config import settings
from app.domain.models import LLMInteractionLog
from app.services.store import store


# ---------------------------------------------------------------------------
# Default brand guidelines (Google-inspired demo)
# ---------------------------------------------------------------------------

DEFAULT_BRAND_GUIDELINES = {
    "company_name": "Acme Corp",
    "primary_colors": [
        {"name": "Blue", "hex": "#4285F4"},
        {"name": "Red", "hex": "#EA4335"},
        {"name": "Yellow", "hex": "#FBBC05"},
        {"name": "Green", "hex": "#34A853"},
    ],
    "secondary_colors": [
        {"name": "Dark Gray", "hex": "#5F6368"},
        {"name": "White", "hex": "#FFFFFF"},
    ],
    "typography": {
        "primary_font": "Product Sans / Google Sans",
        "body_font": "Roboto",
        "rules": "Headlines should use Product Sans. Body copy should use Roboto. Minimum body size 14px.",
    },
    "logo_rules": [
        "Logo must have clear space of at least half its height on all sides",
        "Do not alter the logo colors",
        "Do not place the logo on busy or low-contrast backgrounds",
        "Do not distort, rotate, or add effects to the logo",
    ],
    "imagery_style": [
        "Use bright, clean, well-lit photography",
        "Images should feel optimistic and diverse",
        "Avoid stock-photo clichés (handshakes, pointing at screens)",
        "Illustrations should use the brand color palette",
    ],
    "content_tone": [
        "Helpful and approachable, never condescending",
        "Clear and concise — avoid jargon",
        "Active voice preferred over passive",
    ],
    "prohibited": [
        "No competitor logos or names visible",
        "No unlicensed third-party content",
        "No misleading claims or imagery",
        "No AI-generated faces presented as real employees",
    ],
}


def _build_vision_prompt(guidelines: dict[str, Any], custom_rules: list[str] | None = None) -> str:
    colors_desc = ", ".join(
        f'{c["name"]} ({c["hex"]})' for c in guidelines.get("primary_colors", [])
    )
    secondary_desc = ", ".join(
        f'{c["name"]} ({c["hex"]})' for c in guidelines.get("secondary_colors", [])
    )
    logo_rules = "\n".join(f"  - {r}" for r in guidelines.get("logo_rules", []))
    imagery_rules = "\n".join(f"  - {r}" for r in guidelines.get("imagery_style", []))
    tone_rules = "\n".join(f"  - {r}" for r in guidelines.get("content_tone", []))
    prohibited = "\n".join(f"  - {r}" for r in guidelines.get("prohibited", []))
    typo = guidelines.get("typography", {})

    custom_rules_section = ""
    if custom_rules:
        custom_rules_section = "ADDITIONAL ACTIVE POLICIES FROM DATABASE:\n" + "\n".join(custom_rules) + "\n"

    return f"""You are a brand compliance auditor for {guidelines.get("company_name", "the organization")}.

Analyze the uploaded marketing image against these brand guidelines.

BRAND GUIDELINES:
Primary Colors: {colors_desc}
Secondary Colors: {secondary_desc}
Typography: Primary={typo.get("primary_font","N/A")}, Body={typo.get("body_font","N/A")}. {typo.get("rules","")}
Logo Rules:
{logo_rules}
Imagery Style:
{imagery_rules}
Content Tone:
{tone_rules}
Prohibited:
{prohibited}

{custom_rules_section}

Return strict JSON with these keys:
- overall_score: integer 0-100
- overall_status: "compliant" | "needs_review" | "non_compliant"
- summary: string (2-3 sentence overview)
- checks: array of objects with: id (snake_case), name (readable), category ("color"|"typography"|"logo"|"imagery"|"content"|"prohibited"|"custom_policy"), status ("pass"|"fail"|"warning"|"not_applicable"), severity ("low"|"medium"|"high"|"critical"), evidence (what you see), recommendation (what to fix)
- recommendations: array of top 3-5 actionable strings

Evaluate these checks:
1. color_palette_compliance 2. color_contrast 3. typography_consistency
4. logo_usage 5. logo_clear_space 6. imagery_style 7. image_quality
8. content_tone 9. prohibited_content 10. competitor_references
11. diversity_inclusion 12. ai_disclosure 13. active_custom_policies

Return ONLY valid JSON."""


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


def _scan_with_gemini(image_bytes: bytes, mime_type: str, prompt: str, user_id: str) -> dict[str, Any]:
    """Use Gemini Vision API (preferred for vision tasks)."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    now = datetime.now(timezone.utc)

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[prompt, image_part],
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2000,
                response_mime_type="application/json",
            ),
        )
        raw = (response.text or "").strip()
    except Exception as exc:
        store.log_llm_interaction(LLMInteractionLog(
            timestamp=now, user_id=user_id, system_id=None,
            prompt_template_version="v1-brand-compliance",
            input_summary="Brand compliance vision scan failed (Gemini)",
            model_name=settings.gemini_model, response_summary=str(exc)[:1000], success=False,
        ))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Gemini Vision failed: {str(exc)[:300]}") from exc

    parsed = _parse_json_payload(raw)
    if parsed is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Gemini returned unparseable response")

    store.log_llm_interaction(LLMInteractionLog(
        timestamp=now, user_id=user_id, system_id=None,
        prompt_template_version="v1-brand-compliance",
        input_summary=f"Brand scan — {mime_type}, {len(image_bytes)} bytes",
        model_name=settings.gemini_model,
        response_summary=raw[:1000], success=True,
    ))
    return parsed


def _scan_with_openai(image_bytes: bytes, mime_type: str, prompt: str, user_id: str) -> dict[str, Any]:
    """Use OpenAI-compatible API with vision support (NVIDIA, OpenAI, etc.)."""
    # Use dedicated vision settings if available, otherwise fall back to openai settings
    api_key = settings.vision_api_key or settings.openai_api_key
    base_url = settings.vision_base_url or settings.openai_base_url or None
    model = settings.vision_model if settings.vision_api_key else settings.openai_model

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"
    now = datetime.now(timezone.utc)

    client = OpenAI(api_key=api_key, base_url=base_url)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
            temperature=0.2,
            max_tokens=2000,
        )
        raw = (response.choices[0].message.content or "").strip()
    except APIError as exc:
        store.log_llm_interaction(LLMInteractionLog(
            timestamp=now, user_id=user_id, system_id=None,
            prompt_template_version="v1-brand-compliance",
            input_summary="Brand compliance vision scan failed (OpenAI)",
            model_name=model, response_summary=str(exc)[:1000], success=False,
        ))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Vision API call failed: {str(exc)[:300]}") from exc

    parsed = _parse_json_payload(raw)
    if parsed is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Vision model returned unparseable response")

    store.log_llm_interaction(LLMInteractionLog(
        timestamp=now, user_id=user_id, system_id=None,
        prompt_template_version="v1-brand-compliance",
        input_summary=f"Brand scan — {mime_type}, {len(image_bytes)} bytes",
        model_name=model,
        response_summary=raw[:1000], success=True,
    ))
    return parsed


def scan_image_compliance(
    image_bytes: bytes,
    mime_type: str,
    user_id: str,
    guidelines: dict[str, Any] | None = None,
    custom_rules: list[str] | None = None,
) -> dict[str, Any]:
    """Analyse an uploaded image against brand guidelines and DB policies using a vision model."""
    brand = guidelines or DEFAULT_BRAND_GUIDELINES
    prompt = _build_vision_prompt(brand, custom_rules)
    now = datetime.now(timezone.utc)

    # Pick provider: prefer Gemini for vision, fall back to OpenAI-compatible
    if settings.gemini_api_key:
        parsed_obj = _scan_with_gemini(image_bytes, mime_type, prompt, user_id)
        model_used = settings.gemini_model
    elif settings.vision_api_key or settings.openai_api_key:
        parsed_obj = _scan_with_openai(image_bytes, mime_type, prompt, user_id)
        model_used = settings.vision_model if settings.vision_api_key else settings.openai_model
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No vision-capable API key configured (need Gemini or OpenAI-compatible).",
        )

    return {
        **parsed_obj,
        "brand_name": brand.get("company_name", "Unknown"),
        "scanned_at": now.isoformat(),
        "model": model_used,
        "disclaimer": "AI-generated brand compliance analysis. Human review recommended before taking action.",
    }


def get_default_guidelines() -> dict[str, Any]:
    """Return the default brand guidelines for the frontend to display."""
    return DEFAULT_BRAND_GUIDELINES
