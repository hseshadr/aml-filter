"""FastAPI application and API endpoints."""

import os
from collections.abc import Callable, Mapping
from contextlib import AbstractAsyncContextManager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from aml_filter.api.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from aml_filter.api.v1 import router as v1_router
from aml_filter.security.rate_limit import set_redis_client

# Type alias for lifespan context manager (matches FastAPI's expected type)
LifespanType = (
    Callable[[FastAPI], AbstractAsyncContextManager[Mapping[str, Any] | None]] | None
)


def create_app(
    lifespan: LifespanType = None,
) -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="AML-Filter v2 API",
        description="Open-Source AI-Native AML & Sanctions Screening Engine",
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,  # type: ignore[arg-type]
    )

    # Security headers middleware (first)
    app.add_middleware(SecurityHeadersMiddleware)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting middleware (after CORS, before routes)
    app.add_middleware(RateLimitMiddleware)

    # Initialize Redis for rate limiting (optional)
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    if redis_url:
        try:
            redis_client = Redis.from_url(redis_url, decode_responses=False)
            set_redis_client(redis_client)
        except Exception:
            # Redis is optional, continue without it
            pass

    # Include API routers
    app.include_router(v1_router)

    @app.get("/")
    async def root() -> dict[str, str]:
        """Root endpoint."""
        return {
            "name": "AML-Filter v2",
            "version": "2.0.0",
            "status": "running",
        }

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Health check endpoint."""
        return {"status": "healthy"}

    return app


__all__ = ["create_app"]
