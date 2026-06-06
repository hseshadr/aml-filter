"""Attestation build + staleness service.

Builds a periodic screening attestation for a customer: snapshots the tenant's
enabled lists at their ACTIVE versions, summarizes that customer's matches
(clear / dispositioned / pending), sets ``valid_until`` from the configured window,
and — when a signing key is configured — ed25519-signs the canonical payload using
the bundle trust root. Also answers "which customers are due for re-review".

The router stays thin; all rules live here. Fail-closed: if a signature is required
but no key is configured, :meth:`build_for_customer` raises.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from edgeproc.bundles.signing import Ed25519Signer
from sqlalchemy import Select, select

from aml_filter.attestation import queries
from aml_filter.attestation.canonical import canonical_payload_bytes
from aml_filter.attestation.config import AttestationSigningConfig
from aml_filter.attestation.signing import SIGNING_ALGO
from aml_filter.db.models import Attestation, Customer
from aml_filter.domain.attestation import (
    AttestationPayload,
    AttestationStatus,
    ListVersionEntry,
    ResultSummary,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class AttestationService:
    """Create, read, and stale-check screening attestations for a tenant."""

    def __init__(
        self, session: AsyncSession, signing_config: AttestationSigningConfig | None = None
    ) -> None:
        """Initialize with a session and optional ed25519 signing material."""
        self.session = session
        self.signing_config = signing_config

    async def build_for_customer(
        self, tenant_id: str, customer_id: str, *, require_signature: bool = False
    ) -> Attestation:
        """Build, sign (if configured), and persist an attestation for a customer."""
        if require_signature and self.signing_config is None:
            raise ValueError("a signing key is required but none is configured")
        customer = await self._require_customer(tenant_id, customer_id)
        payload = await self._build_payload(tenant_id, customer)
        attestation = self._persist_row(payload)
        return await self._save(attestation)

    async def get(self, tenant_id: str, attestation_id: str) -> Attestation | None:
        """Fetch a single tenant-scoped attestation."""
        result = await self.session.execute(
            select(Attestation).where(
                Attestation.attestation_id == attestation_id,
                Attestation.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_latest(
        self,
        tenant_id: str,
        *,
        customer_id: str | None,
        stale: bool | None,
        limit: int,
        offset: int,
    ) -> list[Attestation]:
        """List the latest attestation per customer, optionally filtered + paginated."""
        query = self._latest_query(tenant_id, customer_id, stale).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def find_stale_customers(self, tenant_id: str) -> list[Customer]:
        """Active customers whose latest attestation is missing or past valid_until."""
        result = await self.session.execute(
            queries.stale_customers_query(tenant_id, datetime.now(UTC))
        )
        return list(result.scalars().all())

    def payload_of(self, attestation: Attestation) -> AttestationPayload:
        """Re-derive the exact canonical payload of a persisted attestation."""
        return AttestationPayload(
            tenant_id=attestation.tenant_id,
            customer_id=attestation.customer_id,
            customer_reference=attestation.customer_reference,
            screened_at=attestation.screened_at,
            valid_until=attestation.valid_until,
            lists_and_versions=[
                ListVersionEntry.model_validate(entry) for entry in attestation.lists_and_versions
            ],
            result=ResultSummary(
                status=AttestationStatus(attestation.status),
                match_count=attestation.match_count,
                pending_count=attestation.pending_count,
            ),
        )

    def public_key_raw(self) -> bytes:
        """Raw ed25519 public key derived from the configured signer (for verify)."""
        if self.signing_config is None:
            raise ValueError("no signing key is configured")
        private = Ed25519PrivateKey.from_private_bytes(self.signing_config.signer_private_bytes)
        return private.public_key().public_bytes_raw()

    def _latest_query(
        self, tenant_id: str, customer_id: str | None, stale: bool | None
    ) -> Select[tuple[Attestation]]:
        """Compose the latest-per-customer query with optional filters."""
        latest_ids = queries.latest_attestation_ids(tenant_id)
        query = (
            select(Attestation)
            .where(Attestation.attestation_id.in_(latest_ids))
            .order_by(Attestation.created_at.desc())
        )
        if customer_id is not None:
            query = query.where(Attestation.customer_id == customer_id)
        if stale:
            query = query.where(Attestation.valid_until <= datetime.now(UTC))
        return query

    async def _build_payload(self, tenant_id: str, customer: Customer) -> AttestationPayload:
        """Assemble the canonical payload from enabled lists + the match summary."""
        lists = await queries.enabled_list_versions(self.session, tenant_id)
        total, pending = await queries.match_counts(
            self.session, tenant_id, customer.screening_entity_id
        )
        screened_at = datetime.now(UTC)
        return AttestationPayload(
            tenant_id=tenant_id,
            customer_id=customer.customer_id,
            customer_reference=customer.customer_reference,
            screened_at=screened_at,
            valid_until=screened_at + timedelta(days=self._validity_days()),
            lists_and_versions=lists,
            result=_summarize(total, pending),
        )

    def _persist_row(self, payload: AttestationPayload) -> Attestation:
        """Map a payload (+ optional signature) into an unsaved Attestation row."""
        signature, key_id, algo = self._sign(payload)
        return Attestation(
            attestation_id=str(uuid.uuid4()),
            tenant_id=payload.tenant_id,
            customer_id=payload.customer_id,
            customer_reference=payload.customer_reference,
            screened_at=payload.screened_at,
            valid_until=payload.valid_until,
            lists_and_versions=[entry.model_dump() for entry in payload.lists_and_versions],
            status=payload.result.status.value,
            match_count=payload.result.match_count,
            pending_count=payload.result.pending_count,
            signature=signature,
            signing_key_id=key_id,
            algo=algo,
        )

    def _sign(self, payload: AttestationPayload) -> tuple[str | None, str | None, str | None]:
        """Return (signature, key_id, algo); all None when no key is configured."""
        config = self.signing_config
        if config is None:
            return (None, None, None)
        signer = Ed25519Signer.from_private_bytes(config.signer_private_bytes)
        signature = signer.sign(canonical_payload_bytes(payload))
        return (signature, config.signing_key_id, SIGNING_ALGO)

    def _validity_days(self) -> int:
        """Validity window in days (from config, defaulting to 90 when unsigned)."""
        return self.signing_config.validity_days if self.signing_config else 90

    async def _require_customer(self, tenant_id: str, customer_id: str) -> Customer:
        """Fetch a tenant-scoped customer or raise when missing."""
        result = await self.session.execute(
            select(Customer).where(
                Customer.customer_id == customer_id, Customer.tenant_id == tenant_id
            )
        )
        customer = result.scalar_one_or_none()
        if customer is None:
            raise ValueError(f"customer {customer_id} not found")
        return customer

    async def _save(self, attestation: Attestation) -> Attestation:
        """Persist and refresh an attestation row."""
        self.session.add(attestation)
        await self.session.commit()
        await self.session.refresh(attestation)
        return attestation


def _summarize(total: int, pending: int) -> ResultSummary:
    """Classify a customer's match counts into an attestation result status."""
    status = _status_for(total, pending)
    return ResultSummary(status=status, match_count=total, pending_count=pending)


def _status_for(total: int, pending: int) -> AttestationStatus:
    """CLEAR with no matches, PENDING if any unresolved, else DISPOSITIONED."""
    if total == 0:
        return AttestationStatus.CLEAR
    if pending > 0:
        return AttestationStatus.MATCHES_PENDING
    return AttestationStatus.MATCHES_DISPOSITIONED
