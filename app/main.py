# creates the FastAPI app, includes API router

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers

logger = logging.getLogger(__name__)


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


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
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
