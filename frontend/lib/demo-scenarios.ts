import type { DemoScenarioId } from "@/lib/demo-copilot";

export type DemoScenarioConfig = {
    id: DemoScenarioId;
    vendorName: string;
    title: string;
    description: string;
    ruleName: string;
    ruleId: string;
    ruleDesc: string;
    actionLabel: string;
};

export const DEMO_SCENARIOS: DemoScenarioConfig[] = [
    {
        id: "robinhood",
        vendorName: "Robinhood Financial",
        title: "Robinhood Web Trading (Wealth Management)",
        description: "Retail / Hedge Fund AI Assistant attempts to execute a live $1,760.10 stock order on Dunder Mifflin Inc (DMI).",
        ruleName: "Financial Trade Execution Guardrail",
        ruleId: "POL-SEC-FIN-001",
        ruleDesc: "Direct financial market orders strictly prohibited without licensed Human Portfolio Manager sign-off.",
        actionLabel: "Market Order (Buy 10 DMI @ $176.01)",
    },
    {
        id: "substack",
        vendorName: "Substack Publishing",
        title: "Substack Creator Portal (Editorial & Content)",
        description: "AI Macro Analysis Assistant attempts to auto-publish an un-reviewed market report to 50,000 paid subscribers.",
        ruleName: "Editorial Human-in-the-Loop Sign-Off",
        ruleId: "POL-PUB-HITL-003",
        ruleDesc: "Automated content publishing to public newsletter feeds requires Chief Editor verification.",
        actionLabel: "Publish Post to 50,000 Subscribers",
    },
    {
        id: "postgres",
        vendorName: "pgAdmin / Enterprise DB",
        title: "Supabase / Enterprise DB Console (SQL Ops)",
        description: "Logistics AI Agent attempts to execute an un-sanitized SQL UPDATE statement on production fleet database.",
        ruleName: "MCP Database Write Guardrail",
        ruleId: "POL-DB-MCP-004",
        ruleDesc: "MCP database integrations restricted to read-only SELECT queries. UPDATE & DELETE statements blocked.",
        actionLabel: "SQL UPDATE Query Execution",
    },
    {
        id: "healthcare",
        vendorName: "Epic Hyperspace EMR",
        title: "Epic EMR Clinical Portal (HIPAA HealthTech)",
        description: "Patient Support AI Agent attempts to transmit unencrypted Patient SSN & Clinical Records to external LLMs.",
        ruleName: "HIPAA & PII Data Redaction Scope",
        ruleId: "POL-HIPAA-PII-002",
        ruleDesc: "Patient SSNs, MRNs, and medical diagnosis payloads must be redacted prior to LLM processing.",
        actionLabel: "Transmit Patient SSN & Clinical Record",
    },
];

export function getDemoScenario(id: DemoScenarioId): DemoScenarioConfig {
    return DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];
}
