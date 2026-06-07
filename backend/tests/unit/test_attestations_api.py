"""API tests for the attestations router (auth, scoping, CRUD, verify, export)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from edgeproc.bundles.signing import Ed25519Signer, generate_keypair
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.attestations import router
from aml_filter.attestation.canonical import canonical_payload_bytes
from aml_filter.attestation.signing import SIGNING_ALGO
from aml_filter.db.models import Attestation
from aml_filter.domain.attestation import AttestationPayload, AttestationStatus
from aml_filter.security.middleware import require_api_key

_TENANT = "tenant-123"
_NOW = datetime(2026, 6, 6, 12, 0, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _stub_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent get_settings() from reading DATABASE_URL — not needed for router unit tests.

    The attestations router calls get_settings() inside _service() and _load_public_key()
    to read ATTESTATION_SIGNING_KEY_PATH and VERIFY_KEY_PATH. Neither requires a real DB
    URL. Monkeypatching the module-level reference keeps these tests fully offline and
    independent of any DATABASE_URL environment variable (which is absent in the CI
    unit-test step where only TEST_DATABASE_URL is set).
    """
    stub = MagicMock()
    stub.attestation_signing_key_path = None
    stub.attestation_signing_key_id = "default"
    stub.attestation_validity_days = 90
    stub.verify_key_path = None
    monkeypatch.setattr("aml_filter.api.v1.attestations.get_settings", lambda: stub)


def _app() -> FastAPI:
    """Build a router-only app for unit-level endpoint testing."""
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    return app


def _row(**overrides: object) -> Attestation:
    """A persisted-attestation row with sensible defaults for the API mapper."""
    defaults: dict[str, object] = {
        "attestation_id": str(uuid.uuid4()),
        "tenant_id": _TENANT,
        "customer_id": "cust-1",
        "customer_reference": "ACME-001",
        "screened_at": _NOW,
        "valid_until": _NOW + timedelta(days=90),
        "lists_and_versions": [{"list_id": "OFAC_SDN", "version": "2026-06-01"}],
        "status": AttestationStatus.CLEAR.value,
        "match_count": 0,
        "pending_count": 0,
        "signature": None,
        "signing_key_id": None,
        "algo": None,
        "created_at": _NOW,
    }
    defaults.update(overrides)
    return Attestation(**defaults)


def test_should_401_when_no_api_key() -> None:
    # Given an app with the real api-key dependency and a stub session
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    client = TestClient(app)

    # When listing attestations without an X-API-Key header
    response = client.get("/v1/attestations")

    # Then it is rejected as unauthorized
    assert response.status_code == 401


