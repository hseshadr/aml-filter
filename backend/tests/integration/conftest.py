import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from aml_filter.db.models import ApiKey, Tenant

from aml_filter.security.api_key import hash_api_key

@pytest.fixture
async def db_session(session: AsyncSession) -> AsyncSession:
    """Compatibility fixture for integration tests."""
    return session

@pytest.fixture
async def clean_database():
    """No-op fixture now that cleaning is done in session fixture."""
    yield

@pytest.fixture
async def test_tenant(db_session: AsyncSession):
    """Create a test tenant."""
    tenant = Tenant(tenant_id="test-tenant", name="Test Tenant", plan="starter")
    db_session.add(tenant)
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


@pytest.fixture
async def auth_headers(db_session: AsyncSession, test_tenant: Tenant) -> dict[str, str]:
    """Create an API key and return auth headers for integration tests."""
    plaintext = "aml_test_integration_key_123"
    api_key = ApiKey(
        key_id="test-key-1",
        tenant_id=test_tenant.tenant_id,
        key_hash=hash_api_key(plaintext),
        name="integration-key",
    )
    db_session.add(api_key)
    await db_session.commit()
    return {"X-API-Key": plaintext}
