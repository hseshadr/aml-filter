import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.screen import get_search_service, router
from aml_filter.security.middleware import get_tenant_from_api_key


class _FailingSearchService:
    async def search(self, *args, **kwargs):
        raise RuntimeError("boom")


def test_screen_health_endpoint() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    client = TestClient(app)
    resp = client.get("/v1/screen/health")
    assert resp.status_code == 200


def test_screen_endpoint_returns_500_on_internal_error() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/v1")

    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[get_search_service] = lambda: _FailingSearchService()
    app.dependency_overrides[get_tenant_from_api_key] = lambda: None

    client = TestClient(app)
    resp = client.post("/v1/screen", json={"name": "John Doe"})
    assert resp.status_code == 500
    assert "Search failed" in resp.json()["detail"]


