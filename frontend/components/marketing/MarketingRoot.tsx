import { DM_Sans } from "next/font/google";
import { MarketingAOS } from "@/components/marketing/MarketingShell";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { HeroSection } from "@/components/marketing/HeroSection";
import { WorkflowsSection } from "@/components/marketing/WorkflowsSection";
import { FeaturesSection } from "@/components/marketing/FeaturesSection";
import { EnterpriseSection } from "@/components/marketing/EnterpriseSection";
import { ComplianceSection } from "@/components/marketing/ComplianceSection";
import { SecuritySection } from "@/components/marketing/SecuritySection";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { CTASection } from "@/components/marketing/CTASection";
import { Footer } from "@/components/marketing/Footer";

const roobert = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-roobert",
  display: "swap",
});

export function MarketingRoot() {
  return (
    <div className={`marketing ${roobert.variable}`} style={{ fontFamily: "var(--font-roobert)" }}>
      <MarketingAOS>
        <MarketingHeader />
        <main>
          <HeroSection />
          <WorkflowsSection />
          <FeaturesSection />
          <EnterpriseSection />
          <ComplianceSection />
          <SecuritySection />
          <TestimonialsSection />
          <CTASection />
        </main>
        <Footer />
      </MarketingAOS>
    </div>
  );
}
