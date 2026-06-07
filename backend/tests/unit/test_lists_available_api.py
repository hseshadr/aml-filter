"""Unit tests for the available-sanctions-lists endpoint."""

from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.lists import router
from aml_filter.security.middleware import require_api_key

app = FastAPI()
app.include_router(router, prefix="/v1")


def _fake_session() -> AsyncMock:
    return AsyncMock()


def _fake_tenant() -> str:
    return "tenant-123"


@pytest.fixture(autouse=True)
def _overrides() -> Iterator[None]:
    app.dependency_overrides[get_db_session] = _fake_session
    app.dependency_overrides[require_api_key] = _fake_tenant
    yield
    app.dependency_overrides.clear()


def test_should_list_all_available_sanctions_lists() -> None:
    # Given the parser registry with the four built-in lists
    client = TestClient(app)
    # When fetching available lists
    response = client.get("/v1/lists/available")
    # Then the response carries the built-in list ids
    assert response.status_code == 200
    ids = {item["list_id"] for item in response.json()}
    assert {"OFAC_SDN", "EU_CONSOLIDATED", "UK_OFSI", "UN_CONSOLIDATED"} <= ids


def test_available_is_not_shadowed_by_list_id_route() -> None:
    # Given the /available path could collide with /{list_id}
    client = TestClient(app)
    # When fetching /available
    response = client.get("/v1/lists/available")
    # Then it resolves to the available endpoint (200), not a 404 from get_list_config
    assert response.status_code == 200
    assert isinstance(response.json(), list)
