"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, ChevronRightIcon } from "@/lib/icons";
import { useAuth } from "@/providers/AuthProvider";
import { Logo } from "@/components/marketing/Logo";
import { RESOLVED_API_BASE_URL, ssoApi } from "@/lib/api";
import type { SsoDiscovery } from "@/lib/api";
import TestimonialImg01 from "@/public/marketing/testimonial-01.jpg";
import TestimonialImg02 from "@/public/marketing/testimonial-02.jpg";
import TestimonialImg03 from "@/public/marketing/testimonial-03.jpg";

const spotlightQuotes = [
  {
    img: TestimonialImg01,
    name: "Sarah Chen",
    handle: "CISO, Regional Bank",
    quote:
      "TrustFabric gave us a single source of truth for every AI system in production. Our auditors finally have evidence they can work with.",
  },
  {
    img: TestimonialImg02,
    name: "Marcus Webb",
    handle: "Head of AI Risk, Health Network",
    quote:
      "We went from spreadsheet governance to continuous scans in weeks. Policy violations surface before they become incidents.",
  },
  {
    img: TestimonialImg03,
    name: "Priya Nair",
    handle: "VP Engineering, Enterprise SaaS",
    quote:
      "Governance is part of the pipeline, not a gate at the end. Engineering doesn't file tickets for every model deployment review.",
  },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c3.4-3.133 5.342-7.742 5.342-13.215z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoDiscovery, setSsoDiscovery] = useState<SsoDiscovery | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const returnTo =
    typeof window !== "undefined"
      ? (() => {
          const raw = new URLSearchParams(window.location.search).get("returnTo");
          return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
        })()
      : "/dashboard";

  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setSsoDiscovery(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setDiscovering(true);
      void ssoApi
        .discover(trimmed)
        .then((result) => setSsoDiscovery(result))
        .catch(() => setSsoDiscovery({ sso_available: false }))
        .finally(() => setDiscovering(false));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [email]);

  const startSso = () => {
    if (!ssoDiscovery?.sso_available || !ssoDiscovery.organization_id) return;
    const url = new URL(
      `/api/v1/auth/sso/${encodeURIComponent(ssoDiscovery.organization_id)}/login`,
      `${RESOLVED_API_BASE_URL}/`
    );
    url.searchParams.set("return_to", returnTo);
    window.location.href = url.toString();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (ssoDiscovery?.sso_available && ssoDiscovery.enforced) {
      startSso();
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.push(returnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const showPasswordField = !ssoDiscovery?.enforced;
  const quote = spotlightQuotes[quoteIndex];

  return (
    <div className="auth-split">
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-form-top">
            <Logo />
            <h1 className="auth-welcome">Welcome</h1>
            <p className="auth-subtitle">
              Access your account and continue your journey with us.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="email" className="auth-label">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="auth-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {ssoDiscovery?.sso_available && (
              <div className="auth-sso-hint">
                <strong>
                  {ssoDiscovery.organization_name ?? "Your organization"} uses SSO
                </strong>
                {ssoDiscovery.enforced
                  ? "Password sign-in is disabled. Use SSO to continue."
                  : "You can sign in with SSO or your password."}
              </div>
            )}

            {showPasswordField && (
              <div className="auth-field">
                <label htmlFor="password" className="auth-label">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={showPasswordField}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-toggle-pw"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon sx={{ fontSize: 18 }} /> : <EyeIcon sx={{ fontSize: 18 }} />}
                  </button>
                </div>
              </div>
            )}

            {showPasswordField && (
              <div className="auth-row" style={{ justifyContent: "flex-end" }}>
                <Link href="mailto:hello@trustfabric.ai" className="auth-link">
                  Reset password
                </Link>
              </div>
            )}

            {error && <div className="auth-alert">{error}</div>}

            {showPasswordField ? (
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </button>
            ) : (
              <button
                type="button"
                className="auth-submit"
                onClick={startSso}
                disabled={discovering || !ssoDiscovery?.sso_available}
              >
                Continue with SSO
              </button>
            )}
          </form>

          {ssoDiscovery?.sso_available && showPasswordField && (
            <>
              <div className="auth-divider">Or continue with</div>
              <button
                type="button"
                className="auth-oauth"
                onClick={startSso}
                disabled={discovering}
              >
                <GoogleIcon />
                Continue with SSO
              </button>
            </>
          )}

          <p className="auth-footer-text">
            Need enterprise access?{" "}
            <Link href="/#contact" className="auth-link">
              Request a demo
            </Link>
          </p>
        </div>
      </div>

      <aside className="auth-visual-panel">
        <div className="auth-visual-frame">
          <div className="auth-visual-art" />
          <div className="auth-testimonial-card">
            <div className="auth-testimonial-user">
              <Image src={quote.img} width={36} height={36} alt="" />
              <div>
                <div className="auth-testimonial-name">{quote.name}</div>
                <div className="auth-testimonial-role">{quote.handle}</div>
              </div>
            </div>
            <p className="auth-testimonial-quote">&ldquo;{quote.quote}&rdquo;</p>
          </div>
          <button
            type="button"
            className="auth-visual-nav"
            aria-label="Next testimonial"
            onClick={() => setQuoteIndex((i) => (i + 1) % spotlightQuotes.length)}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
      </aside>
    </div>
  );
}
