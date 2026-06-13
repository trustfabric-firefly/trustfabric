export const INTEGRATION_SECTION_IDS = {
    github: "integration-github",
    slack: "integration-slack",
    aws: "integration-aws",
    figma: "integration-figma",
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
};

export function dashboardIntegrationSettingsHref(name: string): string {
    return DASHBOARD_INTEGRATION_HREFS[name] ?? "/settings";
}
