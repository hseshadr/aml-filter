import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from aml_filter.api.v1.weights import router
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.domain.scoring import ScoringPolicy as DomainScoringPolicy, ScoringWeights
from unittest.mock import AsyncMock, MagicMock, patch

app = FastAPI()
app.include_router(router, prefix="/v1")

@pytest.mark.asyncio
async def test_get_current_weights():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    mock_policy = DomainScoringPolicy(
        policy_id="p-1",
        tenant_id="tenant-123",
        name="Balanced",
        weights=ScoringWeights(),
        threshold=0.65,
        version=1,
        preset="balanced"
    )
    
    with patch("aml_filter.api.v1.weights.get_active_policy", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_policy
        
        client = TestClient(app)
        response = client.get("/v1/weights")
        
        assert response.status_code == 200
        assert response.json()["policy_id"] == "p-1"
        assert response.json()["preset"] == "balanced"

@pytest.mark.asyncio
async def test_update_weights_preset():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    current_policy = DomainScoringPolicy(
        policy_id="p-1",
        tenant_id="tenant-123",
        name="Balanced",
        weights=ScoringWeights(),
        threshold=0.65,
        version=1,
        preset="balanced"
    )
    
    new_policy = DomainScoringPolicy(
        policy_id="p-2",
        tenant_id="tenant-123",
        name="strict-policy",
        weights=ScoringWeights(vector_similarity=0.5, trigram_similarity=0.5), # Just an example
        threshold=0.8,
        version=2,
        preset="strict"
    )
    
    with patch("aml_filter.api.v1.weights.get_active_policy", new_callable=AsyncMock) as mock_get, \
         patch("aml_filter.api.v1.weights.create_policy", new_callable=AsyncMock) as mock_create:
        mock_get.return_value = current_policy
        mock_create.return_value = new_policy
        
        client = TestClient(app)
        payload = {"preset": "strict", "threshold": 0.8}
        response = client.put("/v1/weights", json=payload)
        
        assert response.status_code == 200
        assert response.json()["preset"] == "strict"
        assert response.json()["threshold"] == 0.8

@pytest.mark.asyncio
async def test_get_policy_history():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    p1 = DomainScoringPolicy(
        policy_id="p-1",
        tenant_id="tenant-123",
        name="Balanced",
        weights=ScoringWeights(),
        threshold=0.65,
        version=1,
        preset="balanced"
    )
    
    with patch("aml_filter.api.v1.weights.list_policy_versions", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [p1]
        
        # Mock active policy check
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = MagicMock(policy_id="p-1")
        mock_session.execute.return_value = mock_result
        
        client = TestClient(app)
        response = client.get("/v1/weights/history")
        
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["is_active"] is True

@pytest.mark.asyncio
async def test_rollback_policy():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    p1 = DomainScoringPolicy(
        policy_id="p-1",
        tenant_id="tenant-123",
        name="Balanced",
        weights=ScoringWeights(),
        threshold=0.65,
        version=1,
        preset="balanced"
    )
    
    with patch("aml_filter.api.v1.weights.rollback_to_version", new_callable=AsyncMock) as mock_rollback:
        mock_rollback.return_value = p1
        
        client = TestClient(app)
        response = client.post("/v1/weights/rollback", json={"version": 1})
        
        assert response.status_code == 200
        assert response.json()["version"] == 1

