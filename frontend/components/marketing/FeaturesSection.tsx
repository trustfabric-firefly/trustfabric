import Image from "next/image";
import FeaturesImage from "@/public/marketing/features.png";

const features = [
  {
    title: "Continuous compliance scans",
    description:
      "Automated scans across GitHub repos, cloud infrastructure, and AI configurations. Schedule on-demand or recurring scans with exportable PDF and CSV audit reports.",
  },
  {
    title: "Governance copilot",
    description:
      "AI-assisted policy drafting, risk assessments, and remediation guidance aligned to NIST AI RMF Govern, Map, Measure, and Manage functions.",
  },
  {
    title: "Risk tier classification",
    description:
      "Classify every AI system into Tier 1–3 with framework heatmaps for NIST AI RMF, SOC 2, EU AI Act, and your organization's custom standards.",
  },
  {
    title: "System inventory",
    description:
      "Centralized registry of models, endpoints, data flows, owners, and deployment environments. Track the full lifecycle from development to production.",
  },
  {
    title: "Policy management",
    description:
      "Define, version, and enforce governance policies. Track violations, assign remediation owners, and measure time-to-resolution across teams.",
  },
  {
    title: "Real-time integrations",
    description:
      "Native connectors for AWS, GitHub, and Slack. Receive alerts when configurations drift from policy — before auditors or incidents find them.",
  },
];

export function FeaturesSection() {
  return (
    <section id="platform" className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head" data-aos="fade-up">
          <p className="mkt-eyebrow">Platform</p>
          <h2 className="mkt-display-md">
            One platform for AI governance at scale
          </h2>
          <p className="mkt-lead">
            From system discovery to policy enforcement to audit-ready reporting — everything
            your security, legal, compliance, and engineering teams need in a single workspace.
          </p>
        </div>
      </div>

      <div className="mkt-immersive" data-aos="fade-up" data-aos-delay="100">
        <Image src={FeaturesImage} alt="TrustFabric platform overview" width={1440} height={500} />
      </div>

      <div className="mkt-container" style={{ marginTop: "clamp(4rem, 8vw, 6rem)" }}>
        <div className="mkt-grid-3">
          {features.map((feature, i) => (
            <article key={feature.title} className="mkt-feature" data-aos="fade-up" data-aos-delay={i * 50}>
              <div className="mkt-feature-num">{String(i + 1).padStart(2, "0")}</div>
              <h3>{feature.title}</h3>
              <p className="mkt-body">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
