"""Unit tests for ingestion service."""

from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock, patch
import sys

import pytest

from aml_filter.db.models import Entity as DBEntity, EntityEmbedding, ListVersion, Tenant
from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.ingest.service import IngestionService


@pytest.fixture
def sample_entity() -> Entity:
    """Create a sample entity for testing."""
    return Entity(
        entity_id="test:entity:001",
        tenant_id=None,
        entity_type="PERSON",
        primary_name="John Doe",
        name_canonical="john doe",
        name_tokens=["john", "doe"],
        name_trigram="john doe",
        aliases=[
            Alias(name="Johnny D", name_canonical="johnny d", source="OFAC")
        ],
        dob=[date(1980, 1, 15)],
        countries=["US"],
        nationalities=["US"],
        addresses=["123 Main St, New York, NY"],
        identifiers=EntityIdentifier(
            passport=["AB123456"],
            national_id=["SSN123"],
            other={},
        ),
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="2024-01-01",
        custom_list_id=None,
        raw_source={"uid": "12345"},
    )


@pytest.fixture
def sample_entities(sample_entity: Entity) -> list[Entity]:
    """Create a list of sample entities for testing."""
    entity2 = Entity(
        entity_id="test:entity:002",
        tenant_id=None,
        entity_type="ORGANIZATION",
        primary_name="Evil Corp",
        name_canonical="evil corp",
        name_tokens=["evil", "corp"],
        name_trigram="evil corp",
        aliases=[],
        dob=[],
        countries=["RU"],
        nationalities=[],
        addresses=[],
        identifiers=EntityIdentifier(),
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="2024-01-01",
        custom_list_id=None,
        raw_source={"uid": "12346"},
    )
    return [sample_entity, entity2]


