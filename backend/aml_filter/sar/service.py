"""SAR persistence + lifecycle service.

Wraps the ``SarBuilder`` (snapshot + STRONG gating) and the renderer registry with
the database lifecycle: create (gated, snapshot persisted as JSONB), list/get
(tenant-scoped), update (narrative/filer/status with a completing-requires-narrative
gate), and export (render + mark EXPORTED). The router stays thin; all rules live here.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Final

from sqlalchemy import Select, select

from aml_filter.db.models import Sar
from aml_filter.domain.sar import Filer, SarJurisdiction, SarStatus, SarTemplate
from aml_filter.sar.builder import SarBuilder
from aml_filter.sar.errors import SarGatingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_EDITABLE: Final[frozenset[str]] = frozenset({SarStatus.DRAFT.value, SarStatus.COMPLETED.value})


class SarService:
    """Create, read, update, and export SARs for a tenant."""

    def __init__(self, session: AsyncSession, builder: SarBuilder | None = None) -> None:
        """Initialize with a session and an (optionally injected) builder."""
        self.session = session
        self.builder = builder or SarBuilder(session=session)

    async def create(
        self,
        *,
        tenant_id: str,
        customer_id: str,
        match_id: str,
        jurisdiction: SarJurisdiction,
        template: SarTemplate,
        narrative: str | None,
        filer: Filer,
        created_by: str,
    ) -> Sar:
        """Build the snapshot (STRONG-gated) and persist a new SAR row."""
        snapshot = await self.builder.build_snapshot(tenant_id, customer_id, match_id)
        sar = _new_sar(
            tenant_id, customer_id, match_id, jurisdiction, template, narrative, filer, created_by
        )
        sar.subject = snapshot.model_dump(mode="json")
        self.session.add(sar)
        await self.session.commit()
        await self.session.refresh(sar)
        return sar

    async def get(self, tenant_id: str, sar_id: str) -> Sar | None:
        """Fetch a single tenant-scoped SAR."""
        result = await self.session.execute(
            select(Sar).where(Sar.sar_id == sar_id, Sar.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        tenant_id: str,
        status: SarStatus | None,
        customer_id: str | None,
        limit: int,
        offset: int,
    ) -> list[Sar]:
        """List a tenant's SARs, newest first, with optional filters and pagination."""
        query = _list_query(tenant_id, status, customer_id).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update(
        self, sar: Sar, *, narrative: str | None, filer: Filer | None, status: SarStatus | None
    ) -> Sar:
        """Apply narrative/filer/status edits, enforcing the completion gate."""
        _require_editable(sar)
        _apply_edits(sar, narrative, filer)
        _apply_status(sar, status)
        await self.session.commit()
        await self.session.refresh(sar)
        return sar

    async def mark_exported(self, sar: Sar) -> None:
        """Transition a SAR to EXPORTED after a render — idempotent, stamps filed_at once."""
        if sar.status == SarStatus.EXPORTED.value:
            return
        sar.status = SarStatus.EXPORTED.value
        if sar.filed_at is None:
            sar.filed_at = datetime.now(UTC)
        await self.session.commit()


def _new_sar(
    tenant_id: str,
    customer_id: str,
    match_id: str,
    jurisdiction: SarJurisdiction,
    template: SarTemplate,
    narrative: str | None,
    filer: Filer,
    created_by: str,
) -> Sar:
    """Construct an unsaved SAR row with a derived initial status."""
    return Sar(
        sar_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        match_id=match_id,
        jurisdiction=jurisdiction.value,
        template=template.value,
        suspicious_activity_narrative=narrative,
        filer=filer.model_dump(mode="json"),
        status=_initial_status(narrative).value,
        created_by=created_by,
    )


def _initial_status(narrative: str | None) -> SarStatus:
    """A SAR with a narrative is COMPLETED on create; otherwise it is a DRAFT."""
    return SarStatus.COMPLETED if narrative else SarStatus.DRAFT


def _list_query(
    tenant_id: str, status: SarStatus | None, customer_id: str | None
) -> Select[tuple[Sar]]:
    """Build the tenant-scoped list query with optional status/customer filters."""
    query = select(Sar).where(Sar.tenant_id == tenant_id).order_by(Sar.created_at.desc())
    if status is not None:
        query = query.where(Sar.status == status.value)
    if customer_id is not None:
        query = query.where(Sar.customer_id == customer_id)
    return query


def _apply_edits(sar: Sar, narrative: str | None, filer: Filer | None) -> None:
    """Apply provided (non-None) narrative/filer edits onto the SAR in place."""
    if narrative is not None:
        sar.suspicious_activity_narrative = narrative
    if filer is not None:
        sar.filer = filer.model_dump(mode="json")


def _require_editable(sar: Sar) -> None:
    """Fail closed unless the SAR is in an editable state (DRAFT/COMPLETED)."""
    if sar.status not in _EDITABLE:
        raise SarGatingError(f"SAR {sar.sar_id} is {sar.status} and cannot be edited")


def _apply_status(sar: Sar, status: SarStatus | None) -> None:
    """Apply a status transition, enforcing the completion-narrative gate."""
    if status is None:
        return
    if status is SarStatus.COMPLETED and not sar.suspicious_activity_narrative:
        raise SarGatingError("A narrative is required to mark a SAR COMPLETED")
    sar.status = status.value
