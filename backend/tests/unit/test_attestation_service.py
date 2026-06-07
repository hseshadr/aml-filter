"""Behavior tests for the attestation build + staleness service (live test DB)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from edgeproc.bundles.signing import generate_keypair
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.attestation.config import AttestationSigningConfig
from aml_filter.attestation.service import AttestationService
from aml_filter.attestation.signing import verify_payload
from aml_filter.db.models import (
    Customer,
    Entity,
    ListVersion,
    Tenant,
    TenantListConfig,
    WhitelistBlacklistMatch,
)
from aml_filter.domain.attestation import AttestationStatus

_TENANT = "acme"
_NOW = datetime(2026, 6, 6, 12, 0, 0, tzinfo=UTC)


async def _seed_base(session: AsyncSession) -> None:
    """Insert tenant + one enabled list with an ACTIVE version (idempotent on lists)."""
    session.add(Tenant(tenant_id=_TENANT, name="Acme", plan="starter"))
    await session.merge(
        TenantListConfig(tenant_id=_TENANT, list_id="OFAC_SDN", enabled=True, updated_at=_NOW)
    )
    await session.merge(
        ListVersion(
            list_id="OFAC_SDN",
            version="2026-06-01",
            status="ACTIVE",
            ingested_at=_NOW,
            activated_at=_NOW,
        )
    )
    await session.commit()


async def _seed_customer(session: AsyncSession, ref: str) -> str:
    """Insert a customer + its whitelist entity; return the customer_id."""
    entity_id = f"whitelist:{_TENANT}:{ref}"
    session.add(
        Entity(
            entity_id=entity_id,
            tenant_id=_TENANT,
            entity_type="PERSON",
            primary_name=ref,
            name_canonical=ref.lower(),
            name_trigram=ref.lower(),
            risk_category="WHITELIST",
            source_list="WHITELIST",
            list_version="n/a",
        )
    )
    await session.commit()
    customer_id = str(uuid.uuid4())
    session.add(
        Customer(
            customer_id=customer_id,
            tenant_id=_TENANT,
            customer_reference=ref,
            onboarding_status="ACTIVE",
            onboarded_by="officer@acme.com",
            screening_entity_id=entity_id,
        )
    )
    await session.commit()
    return customer_id


async def _add_match(session: AsyncSession, customer_entity: str, resolution: str | None) -> None:
    """Attach a whitelist-vs-blacklist match with a resolution status to a customer."""
    blacklist_id = f"ofac:{uuid.uuid4()}"
    session.add(
        Entity(
            entity_id=blacklist_id,
            tenant_id=_TENANT,
            entity_type="PERSON",
            primary_name="Sanctioned Party",
            name_canonical="sanctioned party",
            name_trigram="sanctioned party",
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2026-06-01",
        )
    )
    session.add(
        WhitelistBlacklistMatch(
            match_id=str(uuid.uuid4()),
            tenant_id=_TENANT,
            whitelist_entity_id=customer_entity,
            blacklist_entity_id=blacklist_id,
            match_score=0.95,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier="STRONG",
            resolution_status=resolution,
        )
    )
    await session.commit()


def _service(session: AsyncSession, signed: bool = False) -> AttestationService:
    """Build a service, optionally with a configured ed25519 signing key."""
    if not signed:
        return AttestationService(session=session)
    private, _public = generate_keypair()
    config = AttestationSigningConfig(
        signer_private_bytes=private.private_bytes_raw(),
        signing_key_id="trust-root-1",
        validity_days=90,
    )
    return AttestationService(session=session, signing_config=config)


@pytest.mark.asyncio
async def test_should_be_clear_when_customer_has_no_matches(session: AsyncSession) -> None:
    # Given an enabled list and a clean customer
    await _seed_base(session)
    customer_id = await _seed_customer(session, "CLEAN-1")

    # When an attestation is built
    att = await _service(session).build_for_customer(_TENANT, customer_id)

    # Then it is CLEAR over the enabled list at its active version
    assert att.status == AttestationStatus.CLEAR.value
    assert att.match_count == 0
    assert att.lists_and_versions == [{"list_id": "OFAC_SDN", "version": "2026-06-01"}]


@pytest.mark.asyncio
async def test_should_be_pending_when_a_match_is_unresolved(session: AsyncSession) -> None:
    # Given a customer with one PENDING match
    await _seed_base(session)
    customer_id = await _seed_customer(session, "PENDING-1")
    await _add_match(session, f"whitelist:{_TENANT}:PENDING-1", "PENDING")

    # When an attestation is built
    att = await _service(session).build_for_customer(_TENANT, customer_id)

    # Then it reports matches pending
    assert att.status == AttestationStatus.MATCHES_PENDING.value
    assert att.match_count == 1
    assert att.pending_count == 1


@pytest.mark.asyncio
async def test_should_be_dispositioned_when_all_matches_resolved(session: AsyncSession) -> None:
    # Given a customer whose only match is dispositioned (FALSE_POSITIVE)
    await _seed_base(session)
    customer_id = await _seed_customer(session, "DISP-1")
    await _add_match(session, f"whitelist:{_TENANT}:DISP-1", "FALSE_POSITIVE")

    # When an attestation is built
    att = await _service(session).build_for_customer(_TENANT, customer_id)

    # Then it reports all matches dispositioned, none pending
    assert att.status == AttestationStatus.MATCHES_DISPOSITIONED.value
    assert att.match_count == 1
    assert att.pending_count == 0


@pytest.mark.asyncio
async def test_should_persist_unsigned_when_no_key_configured(session: AsyncSession) -> None:
    # Given no signing key
    await _seed_base(session)
    customer_id = await _seed_customer(session, "UNSIGNED-1")

    # When an attestation is built
    att = await _service(session).build_for_customer(_TENANT, customer_id)

    # Then it is persisted without a signature
    assert att.signature is None
    assert att.algo is None


@pytest.mark.asyncio
async def test_should_sign_and_verify_when_key_configured(session: AsyncSession) -> None:
    # Given a configured signing key
    await _seed_base(session)
    customer_id = await _seed_customer(session, "SIGNED-1")
    service = _service(session, signed=True)

    # When an attestation is built and its payload re-derived
    att = await service.build_for_customer(_TENANT, customer_id)
    payload = service.payload_of(att)
    public_raw = service.public_key_raw()

    # Then the stored signature verifies the re-derived canonical payload
    assert att.signature is not None
    assert att.algo == "ed25519"
    assert verify_payload(payload, att.signature, public_raw).valid is True


@pytest.mark.asyncio
async def test_should_raise_when_signature_required_but_no_key(session: AsyncSession) -> None:
    # Given no signing key but signature explicitly required
    await _seed_base(session)
    customer_id = await _seed_customer(session, "REQ-1")

    # When/Then building with require_signature fails closed
    with pytest.raises(ValueError, match="signing key"):
        await _service(session).build_for_customer(_TENANT, customer_id, require_signature=True)


@pytest.mark.asyncio
async def test_should_set_valid_until_from_window(session: AsyncSession) -> None:
    # Given a 90-day validity window
    await _seed_base(session)
    customer_id = await _seed_customer(session, "WINDOW-1")
    service = _service(session, signed=True)  # config carries validity_days=90

    # When an attestation is built
    att = await service.build_for_customer(_TENANT, customer_id)

    # Then valid_until is screened_at + 90 days
    assert att.valid_until - att.screened_at == timedelta(days=90)


@pytest.mark.asyncio
async def test_should_flag_stale_customer_with_no_attestation(session: AsyncSession) -> None:
    # Given an ACTIVE customer that has never been attested
    await _seed_base(session)
    customer_id = await _seed_customer(session, "STALE-NEVER")

    # When stale customers are queried
    stale = await _service(session).find_stale_customers(_TENANT)

    # Then the never-attested customer is due for re-review
    assert customer_id in {c.customer_id for c in stale}


@pytest.mark.asyncio
async def test_should_not_flag_freshly_attested_customer(session: AsyncSession) -> None:
    # Given a customer that was just attested (signed → 90-day window)
    await _seed_base(session)
    customer_id = await _seed_customer(session, "FRESH-1")
    service = _service(session, signed=True)
    await service.build_for_customer(_TENANT, customer_id)

    # When stale customers are queried
    stale = await service.find_stale_customers(_TENANT)

    # Then the fresh customer is NOT due for re-review
    assert customer_id not in {c.customer_id for c in stale}


@pytest.mark.asyncio
async def test_should_raise_when_building_for_missing_customer(session: AsyncSession) -> None:
    # Given no such customer
    await _seed_base(session)

    # When/Then building fails closed
    with pytest.raises(ValueError, match="not found"):
        await _service(session).build_for_customer(_TENANT, "ghost-id")


def test_public_key_raw_raises_without_signing_config(session: AsyncSession) -> None:
    # Given an unsigned service
    # When asking for the public key, then it raises (nothing to derive from)
    with pytest.raises(ValueError, match="no signing key"):
        _service(session).public_key_raw()


@pytest.mark.asyncio
async def test_should_filter_list_by_customer_and_stale(session: AsyncSession) -> None:
    # Given an attested customer
    await _seed_base(session)
    customer_id = await _seed_customer(session, "FILTER-1")
    service = _service(session, signed=True)  # fresh → 90-day window, not stale
    await service.build_for_customer(_TENANT, customer_id)

    # When listing only this customer and only stale rows
    by_customer = await service.list_latest(
        _TENANT, customer_id=customer_id, stale=None, limit=10, offset=0
    )
    only_stale = await service.list_latest(
        _TENANT, customer_id=customer_id, stale=True, limit=10, offset=0
    )

    # Then the customer filter returns it, but the stale filter excludes the fresh row
    assert len(by_customer) == 1
    assert only_stale == []


@pytest.mark.asyncio
async def test_should_list_only_latest_per_customer(session: AsyncSession) -> None:
    # Given a customer attested twice
    await _seed_base(session)
    customer_id = await _seed_customer(session, "TWICE-1")
    service = _service(session)
    first = await service.build_for_customer(_TENANT, customer_id)
    second = await service.build_for_customer(_TENANT, customer_id)

    # When listing the latest attestation per customer
    latest = await service.list_latest(_TENANT, customer_id=None, stale=None, limit=100, offset=0)

    # Then only the most recent row is returned
    ids = {a.attestation_id for a in latest}
    assert second.attestation_id in ids
    assert first.attestation_id not in ids
