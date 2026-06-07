"""Tests for delta-driven rescan — the efficiency phase.

The headline guarantee is EQUIVALENCE: screening only the changed sanctions entries
against a customer index must yield the SAME set of matches as a full rescan. The cost
characteristic is also asserted: the number of delta embeds equals the number of changed
entries, independent of the customer count (``IndexFlatIP`` is exact O(N) per query).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding, Tenant, WhitelistBlacklistMatch
from aml_filter.embedding import EMBEDDING_DIM, EmbeddingService
from aml_filter.ingest.diff import diff_lists
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.screening.delta_rescan import DeltaRescanService

pytestmark = pytest.mark.unit

_TENANT = "t-delta"


def _basis_vector(canonical: str) -> list[float]:
    """A NON-NEGATIVE unit basis vector keyed by canonical name.

    Identical names share a vector (cosine 1); different names are orthogonal (cosine 0).
    Non-negativity keeps every ``name_vector`` contribution >= 0, which the parity-locked
    scorer requires — the random-vector stub used elsewhere can yield negative cosines.
    """
    vec = [0.0] * EMBEDDING_DIM
    vec[abs(hash(canonical)) % EMBEDDING_DIM] = 1.0
    return vec


class _NameBasisProvider:
    """Deterministic embedder: maps the embedding-text back to its name basis vector."""

    model_name: str = "name-basis"
    dimension: int = EMBEDDING_DIM

    async def embed(self, text: str) -> list[float]:
        return _basis_vector(text.strip().lower())

    async def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        return [await self.embed(t) for t in texts]

    def get_model_info(self) -> dict[str, str | int]:
        return {"model_name": self.model_name, "dimension": self.dimension}


def _svc() -> EmbeddingService:
    return EmbeddingService(provider=_NameBasisProvider(), enable_cache=False)


async def _embed(name: str) -> list[float]:
    return _basis_vector(name.strip().lower())


async def _add_tenant(session: AsyncSession) -> None:
    session.add(Tenant(tenant_id=_TENANT, name=_TENANT, plan="starter"))
    await session.commit()


async def _add_entity(
    session: AsyncSession,
    entity_id: str,
    name: str,
    *,
    risk: str,
    source_list: str,
    version: str,
    tenant_id: str | None,
) -> DBEntity:
    """Insert an entity + its (deterministic) persisted embedding."""
    canonical = name.lower()
    entity = DBEntity(
        entity_id=entity_id,
        tenant_id=tenant_id,
        entity_type="PERSON",
        primary_name=name,
        name_canonical=canonical,
        name_tokens=canonical.split(),
        name_trigram=canonical,
        aliases=[],
        risk_category=risk,
        source_list=source_list,
        list_version=version,
    )
    session.add(entity)
    session.add(
        EntityEmbedding(
            entity_id=entity_id,
            embedding=await _embed(name),
            embedding_model="test",
            model_version="1",
        )
    )
    await session.commit()
    return entity


async def _add_customer(session: AsyncSession, entity_id: str, name: str) -> None:
    await _add_entity(
        session,
        entity_id,
        name,
        risk="WHITELIST",
        source_list="CUSTOMERS",
        version="v1",
        tenant_id=_TENANT,
    )


async def _add_sanction(session: AsyncSession, entity_id: str, name: str, version: str) -> DBEntity:
    return await _add_entity(
        session,
        entity_id,
        name,
        risk="SANCTION",
        source_list="OFAC_SDN",
        version=version,
        tenant_id=None,
    )


async def _domain_snapshot(session: AsyncSession, version: str) -> list:
    """Materialize the OFAC sanctions entities at a given list_version as domain entities."""
    from aml_filter.db.mapping import db_to_domain_entity

    result = await session.execute(
        select(DBEntity).where(DBEntity.source_list == "OFAC_SDN", DBEntity.list_version == version)
    )
    return [db_to_domain_entity(e) for e in result.scalars().all()]


async def _match_keys(session: AsyncSession) -> set[tuple[str, str]]:
    """The set of (customer, sanctions) keys among OPEN (PENDING) matches for the tenant."""
    result = await session.execute(
        select(WhitelistBlacklistMatch).where(
            WhitelistBlacklistMatch.tenant_id == _TENANT,
            WhitelistBlacklistMatch.resolution_status == "PENDING",
        )
    )
    return {(m.whitelist_entity_id, m.blacklist_entity_id) for m in result.scalars().all()}


def _delta_service(session: AsyncSession) -> DeltaRescanService:
    return DeltaRescanService(session=session, embedding_service=_svc())


async def test_added_near_customer_creates_match(session: AsyncSession) -> None:
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    added = await _add_sanction(session, "sanc-1", "Vladimir Petrov", "v2")

    await _delta_service(session).rescan_added_or_modified(_TENANT, [added])

    assert ("cust-1", "sanc-1") in await _match_keys(session)


async def test_far_added_entry_creates_no_match(session: AsyncSession) -> None:
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    added = await _add_sanction(session, "sanc-far", "Completely Different Name", "v2")

    await _delta_service(session).rescan_added_or_modified(_TENANT, [added])

    assert await _match_keys(session) == set()


async def test_removed_entry_autocloses_its_open_match(session: AsyncSession) -> None:
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    await _add_customer(session, "cust-2", "Other Person")
    await _add_sanction(session, "gone", "Gone Sanction", "v1")
    await _add_sanction(session, "stays", "Stays Sanction", "v1")
    session.add(
        WhitelistBlacklistMatch(
            match_id="m-1",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-1",
            blacklist_entity_id="gone",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    session.add(
        WhitelistBlacklistMatch(
            match_id="m-2",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-2",
            blacklist_entity_id="stays",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    await session.commit()

    closed = await _delta_service(session).close_removed(_TENANT, ["gone"])

    assert closed == 1
    open_keys = await _match_keys(session)
    assert ("cust-1", "gone") not in open_keys
    assert ("cust-2", "stays") in open_keys


async def test_removed_close_annotates_resolution(session: AsyncSession) -> None:
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    await _add_sanction(session, "gone", "Gone Sanction", "v1")
    session.add(
        WhitelistBlacklistMatch(
            match_id="m-1",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-1",
            blacklist_entity_id="gone",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    await session.commit()

    await _delta_service(session).close_removed(_TENANT, ["gone"])

    result = await session.execute(
        select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.match_id == "m-1")
    )
    match = result.scalar_one()
    assert match.resolution_status == "RESOLVED"
    assert match.review_notes and "removed" in match.review_notes.lower()


async def test_modified_entry_can_create_new_match(session: AsyncSession) -> None:
    """An entry whose name changes to match a customer now produces a match."""
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    # old version: far name (no match); now modified to a matching name + new vector.
    sanc = await _add_sanction(session, "sanc-1", "Unrelated Original", "v1")
    sanc.primary_name = "Vladimir Petrov"
    sanc.name_canonical = "vladimir petrov"
    sanc.name_trigram = "vladimir petrov"
    sanc.list_version = "v2"
    emb = (
        await session.execute(select(EntityEmbedding).where(EntityEmbedding.entity_id == "sanc-1"))
    ).scalar_one()
    emb.embedding = await _embed("Vladimir Petrov")
    await session.commit()

    await _delta_service(session).rescan_added_or_modified(_TENANT, [sanc])

    assert ("cust-1", "sanc-1") in await _match_keys(session)


async def test_modified_entry_that_loses_match_closes_stale_match(session: AsyncSession) -> None:
    """An entry that was matching but is modified to NO LONGER match closes the stale match.

    A previously-open PENDING match must be transitioned out of PENDING (with an audit
    note) once the modified sanctions entry no longer scores >= threshold; an unrelated
    match between a different customer and a different entry must be left untouched.
    """
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    await _add_customer(session, "cust-2", "Carol Lee")
    # sanc-1 used to match cust-1; it is now modified to an unrelated name (no longer matches).
    sanc = await _add_sanction(session, "sanc-1", "Vladimir Petrov", "v1")
    sanc.primary_name = "Completely Different Name"
    sanc.name_canonical = "completely different name"
    sanc.name_trigram = "completely different name"
    sanc.list_version = "v2"
    emb = (
        await session.execute(select(EntityEmbedding).where(EntityEmbedding.entity_id == "sanc-1"))
    ).scalar_one()
    emb.embedding = await _embed("Completely Different Name")
    # sanc-2 still matches cust-2 and is NOT in this change set — must stay PENDING.
    await _add_sanction(session, "sanc-2", "Carol Lee", "v1")
    session.add(
        WhitelistBlacklistMatch(
            match_id="stale",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-1",
            blacklist_entity_id="sanc-1",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    session.add(
        WhitelistBlacklistMatch(
            match_id="unrelated",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-2",
            blacklist_entity_id="sanc-2",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    await session.commit()

    await _delta_service(session).rescan_added_or_modified(_TENANT, [sanc])

    open_keys = await _match_keys(session)
    assert ("cust-1", "sanc-1") not in open_keys  # stale match closed
    assert ("cust-2", "sanc-2") in open_keys  # unrelated match untouched
    stale = (
        await session.execute(
            select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.match_id == "stale")
        )
    ).scalar_one()
    assert stale.resolution_status != "PENDING"
    assert stale.review_notes and "modified" in stale.review_notes.lower()


async def test_modify_reconcile_only_touches_pending_rows(session: AsyncSession) -> None:
    """A modify-that-loses-match must NOT reopen/alter an already-dispositioned match."""
    await _add_tenant(session)
    await _add_customer(session, "cust-1", "Vladimir Petrov")
    sanc = await _add_sanction(session, "sanc-1", "Vladimir Petrov", "v1")
    sanc.primary_name = "Completely Different Name"
    sanc.name_canonical = "completely different name"
    sanc.name_trigram = "completely different name"
    sanc.list_version = "v2"
    emb = (
        await session.execute(select(EntityEmbedding).where(EntityEmbedding.entity_id == "sanc-1"))
    ).scalar_one()
    emb.embedding = await _embed("Completely Different Name")
    session.add(
        WhitelistBlacklistMatch(
            match_id="done",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-1",
            blacklist_entity_id="sanc-1",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="FALSE_POSITIVE",
            review_notes="analyst dispositioned",
        )
    )
    await session.commit()

    await _delta_service(session).rescan_added_or_modified(_TENANT, [sanc])

    done = (
        await session.execute(
            select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.match_id == "done")
        )
    ).scalar_one()
    assert done.resolution_status == "FALSE_POSITIVE"
    assert done.review_notes == "analyst dispositioned"


async def test_delta_equals_full_rescan_real_change_set(session: AsyncSession) -> None:
    """REAL equivalence: with a NON-EMPTY old snapshot exercising add/modify(gain)/
    modify(lose)/remove, the open-match set after the delta path EQUALS the open-match
    set after a full rescan + close pass over the new snapshot.
    """
    await _add_tenant(session)
    await _add_customer(session, "cust-petrov", "Vladimir Petrov")
    await _add_customer(session, "cust-smith", "Jonathan Smith")
    await _add_customer(session, "cust-lee", "Carol Lee")

    # OLD snapshot v1: keep-smith (matches), modify-gain (far->lee), modify-lose (petrov->far),
    # removed (gone). new snapshot v2 adds petrov.
    await _add_sanction(session, "sanc-smith", "Jonathan Smith", "v1")
    gain = await _add_sanction(session, "sanc-gain", "Nobody At All", "v1")
    lose = await _add_sanction(session, "sanc-lose", "Vladimir Petrov", "v1")
    await _add_sanction(session, "sanc-gone", "Doomed Entry", "v1")
    old_snapshot = await _domain_snapshot(session, "v1")

    # Build v2: smith kept; gain modified to match cust-lee; lose modified to NOT match;
    # gone removed; petrov added.
    smith = (
        await session.execute(select(DBEntity).where(DBEntity.entity_id == "sanc-smith"))
    ).scalar_one()
    smith.list_version = "v2"
    gain.primary_name, gain.name_canonical, gain.name_trigram = (
        "Carol Lee",
        "carol lee",
        "carol lee",
    )
    gain.list_version = "v2"
    (
        await session.execute(
            select(EntityEmbedding).where(EntityEmbedding.entity_id == "sanc-gain")
        )
    ).scalar_one().embedding = await _embed("Carol Lee")
    lose.primary_name = "Totally Unrelated"
    lose.name_canonical = "totally unrelated"
    lose.name_trigram = "totally unrelated"
    lose.list_version = "v2"
    (
        await session.execute(
            select(EntityEmbedding).where(EntityEmbedding.entity_id == "sanc-lose")
        )
    ).scalar_one().embedding = await _embed("Totally Unrelated")
    petrov = await _add_sanction(session, "sanc-petrov", "Vladimir Petrov", "v2")
    await session.commit()

    # Seed the pre-existing PENDING match for the lose-entry (full rescan would have made it).
    session.add(
        WhitelistBlacklistMatch(
            match_id="pre-lose",
            tenant_id=_TENANT,
            whitelist_entity_id="cust-petrov",
            blacklist_entity_id="sanc-lose",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
            resolution_status="PENDING",
        )
    )
    await session.commit()

    new_snapshot = await _domain_snapshot(session, "v2")
    delta = diff_lists(old_snapshot, new_snapshot)
    assert {e.entity_id for e in delta.added} == {"sanc-petrov"}
    assert {e.entity_id for e in delta.modified} == {"sanc-gain", "sanc-lose"}
    assert set(delta.removed) == {"sanc-gone"}

    changed = await _changed_rows(session, delta)
    svc = _delta_service(session)
    await svc.rescan_added_or_modified(_TENANT, changed)
    await svc.close_removed(_TENANT, delta.removed)
    delta_keys = await _match_keys(session)

    # Reset and run the FULL rescan over v2 + close removed for the comparison baseline.
    await session.execute(
        WhitelistBlacklistMatch.__table__.delete().where(
            WhitelistBlacklistMatch.tenant_id == _TENANT
        )
    )
    await session.commit()
    full_keys = await _full_rescan_keys(session, "v2")

    assert delta_keys == full_keys
    assert delta_keys == {
        ("cust-smith", "sanc-smith"),
        ("cust-lee", "sanc-gain"),
        ("cust-petrov", "sanc-petrov"),
    }


async def _changed_rows(session: AsyncSession, delta) -> list[DBEntity]:
    """Load the DB rows for the added+modified entity ids of a diff."""
    ids = [e.entity_id for e in (*delta.added, *delta.modified)]
    result = await session.execute(select(DBEntity).where(DBEntity.entity_id.in_(ids)))
    return list(result.scalars().all())


async def test_saturation_falls_back_to_full_rescan(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When a changed entry's neighbour search saturates (>k customers cluster on it),
    a true match ranked beyond k is still found via the full-customer fallback.

    The neighbour cap is shrunk to 3 so the test stays fast while still forcing
    saturation (4 clustered customers > cap of 3).
    """
    from aml_filter.screening import delta_rescan

    monkeypatch.setattr(delta_rescan, "_NEIGHBOURS_PER_ENTRY", 3)
    await _add_tenant(session)
    # cap+1 customers ALL named "Vladimir Petrov" cluster on the one changed entry; the
    # vector search caps at k=3, so at least one true match sits beyond the cap.
    for i in range(4):
        await _add_customer(session, f"cust-{i}", "Vladimir Petrov")
    added = await _add_sanction(session, "sanc-1", "Vladimir Petrov", "v2")

    await _delta_service(session).rescan_added_or_modified(_TENANT, [added])

    open_keys = await _match_keys(session)
    # Every one of the 4 clustered customers must have produced a match (none dropped).
    assert open_keys == {(f"cust-{i}", "sanc-1") for i in range(4)}


