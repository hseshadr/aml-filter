"""Typed, env-overridable rate-limit tier quotas.

Defaults preserve historical behaviour exactly. Operators can tune any tier via
environment variables without editing source, e.g.::

    RATE_LIMIT_STARTER__SCREEN=200
    RATE_LIMIT_ENTERPRISE__BATCH=2000
"""

from functools import lru_cache

from pydantic import BaseModel, ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict


class TierQuota(BaseModel):
    """Per-endpoint requests-per-minute caps for one billing tier."""

    model_config = ConfigDict(frozen=True)

    screen: int
    batch: int
    api_keys: int

    def cap_for_endpoint(self, endpoint: str) -> int:
        """Return the cap for ``endpoint``; falls back to the ``screen`` cap."""
        return {"screen": self.screen, "batch": self.batch, "api_keys": self.api_keys}.get(
            endpoint, self.screen
        )


_STARTER = TierQuota(screen=100, batch=10, api_keys=5)
_PROFESSIONAL = TierQuota(screen=1000, batch=100, api_keys=20)
_ENTERPRISE = TierQuota(screen=10000, batch=1000, api_keys=100)


class RateLimitTiers(BaseSettings):
    """Env-overridable rate-limit tiers (prefix ``RATE_LIMIT_``)."""

    model_config = SettingsConfigDict(
        env_prefix="RATE_LIMIT_", env_nested_delimiter="__", extra="ignore", frozen=True
    )

    starter: TierQuota = _STARTER
    professional: TierQuota = _PROFESSIONAL
    enterprise: TierQuota = _ENTERPRISE

    def for_plan(self, plan: str) -> TierQuota:
        """Return the TierQuota for ``plan``; falls back to ``starter``."""
        tiers = {
            "starter": self.starter,
            "professional": self.professional,
            "enterprise": self.enterprise,
        }
        return tiers.get(plan, self.starter)


@lru_cache(maxsize=1)
def get_rate_limit_tiers() -> RateLimitTiers:
    """Return the cached process-wide RateLimitTiers."""
    return RateLimitTiers()
