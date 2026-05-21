"""Rate limiting utilities using Redis."""

from __future__ import annotations

import logging

from redis.asyncio import Redis

logger = logging.getLogger(__name__)


async def check_rate_limit(
    redis_client: Redis[bytes] | None,
    *,
    tenant_id: str,
    endpoint: str,
    limit: int,
    window_seconds: int = 60,
) -> tuple[bool, int, int]:
    """Check whether the request should be allowed. Fails open if Redis is unavailable.

    Returns:
        (allowed, remaining, reset_after_seconds)
    """
    if redis_client is None:
        return True, limit, window_seconds

    key = f"rate_limit:{tenant_id}:{endpoint}"
    try:
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, window_seconds)
        remaining = max(0, limit - current)
        ttl = await redis_client.ttl(key)
        reset_after = ttl if ttl > 0 else window_seconds
        allowed = current <= limit
    except Exception as exc:  # noqa: BLE001 — fail-open: never block the request
        logger.warning("Rate limit check failed (fail-open): %s", exc)
        return True, limit, window_seconds
    return allowed, remaining, reset_after


def get_rate_limit_for_plan(plan: str) -> dict[str, int]:
    """Return the per-endpoint request-per-minute caps for `plan`. Falls back to `starter`."""
    limits = {
        "starter": {"screen": 100, "batch": 10, "api_keys": 5},
        "professional": {"screen": 1000, "batch": 100, "api_keys": 20},
        "enterprise": {"screen": 10000, "batch": 1000, "api_keys": 100},
    }
    return limits.get(plan, limits["starter"])
