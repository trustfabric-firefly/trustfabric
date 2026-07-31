export const INTEGRATION_SECTION_IDS = {
    github: "integration-github",
    slack: "integration-slack",
    aws: "integration-aws",
    figma: "integration-figma",
    substack: "integration-substack",
    openai: "integration-openai",
    mcp: "integration-mcp",
} as const;

export type IntegratableService = keyof typeof INTEGRATION_SECTION_IDS;

export function settingsIntegrationHref(service: IntegratableService): string {
    return `/settings#${INTEGRATION_SECTION_IDS[service]}`;
}

const DASHBOARD_INTEGRATION_HREFS: Record<string, string> = {
    GitHub: settingsIntegrationHref("github"),
    Figma: settingsIntegrationHref("figma"),
    Slack: settingsIntegrationHref("slack"),
    AWS: settingsIntegrationHref("aws"),
    Substack: settingsIntegrationHref("substack"),
    OpenAI: settingsIntegrationHref("openai"),
    MCP: settingsIntegrationHref("mcp"),
};

export function dashboardIntegrationSettingsHref(name: string): string {
    return DASHBOARD_INTEGRATION_HREFS[name] ?? "/settings";
}
