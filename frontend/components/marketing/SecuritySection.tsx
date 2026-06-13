const points = [
  {
    title: "Tenant data isolation",
    detail:
      "Every organization gets scoped Firestore collections. Cross-tenant data access is architecturally prevented — not just policy-prohibited.",
  },
  {
    title: "Encrypted credentials at rest",
    detail:
      "GitHub, Slack, and integration tokens encrypted with Fernet. SAML SSO uses one-time exchange codes — no long-lived secrets in URLs.",
  },
  {
    title: "Least-privilege access control",
    detail:
      "Granular org roles with admin-only mutations for integrations, SSO config, and member management. Auditors get read-only evidence access.",
  },
  {
    title: "Audit-ready exports",
    detail:
      "Compliance reports, scan histories, and policy change logs formatted for security review, board reporting, and external auditor handoff.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-split">
          <div data-aos="fade-right">
            <p className="mkt-eyebrow">Security architecture</p>
            <h2 className="mkt-display-sm">Designed for your CISO&apos;s review</h2>
            <p className="mkt-lead">
              Clear data boundaries, hardened authentication flows, and exportable evidence
              for your compliance program — with no black-box AI decisions on critical controls.
            </p>
          </div>
          <div className="mkt-security-grid" data-aos="fade-left">
            {points.map((point, i) => (
              <article key={point.title} className="mkt-security-item">
                <div className="mkt-feature-num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{point.title}</h3>
                <p className="mkt-body">{point.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
