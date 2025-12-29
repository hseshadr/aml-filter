import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from aml_filter.api.v1.whitelist import router
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.db.models import Entity as DBEntity, ScreeningJob, WhitelistBlacklistMatch
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

app = FastAPI()
app.include_router(router, prefix="/v1")

@pytest.mark.asyncio
async def test_add_customer():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_entity = DBEntity(
        entity_id="cust-123",
        tenant_id="tenant-123",
        entity_type="PERSON",
        primary_name="Target Customer",
        name_canonical="target customer",
        dob=[],
        countries=["US"],
        aliases=[],
        identifiers={},
        created_at=now,
        updated_at=now,
        risk_category="WHITELIST"
    )
    
    with patch("aml_filter.api.v1.whitelist.WhitelistIngestionService") as mock_ingest_class:
        mock_ingest = mock_ingest_class.return_value
        mock_ingest.add_customer = AsyncMock(return_value=mock_entity)
        
        client = TestClient(app)
        payload = {"name": "Target Customer", "country": "US"}
        response = client.post("/v1/whitelist/customers", json=payload)
        
        assert response.status_code == 201
        assert response.json()["entity_id"] == "cust-123"

@pytest.mark.asyncio
async def test_list_customers():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_entity = DBEntity(
        entity_id="cust-123",
        tenant_id="tenant-123",
        entity_type="PERSON",
        primary_name="Target Customer",
        name_canonical="target customer",
        dob=[],
        countries=["US"],
        aliases=[],
        identifiers={},
        created_at=now,
        updated_at=now,
        risk_category="WHITELIST"
    )
    
    with patch("aml_filter.api.v1.whitelist.WhitelistIngestionService") as mock_ingest_class:
        mock_ingest = mock_ingest_class.return_value
        mock_ingest.list_customers = AsyncMock(return_value=[mock_entity])
        
        client = TestClient(app)
        response = client.get("/v1/whitelist/customers")
        
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["entity_id"] == "cust-123"

@pytest.mark.asyncio
async def test_get_customer_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_entity = MagicMock(spec=DBEntity)
    mock_entity.entity_id = "cust-123"
    mock_entity.tenant_id = "tenant-123"
    mock_entity.entity_type = "PERSON"
    mock_entity.primary_name = "Target Customer"
    mock_entity.name_canonical = "target customer"
    mock_entity.dob = []
    mock_entity.countries = ["US"]
    mock_entity.aliases = []
    mock_entity.identifiers = {}
    mock_entity.created_at = now
    mock_entity.updated_at = now
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_entity
    mock_session.execute.return_value = mock_result
    
    client = TestClient(app)
    response = client.get("/v1/whitelist/customers/cust-123")
    
    assert response.status_code == 200
    assert response.json()["entity_id"] == "cust-123"

@pytest.mark.asyncio
async def test_trigger_screening_sync():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    # Mocking Redis to fail
    with patch("redis.Redis.from_url", side_effect=Exception("Redis connection failed")):
        # Patch the class where it's imported (locally in the except block)
        with patch("aml_filter.api.v1.whitelist.BidirectionalScreeningService") as mock_service_class:
            mock_service_instance = mock_service_class.return_value
            mock_service_instance.screen_whitelist_against_blacklist = AsyncMock(return_value={
                "entities_scanned": 10,
                "matches_found": 2
            })
            
            # Mock session.refresh to avoid errors on the ScreeningJob object
            async def mock_refresh(obj):
                if hasattr(obj, 'job_id'):
                    obj.status = "COMPLETED"
                    obj.entities_scanned = 10
                    obj.matches_found = 2
            mock_session.refresh = mock_refresh
            
            client = TestClient(app)
            response = client.post("/v1/whitelist/screen")
            
            assert response.status_code == 202
            assert response.json()["entities_scanned"] == 10
            assert response.json()["matches_found"] == 2

@pytest.mark.asyncio
async def test_get_matches():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_match = MagicMock(spec=WhitelistBlacklistMatch)
    mock_match.match_id = "m-1"
    mock_match.tenant_id = "tenant-123"
    mock_match.whitelist_entity_id = "w-1"
    mock_match.blacklist_entity_id = "b-1"
    mock_match.match_score = 0.95
    mock_match.match_type = "WHITELIST_VS_BLACKLIST"
    mock_match.list_version = "v1"
    mock_match.detected_at = now
    mock_match.resolution_status = "PENDING"
    mock_match.resolved_at = None
    
    with patch("aml_filter.api.v1.whitelist.MatchTracker") as mock_tracker_class:
        mock_tracker = mock_tracker_class.return_value
        mock_tracker.get_matches_for_tenant = AsyncMock(return_value=[mock_match])
        
        client = TestClient(app)
        response = client.get("/v1/whitelist/matches")
        
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["match_id"] == "m-1"
