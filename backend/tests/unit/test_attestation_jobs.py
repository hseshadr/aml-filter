"""Unit tests for the periodic attestation-regeneration RQ job."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.worker import attestation_jobs


def _customer(customer_id: str) -> MagicMock:
    """A stand-in Customer carrying just the id the job reads."""
    stub = MagicMock()
    stub.customer_id = customer_id
    return stub


@pytest.mark.asyncio
async def test_should_regenerate_only_stale_customers() -> None:
    # Given two stale customers
    service = MagicMock()
    service.find_stale_customers = AsyncMock(return_value=[_customer("a"), _customer("b")])
    service.build_for_customer = AsyncMock()

    # When the tenant is reattested
    summary = await attestation_jobs._reattest_tenant(service, "acme")

    # Then exactly the stale customers were rebuilt
    assert summary == {"regenerated": 2, "failed": 0}
    assert service.build_for_customer.await_count == 2


@pytest.mark.asyncio
async def test_should_continue_when_one_customer_fails() -> None:
    # Given three stale customers where the middle one errors
    service = MagicMock()
    service.find_stale_customers = AsyncMock(
        return_value=[_customer("a"), _customer("boom"), _customer("c")]
    )

    async def _build(_tenant: str, customer_id: str) -> None:
        if customer_id == "boom":
            raise ValueError("transient build failure")

    service.build_for_customer = AsyncMock(side_effect=_build)

    # When the tenant is reattested
    summary = await attestation_jobs._reattest_tenant(service, "acme")

    # Then the failure is isolated and the others still completed
    assert summary == {"regenerated": 2, "failed": 1}
    assert service.build_for_customer.await_count == 3


def test_regenerate_stale_attestations_is_callable_as_sync_job() -> None:
    # Given the sync RQ entry wraps the async driver
    with patch.object(
        attestation_jobs,
        "_reattest_all_tenants",
        AsyncMock(return_value={"regenerated": 0, "failed": 0}),
    ):
        # When invoked synchronously (as RQ would)
        result = attestation_jobs.regenerate_stale_attestations()

    # Then it returns the summary
    assert result == {"regenerated": 0, "failed": 0}


@pytest.mark.asyncio
async def test_all_tenant_ids_reads_every_tenant() -> None:
    # Given a session whose tenant query yields two ids
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = ["t1", "t2"]
    session.execute = AsyncMock(return_value=result)

    # When listing tenant ids
    ids = await attestation_jobs._all_tenant_ids(session)

    # Then both come back
    assert ids == ["t1", "t2"]


def test_load_signing_config_delegates_to_settings() -> None:
    # Given a stubbed settings + loader
    with (
        patch.object(attestation_jobs, "get_settings", return_value="settings"),
        patch.object(attestation_jobs, "load_signing_config", return_value=None) as loader,
    ):
        # When resolving the signing config
        result = attestation_jobs._load_signing_config()

    # Then it delegates to load_signing_config(get_settings())
    loader.assert_called_once_with("settings")
    assert result is None


@pytest.mark.asyncio
async def test_reattest_all_tenants_aggregates_per_tenant_summaries() -> None:
    # Given two tenants each with a per-tenant summary
    session = AsyncMock()

    class _Ctx:
        async def __aenter__(self) -> object:
            return session

        async def __aexit__(self, *_: object) -> None:
            return None

    with (
        patch.object(attestation_jobs, "open_worker_session", return_value=_Ctx()),
        patch.object(attestation_jobs, "_all_tenant_ids", AsyncMock(return_value=["t1", "t2"])),
        patch.object(attestation_jobs, "_load_signing_config", return_value=None),
        patch.object(
            attestation_jobs,
            "_reattest_tenant",
            AsyncMock(return_value={"regenerated": 1, "failed": 0}),
        ),
    ):
        # When reattesting all tenants
        summary = await attestation_jobs._reattest_all_tenants()

    # Then the per-tenant summaries are aggregated
    assert summary == {"regenerated": 2, "failed": 0}
