/**
 * CSP and HTTP security headers for the Next.js frontend.
 *
 * CSP is applied per-request (with a nonce) from middleware.
 * Static headers are also set in next.config.js for assets that skip middleware.
 */

const isDev = process.env.NODE_ENV === "development";

function normalizeOrigin(value: string | undefined): string | null {
    if (!value?.trim()) return null;
    const trimmed = value.trim();
    try {
        const withProtocol =
            trimmed.startsWith("http://") || trimmed.startsWith("https://")
                ? trimmed
                : `http://${trimmed}`;
        return new URL(withProtocol).origin;
    } catch {
        return null;
    }
}

/** API + Firebase origins allowed in connect-src / frame-src. */
export function getTrustedConnectOrigins(): string[] {
    const origins = new Set<string>();

    const api =
        normalizeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ??
        normalizeOrigin(process.env.NEXT_PUBLIC_API_URL);
    if (api) origins.add(api);

    if (isDev) {
        origins.add("http://127.0.0.1:8000");
        origins.add("http://localhost:8000");
    }

    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
    if (authDomain) {
        const origin = normalizeOrigin(
            authDomain.startsWith("http") ? authDomain : `https://${authDomain}`,
        );
        if (origin) origins.add(origin);
    }

    return [...origins].filter(Boolean);
}

export function createCspNonce(): string {
    return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * Build a Content-Security-Policy value.
 * - Scripts: nonce + strict-dynamic (Next.js applies the nonce automatically).
 * - Styles: unsafe-inline required for React `style={}` props across the app.
 */
export function buildContentSecurityPolicy(nonce: string): string {
    const connectOrigins = getTrustedConnectOrigins();
    const firebaseConnect = [
        "https://*.googleapis.com",
        "https://*.gstatic.com",
        "https://*.firebaseio.com",
        "https://*.cloudfunctions.net",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://www.googleapis.com",
    ];
    const firebaseFrames = [
        "https://*.firebaseapp.com",
        "https://accounts.google.com",
        "https://*.google.com",
    ];

    const directives: string[] = [
        "default-src 'self'",
        [
            "script-src",
            "'self'",
            `'nonce-${nonce}'`,
            "'strict-dynamic'",
            isDev ? "'unsafe-eval'" : "",
        ]
            .filter(Boolean)
            .join(" "),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' blob: data: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        ["connect-src", "'self'", ...connectOrigins, ...firebaseConnect].join(" "),
        ["frame-src", "'self'", ...firebaseFrames].join(" "),
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "manifest-src 'self'",
        ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ];

    return directives.join("; ").replace(/\s{2,}/g, " ").trim();
}

/** Headers that do not require a per-request nonce. */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ...(isDev
        ? []
        : [
              {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
              },
          ]),
];

export function applySecurityHeaders(
    headers: Headers,
    nonce: string,
): void {
    for (const { key, value } of STATIC_SECURITY_HEADERS) {
        headers.set(key, value);
    }
    headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
}
