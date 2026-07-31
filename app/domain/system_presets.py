from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from app.domain.models import (
    AISystemCreate,
    DataSensitivity,
    ModelType,
    RiskTier,
    SystemStatus,
)


class SystemPreset(BaseModel):
    category_id: str = Field(..., description="Vertical identifier (e.g., calculated_risk, sisu_energy, solaris_tech, trellis_energy, enterprise)")
    category_name: str = Field(..., description="Human readable category name")
    name: str = Field(..., description="System name")
    description: str = Field(..., description="System business description")
    owner: str = Field(..., description="System owner or title")
    business_unit: str = Field(..., description="Department or business unit")
    model_type: ModelType = Field(..., description="Type of model")
    data_sensitivity: DataSensitivity = Field(..., description="Data sensitivity level")
    status: SystemStatus = Field(default=SystemStatus.active, description="System lifecycle status")
    risk_tier: Optional[RiskTier] = Field(default=None, description="Assigned risk tier")
    risk_justification: Optional[str] = Field(default=None, description="Justification for risk tier assignment")
    external_integrations: List[str] = Field(default_factory=list, description="External system tags")

    def to_create_payload(self) -> AISystemCreate:
        return AISystemCreate(
            name=self.name,
            description=self.description,
            owner=self.owner,
            business_unit=self.business_unit,
            model_type=self.model_type,
            data_sensitivity=self.data_sensitivity,
            external_integrations=self.external_integrations,
            status=self.status,
            risk_tier=self.risk_tier,
            risk_justification=self.risk_justification,
        )


