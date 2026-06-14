"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/marketing/Logo";

const nav = [
  { label: "Platform", href: "#platform" },
  { label: "Workflows", href: "#workflows" },
  { label: "Enterprise", href: "#enterprise" },
  { label: "Compliance", href: "#compliance" },
  { label: "Contact", href: "#contact" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`mkt-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="mkt-container">
        <div className="mkt-header-inner">
          <Logo />
          <nav className="mkt-nav" aria-label="Primary">
            {nav.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mkt-header-actions">
            <Link href="/login" className="mkt-ghost-link">
              Sign in
            </Link>
            <Link href="#contact" className="mkt-pill mkt-pill-white">
              Request demo
            </Link>
          </div>
          <button
            type="button"
            className="mkt-menu-btn"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        <div className={`mkt-mobile-nav${open ? " open" : ""}`}>
          {nav.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className="mkt-btn-row">
            <Link href="/login" className="mkt-pill mkt-pill-ghost" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="#contact" className="mkt-pill mkt-pill-white" onClick={() => setOpen(false)}>
              Request demo
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
