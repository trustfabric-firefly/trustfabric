import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/systems",
  "/policies",
  "/scans",
  "/compliance",
  "/audit",
  "/settings",
  "/brand-compliance",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Dev mode: Firebase not configured, allow through (matches AuthProvider stub behaviour)
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    return NextResponse.next();
  }

  const session = request.cookies.get("tf_session");
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
