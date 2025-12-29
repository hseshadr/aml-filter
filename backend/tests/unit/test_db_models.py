"""Unit tests for SQLAlchemy models."""

import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from aml_filter.db.models import (
    Entity,
    Tenant,
)

@pytest.mark.asyncio
async def test_create_tenant(session: AsyncSession) -> None:
    tenant = Tenant(
        tenant_id="acme",
        name="Acme Fintech Inc.",
        plan="professional",
        metadata_json={"contact_email": "admin@acme.com"},
    )
    session.add(tenant)
    await session.commit()
    result = await session.get(Tenant, "acme")
    assert result is not None
    assert result.tenant_id == "acme"
    assert result.metadata_json["contact_email"] == "admin@acme.com"

@pytest.mark.asyncio
async def test_create_entity(session: AsyncSession) -> None:
    # Create tenant first due to foreign key
    tenant = Tenant(tenant_id="test_tenant", name="Test Tenant", plan="starter")
    session.add(tenant)
    await session.commit()

    entity = Entity(
        entity_id="ofac:sdn:12345",
        tenant_id="test_tenant",
        entity_type="PERSON",
        primary_name="MOHAMMED ALI",
        name_canonical="mohammed ali",
        name_tokens=["mohammed", "ali"],
        name_trigram="mohammed ali",
        aliases=[{"name": "MUHAMMAD ALI", "name_canonical": "muhammad ali", "source": "OFAC"}],
        dob=[date(1985, 2, 10)],
        countries=["PK"],
        risk_category="SANCTION",
        source_list="ofac_sdn",
        list_version="2025-12-28",
    )
    session.add(entity)
    await session.commit()
    result = await session.get(Entity, "ofac:sdn:12345")
    assert result is not None
    assert result.primary_name == "MOHAMMED ALI"
