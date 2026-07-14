export const AUTH_COOKIE_NAME = "__tf_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60; // Firebase ID tokens expire after 1 hour

/** App routes that require an authenticated session (mirrors `(app)` route group). */
export const PROTECTED_APP_PREFIXES = [
    "/dashboard",
    "/systems",
    "/policies",
    "/scans",
    "/compliance",
    "/audit",
    "/settings",
    "/brand-compliance",
] as const;

export function isProtectedAppPath(pathname: string): boolean {
    return PROTECTED_APP_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

export function isFirebaseAuthEnabled(): boolean {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    return typeof apiKey === "string" && apiKey.length > 0;
}
