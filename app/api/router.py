# all API endpoints defined here

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes.audit import router as audit_router
from app.api.routes.copilot import router as copilot_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.api.routes.systems import router as systems_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["health"])
api_router.include_router(systems_router, prefix="/api/v1/systems", tags=["systems"])
api_router.include_router(events_router, prefix="/api/v1/events", tags=["events"])
api_router.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["dashboard"])
api_router.include_router(audit_router, prefix="/api/v1/audit", tags=["audit"])
api_router.include_router(copilot_router, prefix="/api/v1/copilot", tags=["copilot"])
