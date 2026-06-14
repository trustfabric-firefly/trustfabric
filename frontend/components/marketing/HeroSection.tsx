import Image from "next/image";
import Link from "next/link";
import HeroImage from "@/public/marketing/hero-image-01.jpg";

const industries = [
  "Financial Services",
  "Healthcare",
  "Insurance",
  "Technology",
  "Energy",
  "Government",
];

const stats = [
  { value: "NIST AI RMF", label: "Framework aligned" },
  { value: "Multi-tenant", label: "Org isolation" },
  { value: "SAML SSO", label: "Enterprise auth" },
  { value: "24/7", label: "Continuous scans" },
];

export function HeroSection() {
  return (
    <>
      <section className="mkt-hero-frame">
        <div className="mkt-hero-bg" aria-hidden="true">
          <Image src={HeroImage} alt="" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        </div>
        <div className="mkt-container mkt-hero-content">
          <p className="mkt-eyebrow" data-aos="fade-up">
            Enterprise AI governance
          </p>
          <h1 className="mkt-display" data-aos="fade-up" data-aos-delay="80">
            Govern every AI system with clarity
          </h1>
          <p className="mkt-lead" data-aos="fade-up" data-aos-delay="160">
            Continuously monitor inventory, enforce governance policies, and maintain
            audit-ready NIST AI RMF compliance — built for enterprise security teams.
          </p>
          <div className="mkt-btn-row" data-aos="fade-up" data-aos-delay="240">
            <Link href="#contact" className="mkt-pill mkt-pill-white">
              Request a demo
            </Link>
            <Link href="/login" className="mkt-pill mkt-pill-ghost">
              Sign in
            </Link>
          </div>
        </div>
        <p className="mkt-scroll-hint">Scroll to explore</p>
      </section>

      <section className="mkt-band mkt-frame-dark">
        <div className="mkt-container">
          <div className="mkt-stats" data-aos="fade-up">
            {stats.map((stat) => (
              <div key={stat.label} className="mkt-stat">
                <div className="mkt-stat-value">{stat.value}</div>
                <div className="mkt-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="mkt-trusted" data-aos="fade-up" data-aos-delay="80">
            <span className="mkt-trusted-label">Trusted in regulated industries</span>
            {industries.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
