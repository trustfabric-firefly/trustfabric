# creates the FastAPI app, includes API router

from __future__ import annotations

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings

def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.include_router(api_router)
    return app

app = create_app()  # entry point
