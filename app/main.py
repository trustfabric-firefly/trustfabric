# creates the FastAPI app, includes API router

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers

logger = logging.getLogger(__name__)

API_DESCRIPTION = """
TrustFabric REST API — multi-tenant AI governance control plane.

## Authentication

Send a Bearer token on protected routes:

| Mode | Token | When |
|---|---|---|
| **Dev** | `ADMIN_TOKEN` or `VIEWER_TOKEN` from `.env` | `APP_ENV` is not `production` |
| **Production** | Firebase ID token | Always preferred when Firebase is configured |

Optional header: `X-Organization-Id` — select the active organization when the user belongs to more than one.

## Conventions

- Base path for versioned resources: `/api/v1/...`
- Write endpoints may accept `Idempotency-Key` to safely retry creates
- Interactive docs: **Swagger UI** at `/docs`, **ReDoc** at `/redoc`, raw schema at `/openapi.json`
""".strip()

OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness and readiness probes"},
    {"name": "sso", "description": "SAML SSO discovery, login, ACS, and code exchange"},
    {"name": "organizations", "description": "Org profile, members, invites, SSO config, copilot quotas"},
    {"name": "systems", "description": "AI system registry CRUD, policies, and missing-controls explain"},
    {"name": "policies", "description": "Governance policy catalog (risk-tier → required controls)"},
    {"name": "events", "description": "Simulated activity event ingest and query"},
    {"name": "dashboard", "description": "Governance posture summaries and NIST coverage"},
    {"name": "audit", "description": "Governance change history"},
    {"name": "llm-logs", "description": "Copilot / LLM interaction audit logs (admin)"},
    {"name": "copilot", "description": "LLM recommendations and policy chat"},
    {"name": "integrations", "description": "GitHub, Slack, AWS, and Figma connections"},
    {"name": "scans", "description": "GitHub and AWS compliance scans and reports"},
    {"name": "scan-policies", "description": "Toggleable scan check policies"},
    {"name": "settings", "description": "Non-secret settings / provider status"},
    {"name": "compliance", "description": "Framework evaluation against scan results"},
    {"name": "brand-compliance", "description": "Brand / visual compliance scans"},
    {"name": "figma", "description": "Figma project/file helpers for brand scans"},
    {"name": "webhooks", "description": "Outbound SIEM webhook endpoints"},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.job_queue import job_queue
    from app.services.store import store

    try:
        migrated = store.migrate_plaintext_integration_tokens()
        if migrated:
            logger.info(
                "Encrypted legacy plaintext integration tokens for %d organization(s)",
                migrated,
            )
    except RuntimeError as exc:
        logger.debug("Integration token migration skipped: %s", exc)
    except Exception:
        logger.exception("Integration token migration failed")

    await job_queue.start()
    try:
        yield
    finally:
        await job_queue.stop()


def custom_openapi(app: FastAPI) -> dict:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=settings.app_name,
        version=settings.app_version,
        description=API_DESCRIPTION,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )
    schema["info"]["contact"] = {
        "name": "TrustFabric",
        "url": settings.frontend_url.rstrip("/"),
    }
    schema["servers"] = [
        {"url": settings.api_base_url.rstrip("/"), "description": "Configured API_BASE_URL"},
        {"url": "http://127.0.0.1:8000", "description": "Local development"},
    ]
    # Document Bearer auth so Swagger "Authorize" works for try-it-out.
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["HTTPBearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT or dev token",
        "description": (
            "Firebase ID token, or (non-production) ADMIN_TOKEN / VIEWER_TOKEN. "
            "Optionally send X-Organization-Id for multi-org users."
        ),
    }
    schema["security"] = [{"HTTPBearer": []}]
    app.openapi_schema = schema
    return app.openapi_schema


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=API_DESCRIPTION,
        openapi_tags=OPENAPI_TAGS,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.openapi = lambda: custom_openapi(app)  # type: ignore[method-assign]
    # Always allow the configured frontend origin (in addition to CORS_ORIGINS).
    allow_origins = list(dict.fromkeys([*settings.cors_origins, settings.frontend_url.rstrip("/")]))
    cors_kwargs: dict = {
        "allow_origins": allow_origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    # Local/LAN Next.js URLs (e.g. http://192.168.x.x:3000) fail CORS otherwise.
    if settings.app_env.lower() not in {"production", "prod"}:
        cors_kwargs["allow_origin_regex"] = (
            r"https?://("
            r"localhost|127\.0\.0\.1|"
            r"192\.168\.\d{1,3}\.\d{1,3}|"
            r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
            r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
            r")(:\d+)?"
        )
    app.add_middleware(CORSMiddleware, **cors_kwargs)
    app.include_router(api_router)
    register_error_handlers(app)
    return app


app = create_app()  # entry point
