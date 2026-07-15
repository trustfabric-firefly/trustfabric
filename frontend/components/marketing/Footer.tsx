import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";

const links = {
  Product: [
    { label: "Platform", href: "#platform" },
    { label: "Workflows", href: "#workflows" },
    { label: "Enterprise", href: "#enterprise" },
    { label: "Compliance", href: "#compliance" },
    { label: "Security", href: "#security" },
  ],
  Company: [
    { label: "Contact", href: "#contact" },
    { label: "Sign in", href: "/login" },
    { label: "Request demo", href: "mailto:hello@trustfabric.ai" },
  ],
  Resources: [
    { label: "NIST AI RMF", href: "#compliance" },
    { label: "Documentation", href: "/login" },
    { label: "SSO setup", href: "/login" },
    { label: "Demo — Figma", href: "https://streamable.com/h1niib" },
  ],
};

export function Footer() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container mkt-footer-grid">
        {Object.entries(links).map(([title, items]) => (
          <div key={title}>
            <h3>{title}</h3>
            <ul>
              {items.map((item) => (
                <li key={item.label}>
                  {item.href.startsWith("http") ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
                  ) : (
                    <Link href={item.href}>{item.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mkt-footer-brand">
          <Logo />
          <p className="mkt-footer-copy">
            © {new Date().getFullYear()} TrustFabric — Enterprise AI governance for regulated
            organizations.
          </p>
        </div>
      </div>
    </footer>
  );
}
