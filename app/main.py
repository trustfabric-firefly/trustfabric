# creates the FastAPI app, includes API router

from __future__ import annotations

from fastapi import FastAPI
from fastapi import HTTPException, status

from app.api.router import api_router
from app.core.config import settings

import firebase_admin
from firebase_admin import credentials

cred = credentials.Certificate("firefly-7bd68-firebase-adminsdk-fbsvc-233179879c.json")
firebase_admin.initialize_app(cred)

def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.include_router(api_router)
    return app

app = create_app() # entry point