"""Integration tests for whitelist-blacklist bidirectional screening."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.ingest.whitelist import WhitelistIngestionService
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.screening.match_tracker import MatchTracker


@pytest.mark.asyncio
async def test_add_whitelist_customer(db_session: AsyncSession, test_tenant):
    """Test adding a customer to whitelist."""
    ingestion_service = WhitelistIngestionService(session=db_session)

    entity = await ingestion_service.add_customer(
        tenant_id=test_tenant.tenant_id,
        name="John Doe",
        entity_type="PERSON",
        country="US",
    )

    assert entity.risk_category == "WHITELIST"
    assert entity.tenant_id == test_tenant.tenant_id
    assert entity.source_list == "CUSTOMER_WHITELIST"
    assert entity.primary_name == "John Doe"


@pytest.mark.asyncio
async def test_screen_whitelist_against_blacklist(
    db_session: AsyncSession,
    test_tenant,
):
    """Test screening whitelist customer against blacklist."""
    # Create a whitelist customer
    ingestion_service = WhitelistIngestionService(session=db_session)
    whitelist_entity = await ingestion_service.add_customer(
        tenant_id=test_tenant.tenant_id,
        name="John Doe",
        entity_type="PERSON",
        country="US",
    )

    # Create a blacklist entity (simulating OFAC entry)
    from aml_filter.db.models import EntityEmbedding
    from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
    from aml_filter.embedding.service import EmbeddingService

    embedding_service = EmbeddingService()
    normalized = normalize_name("John Doe")
    embedding_text = prepare_embedding_text("John Doe", "US")
    embedding_vector = await embedding_service.embed(embedding_text)

    blacklist_entity = DBEntity(
        entity_id="ofac:sdn:12345",
        tenant_id=None,  # Global entity
        entity_type="PERSON",
        primary_name="John Doe",
        name_canonical=normalized.name_canonical,
        name_tokens=normalized.name_tokens,
        name_trigram=normalized.name_trigram,
        aliases=[],
        dob=[],
        countries=["US"],
        nationalities=[],
        addresses=[],
        identifiers={},
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="2024-01",
        custom_list_id=None,
        raw_source={},
    )
    db_session.add(blacklist_entity)
    await db_session.flush()

    embedding = EntityEmbedding(
        entity_id="ofac:sdn:12345",
        embedding=embedding_vector,
        embedding_model="all-MiniLM-L6-v2",
        model_version="default",
    )
    await db_session.merge(embedding)
    await db_session.commit()

    # Screen whitelist against blacklist
    screening_service = BidirectionalScreeningService(session=db_session)
    results = await screening_service.screen_whitelist_against_blacklist(
        tenant_id=test_tenant.tenant_id,
        threshold=0.5,
        batch_size=10,
    )

    assert results["entities_scanned"] == 1
    assert results["matches_found"] >= 1

    # Check that match was recorded
    match_tracker = MatchTracker(session=db_session)
    matches = await match_tracker.get_matches_for_tenant(
        tenant_id=test_tenant.tenant_id,
        resolution_status="PENDING",
    )

    assert len(matches) >= 1
    match = matches[0]
    assert match.whitelist_entity_id == whitelist_entity.entity_id
    assert match.blacklist_entity_id == blacklist_entity.entity_id
    assert match.match_type == "WHITELIST_VS_BLACKLIST"
    assert match.resolution_status == "PENDING"


@pytest.mark.asyncio
async def test_screen_blacklist_against_whitelist(
    db_session: AsyncSession,
    test_tenant,
):
    """Test screening blacklist entity against whitelist."""
    # Create a whitelist customer
    ingestion_service = WhitelistIngestionService(session=db_session)
    whitelist_entity = await ingestion_service.add_customer(
        tenant_id=test_tenant.tenant_id,
        name="Jane Smith",
        entity_type="PERSON",
        country="UK",
    )

    # Create a blacklist entity
    from aml_filter.db.models import EntityEmbedding
    from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
    from aml_filter.embedding.service import EmbeddingService

    embedding_service = EmbeddingService()
    normalized = normalize_name("Jane Smith")
    embedding_text = prepare_embedding_text("Jane Smith", "UK")
    embedding_vector = await embedding_service.embed(embedding_text)

    blacklist_entity = DBEntity(
        entity_id="ofac:sdn:67890",
        tenant_id=None,
        entity_type="PERSON",
        primary_name="Jane Smith",
        name_canonical=normalized.name_canonical,
        name_tokens=normalized.name_tokens,
        name_trigram=normalized.name_trigram,
        aliases=[],
        dob=[],
        countries=["UK"],
        nationalities=[],
        addresses=[],
        identifiers={},
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="2024-01",
        custom_list_id=None,
        raw_source={},
    )
    db_session.add(blacklist_entity)
    await db_session.flush()

    embedding = EntityEmbedding(
        entity_id="ofac:sdn:67890",
        embedding=embedding_vector,
        embedding_model="all-MiniLM-L6-v2",
        model_version="default",
    )
    await db_session.merge(embedding)
    await db_session.commit()

    # Screen blacklist against whitelist
    screening_service = BidirectionalScreeningService(session=db_session)
    matches = await screening_service.screen_entity_against_list(
        entity=blacklist_entity,
        target_risk_category="WHITELIST",
        threshold=0.5,
        match_type="BLACKLIST_VS_WHITELIST",
        tenant_id=test_tenant.tenant_id,
    )

    assert len(matches) >= 1
    assert whitelist_entity.entity_id in matches

    # Check that match was recorded
    match_tracker = MatchTracker(session=db_session)
    recorded_matches = await match_tracker.get_matches_for_tenant(
        tenant_id=test_tenant.tenant_id,
        resolution_status="PENDING",
    )

    assert len(recorded_matches) >= 1
    match = recorded_matches[0]
    assert match.whitelist_entity_id == whitelist_entity.entity_id
    assert match.blacklist_entity_id == blacklist_entity.entity_id
    assert match.match_type == "BLACKLIST_VS_WHITELIST"


@pytest.mark.asyncio
async def test_resolve_match(db_session: AsyncSession, test_tenant):
    """Test resolving a match."""
    # Create entities first to satisfy foreign keys
    whitelist_entity = DBEntity(
        entity_id="whitelist:test:123",
        tenant_id=test_tenant.tenant_id,
        entity_type="PERSON",
        primary_name="Whitelist Person",
        name_canonical="whitelist person",
        name_trigram="whitelist person",
        risk_category="WHITELIST",
        source_list="CUSTOMER_WHITELIST",
        list_version="v1",
    )
    blacklist_entity = DBEntity(
        entity_id="ofac:sdn:12345",
        tenant_id=None,
        entity_type="PERSON",
        primary_name="Blacklist Person",
        name_canonical="blacklist person",
        name_trigram="blacklist person",
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="v1",
    )
    db_session.add(whitelist_entity)
    db_session.add(blacklist_entity)
    await db_session.commit()

    # Create a match
    match_tracker = MatchTracker(session=db_session)
    match = await match_tracker.record_match(
        tenant_id=test_tenant.tenant_id,
        whitelist_entity_id="whitelist:test:123",
        blacklist_entity_id="ofac:sdn:12345",
        match_score=0.85,
        match_type="WHITELIST_VS_BLACKLIST",
    )

    # Resolve match
    resolved = await match_tracker.resolve_match(
        match_id=match.match_id,
        resolution_status="FALSE_POSITIVE",
        tenant_id=test_tenant.tenant_id,
    )

    assert resolved is not None
    assert resolved.resolution_status == "FALSE_POSITIVE"
    assert resolved.resolved_at is not None

    # Get unresolved matches (should not include this one)
    unresolved = await match_tracker.get_unresolved_matches(tenant_id=test_tenant.tenant_id)
    assert match.match_id not in [m.match_id for m in unresolved]
