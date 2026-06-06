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


_RATE_LIMIT_EXEMPT_PATHS: frozenset[str] = frozenset(
    {"/health", "/docs", "/redoc", "/openapi.json", "/"}
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to apply rate limiting."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _RATE_LIMIT_EXEMPT_PATHS:
            return await call_next(request)

        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            blocked = await self._enforce_rate_limit(request, tenant_id)
            if blocked is not None:
                return blocked

        response = await call_next(request)
        self._attach_rate_limit_headers(request, response)
        return response

    async def _enforce_rate_limit(self, request: Request, tenant_id: str) -> Response | None:
        """Check the limit; return a 429 Response if exceeded, else None (fail-open on error)."""
        endpoint = self._endpoint_for(request.url.path)
        # Defaults to the "starter" tier; per-tenant plan lookup tracked in #16
        limits = get_rate_limit_for_plan("starter")
        limit = limits.get(endpoint, limits.get("screen", 100))
        try:
            allowed, remaining, reset_after = await check_rate_limit(
                getattr(request.app.state, "redis_client", None),
                tenant_id=tenant_id,
                endpoint=endpoint,
                limit=limit,
                window_seconds=60,
            )
        except Exception as exc:  # noqa: BLE001 — middleware fail-open: never block the request
            logger.warning("Rate limit check failed (fail-open): %s", exc)
            return None
        request.state.rate_limit_remaining = remaining
        request.state.rate_limit_reset = reset_after
        if allowed:
            return None
        return self._too_many_requests(limit, remaining, reset_after)

    @staticmethod
    def _endpoint_for(path: str) -> str:
        """Derive the rate-limit bucket key from the request path."""
        if path.startswith("/v1/"):
            return path[4:].split("/", maxsplit=1)[0] or "default"
        return "default"

    @staticmethod
    def _too_many_requests(limit: int, remaining: int, reset_after: int) -> Response:
        """Build the 429 response with rate-limit headers."""
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

    @staticmethod
    def _attach_rate_limit_headers(request: Request, response: Response) -> None:
        """Copy any rate-limit counters stashed on request state onto the response."""
        if hasattr(request.state, "rate_limit_remaining"):
            response.headers["X-RateLimit-Remaining"] = str(request.state.rate_limit_remaining)
        if hasattr(request.state, "rate_limit_reset"):
            response.headers["X-RateLimit-Reset"] = str(request.state.rate_limit_reset)
