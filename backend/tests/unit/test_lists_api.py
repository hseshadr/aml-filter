import pytest
from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from aml_filter.api.v1.lists import router
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.db.models import TenantListConfig, ListVersion
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
import io

app = FastAPI()
app.include_router(router, prefix="/v1")

@pytest.mark.asyncio
async def test_list_tenant_lists():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    # Mock configs
    now = datetime.utcnow()
    mock_config = TenantListConfig(
        tenant_id="tenant-123",
        list_id="OFAC_SDN",
        enabled=True,
        version_override=None,
        updated_at=now
    )
    
    mock_configs_result = MagicMock()
    mock_configs_result.scalars.return_value.all.return_value = [mock_config]
    
    # Mock versions
    mock_version = ListVersion(
        list_id="OFAC_SDN",
        version="2025-01-01",
        status="ACTIVE",
        activated_at=now
    )
    
    mock_versions_result = MagicMock()
    mock_versions_result.scalars.return_value.all.return_value = [mock_version]
    
    mock_session.execute.side_effect = [mock_configs_result, mock_versions_result]
    
    client = TestClient(app)
    response = client.get("/v1/lists")
    
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["list_id"] == "OFAC_SDN"

@pytest.mark.asyncio
async def test_get_list_config_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_config = TenantListConfig(
        tenant_id="tenant-123",
        list_id="OFAC_SDN",
        enabled=True,
        version_override=None,
        updated_at=now
    )
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_config
    
    # Mock version
    mock_version = ListVersion(
        list_id="OFAC_SDN",
        version="2025-01-01",
        status="ACTIVE",
        activated_at=now
    )
    mock_version_result = MagicMock()
    mock_version_result.scalar_one_or_none.return_value = mock_version
    
    mock_session.execute.side_effect = [mock_result, mock_version_result]
    
    client = TestClient(app)
    response = client.get("/v1/lists/OFAC_SDN")
    
    assert response.status_code == 200
    assert response.json()["list_id"] == "OFAC_SDN"

@pytest.mark.asyncio
async def test_update_list_config_new():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    # Mock GET (not found)
    mock_result_none = MagicMock()
    mock_result_none.scalar_one_or_none.return_value = None
    
    # Mock current version
    mock_version_result = MagicMock()
    mock_version_result.scalar_one_or_none.return_value = None
    
    mock_session.execute.side_effect = [mock_result_none, mock_version_result]
    
    # Use real TenantListConfig but mock refresh
    now = datetime.utcnow()
    async def mock_refresh(obj):
        obj.updated_at = now
        
    mock_session.refresh = mock_refresh
    
    client = TestClient(app)
    payload = {"enabled": False, "version_override": "v2"}
    response = client.put("/v1/lists/OFAC_SDN", json=payload)
    
    assert response.status_code == 200
    assert response.json()["enabled"] is False

@pytest.mark.asyncio
async def test_upload_custom_list_csv():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    csv_content = "name,country\nJohn Doe,US"
    file_obj = io.BytesIO(csv_content.encode())
    
    # Mock EmbeddingService instance methods
    with patch("aml_filter.api.v1.lists.EmbeddingService") as mock_emb_class:
        mock_emb_instance = MagicMock()
        mock_emb_instance.embed = AsyncMock(return_value=[0.1] * 384)
        mock_emb_class.return_value = mock_emb_instance
        
        client = TestClient(app)
        response = client.post(
            "/v1/lists/custom/upload",
            params={"list_name": "My List"},
            files={"file": ("test.csv", file_obj, "text/csv")}
        )
        
        assert response.status_code == 201
        assert "custom:tenant-123" in response.json()["list_id"]