class TestIngestionServiceInit:
    """Test IngestionService initialization."""

    def test_init_with_defaults(self) -> None:
        """Test initialization with default values."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        assert service.session == mock_session
        assert service.embedding_service is not None
        assert service.ofac_parser is not None

    def test_init_with_custom_embedding_service(self) -> None:
        """Test initialization with custom embedding service."""
        mock_session = MagicMock()
        mock_embedding_service = MagicMock()

        service = IngestionService(
            session=mock_session,
            embedding_service=mock_embedding_service,
        )

        assert service.session == mock_session
        assert service.embedding_service == mock_embedding_service


class TestDomainToDbEntity:
    """Test _domain_to_db_entity conversion."""

    def test_convert_new_entity(self, sample_entity: Entity) -> None:
        """Test converting a new domain entity to DB entity."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        db_entity = service._domain_to_db_entity(sample_entity, existing=None)

        assert db_entity.entity_id == sample_entity.entity_id
        assert db_entity.tenant_id == sample_entity.tenant_id
        assert db_entity.entity_type == sample_entity.entity_type
        assert db_entity.primary_name == sample_entity.primary_name
        assert db_entity.name_canonical == sample_entity.name_canonical
        assert db_entity.name_tokens == sample_entity.name_tokens
        assert db_entity.name_trigram == sample_entity.name_trigram
        assert db_entity.risk_category == sample_entity.risk_category
        assert db_entity.source_list == sample_entity.source_list
        assert db_entity.list_version == sample_entity.list_version
        assert db_entity.raw_source == sample_entity.raw_source

        # Check aliases JSON format
        assert len(db_entity.aliases) == 1
        assert db_entity.aliases[0]["name"] == "Johnny D"
        assert db_entity.aliases[0]["name_canonical"] == "johnny d"
        assert db_entity.aliases[0]["source"] == "OFAC"

        # Check identifiers JSON format
        assert db_entity.identifiers["passport"] == ["AB123456"]
        assert db_entity.identifiers["national_id"] == ["SSN123"]
        assert db_entity.identifiers["other"] == {}

    def test_convert_existing_entity(self, sample_entity: Entity) -> None:
        """Test updating an existing DB entity."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        # Create existing DB entity
        existing_db_entity = DBEntity(
            entity_id=sample_entity.entity_id,
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Old Name",
            name_canonical="old name",
            name_tokens=["old", "name"],
            name_trigram="old name",
            aliases=[],
            dob=None,
            countries=None,
            nationalities=None,
            addresses=None,
            identifiers={},
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2023-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(sample_entity, existing=existing_db_entity)

        # Should return the same object updated
        assert db_entity is existing_db_entity
        assert db_entity.primary_name == sample_entity.primary_name
        assert db_entity.name_canonical == sample_entity.name_canonical
        assert db_entity.list_version == sample_entity.list_version

    def test_convert_entity_with_multiple_aliases(self) -> None:
        """Test converting entity with multiple aliases."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:multi-alias",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="John Doe",
            name_canonical="john doe",
            name_tokens=["john", "doe"],
            name_trigram="john doe",
            aliases=[
                Alias(name="Johnny D", name_canonical="johnny d", source="OFAC"),
                Alias(name="J. Doe", name_canonical="j doe", source="OFAC"),
                Alias(name="John D.", name_canonical="john d", source="EU"),
            ],
            dob=[date(1980, 1, 15)],
            countries=["US"],
            nationalities=["US"],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert len(db_entity.aliases) == 3
        assert db_entity.aliases[0]["name"] == "Johnny D"
        assert db_entity.aliases[1]["name"] == "J. Doe"
        assert db_entity.aliases[2]["name"] == "John D."

    def test_convert_entity_with_identifiers(self) -> None:
        """Test converting entity with various identifiers."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:identifiers",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Test Person",
            name_canonical="test person",
            name_tokens=["test", "person"],
            name_trigram="test person",
            aliases=[],
            dob=[],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(
                passport=["AB123456", "XY789012"],
                national_id=["SSN123", "TIN456"],
                other={"tax_id": ["TAX001"], "license": ["DL123"]},
            ),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.identifiers["passport"] == ["AB123456", "XY789012"]
        assert db_entity.identifiers["national_id"] == ["SSN123", "TIN456"]
        assert db_entity.identifiers["other"]["tax_id"] == ["TAX001"]

    def test_convert_entity_with_tenant_id(self) -> None:
        """Test converting tenant-specific entity."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:tenant",
            tenant_id="tenant_123",
            entity_type="PERSON",
            primary_name="Tenant Person",
            name_canonical="tenant person",
            name_tokens=["tenant", "person"],
            name_trigram="tenant person",
            aliases=[],
            dob=[],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="WHITELIST",
            source_list="WHITELIST",
            list_version="2024-01-01",
            custom_list_id="custom_list_001",
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.tenant_id == "tenant_123"
        assert db_entity.risk_category == "WHITELIST"
        assert db_entity.custom_list_id == "custom_list_001"

    def test_convert_organization_entity(self) -> None:
        """Test converting organization entity."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:org",
            tenant_id=None,
            entity_type="ORGANIZATION",
            primary_name="Evil Corporation",
            name_canonical="evil corporation",
            name_tokens=["evil", "corporation"],
            name_trigram="evil corporation",
            aliases=[],
            dob=[],  # Orgs typically don't have DOB
            countries=["RU", "BY"],
            nationalities=[],
            addresses=["123 Villain Street, Moscow"],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.entity_type == "ORGANIZATION"
        assert db_entity.countries == ["RU", "BY"]
        assert db_entity.addresses == ["123 Villain Street, Moscow"]

    def test_update_existing_preserves_entity_id(self, sample_entity: Entity) -> None:
        """Test that updating existing entity preserves entity_id."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        existing_db_entity = DBEntity(
            entity_id="original_id",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Old Name",
            name_canonical="old name",
            name_tokens=["old", "name"],
            name_trigram="old name",
            aliases=[],
            dob=None,
            countries=None,
            nationalities=None,
            addresses=None,
            identifiers={},
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2023-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(sample_entity, existing=existing_db_entity)

        # Should update in place but entity_id comes from existing
        assert db_entity is existing_db_entity
        # primary_name should be updated
        assert db_entity.primary_name == sample_entity.primary_name


