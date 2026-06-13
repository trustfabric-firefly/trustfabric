"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { setActiveOrganizationId, ssoApi } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

function SsoCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { signInWithSsoToken } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const code = searchParams.get("code");
        const organizationId = searchParams.get("organization_id");
        if (!code) {
            setError("Missing SSO authorization code.");
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const result = await ssoApi.exchange(code);
                if (cancelled) return;
                await signInWithSsoToken(result.custom_token);
                setActiveOrganizationId(result.organization_id || organizationId || "");
                router.replace(result.return_to || "/dashboard");
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "SSO sign-in failed");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [searchParams, signInWithSsoToken, router]);

    return (
        <div className="relative min-h-screen overflow-hidden">
            <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-6 py-8">
                <Logo />
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                    {error ? (
                        <>
                            <h1 className="text-xl font-[550] text-obsidian-ink">SSO sign-in failed</h1>
                            <p className="mt-3 text-sm text-sage">{error}</p>
                            <Link
                                href="/login"
                                className="mt-6 text-sm text-obsidian-ink underline underline-offset-2"
                            >
                                Back to sign in
                            </Link>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl font-[550] text-obsidian-ink">Completing SSO sign-in…</h1>
                            <p className="mt-3 text-sm text-sage">Verifying your identity provider session.</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SsoCallbackPage() {
    return (
        <Suspense fallback={
            <div className="marketing min-h-screen bg-background px-6 py-12 text-center text-sm text-sage">
                Completing SSO sign-in…
            </div>
        }>
            <SsoCallbackContent />
        </Suspense>
    );
}