PRESET_SYSTEMS: List[SystemPreset] = [
    # --------------------------------------------------------------------------
    # Calculated Risk (Macroeconomics & Housing Market Analysis)
    # --------------------------------------------------------------------------
    SystemPreset(
        category_id="calculated_risk",
        category_name="Calculated Risk (Macro & Financial Intelligence)",
        name="Econ-LLM Macro Analysis Assistant",
        description="AI writing and synthesis engine that ingests Fed releases, Census data, and BLS reports to draft macroeconomic commentary and housing market insights.",
        owner="Director of Macroeconomic Research",
        business_unit="Editorial & Market Analysis",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Market-moving research output requires strict auditability, source data validation, and hallucination verification.",
        external_integrations=["Substack", "OpenAI", "Federal Reserve API", "Census Bureau API"],
    ),
    SystemPreset(
        category_id="calculated_risk",
        category_name="Calculated Risk (Macro & Financial Intelligence)",
        name="Housing Market & Census Data Pipeline",
        description="Machine learning pipeline processing regional housing inventory, mortgage rate trends, and demographic datasets for predictive forecasting.",
        owner="Lead Data Scientist",
        business_unit="Quantitative Research",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.medium,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Core predictive model informing public analysis; drift or data corruption directly impacts subscriber trust.",
        external_integrations=["FRED Data", "MLS Feeds", "Python Scikit-Learn"],
    ),
    SystemPreset(
        category_id="calculated_risk",
        category_name="Calculated Risk (Macro & Financial Intelligence)",
        name="Substack Content & Fact-Check Audit Bot",
        description="Autonomous verification agent checking pre-publication articles for statistical accuracy, citation provenance, and source freshness.",
        owner="Senior Managing Editor",
        business_unit="Editorial Quality Control",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.low,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier3,
        risk_justification="Internal quality gate; failures result in editorial re-review prior to publication.",
        external_integrations=["Substack API", "Anthropic Claude", "FactCheck-DB"],
    ),

    # --------------------------------------------------------------------------
    # Sisu Energy LLC (Oil & Gas Frac Sand Logistics & Owner-Operator Fleet)
    # --------------------------------------------------------------------------
    SystemPreset(
        category_id="sisu_energy",
        category_name="Sisu Energy LLC (Oilfield Logistics & Fleet)",
        name="Automated Dispatch & Frac Sand Load Router",
        description="24/7 intelligent routing agent assigning pneumatic and hopper bottom loads to 100% owner-operator drivers across the Permian and Eagle Ford basins.",
        owner="VP of Fleet Operations & Logistics",
        business_unit="Dispatch Operations",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Directly controls high-value frac sand deliveries to active oil rigs ($80k/hr downtime risk); requires safety & DOT compliance checks.",
        external_integrations=["SAMSARA Telematics", "TMS Dispatch", "Permian GIS"],
    ),
    SystemPreset(
        category_id="sisu_energy",
        category_name="Sisu Energy LLC (Oilfield Logistics & Fleet)",
        name="Owner-Operator Safety & Compliance Vault",
        description="Predictive risk model analyzing contractor driving history, DOT certifications, IRP plates, and insurance coverage to flag compliance gaps before dispatch.",
        owner="Director of Safety & Regulatory Compliance",
        business_unit="Safety & Risk Management",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Enforces federal motor carrier safety standards and prevents unverified or uninsured contractors from receiving loads.",
        external_integrations=["FMCSA Clearinghouse", "DOT Verification API", "IRP Database"],
    ),
    SystemPreset(
        category_id="sisu_energy",
        category_name="Sisu Energy LLC (Oilfield Logistics & Fleet)",
        name="Permian Basin Fleet Telematics & ETA Predictor",
        description="Machine learning model monitoring real-time truck GPS, wellhead congestion, and transit conditions to provide accurate site delivery ETAs.",
        owner="Lead Logistics Data Analyst",
        business_unit="Field Telematics",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.medium,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Informs customer scheduling; delivery delays impact well completion timelines.",
        external_integrations=["GPS Gateway", "Google Maps Platform", "Wellsite API"],
    ),

    # --------------------------------------------------------------------------
    # Solaris Technologies Services (Mobile Towers, Hybrid Power & Satellite WiFi)
    # --------------------------------------------------------------------------
    SystemPreset(
        category_id="solaris_tech",
        category_name="Solaris Technologies Services (Mobile Towers & Power)",
        name="COW Power Management & Tri-Power Solar Switcher",
        description="Autonomous power switching controller managing tri-power (solar panel, generator, shore power) allocation for remote Cell-on-Wheels (COW) units.",
        owner="VP of Hardware & Power Systems",
        business_unit="Power Infrastructure",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Mission-critical autonomous hardware control for remote military (Navy) and emergency response deployments; failure causes tower outages.",
        external_integrations=["IoT Sensor Bus", "Generator Modbus", "Solar Controller"],
    ),
    SystemPreset(
        category_id="solaris_tech",
        category_name="Solaris Technologies Services (Mobile Towers & Power)",
        name="Remote Mobile Tower Predictive Maintenance AI",
        description="Machine learning model predicting mechanical, structural, and electrical failures in deployed mobile communications towers before outage occurrence.",
        owner="Director of Field Telemetry & Reliability",
        business_unit="Field Infrastructure",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Ensures 99.999% uptime SLAs for defense, telecom, and disaster recovery customers.",
        external_integrations=["Telemetry Cloud", "AWS IoT Core", "ServiceNow ITOM"],
    ),
    SystemPreset(
        category_id="solaris_tech",
        category_name="Solaris Technologies Services (Mobile Towers & Power)",
        name="MITT Satellite WiFi Bandwidth Optimizer",
        description="Dynamic bandwidth allocation agent optimizing Starlink LEO satellite backhaul and cellular redundancy for field operations.",
        owner="Lead Communications Engineer",
        business_unit="Telecom & Connectivity",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.medium,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Controls emergency WiFi quality of service for first responders and field technicians.",
        external_integrations=["Starlink LEO API", "Cisco Meraki", "Cellular Routers"],
    ),

    # --------------------------------------------------------------------------
    # Trellis Energy Partners (Non-Operated Oil & Gas Private Equity & Asset Management)
    # --------------------------------------------------------------------------
    SystemPreset(
        category_id="trellis_energy",
        category_name="Trellis Energy Partners (Energy Private Equity)",
        name="Decline Curve & Reservoir Engineering AI Model",
        description="Machine learning model performing automated decline curve analysis (DCA) and estimated ultimate recovery (EUR) projections for non-operated well interests.",
        owner="Chief Reservoir Engineer",
        business_unit="Reservoir Engineering",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Core asset valuation model driving multi-million-dollar fund allocation decisions in the Permian and Haynesville basins.",
        external_integrations=["Enverus API", "IHS Markit", "Python Reservoir Analytics"],
    ),
    SystemPreset(
        category_id="trellis_energy",
        category_name="Trellis Energy Partners (Energy Private Equity)",
        name="Non-Op Well Deal Underwriting & Valuation Agent",
        description="Autonomous underwriting agent synthesizing leasehold terms, operator track records (Chevron, Oxy, EOG), and cash flow models to score prospective acquisitions.",
        owner="Chief Investment Officer",
        business_unit="Private Equity Underwriting",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Determines acquisition pricing for non-operated working interests; errors impact LP fund returns (TEP Fund 2026).",
        external_integrations=["DataRoom Secure", "Financial Modeling Engine", "Anthropic Claude"],
    ),
    SystemPreset(
        category_id="trellis_energy",
        category_name="Trellis Energy Partners (Energy Private Equity)",
        name="LP Portfolio ESG & Financial Performance Monitor",
        description="LLM assistant summarizing quarterly fund performance, operator compliance, and environmental metrics for institutional LP reports.",
        owner="VP of Investor Relations & Governance",
        business_unit="Investor Relations",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.medium,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Generates LP communications and regulatory disclosure summaries; requires strict accuracy and confidentiality.",
        external_integrations=["LP Portal", "Financial Reporting DB", "OpenAI Enterprise"],
    ),

    # --------------------------------------------------------------------------
    # Core Enterprise / General Tech Systems
    # --------------------------------------------------------------------------
    SystemPreset(
        category_id="enterprise",
        category_name="Core Enterprise & Infrastructure",
        name="GitHub Copilot Enterprise",
        description="Developer code assistant integrated into engineering workflows for automated code completion and pull request summaries.",
        owner="VP of Software Engineering",
        business_unit="Engineering",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Has access to internal codebase repositories; requires secret scanning and license compliance governance.",
        external_integrations=["GitHub Enterprise", "OpenAI"],
    ),
    SystemPreset(
        category_id="enterprise",
        category_name="Core Enterprise & Infrastructure",
        name="Customer Support AI Assistant",
        description="Front-line customer support chatbot answering product questions, resolving tickets, and routing escalation requests.",
        owner="Head of Customer Experience",
        business_unit="Customer Support",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.medium,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier2,
        risk_justification="Customer-facing interactions require PII masking, tone monitoring, and escalation safety controls.",
        external_integrations=["Zendesk", "Intercom", "OpenAI"],
    ),
    SystemPreset(
        category_id="enterprise",
        category_name="Core Enterprise & Infrastructure",
        name="AWS Infrastructure Security & Compliance Auditor",
        description="Automated security agent continuously scanning cloud IAM roles, S3 bucket permissions, and CloudTrail logs against NIST standards.",
        owner="Chief Information Security Officer (CISO)",
        business_unit="IT & Security Governance",
        model_type=ModelType.agent,
        data_sensitivity=DataSensitivity.high,
        status=SystemStatus.active,
        risk_tier=RiskTier.tier1,
        risk_justification="Continuous compliance engine for enterprise infrastructure; high privilege access requires complete audit trail.",
        external_integrations=["AWS IAM", "AWS CloudTrail", "AWS Security Hub"],
    ),
]


def list_preset_categories() -> List[Dict[str, str]]:
    categories: Dict[str, str] = {}
    for preset in PRESET_SYSTEMS:
        if preset.category_id not in categories:
            categories[preset.category_id] = preset.category_name
    return [{"id": cat_id, "name": name} for cat_id, name in categories.items()]


def get_presets_by_category(category_id: Optional[str] = None) -> List[SystemPreset]:
    if not category_id or category_id == "all":
        return PRESET_SYSTEMS
    return [p for p in PRESET_SYSTEMS if p.category_id == category_id]