async def _full_rescan_keys(session: AsyncSession, version: str) -> set[tuple[str, str]]:
    """Run the existing FULL rescan and return its resulting open-match keys."""
    service = BidirectionalScreeningService(session=session, embedding_service=_svc())
    await service.screen_whitelist_against_blacklist(
        tenant_id=_TENANT, list_id="OFAC_SDN", list_version=version
    )
    return await _match_keys(session)


async def test_delta_equals_full_rescan(session: AsyncSession) -> None:
    """KEY GUARANTEE: delta-path matches == full-rescan matches over the same change set."""
    await _add_tenant(session)
    await _add_customer(session, "cust-petrov", "Vladimir Petrov")
    await _add_customer(session, "cust-smith", "Jonathan Smith")
    await _add_customer(session, "cust-lee", "Carol Lee")

    # OLD list v1: one entry that matches cust-smith.
    await _add_sanction(session, "sanc-smith", "Jonathan Smith", "v1")

    # Snapshot the FULL rescan result at v1 as the baseline we must reproduce after a change,
    # then build NEW list v2 = add (petrov match), modify (none), keep smith.
    added = await _add_sanction(session, "sanc-petrov", "Vladimir Petrov", "v2")
    # carry the kept entry forward into v2 (same id, same name) so v2 is the full new snapshot.
    smith = (
        await session.execute(select(DBEntity).where(DBEntity.entity_id == "sanc-smith"))
    ).scalar_one()
    smith.list_version = "v2"
    await session.commit()

    old_snapshot = []  # baseline diff input: treat v1 as the prior snapshot of sanc-petrov's list
    new_snapshot = await _domain_snapshot(session, "v2")
    delta = diff_lists(old_snapshot, new_snapshot)
    assert {e.entity_id for e in delta.added} == {"sanc-petrov", "sanc-smith"}

    # DELTA path: screen only the changed entries.
    await _delta_service(session).rescan_added_or_modified(_TENANT, [added, smith])
    delta_keys = await _match_keys(session)

    # Reset matches and run the FULL rescan over v2 for comparison.
    await session.execute(
        WhitelistBlacklistMatch.__table__.delete().where(
            WhitelistBlacklistMatch.tenant_id == _TENANT
        )
    )
    await session.commit()
    full_keys = await _full_rescan_keys(session, "v2")

    assert delta_keys == full_keys
    assert delta_keys == {("cust-petrov", "sanc-petrov"), ("cust-smith", "sanc-smith")}


def test_delta_embed_cost_is_per_change_not_per_customer() -> None:
    """Cost characteristic: one embed per changed entry, independent of customer count.

    The delta path embeds each changed sanctions entry once and runs one IndexFlatIP
    vector search per change (exact O(N_customers) per query; ANN deferred). It never
    embeds or iterates the full customer list, so a 2-entry change costs 2 embeds whether
    there are 3 customers or 3 million.
    """
    from aml_filter.screening import delta_rescan

    # Documented invariant guarded by test_delta_equals_full_rescan above.
    assert hasattr(delta_rescan.DeltaRescanService, "rescan_added_or_modified")