def test_should_generate_attestation_when_posted(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a service that builds an attestation
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT
    built = _row(customer_id="cust-9")

    async def _build(self: object, tenant_id: str, customer_id: str, **_: object) -> Attestation:
        assert tenant_id == _TENANT
        return built

    monkeypatch.setattr(
        "aml_filter.attestation.service.AttestationService.build_for_customer", _build
    )
    client = TestClient(app)

    # When posting a customer id
    response = client.post("/v1/attestations", json={"customer_id": "cust-9"})

    # Then a 201 with the new attestation
    assert response.status_code == 201
    assert response.json()["customer_id"] == "cust-9"


def test_should_list_latest_when_get(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a service returning one latest attestation
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _list(self: object, tenant_id: str, **_: object) -> list[Attestation]:
        return [_row()]

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.list_latest", _list)
    client = TestClient(app)

    # When listing
    response = client.get("/v1/attestations?stale=false&limit=10&offset=0")

    # Then the latest attestations come back
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_should_404_when_attestation_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a service that finds nothing
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _get(self: object, tenant_id: str, attestation_id: str) -> None:
        return None

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    client = TestClient(app)

    # When fetching a missing id
    response = client.get("/v1/attestations/nope")

    # Then 404
    assert response.status_code == 404


def test_should_verify_signed_attestation(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a genuinely signed attestation row and a pinned public key
    private, public = generate_keypair()
    payload = AttestationPayload.model_validate(
        {
            "tenant_id": _TENANT,
            "customer_id": "cust-1",
            "customer_reference": "ACME-001",
            "screened_at": _NOW,
            "valid_until": _NOW + timedelta(days=90),
            "lists_and_versions": [{"list_id": "OFAC_SDN", "version": "2026-06-01"}],
            "result": {"status": "CLEAR", "match_count": 0, "pending_count": 0},
        }
    )
    signature = Ed25519Signer(private).sign(canonical_payload_bytes(payload))
    row = _row(signature=signature, algo=SIGNING_ALGO, signing_key_id="k1")

    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    monkeypatch.setattr(
        "aml_filter.api.v1.attestations._load_public_key", lambda: public.public_bytes_raw()
    )
    client = TestClient(app)

    # When verifying
    response = client.get(f"/v1/attestations/{row.attestation_id}/verify")

    # Then it reports valid
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_should_report_unsigned_on_verify(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given an unsigned attestation and a configured key
    _private, public = generate_keypair()
    row = _row()
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    monkeypatch.setattr(
        "aml_filter.api.v1.attestations._load_public_key", lambda: public.public_bytes_raw()
    )
    client = TestClient(app)

    # When verifying
    response = client.get(f"/v1/attestations/{row.attestation_id}/verify")

    # Then it reports unsigned
    body = response.json()
    assert body["valid"] is False
    assert body["reason"] == "attestation is unsigned"


def test_should_503_on_verify_when_no_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a signed attestation but no configured verification key
    row = _row(signature="sig", algo=SIGNING_ALGO)
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)

    class _Settings:
        verify_key_path = None
        attestation_signing_key_path = None

    monkeypatch.setattr("aml_filter.api.v1.attestations.get_settings", lambda: _Settings())
    client = TestClient(app)

    # When verifying
    response = client.get(f"/v1/attestations/{row.attestation_id}/verify")

    # Then it reports the key is unavailable
    assert response.status_code == 503


def test_should_422_when_signature_required_but_no_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a service whose build raises (no signing key but signature required)
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _build(self: object, tenant_id: str, customer_id: str, **_: object) -> Attestation:
        raise ValueError("a signing key is required but none is configured")

    monkeypatch.setattr(
        "aml_filter.attestation.service.AttestationService.build_for_customer", _build
    )
    client = TestClient(app)

    # When posting with require_signature
    response = client.post(
        "/v1/attestations", json={"customer_id": "cust-9", "require_signature": True}
    )

    # Then it fails closed with 422
    assert response.status_code == 422


def test_read_paths_do_not_load_private_signing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a configured-but-missing private signing key (a misconfig) and a valid public key
    _private, public = generate_keypair()
    row = _row()
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    monkeypatch.setattr(
        "aml_filter.api.v1.attestations._load_public_key", lambda: public.public_bytes_raw()
    )

    class _Settings:
        # The private signing key path is set but the file does not exist: load_signing_config
        # would raise FileNotFoundError. Read/verify/export must NOT touch it.
        attestation_signing_key_path = Path("/nonexistent/private.key")
        attestation_signing_key_id = "default"
        attestation_validity_days = 90
        verify_key_path = None

    monkeypatch.setattr("aml_filter.api.v1.attestations.get_settings", lambda: _Settings())
    client = TestClient(app)

    # When hitting the read, verify, and export paths
    get_resp = client.get(f"/v1/attestations/{row.attestation_id}")
    verify_resp = client.get(f"/v1/attestations/{row.attestation_id}/verify")
    export_resp = client.get(f"/v1/attestations/{row.attestation_id}/export?format=json")

    # Then none of them 500 on the absent private key (they only need the public verify key)
    assert get_resp.status_code == 200
    assert verify_resp.status_code == 200
    assert export_resp.status_code == 200


def test_should_export_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given an attestation to export
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT
    row = _row()

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    client = TestClient(app)

    # When exporting as PDF
    response = client.get(f"/v1/attestations/{row.attestation_id}/export?format=pdf")

    # Then a PDF artifact is streamed
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_should_export_json(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given an attestation to export
    app = _app()
    app.dependency_overrides[get_db_session] = lambda: object()
    app.dependency_overrides[require_api_key] = lambda: _TENANT
    row = _row()

    async def _get(self: object, tenant_id: str, attestation_id: str) -> Attestation:
        return row

    monkeypatch.setattr("aml_filter.attestation.service.AttestationService.get", _get)
    client = TestClient(app)

    # When exporting as JSON
    response = client.get(f"/v1/attestations/{row.attestation_id}/export?format=json")

    # Then the JSON record is returned
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
