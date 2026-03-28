# creates the FastAPI app, includes API router

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi import HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

import firebase_admin
from firebase_admin import credentials


from dotenv import load_dotenv
load_dotenv()
cred = os.getenv("SERVICE_FIREBASE")

firebase_cred = credentials.Certificate(cred)
firebase_admin.initialize_app(firebase_cred)

def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app

app = create_app() # entry point
