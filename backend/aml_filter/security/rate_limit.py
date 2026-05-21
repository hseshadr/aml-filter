"""Rate limiting utilities using Redis."""

from __future__ import annotations

import logging

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Global Redis client (will be initialized on startup)
_redis_client: Redis[bytes] | None = None  # module-level singleton; see set_redis_client


def set_redis_client(redis_client: Redis[bytes]) -> None:
    """Set the global Redis client."""
    global _redis_client  # noqa: PLW0603 — module-level singleton wired at app startup
    _redis_client = redis_client


def get_redis_client() -> Redis[bytes] | None:
    """Get the global Redis client."""
    return _redis_client


async def check_rate_limit(
    tenant_id: str,
    endpoint: str,
    limit: int,
    window_seconds: int = 60,
) -> tuple[bool, int, int]:
    """
    Check if a request should be rate limited.

    Args:
        tenant_id: The tenant ID
        endpoint: The endpoint being accessed
        limit: Maximum number of requests allowed
        window_seconds: Time window in seconds (default: 60)

    Returns:
        Tuple of (allowed, remaining, reset_after)
        - allowed: True if request is allowed
        - remaining: Number of requests remaining
        - reset_after: Seconds until the limit resets
    """
    if _redis_client is None:
        # If Redis is not available, allow the request
        return True, limit, window_seconds

    # Create a unique key for this tenant + endpoint
    key = f"rate_limit:{tenant_id}:{endpoint}"

    try:
        # Use Redis INCR with expiration
        current = await _redis_client.incr(key)
        if current == 1:
            # First request in this window, set expiration
            await _redis_client.expire(key, window_seconds)

        # Calculate remaining and reset time
        remaining = max(0, limit - current)
        ttl = await _redis_client.ttl(key)
        reset_after = ttl if ttl > 0 else window_seconds

        allowed = current <= limit
        return allowed, remaining, reset_after

    except Exception as exc:  # noqa: BLE001 — fail-open: never block the request
        logger.warning("Rate limit check failed (fail-open): %s", exc)
        return True, limit, window_seconds


def get_rate_limit_for_plan(plan: str) -> dict[str, int]:
    """
    Get rate limit configuration for a plan.

    Args:
        plan: The tenant plan (starter, professional, enterprise)

    Returns:
        Dictionary with endpoint -> requests per minute
    """
    limits = {
        "starter": {
            "screen": 100,  # 100 requests per minute
            "batch": 10,  # 10 batch jobs per minute
            "api_keys": 5,  # 5 API key operations per minute
        },
        "professional": {
            "screen": 1000,
            "batch": 100,
            "api_keys": 20,
        },
        "enterprise": {
            "screen": 10000,
            "batch": 1000,
            "api_keys": 100,
        },
    }
    return limits.get(plan, limits["starter"])
