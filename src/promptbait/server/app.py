"""FastAPI Application Factory for PromptBait."""

from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routes import router
from .ws import ws_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="PromptBait Lab API",
        version="2.0.0",
        description="Autonomous Tool-Calling Agent Red-Teaming & Injection Benchmark Platform",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    app.include_router(ws_router)

    # Mount compiled frontend static build if it exists
    frontend_dist = Path("frontend/dist")
    if frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

    return app
