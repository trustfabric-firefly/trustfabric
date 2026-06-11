import Image from "next/image";
import Link from "next/link";
import WorkflowImg02 from "@/public/marketing/workflow-02.png";

const capabilities = [
  "Organization-scoped data isolation in Firestore — built for multi-tenant SaaS",
  "Role-based access: owner, admin, auditor, and viewer with granular permissions",
  "Per-organization SAML SSO with JIT provisioning and secure token exchange",
  "Member invites, role management, and pending invite auto-accept on first login",
  "Encrypted integration credentials (GitHub, Slack, AWS) at rest with Fernet",
  "Immutable audit logs for policy changes, scans, system updates, and member activity",
];

export function EnterpriseSection() {
  return (
    <section id="enterprise" className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-split">
          <div className="mkt-split-visual" data-aos="fade-right">
            <Image src={WorkflowImg02} alt="" width={600} height={480} />
          </div>
          <div data-aos="fade-left">
            <p className="mkt-eyebrow">Enterprise ready</p>
            <h2 className="mkt-display-sm">Built for security teams, not side projects</h2>
            <p className="mkt-lead">
              Multi-tenant architecture, org-scoped isolation, SAML SSO, and audit-ready
              governance workflows — production controls from day one, not bolted on later.
            </p>
            <ul className="mkt-checklist">
              {capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mkt-btn-row">
              <Link href="#contact" className="mkt-pill mkt-pill-white">
                Talk to our team
              </Link>
              <Link href="/login" className="mkt-pill mkt-pill-ghost">
                View console
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
