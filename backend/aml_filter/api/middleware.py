"""FastAPI middleware for security headers and rate limiting."""

import logging

from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from aml_filter.security.rate_limit import check_rate_limit, get_rate_limit_for_plan

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Use relaxed CSP for Swagger UI and ReDoc endpoints to allow CDN resources
        if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "font-src 'self' https://cdn.jsdelivr.net"
            )
        else:
            # Strict CSP for API endpoints
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'"
            )

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to apply rate limiting."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health checks and docs
        if request.url.path in ["/health", "/docs", "/redoc", "/openapi.json", "/"]:
            return await call_next(request)

        # Get tenant_id from request state (set by auth middleware)
        tenant_id = getattr(request.state, "tenant_id", None)

        if tenant_id:
            # Extract endpoint from path
            endpoint = request.url.path
            if endpoint.startswith("/v1/"):
                endpoint = endpoint[4:].split("/")[0] or "default"
            else:
                endpoint = "default"

            # Get rate limit for tenant plan (default to starter)
            # TODO: Fetch from database
            plan = "starter"
            limits = get_rate_limit_for_plan(plan)
            limit = limits.get(endpoint, limits.get("screen", 100))

            # Check rate limit
            try:
                allowed, remaining, reset_after = await check_rate_limit(
                    getattr(request.app.state, "redis_client", None),
                    tenant_id=tenant_id,
                    endpoint=endpoint,
                    limit=limit,
                    window_seconds=60,
                )

                # Store in request state
                request.state.rate_limit_remaining = remaining
                request.state.rate_limit_reset = reset_after

                if not allowed:
                    response = Response(
                        content=f'{{"detail": "Rate limit exceeded. {remaining} requests remaining. Resets in {reset_after}s."}}',
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        media_type="application/json",
                    )
                    response.headers["X-RateLimit-Limit"] = str(limit)
                    response.headers["X-RateLimit-Remaining"] = str(remaining)
                    response.headers["X-RateLimit-Reset"] = str(reset_after)
                    response.headers["Retry-After"] = str(reset_after)
                    return response
            except Exception as exc:  # noqa: BLE001 — middleware fail-open: never block the request
                logger.warning("Rate limit check failed (fail-open): %s", exc)

        response = await call_next(request)

        # Add rate limit headers if available
        if hasattr(request.state, "rate_limit_remaining"):
            response.headers["X-RateLimit-Remaining"] = str(request.state.rate_limit_remaining)
        if hasattr(request.state, "rate_limit_reset"):
            response.headers["X-RateLimit-Reset"] = str(request.state.rate_limit_reset)

        return response
