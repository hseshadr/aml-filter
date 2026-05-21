"""FastAPI application factory."""

from collections.abc import Callable, Mapping
from contextlib import AbstractAsyncContextManager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from aml_filter.api.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from aml_filter.api.v1 import router as v1_router

# Type alias for lifespan context manager (matches FastAPI's expected type)
LifespanType = Callable[[FastAPI], AbstractAsyncContextManager[Mapping[str, Any] | None]] | None


def create_app(lifespan: LifespanType = None) -> FastAPI:
    """Build the FastAPI app with middleware, routers, and a lifespan-driven init."""
    app = FastAPI(
        title="AML-Filter v2 API",
        description="Open-Source AI-Native AML & Sanctions Screening Engine",
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,  # type: ignore[arg-type]
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware)
    app.include_router(v1_router)

    @app.get("/")
    async def root() -> dict[str, str]:
        """Root endpoint."""
        return {"name": "AML-Filter v2", "version": "2.0.0", "status": "running"}

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Health check endpoint."""
        return {"status": "healthy"}

    return app


__all__ = ["create_app"]
