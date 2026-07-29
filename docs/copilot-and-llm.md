# Copilot & LLM behavior

## Two different features

1. **System recommendations** — `POST /api/v1/copilot/systems/{system_id}/recommendations`  
   NIST AI RMF–style suggestions for a **single system** from the registry. Implemented by `app/services/copilot.py`, which delegates to **Gemini** and/or **Claude** depending on `COPILOT_PROVIDER`.

2. **Policy text generation** — `POST /api/v1/copilot/policies/recommendations`  
   Chat-style **governance policy** output (structured JSON: content, policy, rules). Implemented in `app/services/claude.py` as `generate_policy_recommendation` and uses **Claude only** (requires `CLAUDE_API_KEY`).

## System copilot: `COPILOT_PROVIDER`

| Value | Behavior |
|-------|----------|
| `gemini` | Gemini only (`GEMINI_API_KEY` required). |
| `claude` | Claude only (`CLAUDE_API_KEY` required). |
| `auto` | Try **Gemini** first; on 502/503 from the provider, fall back to **Claude**. |

Model IDs are configured with `GEMINI_MODEL` and `ANTHROPIC_MODEL` in `.env` (see `.env.example`).

## Logs

Successful and failed LLM calls can be recorded via `store.log_llm_interaction` for auditability; details live in `llm_logs` in Firestore.
