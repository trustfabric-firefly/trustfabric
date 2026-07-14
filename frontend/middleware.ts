import { NextResponse, type NextRequest } from "next/server";

import {
    AUTH_COOKIE_NAME,
    isFirebaseAuthEnabled,
    isProtectedAppPath,
} from "@/lib/auth-cookie";
import { verifyFirebaseIdToken } from "@/lib/auth-middleware";

function redirectToLogin(request: NextRequest) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnTo", request.nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!isProtectedAppPath(pathname)) {
        return NextResponse.next();
    }

    // Local dev without Firebase web config — client AppAuthGate uses stub user.
    if (!isFirebaseAuthEnabled()) {
        if (process.env.NODE_ENV === "production") {
            return redirectToLogin(request);
        }
        return NextResponse.next();
    }

    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
        return redirectToLogin(request);
    }

    try {
        await verifyFirebaseIdToken(token);
        return NextResponse.next();
    } catch {
        return redirectToLogin(request);
    }
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/systems/:path*",
        "/policies/:path*",
        "/scans/:path*",
        "/compliance/:path*",
        "/audit/:path*",
        "/settings/:path*",
        "/brand-compliance/:path*",
    ],
};
