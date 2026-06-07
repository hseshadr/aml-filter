"""Customer onboarding service.

Orchestrates onboarding on top of the existing screening engine: it creates the
KYC ``Customer`` row, reuses the whitelist ingestion path to create/link a
WHITELIST ``Entity`` (which embeds the name), then reuses the bidirectional
screening path to screen that entity against active sanctions lists and persist
any matches. No scoring or retrieval logic is reimplemented here.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Final

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from aml_filter.customers.errors import DuplicateCustomerReferenceError
from aml_filter.db.models import Customer
from aml_filter.domain.customer import IdDocument, OnboardingResult, OnboardingStatus
from aml_filter.ingest.whitelist import WhitelistIngestionService
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.types import JsonArray, JsonObject

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from aml_filter.db.models import Entity

SANCTION_CATEGORY: Final[str] = "SANCTION"
ONBOARDING_THRESHOLD: Final[float] = 0.65


class OnboardingService:
    """Create a KYC customer, link a screened entity, and screen it on onboarding."""

    def __init__(
        self,
        session: AsyncSession,
        ingestion: WhitelistIngestionService | None = None,
        screening: BidirectionalScreeningService | None = None,
    ) -> None:
        """Initialize with a session and (optionally injected) collaborators."""
        self.session = session
        self.ingestion = ingestion or WhitelistIngestionService(session=session)
        self.screening = screening or BidirectionalScreeningService(session=session)

    async def onboard_customer(
        self,
        tenant_id: str,
        customer_reference: str,
        name: str,
        onboarded_by: str,
        country: str | None = None,
        id_documents: list[IdDocument] | None = None,
    ) -> OnboardingResult:
        """Create the customer + screened entity, screen it, and return a typed result."""
        documents = id_documents or []
        await self._reject_duplicate_reference(tenant_id, customer_reference)
        entity = await self._create_entity(tenant_id, name, country, documents)
        customer = await self._persist_customer(
            tenant_id, customer_reference, onboarded_by, documents, entity
        )
        match_ids = await self._screen(entity, tenant_id)
        return _build_result(customer, entity.entity_id, match_ids)

    async def _reject_duplicate_reference(self, tenant_id: str, customer_reference: str) -> None:
        """Fail closed (no entity created yet) when the reference already exists for the tenant."""
        existing = await self.session.execute(
            select(Customer.customer_id).where(
                Customer.tenant_id == tenant_id,
                Customer.customer_reference == customer_reference,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise DuplicateCustomerReferenceError(
                f"customer_reference {customer_reference!r} already exists"
            )

    async def _create_entity(
        self,
        tenant_id: str,
        name: str,
        country: str | None,
        documents: list[IdDocument],
    ) -> Entity:
        """Reuse the whitelist ingestion path to create/link a WHITELIST entity."""
        return await self.ingestion.add_customer(
            tenant_id=tenant_id,
            name=name,
            country=country,
            identifiers=_documents_to_identifiers(documents),
        )

    async def _persist_customer(
        self,
        tenant_id: str,
        customer_reference: str,
        onboarded_by: str,
        documents: list[IdDocument],
        entity: Entity,
    ) -> Customer:
        """Insert the KYC customer row; on a duplicate-reference race, erase the orphan entity."""
        customer = Customer(
            customer_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            customer_reference=customer_reference,
            onboarding_status=OnboardingStatus.PENDING_REVIEW.value,
            onboarded_by=onboarded_by,
            id_documents=[doc.model_dump(mode="json") for doc in documents],
            screening_entity_id=entity.entity_id,
        )
        self.session.add(customer)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self._rollback_orphan_entity(entity)
            raise DuplicateCustomerReferenceError(
                f"customer_reference {customer_reference!r} already exists"
            ) from exc
        await self.session.refresh(customer)
        return customer

    async def _rollback_orphan_entity(self, entity: Entity) -> None:
        """Roll back the failed insert and erase the entity created earlier in this onboard."""
        await self.session.rollback()
        persisted = await self.session.get(type(entity), entity.entity_id)
        if persisted is not None:
            await self.session.delete(persisted)
            await self.session.commit()

    async def _screen(self, entity: Entity, tenant_id: str) -> list[str]:
        """Reuse the bidirectional screening path; matches are persisted by the tracker."""
        return await self.screening.screen_entity_against_list(
            entity=entity,
            target_risk_category=SANCTION_CATEGORY,
            threshold=ONBOARDING_THRESHOLD,
            match_type="WHITELIST_VS_BLACKLIST",
            tenant_id=tenant_id,
        )


def _documents_to_identifiers(documents: list[IdDocument]) -> JsonObject:
    """Project id-document numbers into the entity identifiers payload."""
    numbers: JsonArray = [doc.number for doc in documents]
    return {"id_documents": numbers} if numbers else {}


def _build_result(
    customer: Customer, screening_entity_id: str, match_ids: list[str]
) -> OnboardingResult:
    """Assemble the typed onboarding result from the persisted customer."""
    return OnboardingResult(
        customer_id=customer.customer_id,
        customer_reference=customer.customer_reference,
        screening_entity_id=screening_entity_id,
        onboarding_status=OnboardingStatus(customer.onboarding_status),
        match_entity_ids=match_ids,
    )
