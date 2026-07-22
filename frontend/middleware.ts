import { NextResponse, type NextRequest } from "next/server";

import {
    AUTH_COOKIE_NAME,
    isFirebaseAuthEnabled,
    isProtectedAppPath,
} from "@/lib/auth-cookie";
import { verifyFirebaseIdToken } from "@/lib/auth-middleware";
import {
    applySecurityHeaders,
    buildContentSecurityPolicy,
    createCspNonce,
} from "@/lib/security-headers";

function redirectToLogin(request: NextRequest, nonce: string) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnTo", request.nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    applySecurityHeaders(response.headers, nonce);
    return response;
}

function nextWithSecurity(request: NextRequest, nonce: string) {
    const csp = buildContentSecurityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    // Next.js parses this request header to attach nonces to framework scripts.
    requestHeaders.set("Content-Security-Policy", csp);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });
    applySecurityHeaders(response.headers, nonce);
    return response;
}

export async function middleware(request: NextRequest) {
    const nonce = createCspNonce();
    const { pathname } = request.nextUrl;

    if (!isProtectedAppPath(pathname)) {
        return nextWithSecurity(request, nonce);
    }

    // Local dev without Firebase web config — client AppAuthGate uses stub user.
    if (!isFirebaseAuthEnabled()) {
        if (process.env.NODE_ENV === "production") {
            return redirectToLogin(request, nonce);
        }
        return nextWithSecurity(request, nonce);
    }

    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
        return redirectToLogin(request, nonce);
    }

    try {
        await verifyFirebaseIdToken(token);
        return nextWithSecurity(request, nonce);
    } catch {
        return redirectToLogin(request, nonce);
    }
}

export const config = {
    matcher: [
        /*
         * Apply CSP + security headers to page navigations.
         * Skip App Router API routes, static assets, and image optimizer.
         * Skip RSC/link prefetches so they do not burn a unique nonce.
         */
        {
            source: "/((?!api|_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" },
            ],
        },
    ],
};
