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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    register_error_handlers(app)
    return app


app = create_app()  # entry point
