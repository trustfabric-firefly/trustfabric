import { NextResponse } from "next/server";

import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from "@/lib/auth-cookie";
import { verifyFirebaseIdToken } from "@/lib/auth-middleware";

export async function POST(request: Request) {
    let token: string | undefined;
    try {
        const body = (await request.json()) as { token?: string };
        token = body.token;
    } catch {
        token = undefined;
    }

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    try {
        await verifyFirebaseIdToken(token);
    } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
        path: "/",
    });
    return response;
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
    return response;
}
