"""Unit tests for Entity domain models."""

import pytest
from datetime import date

from aml_filter.domain.entity import Alias, Entity, EntityIdentifier


class TestEntityIdentifier:
    """Test EntityIdentifier model."""

    def test_create_empty_identifier(self) -> None:
        """Test creating empty identifier."""
        ident = EntityIdentifier()
        assert ident.passport == []
        assert ident.national_id == []
        assert ident.other == {}

    def test_create_with_data(self) -> None:
        """Test creating identifier with data."""
        ident = EntityIdentifier(
            passport=["AB123456"],
            national_id=["12345-67890"],
            other={"driver_license": ["DL789"]},
        )
        assert ident.passport == ["AB123456"]
        assert ident.national_id == ["12345-67890"]
        assert ident.other["driver_license"] == ["DL789"]


class TestAlias:
    """Test Alias model."""

    def test_create_alias(self) -> None:
        """Test creating alias."""
        alias = Alias(name="MUHAMMAD ALI", name_canonical="muhammad ali", source="OFAC")
        assert alias.name == "MUHAMMAD ALI"
        assert alias.name_canonical == "muhammad ali"
        assert alias.source == "OFAC"


class TestEntity:
    """Test Entity model."""

    def test_create_minimal_entity(self) -> None:
        """Test creating minimal entity."""
        entity = Entity(
            entity_id="ofac:sdn:12345",
            entity_type="PERSON",
            primary_name="MOHAMMED ALI",
            name_canonical="mohammed ali",
            name_trigram="mohammed ali",
            risk_category="SANCTION",
            source_list="ofac_sdn",
            list_version="2025-12-28",
        )
        assert entity.entity_id == "ofac:sdn:12345"
        assert entity.entity_type == "PERSON"
        assert entity.primary_name == "MOHAMMED ALI"
        assert entity.tenant_id is None
        assert entity.aliases == []
        assert entity.dob == []

    def test_create_full_entity(self) -> None:
        """Test creating entity with all fields."""
        entity = Entity(
            entity_id="ofac:sdn:12345",
            tenant_id="acme",
            entity_type="PERSON",
            primary_name="MOHAMMED ALI",
            name_canonical="mohammed ali",
            name_tokens=["mohammed", "ali"],
            name_trigram="mohammed ali",
            aliases=[
                Alias(name="MUHAMMAD ALI", name_canonical="muhammad ali", source="OFAC")
            ],
            dob=[date(1985, 2, 10)],
            countries=["PK"],
            nationalities=["PK"],
            addresses=["Karachi, Pakistan"],
            identifiers=EntityIdentifier(passport=["AB123456"]),
            risk_category="SANCTION",
            source_list="ofac_sdn",
            list_version="2025-12-28",
            custom_list_id="acme-watchlist-v1",
            raw_source={"test": "data"},
        )
        assert entity.entity_id == "ofac:sdn:12345"
        assert entity.tenant_id == "acme"
        assert len(entity.aliases) == 1
        assert entity.dob[0] == date(1985, 2, 10)
        assert entity.countries == ["PK"]

    def test_entity_validation_entity_type(self) -> None:
        """Test entity type validation."""
        with pytest.raises(Exception):  # Pydantic validation error
            Entity(
                entity_id="test",
                entity_type="INVALID",  # type: ignore
                primary_name="Test",
                name_canonical="test",
                name_trigram="test",
                risk_category="SANCTION",
                source_list="test",
                list_version="v1",
            )

    def test_entity_validation_risk_category(self) -> None:
        """Test risk category validation."""
        with pytest.raises(Exception):  # Pydantic validation error
            Entity(
                entity_id="test",
                entity_type="PERSON",
                primary_name="Test",
                name_canonical="test",
                name_trigram="test",
                risk_category="INVALID",  # type: ignore
                source_list="test",
                list_version="v1",
            )

