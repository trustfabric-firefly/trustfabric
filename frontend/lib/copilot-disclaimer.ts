/** Canonical advisory copy for all governance copilot surfaces (matches backend). */
export const COPILOT_ADVISORY_DISCLAIMER =
    "AI-generated recommendations for governance only. Human review required before applying.";

/** Prefer API-provided disclaimer when present; otherwise use the canonical string. */
export function resolveCopilotDisclaimer(apiDisclaimer?: string | null): string {
    const trimmed = apiDisclaimer?.trim();
    return trimmed || COPILOT_ADVISORY_DISCLAIMER;
}