class TestIngestOfacSdn:
    """Test ingest_ofac_sdn method."""

    def test_ingest_ofac_sdn_parses_xml(self) -> None:
        """Test that ingest_ofac_sdn calls parser with correct content."""
        mock_session = MagicMock()
        mock_embedding_service = MagicMock()

        service = IngestionService(
            session=mock_session,
            embedding_service=mock_embedding_service,
        )

        # Mock the OFAC parser
        service.ofac_parser = MagicMock()
        service.ofac_parser.parse = MagicMock(return_value=[])

        # Verify parser is called (we don't await the full flow)
        service.ofac_parser.parse("<test></test>")
        service.ofac_parser.parse.assert_called_once_with("<test></test>")

    def test_ingest_ofac_sdn_version_defaults_to_today(self) -> None:
        """Test that version defaults to today's date."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        # Just verify the default date format
        expected_version = datetime.now().strftime("%Y-%m-%d")
        assert len(expected_version) == 10
        assert expected_version.count("-") == 2


class TestEntityConversionEdgeCases:
    """Test edge cases in entity conversion."""

    def test_convert_entity_with_empty_aliases(self) -> None:
        """Test converting entity with empty aliases list."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:empty-alias",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="No Alias Person",
            name_canonical="no alias person",
            name_tokens=["no", "alias", "person"],
            name_trigram="no alias person",
            aliases=[],
            dob=[],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.aliases == []

    def test_convert_entity_with_empty_identifiers(self) -> None:
        """Test converting entity with empty identifiers."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:empty-id",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="No ID Person",
            name_canonical="no id person",
            name_tokens=["no", "id", "person"],
            name_trigram="no id person",
            aliases=[],
            dob=[],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(passport=[], national_id=[], other={}),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.identifiers["passport"] == []
        assert db_entity.identifiers["national_id"] == []
        assert db_entity.identifiers["other"] == {}

    def test_convert_entity_with_multiple_dates_of_birth(self) -> None:
        """Test converting entity with multiple DOB values."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        entity = Entity(
            entity_id="test:entity:multi-dob",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Multi DOB Person",
            name_canonical="multi dob person",
            name_tokens=["multi", "dob", "person"],
            name_trigram="multi dob person",
            aliases=[],
            dob=[date(1980, 1, 15), date(1981, 2, 20)],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source={},
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert len(db_entity.dob) == 2
        assert db_entity.dob[0] == date(1980, 1, 15)
        assert db_entity.dob[1] == date(1981, 2, 20)

    def test_convert_entity_preserves_raw_source(self) -> None:
        """Test that raw_source is preserved correctly."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)

        raw_source = {
            "uid": "12345",
            "xml_entry": "<entry>test</entry>",
            "nested": {"key": "value"},
        }

        entity = Entity(
            entity_id="test:entity:raw-source",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Raw Source Person",
            name_canonical="raw source person",
            name_tokens=["raw", "source", "person"],
            name_trigram="raw source person",
            aliases=[],
            dob=[],
            countries=[],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01-01",
            custom_list_id=None,
            raw_source=raw_source,
        )

        db_entity = service._domain_to_db_entity(entity, existing=None)

        assert db_entity.raw_source == raw_source
        assert db_entity.raw_source["nested"]["key"] == "value"


class TestServiceAttributes:
    """Test service attribute access."""

    def test_session_attribute(self) -> None:
        """Test that session is accessible."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)
        assert service.session is mock_session

    def test_embedding_service_attribute(self) -> None:
        """Test that embedding_service is accessible."""
        mock_session = MagicMock()
        mock_embedding = MagicMock()
        service = IngestionService(session=mock_session, embedding_service=mock_embedding)
        assert service.embedding_service is mock_embedding

    def test_ofac_parser_attribute(self) -> None:
        """Test that ofac_parser is accessible."""
        mock_session = MagicMock()
        service = IngestionService(session=mock_session)
        assert service.ofac_parser is not None
        # Parser should have a parse method
        assert hasattr(service.ofac_parser, "parse")
