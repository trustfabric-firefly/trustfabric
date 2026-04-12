# all API endpoints defined here

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes.audit import router as audit_router
from app.api.routes.copilot import router as copilot_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.api.routes.integrations import router as integrations_router
from app.api.routes.scan_policies import router as scan_policies_router
from app.api.routes.scans import router as scans_router
from app.api.routes.compliance import router as compliance_router
from app.api.routes.settings import router as settings_router
from app.api.routes.systems import router as systems_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["health"])
api_router.include_router(systems_router, prefix="/api/v1/systems", tags=["systems"])
api_router.include_router(events_router, prefix="/api/v1/events", tags=["events"])
api_router.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["dashboard"])
api_router.include_router(audit_router, prefix="/api/v1/audit", tags=["audit"])
api_router.include_router(copilot_router, prefix="/api/v1/copilot", tags=["copilot"])
api_router.include_router(integrations_router, prefix="/api/v1/integrations", tags=["integrations"])
api_router.include_router(scans_router, prefix="/api/v1/scans", tags=["scans"])
api_router.include_router(scan_policies_router, prefix="/api/v1/scan-policies", tags=["scan-policies"])
api_router.include_router(settings_router, prefix="/api/v1/settings", tags=["settings"])
api_router.include_router(compliance_router, prefix="/api/v1", tags=["compliance"])
