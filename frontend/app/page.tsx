import type { Metadata } from "next";
import { TrustFabricLanding } from "@/components/marketing/TrustFabricLanding";

export const metadata: Metadata = {
  title: "Enterprise AI Governance Platform",
  description:
    "TrustFabric — continuously monitor AI systems, enforce governance policies, and maintain NIST AI RMF-aligned compliance for enterprise organizations.",
};

export default function HomePage() {
  return <TrustFabricLanding />;
}
