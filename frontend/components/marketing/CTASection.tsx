import Link from "next/link";

export function CTASection() {
  return (
    <section id="contact" className="mkt-cta-section">
      <div className="mkt-container" data-aos="fade-up">
        <p className="mkt-eyebrow">Get started</p>
        <h2 className="mkt-display-md">Ready to govern AI with confidence?</h2>
        <p className="mkt-lead">
          Schedule an enterprise demo with our team, or sign in to your existing workspace.
          We&apos;ll walk through your AI inventory, compliance frameworks, and integration setup.
        </p>
        <div className="mkt-btn-row">
          <Link href="mailto:hello@trustfabric.ai" className="mkt-pill mkt-pill-white">
            Request enterprise demo
          </Link>
          <Link href="/login" className="mkt-pill mkt-pill-ghost">
            Sign in to console
          </Link>
        </div>
      </div>
    </section>
  );
}
