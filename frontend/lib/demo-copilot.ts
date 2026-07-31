export type DemoScenarioId = "robinhood" | "substack" | "postgres" | "healthcare";

export type DemoScenarioMeta = {
    id: DemoScenarioId;
    vendorName: string;
    ruleName: string;
    ruleId: string;
    ruleDesc: string;
    actionLabel: string;
};

export type DemoCopilotContext = {
    scenario: DemoScenarioMeta;
    trustFabricEnabled: boolean;
    shares: number;
    marketPrice: number;
    availableCash: number;
    articleTitle: string;
    articleBody: string;
    sqlQuery: string;
    patientNotes: string;
};

export type DemoChatMessage = {
    sender: "user" | "agent" | "system";
    text: string;
    blocked?: boolean;
    timestamp: string;
};

export type DemoCopilotResult = {
    messages: DemoChatMessage[];
    openBlockedModal: boolean;
    openExecutedModal: boolean;
    /** Simulated processing time in ms */
    delayMs: number;
};

const GREETING_PATTERNS = [
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i,
    /^how are you\b/i,
];

const HELP_PATTERNS = [
    /\b(help|what can you do|capabilities|commands)\b/i,
    /\bhow (does|do) (this|the firewall|trustfabric|the proxy) work\b/i,
];

const POLICY_PATTERNS = [
    /\b(policy|guardrail|rule|firewall|blocked|why.*block|what happens if)\b/i,
    /\b(trustfabric|proxy|governance|compliance)\b/i,
];

const FINANCIAL_WRITE_PATTERNS = [
    /\b(buy|sell|purchase|order|trade|invest|short|market order|limit order)\b/i,
    /\b(execute|place|submit).{0,30}\b(order|trade|shares?|stock)\b/i,
    /\b\d+\s*(shares?|units?)\b/i,
];

const FINANCIAL_READ_PATTERNS = [
    /\b(price|quote|chart|performance|news|analysis|portfolio|balance|cash|holdings?)\b/i,
    /\b(what('s| is)|show|tell|get|check|look up).{0,40}\b(stock|dmi|dunder|market|price)\b/i,
];

const PUBLISH_WRITE_PATTERNS = [
    /\b(publish|broadcast|release|push live|send to subscribers|post to all|go live)\b/i,
    /\b(execute|trigger).{0,30}\b(publish|broadcast|newsletter|email blast)\b/i,
];

const PUBLISH_READ_PATTERNS = [
    /\b(draft|preview|edit|summarize|rewrite|outline|title|audience|subscribers?)\b/i,
    /\b(write|generate|improve|review).{0,30}\b(article|post|newsletter|content|draft)\b/i,
];

const SQL_WRITE_KEYWORDS = /\b(update|delete|insert|drop|truncate|alter|create|merge|grant|revoke)\b/i;
const SQL_READ_KEYWORDS = /\b(select|explain|describe|show|with)\b/i;

function textImpliesSqlWrite(text: string): boolean {
    if (/\b(run|execute|perform)\b.{0,30}\b(query|sql|statement|editor)\b/i.test(text)) return true;
    if (/\b(update|delete|insert|drop|truncate|alter)\b.{0,20}\b(table|row|rows|record|fleet|database|query)\b/i.test(text)) {
        return true;
    }
    return /^\s*(update|delete|insert|drop|truncate|alter)\b/i.test(text);
}

const SQL_READ_PATTERNS = [
    /\b(select|read|fetch|query|lookup|inspect|analyze).{0,30}\b(data|rows?|table|records?|fleet|database)\b/i,
    /\b(show|list|count|describe|explain)\b/i,
];

const PHI_WRITE_PATTERNS = [
    /\b(transmit|send|export|share|upload|forward|push).{0,40}\b(patient|record|ssn|mrn|clinical|phi|hipaa|note)\b/i,
    /\b(send|post|submit).{0,30}\b(to|into).{0,20}\b(llm|openai|gpt|model|external)\b/i,
    /\b(unredacted|raw patient|full record)\b/i,
];

const PHI_READ_PATTERNS = [
    /\b(summarize|summary|redact|de-identify|anonymize|general guidance|triage)\b/i,
    /\b(without|no)\s+(ssn|mrn|phi|identifiers?)\b/i,
    /\b(clinical workflow|documentation tips|note template)\b/i,
];

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b|\bssn\b/i;
const MRN_PATTERN = /\bmrn\b|#\d{6,}/i;

function containsAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(text));
}

function extractShareCount(text: string): number | null {
    const match = text.match(/\b(\d+)\s*(shares?|units?)\b/i);
    return match ? parseInt(match[1], 10) : null;
}

