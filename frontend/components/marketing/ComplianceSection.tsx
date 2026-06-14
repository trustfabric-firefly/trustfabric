const frameworks = [
  {
    name: "NIST AI RMF",
    version: "Version 1.0",
    coverage: "94%",
    description:
      "Govern, Map, Measure, and Manage functions with real-time control coverage across your AI inventory. Export gap analysis for leadership and auditors.",
  },
  {
    name: "SOC 2 Type II",
    version: "Trust services criteria",
    coverage: "87%",
    description:
      "Security and availability controls mapped to your AI systems and data flows. Evidence collection automated from integration scans.",
  },
  {
    name: "EU AI Act",
    version: "2024 regulation",
    coverage: "82%",
    description:
      "Risk classification and documentation for high-risk AI deployments. Track conformity assessments and technical documentation requirements.",
  },
  {
    name: "Custom policies",
    version: "Your organization",
    coverage: "100%",
    description:
      "Define organization-specific governance rules enforced through automated scans. Version policies, track violations, and measure remediation SLAs.",
  },
];

export function ComplianceSection() {
  return (
    <section id="compliance" className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head" data-aos="fade-up">
          <p className="mkt-eyebrow">Compliance</p>
          <h2 className="mkt-display-md">
            Frameworks, continuously measured
          </h2>
          <p className="mkt-lead">
            Maps your AI systems and policies to regulatory frameworks — updated with every
            scan, not once a year in a spreadsheet.
          </p>
        </div>

        <div className="mkt-grid-2">
          {frameworks.map((fw, i) => (
            <article key={fw.name} className="mkt-framework-card" data-aos="fade-up" data-aos-delay={i * 60}>
              <p className="mkt-coverage">{fw.coverage} control coverage</p>
              <h3>{fw.name}</h3>
              <p className="mkt-version">{fw.version}</p>
              <p className="mkt-body">{fw.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
