"""Periodic job: regenerate screening attestations for customers due for re-review.

``regenerate_stale_attestations`` is the RQ-callable (synchronous) entry point. It
opens an async DB session and, for every tenant, rebuilds an attestation for each
active customer whose latest attestation is missing or past ``valid_until``. The
rebuild is fail-soft per customer: one failure is logged and skipped, never aborting
the rest of the batch.

Scheduling: register a periodic trigger with ``rq-scheduler`` (or any cron/systemd
timer that runs ``python -m aml_filter.worker.attestation_jobs``) — e.g. weekly::

    from redis import Redis
    from rq_scheduler import Scheduler
    scheduler = Scheduler(queue_name="screening", connection=Redis.from_url(REDIS_URL))
    scheduler.cron(
        "0 4 * * 1",  # 04:00 every Monday
        func="aml_filter.worker.attestation_jobs.regenerate_stale_attestations",
    )

The cron expression, queue, signing key, and validity window are all config-driven;
nothing here hard-codes a schedule.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.attestation.config import AttestationSigningConfig, load_signing_config
from aml_filter.attestation.service import AttestationService
from aml_filter.config import get_settings
from aml_filter.db.models import Customer, Tenant
from aml_filter.worker.db import open_worker_session

logger = logging.getLogger(__name__)


async def _all_tenant_ids(session: AsyncSession) -> list[str]:
    """Every tenant id (the job sweeps all tenants)."""
    result = await session.execute(select(Tenant.tenant_id))
    return list(result.scalars().all())


def _load_signing_config() -> AttestationSigningConfig | None:
    """Resolve the (optional) attestation signing config from settings."""
    return load_signing_config(get_settings())


async def _reattest_tenant(service: AttestationService, tenant_id: str) -> dict[str, int]:
    """Rebuild attestations for one tenant's stale customers, fail-soft per customer."""
    stale = await service.find_stale_customers(tenant_id)
    regenerated = 0
    failed = 0
    for customer in stale:
        if await _rebuild_one(service, tenant_id, customer):
            regenerated += 1
        else:
            failed += 1
    return {"regenerated": regenerated, "failed": failed}


async def _rebuild_one(service: AttestationService, tenant_id: str, customer: Customer) -> bool:
    """Rebuild one customer's attestation; log and swallow per-customer failures."""
    try:
        await service.build_for_customer(tenant_id, customer.customer_id)
    except Exception:
        logger.exception("Attestation rebuild failed for customer %s", customer.customer_id)
        return False
    return True


async def _reattest_all_tenants() -> dict[str, int]:
    """Sweep every tenant, aggregating per-tenant regenerate/fail counts."""
    signing_config = _load_signing_config()
    totals = {"regenerated": 0, "failed": 0}
    async with open_worker_session() as session:
        service = AttestationService(session=session, signing_config=signing_config)
        for tenant_id in await _all_tenant_ids(session):
            summary = await _reattest_tenant(service, tenant_id)
            totals["regenerated"] += summary["regenerated"]
            totals["failed"] += summary["failed"]
    return totals


def regenerate_stale_attestations() -> dict[str, int]:
    """Synchronous RQ entry point: regenerate attestations for due-for-review customers."""
    summary = asyncio.run(_reattest_all_tenants())
    logger.info("Attestation regeneration complete: %s", summary)
    return summary


if __name__ == "__main__":
    regenerate_stale_attestations()
