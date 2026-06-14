"use client";

import { useState } from "react";
import Image from "next/image";
import TestimonialImg01 from "@/public/marketing/testimonial-01.jpg";
import TestimonialImg02 from "@/public/marketing/testimonial-02.jpg";
import TestimonialImg03 from "@/public/marketing/testimonial-03.jpg";
import TestimonialImg04 from "@/public/marketing/testimonial-04.jpg";
import TestimonialImg05 from "@/public/marketing/testimonial-05.jpg";
import TestimonialImg06 from "@/public/marketing/testimonial-06.jpg";
import ClientImg01 from "@/public/marketing/client-logo-01.svg";
import ClientImg02 from "@/public/marketing/client-logo-02.svg";
import ClientImg03 from "@/public/marketing/client-logo-03.svg";
import ClientImg04 from "@/public/marketing/client-logo-04.svg";
import ClientImg05 from "@/public/marketing/client-logo-05.svg";
import ClientImg06 from "@/public/marketing/client-logo-06.svg";

const categories = [
  { id: 1, label: "All teams" },
  { id: 2, label: "Security" },
  { id: 3, label: "Compliance" },
  { id: 4, label: "Engineering" },
];

const testimonials = [
  {
    img: TestimonialImg01,
    clientImg: ClientImg01,
    name: "Sarah Chen",
    role: "CISO",
    company: "Regional Bank",
    content:
      "TrustFabric gave us a single source of truth for every AI system in production. Our auditors finally have evidence they can work with — not screenshots from five different tools.",
    categories: [1, 2, 3],
  },
  {
    img: TestimonialImg02,
    clientImg: ClientImg02,
    name: "Marcus Webb",
    role: "Head of AI Risk",
    company: "Health Network",
    content:
      "We went from spreadsheet governance to continuous scans in weeks. Policy violations surface before they become incidents, and our compliance team stopped chasing engineering for inventory updates.",
    categories: [1, 3],
  },
  {
    img: TestimonialImg03,
    clientImg: ClientImg03,
    name: "Priya Nair",
    role: "VP Engineering",
    company: "Enterprise SaaS",
    content:
      "The GitHub and AWS integrations mean engineering doesn't file tickets for every model deployment review. Governance is part of the pipeline, not a gate at the end.",
    categories: [1, 4],
  },
  {
    img: TestimonialImg04,
    clientImg: ClientImg04,
    name: "James Okonkwo",
    role: "Compliance Director",
    company: "Insurance Group",
    content:
      "NIST AI RMF coverage reporting used to take our team days each quarter. Now it's always current, and we export gap analysis for the board in minutes.",
    categories: [1, 3],
  },
  {
    img: TestimonialImg05,
    clientImg: ClientImg05,
    name: "Elena Vasquez",
    role: "Security Architect",
    company: "Global Retail",
    content:
      "Multi-tenant isolation and SAML SSO were non-negotiable for our procurement team. TrustFabric shipped both without us bending our security model or running a six-month integration project.",
    categories: [1, 2],
  },
  {
    img: TestimonialImg06,
    clientImg: ClientImg06,
    name: "David Park",
    role: "General Counsel",
    company: "Fintech",
    content:
      "Our legal team finally has visibility into which models touch regulated data — without slowing down product teams. That's the balance we couldn't find anywhere else.",
    categories: [1, 2, 3],
  },
];

export function TestimonialsSection() {
  const [category, setCategory] = useState(1);

  return (
    <section className="mkt-frame-dark mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head" data-aos="fade-up">
          <p className="mkt-eyebrow">Enterprise teams</p>
          <h2 className="mkt-display-md">Trusted by governance leaders</h2>
          <p className="mkt-lead">
            Security, compliance, and engineering leaders using TrustFabric to govern AI at
            scale across regulated industries.
          </p>
        </div>

        <div className="mkt-filter-row" data-aos="fade-up" data-aos-delay="50">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`mkt-filter-btn${category === cat.id ? " is-active" : ""}`}
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mkt-testimonial-grid">
          {testimonials.map((t, i) => {
            const dimmed = category !== 1 && !t.categories.includes(category);
            return (
              <article
                key={t.name}
                className="mkt-testimonial"
                data-aos="fade-up"
                data-aos-delay={i * 60}
              >
                <div className={dimmed ? "mkt-testimonial-inner dimmed" : "mkt-testimonial-inner"}>
                  <Image src={t.clientImg} height={24} alt="" className="mkt-testimonial-logo" />
                  <blockquote>&ldquo;{t.content}&rdquo;</blockquote>
                  <div className="mkt-testimonial-author">
                    <Image src={t.img} width={36} height={36} alt="" />
                    <div>
                      <strong>{t.name}</strong>
                      <span>
                        {t.role}, {t.company}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
