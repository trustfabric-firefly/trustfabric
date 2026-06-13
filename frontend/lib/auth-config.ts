/** True when running a production Next.js build (never enable dev auth bypass). */
export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

/** Dev-only bearer token from env — never available in production builds. */
export function getDevBearerToken(): string | undefined {
    if (IS_PRODUCTION_BUILD) return undefined;
    return (
        process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN
        ?? process.env.NEXT_PUBLIC_DEV_VIEWER_TOKEN
    );
}