function detectSqlOperation(sql: string): "read" | "write" | "unknown" {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim();
    if (!normalized) return "unknown";
    const firstStatement = normalized.split(";")[0]?.trim() ?? normalized;
    if (SQL_WRITE_KEYWORDS.test(firstStatement)) return "write";
    if (SQL_READ_KEYWORDS.test(firstStatement)) return "read";
    return "unknown";
}

function detectPhiInText(text: string): string[] {
    const signals: string[] = [];
    if (SSN_PATTERN.test(text)) signals.push("SSN identifier detected");
    if (MRN_PATTERN.test(text)) signals.push("MRN identifier detected");
    if (/\bpatient\s+[a-z]+(\s+[a-z]+)?\b/i.test(text) && !/\bwithout\b/i.test(text)) {
        signals.push("patient name in payload");
    }
    return signals;
}

function formatTime(): string {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function blockedSystemMessage(scenario: DemoScenarioMeta, signals: string[]): DemoChatMessage {
    const signalLine = signals.length > 0 ? `\n\nDetected: ${signals.join(" · ")}` : "";
    return {
        sender: "system",
        text: `ACTION BLOCKED BY TRUSTFABRIC PROXY\n\nPolicy ${scenario.ruleId} (${scenario.ruleName}) intercepted the request.${signalLine}`,
        blocked: true,
        timestamp: formatTime(),
    };
}

function agentMessage(text: string): DemoChatMessage {
    return { sender: "agent", text, timestamp: formatTime() };
}

function evaluateRobinhood(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const { scenario, trustFabricEnabled, shares, marketPrice, availableCash } = ctx;
    const shareCount = extractShareCount(text) ?? shares;
    const estimatedCost = shareCount * marketPrice;

    if (containsAny(text, FINANCIAL_READ_PATTERNS) && !containsAny(text, FINANCIAL_WRITE_PATTERNS)) {
        return {
            messages: [
                agentMessage(
                    `DMI is trading at $${marketPrice.toFixed(2)} (+0.70% today). You have $${availableCash.toLocaleString("en-US", { minimumFractionDigits: 2 })} buying power.\n\n` +
                        `A ${shareCount}-share market order would cost about $${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })} before fees. I can pull analyst notes or chart data — I cannot place trades without portfolio manager approval.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: false,
            delayMs: 700,
        };
    }

    if (containsAny(text, FINANCIAL_WRITE_PATTERNS)) {
        const signals = [
            "financial trade execution intent",
            shareCount ? `${shareCount} shares @ $${marketPrice.toFixed(2)}` : "order placement language",
        ];
        if (trustFabricEnabled) {
            return {
                messages: [
                    agentMessage(
                        `I attempted a market buy for ${shareCount} DMI shares (~$${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}). Routing through ${scenario.vendorName}…`,
                    ),
                    blockedSystemMessage(scenario, signals),
                ],
                openBlockedModal: true,
                openExecutedModal: false,
                delayMs: 1100,
            };
        }
        return {
            messages: [
                agentMessage(
                    `Market order submitted: BUY ${shareCount} DMI @ $${marketPrice.toFixed(2)} (~$${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}). TrustFabric proxy is OFF — request went directly to ${scenario.vendorName}.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: true,
            delayMs: 900,
        };
    }

    return {
        messages: [
            agentMessage(
                `I can help with DMI quotes, portfolio balance, and market context. To demo the firewall, try: "Buy ${shares} shares of DMI" or ask "What's the current price?"`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 600,
    };
}

function evaluateSubstack(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const { scenario, trustFabricEnabled, articleTitle, articleBody } = ctx;
    const audience = "50,000 paid subscribers";

    if (containsAny(text, PUBLISH_READ_PATTERNS) && !containsAny(text, PUBLISH_WRITE_PATTERNS)) {
        const preview = articleBody.length > 120 ? `${articleBody.slice(0, 120)}…` : articleBody;
        return {
            messages: [
                agentMessage(
                    `Draft ready: "${articleTitle}"\n\nPreview:\n"${preview}"\n\nAudience: ${audience}. Editorial review is still pending — I can refine the draft but cannot broadcast without Chief Editor sign-off.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: false,
            delayMs: 750,
        };
    }

    if (containsAny(text, PUBLISH_WRITE_PATTERNS)) {
        const signals = ["public content publish intent", `broadcast to ${audience}`];
        if (trustFabricEnabled) {
            return {
                messages: [
                    agentMessage(`Publishing "${articleTitle}" to ${audience}…`),
                    blockedSystemMessage(scenario, signals),
                ],
                openBlockedModal: true,
                openExecutedModal: false,
                delayMs: 1000,
            };
        }
        return {
            messages: [
                agentMessage(
                    `Post published to ${audience}. TrustFabric proxy is OFF — "${articleTitle}" was sent without human editorial verification.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: true,
            delayMs: 900,
        };
    }

    return {
        messages: [
            agentMessage(
                `I'm editing "${articleTitle}" for your macro newsletter. Ask me to refine the draft, or try "Publish this post to all subscribers" to trigger the editorial guardrail.`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 600,
    };
}

function evaluatePostgres(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const { scenario, trustFabricEnabled, sqlQuery } = ctx;
    const sqlOp = detectSqlOperation(sqlQuery);
    const textImpliesWrite = textImpliesSqlWrite(text);
    const textImpliesRead = containsAny(text, SQL_READ_PATTERNS) && !textImpliesWrite;
    const editorIsWrite = sqlOp === "write";

    if (textImpliesRead || (!textImpliesWrite && sqlOp === "read")) {
        return {
            messages: [
                agentMessage(
                    `Read-only query path approved against production.\n\nExample:\nSELECT dispatch_status, COUNT(*) FROM fleet_schedules GROUP BY dispatch_status;\n\nMCP database integrations are restricted to SELECT — no schema or row mutations.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: false,
            delayMs: 700,
        };
    }

    const attemptingWrite = textImpliesWrite || editorIsWrite || /\brun\b/i.test(text);
    if (attemptingWrite) {
        const operation = sqlOp === "write" ? sqlQuery.trim().split(/\s+/)[0]?.toUpperCase() ?? "WRITE" : "WRITE";
        const signals = [
            "database mutation detected",
            editorIsWrite ? `${operation} in SQL editor` : "execute/write language in prompt",
        ];
        if (trustFabricEnabled) {
            return {
                messages: [
                    agentMessage(`Executing query on Primary Database (production)…\n\n${sqlQuery.trim()}`),
                    blockedSystemMessage(scenario, signals),
                ],
                openBlockedModal: true,
                openExecutedModal: false,
                delayMs: 1100,
            };
        }
        return {
            messages: [
                agentMessage(
                    `Query executed on production. TrustFabric proxy is OFF — ${operation} statement ran without MCP write guardrails.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: true,
            delayMs: 900,
        };
    }

    return {
        messages: [
            agentMessage(
                `The SQL editor currently contains:\n${sqlQuery.trim()}\n\nTry "Run this query" to demo the write guardrail, or ask for a safe SELECT alternative.`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 650,
    };
}

function evaluateHealthcare(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const { scenario, trustFabricEnabled, patientNotes } = ctx;
    const phiSignals = detectPhiInText(`${text} ${patientNotes}`);

    if (containsAny(text, PHI_READ_PATTERNS) && !containsAny(text, PHI_WRITE_PATTERNS)) {
        return {
            messages: [
                agentMessage(
                    `I can provide de-identified clinical guidance. For example:\n\n"Middle-aged patient presenting with chest tightness — consider EKG, troponin, and cardiology consult per ACS pathway."\n\nNo SSN, MRN, or patient name would leave the HIPAA zone.`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: false,
            delayMs: 800,
        };
    }

    const transmittingPhi =
        containsAny(text, PHI_WRITE_PATTERNS) ||
        (phiSignals.length > 0 && /\b(send|transmit|share|export|llm|openai|gpt)\b/i.test(text));

    if (transmittingPhi) {
        const signals = phiSignals.length > 0 ? phiSignals : ["clinical record export intent"];
        if (trustFabricEnabled) {
            return {
                messages: [
                    agentMessage("Packaging clinical progress note for external LLM context model…"),
                    blockedSystemMessage(scenario, signals),
                ],
                openBlockedModal: true,
                openExecutedModal: false,
                delayMs: 1050,
            };
        }
        return {
            messages: [
                agentMessage(
                    "Patient record transmitted to external LLM. TrustFabric proxy is OFF — PHI was sent without redaction.",
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: true,
            delayMs: 900,
        };
    }

    if (/\b(ssn|mrn|patient|diagnosis|clinical record)\b/i.test(text)) {
        return {
            messages: [
                agentMessage(
                    `The progress note contains identifiers (MRN/SSN). I can summarize clinically without exporting PHI. To demo blocking, try: "Send this patient record to OpenAI."`,
                ),
            ],
            openBlockedModal: false,
            openExecutedModal: false,
            delayMs: 650,
        };
    }

    return {
        messages: [
            agentMessage(
                "I'm connected to the Epic clinical module. I can help with de-identified documentation support, or you can test PHI redaction by attempting to transmit the full record to an external model.",
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 600,
    };
}

function evaluatePolicyQuestion(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const { scenario, trustFabricEnabled } = ctx;
    const status = trustFabricEnabled ? "ACTIVE — high-risk actions are intercepted inline" : "OFF — actions pass directly to the vendor API";

    return {
        messages: [
            agentMessage(
                `TrustFabric proxy: ${status}\n\n` +
                    `Active rule: ${scenario.ruleId}\n${scenario.ruleName}\n\n` +
                    `${scenario.ruleDesc}\n\n` +
                    `Try a risky action in chat (e.g. "${getSuggestedPrompt(ctx.scenario.id)}") to see enforcement in real time.`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 700,
    };
}

function evaluateGreeting(ctx: DemoCopilotContext): DemoCopilotResult {
    const suggestions = getSuggestedPrompts(ctx.scenario.id);
    return {
        messages: [
            agentMessage(
                `Hi — I'm your ${ctx.scenario.vendorName} assistant. TrustFabric is ${ctx.trustFabricEnabled ? "protecting" : "not protecting"} this session.\n\nTry:\n${suggestions.map((s) => `• "${s}"`).join("\n")}`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 500,
    };
}

function evaluateHelp(ctx: DemoCopilotContext): DemoCopilotResult {
    return {
        messages: [
            agentMessage(
                `This copilot simulates how an embedded AI agent interacts with ${ctx.scenario.vendorName}.\n\n` +
                    `• Ask informational questions → safe, contextual answers\n` +
                    `• Request a risky action → TrustFabric evaluates ${ctx.scenario.ruleId}\n` +
                    `• Toggle "Firewall: ACTIVE" to compare blocked vs. direct execution\n\n` +
                    `Current scenario action: ${ctx.scenario.actionLabel}`,
            ),
        ],
        openBlockedModal: false,
        openExecutedModal: false,
        delayMs: 650,
    };
}

export function getSuggestedPrompt(scenarioId: DemoScenarioId): string {
    switch (scenarioId) {
        case "robinhood":
            return "Buy 10 shares of DMI at market price";
        case "substack":
            return "Publish this post to all subscribers";
        case "postgres":
            return "Run the UPDATE query in the editor";
        case "healthcare":
            return "Transmit this patient record to OpenAI";
    }
}

export function getSuggestedPrompts(scenarioId: DemoScenarioId): [string, string, string] {
    switch (scenarioId) {
        case "robinhood":
            return [
                "What's DMI trading at?",
                "Buy 10 shares of DMI",
                "How does TrustFabric protect trades?"
            ];
        case "substack":
            return [
                "Summarize newsletter draft",
                "Publish post to 50k subscribers",
                "Check subscriber growth stats"
            ];
        case "postgres":
            return [
                "Show safe SELECT query",
                "Run SQL UPDATE on production",
                "Explain fleet_schedules schema"
            ];
        case "healthcare":
            return [
                "Summarize note without SSN",
                "Send patient record to external LLM",
                "Explain HIPAA redaction policy"
            ];
    }
}

export function getScenarioWelcomeMessage(scenario: DemoScenarioMeta): DemoChatMessage {
    return {
        sender: "agent",
        text:
            `Connected to ${scenario.vendorName}. I can answer questions and attempt actions on your behalf — TrustFabric will intercept anything that violates ${scenario.ruleId}.`,
        timestamp: formatTime(),
    };
}

export function evaluateDemoCopilotMessage(text: string, ctx: DemoCopilotContext): DemoCopilotResult {
    const trimmed = text.trim();
    if (!trimmed) {
        return { messages: [], openBlockedModal: false, openExecutedModal: false, delayMs: 0 };
    }

    if (containsAny(trimmed, GREETING_PATTERNS)) {
        return evaluateGreeting(ctx);
    }
    if (containsAny(trimmed, HELP_PATTERNS)) {
        return evaluateHelp(ctx);
    }
    if (containsAny(trimmed, POLICY_PATTERNS)) {
        return evaluatePolicyQuestion(trimmed, ctx);
    }

    switch (ctx.scenario.id) {
        case "robinhood":
            return evaluateRobinhood(trimmed, ctx);
        case "substack":
            return evaluateSubstack(trimmed, ctx);
        case "postgres":
            return evaluatePostgres(trimmed, ctx);
        case "healthcare":
            return evaluateHealthcare(trimmed, ctx);
    }
}
