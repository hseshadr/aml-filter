"""Right-to-erasure for a KYC customer's PII and screening footprint.

Deleting a ``Customer`` row alone orphans the linked screening ``Entity`` (and its
embedding) and leaves the customer's matches on the review board (the orphaned match
still surfaces the customer's name via the review join). :class:`CustomerErasureService`
cascades the erasure across the customer, its screening entity + embedding, the
customer's matches, SARs, and attestations — all tenant-scoped, in one transaction.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import delete

from aml_filter.db.models import (
    Attestation,
    Customer,
    EntityEmbedding,
    Sar,
    WhitelistBlacklistMatch,
)
from aml_filter.db.models import Entity as DBEntity

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class CustomerErasureService:
    """Cascade-erase a customer's PII + screening footprint within tenant scope."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a database session."""
        self.session = session

    async def erase(self, tenant_id: str, customer: Customer) -> None:
        """Erase the customer and all dependent screening/compliance rows in one transaction."""
        entity_id = customer.screening_entity_id
        await self._delete_compliance_records(tenant_id, customer.customer_id)
        if entity_id is not None:
            await self._delete_screening_footprint(tenant_id, entity_id)
        await self.session.delete(customer)
        await self.session.commit()

    async def _delete_compliance_records(self, tenant_id: str, customer_id: str) -> None:
        """Delete the customer's SARs and attestations (tenant-scoped)."""
        await self.session.execute(
            delete(Sar).where(Sar.tenant_id == tenant_id, Sar.customer_id == customer_id)
        )
        await self.session.execute(
            delete(Attestation).where(
                Attestation.tenant_id == tenant_id,
                Attestation.customer_id == customer_id,
            )
        )

    async def _delete_screening_footprint(self, tenant_id: str, entity_id: str) -> None:
        """Delete the customer's matches, then the screening entity + its embedding."""
        await self.session.execute(
            delete(WhitelistBlacklistMatch).where(
                WhitelistBlacklistMatch.tenant_id == tenant_id,
                WhitelistBlacklistMatch.whitelist_entity_id == entity_id,
            )
        )
        await self.session.execute(
            delete(EntityEmbedding).where(EntityEmbedding.entity_id == entity_id)
        )
        await self.session.execute(
            delete(DBEntity).where(DBEntity.entity_id == entity_id, DBEntity.tenant_id == tenant_id)
        )
