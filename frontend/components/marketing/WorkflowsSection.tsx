"use client";

import Image from "next/image";
import { Spotlight } from "@/components/marketing/Spotlight";
import WorkflowImg01 from "@/public/marketing/workflow-01.png";
import WorkflowImg02 from "@/public/marketing/workflow-02.png";
import WorkflowImg03 from "@/public/marketing/workflow-03.png";

const workflows = [
  {
    image: WorkflowImg01,
    tag: "01 — Discover",
    title: "Map your AI inventory",
    text: "Connect AWS, GitHub, and Slack to automatically discover models, endpoints, APIs, and data flows. Build a centralized registry with ownership, risk tier, and deployment context for every AI system.",
  },
  {
    image: WorkflowImg02,
    tag: "02 — Govern",
    title: "Enforce policy at scale",
    text: "Define governance policies, classify systems into Tier 1–3 risk levels, and block configuration drift before it reaches production. Use the governance copilot for NIST AI RMF-aligned recommendations.",
  },
  {
    image: WorkflowImg03,
    tag: "03 — Audit",
    title: "Prove compliance continuously",
    text: "Run automated compliance scans and generate exportable audit reports mapped to NIST AI RMF, SOC 2, and EU AI Act controls. Immutable audit trails capture every policy change and scan result.",
  },
];

export function WorkflowsSection() {
  return (
    <section id="workflows" className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head" data-aos="fade-up">
          <p className="mkt-eyebrow">Governance workflows</p>
          <h2 className="mkt-display-md">Map your AI governance journey</h2>
          <p className="mkt-lead">
            A continuous loop from discovery to enforcement to evidence — designed for
            enterprise security teams who cannot afford governance gaps between releases.
          </p>
        </div>

        <Spotlight className="mkt-spotlight-grid">
          {workflows.map((item, i) => (
            <article
              key={item.tag}
              className="mkt-work-cell"
              data-aos="fade-up"
              data-aos-delay={i * 120}
            >
              <Image src={item.image} alt="" width={400} height={320} />
              <div className="mkt-work-cell-body">
                <span className="mkt-tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p className="mkt-body">{item.text}</p>
              </div>
            </article>
          ))}
        </Spotlight>
      </div>
    </section>
  );
}
