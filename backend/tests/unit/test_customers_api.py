"""Unit tests for the /v1/customers API router."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.customers import router
from aml_filter.db.models import Customer
from aml_filter.domain.customer import OnboardingResult, OnboardingStatus
from aml_filter.security.middleware import require_api_key

app = FastAPI()
app.include_router(router, prefix="/v1")


def _override(tenant_id: str = "tenant-123") -> AsyncMock:
    """Wire dependency overrides and return the mock session."""
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: tenant_id
    return mock_session


def _customer(customer_id: str = "cust-1", tenant_id: str = "tenant-123") -> Customer:
    """Build a Customer ORM stand-in for read-path responses."""
    now = datetime.now(UTC)
    return Customer(
        customer_id=customer_id,
        tenant_id=tenant_id,
        customer_reference="REF-1",
        onboarding_status="PENDING_REVIEW",
        kyc_risk_rating=None,
        id_documents=[],
        onboarded_by="officer@acme.com",
        screening_entity_id="whitelist:tenant-123:abc",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_should_onboard_customer_when_posted() -> None:
    # Given
    _override()
    result = OnboardingResult(
        customer_id="cust-1",
        customer_reference="REF-1",
        screening_entity_id="whitelist:tenant-123:abc",
        onboarding_status=OnboardingStatus.PENDING_REVIEW,
        match_entity_ids=["ofac:sdn:1"],
    )
    with (
        patch("aml_filter.api.v1.customers.OnboardingService") as svc,
        patch("aml_filter.api.v1.customers.get_customer_for_tenant") as getter,
    ):
        svc.return_value.onboard_customer = AsyncMock(return_value=result)
        getter.return_value = _customer()
        client = TestClient(app)

        # When
        resp = client.post(
            "/v1/customers",
            json={"customer_reference": "REF-1", "name": "Jon Q Fakename"},
        )

    # Then
    assert resp.status_code == 201
    body = resp.json()
    assert body["customer_id"] == "cust-1"
    assert body["match_entity_ids"] == ["ofac:sdn:1"]


@pytest.mark.asyncio
async def test_should_require_api_key_when_posting() -> None:
    # Given — session overridden but no auth override, so require_api_key runs for real
    _override()
    del app.dependency_overrides[require_api_key]
    client = TestClient(app)

    # When — no X-API-Key header is sent
    resp = client.post("/v1/customers", json={"customer_reference": "R", "name": "X"})

    # Then
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_should_list_customers_scoped_to_tenant() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.customers.list_customers_for_tenant") as lister:
        lister.return_value = [_customer()]
        client = TestClient(app)

        # When
        resp = client.get("/v1/customers")

    # Then
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["customer_id"] == "cust-1"
    assert lister.call_args.kwargs["tenant_id"] == "tenant-123"


@pytest.mark.asyncio
async def test_should_get_customer_by_id_when_owned() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.customers.get_customer_for_tenant") as getter:
        getter.return_value = _customer()
        client = TestClient(app)

        # When
        resp = client.get("/v1/customers/cust-1")

    # Then
    assert resp.status_code == 200
    assert resp.json()["customer_id"] == "cust-1"


@pytest.mark.asyncio
async def test_should_return_404_when_customer_missing() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.customers.get_customer_for_tenant") as getter:
        getter.return_value = None
        client = TestClient(app)

        # When
        resp = client.get("/v1/customers/nope")

    # Then
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_should_update_status_when_put() -> None:
    # Given
    _override()
    updated = _customer()
    updated.onboarding_status = "ACTIVE"
    updated.kyc_risk_rating = "LOW"
    with patch("aml_filter.api.v1.customers.get_customer_for_tenant") as getter:
        getter.return_value = updated
        client = TestClient(app)

        # When
        resp = client.put(
            "/v1/customers/cust-1",
            json={"onboarding_status": "ACTIVE", "kyc_risk_rating": "LOW"},
        )

    # Then
    assert resp.status_code == 200
    assert resp.json()["onboarding_status"] == "ACTIVE"
    assert resp.json()["kyc_risk_rating"] == "LOW"


@pytest.mark.asyncio
async def test_should_delete_customer_when_owned() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.customers.get_customer_for_tenant") as getter:
        getter.return_value = _customer()
        client = TestClient(app)

        # When
        resp = client.delete("/v1/customers/cust-1")

    # Then
    assert resp.status_code == 204
