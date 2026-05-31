"""Integration tests for OFAC ingestion pipeline."""

import os

import pytest

from aml_filter.db.models import Entity, EntityEmbedding, ListVersion
from aml_filter.ingest.parsers.ofac import OFACParser
from aml_filter.ingest.service import IngestionService


@pytest.mark.integration
class TestOFACIngestion:
    """Integration tests for OFAC ingestion."""

    @pytest.fixture
    def ofac_xml_path(self):
        """Path to a sample OFAC XML file."""
        # Create a tiny sample XML for testing
        path = "tests/fixtures/sample_sdn.xml"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write("""<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="http://tempuri.org/sdnList.xsd">
    <publshInformation>
        <Publish_Date>12/28/2025</Publish_Date>
        <Record_Count>1</Record_Count>
    </publshInformation>
    <sdnEntry>
        <uid>123</uid>
        <firstName>MOHAMMED</firstName>
        <lastName>ALI</lastName>
        <sdnType>Individual</sdnType>
        <programList>
            <program>SDGT</program>
        </programList>
        <akaList>
            <aka>
                <uid>456</uid>
                <type>a.k.a.</type>
                <category>strong</category>
                <lastName>MUHAMMAD ALI</lastName>
            </aka>
        </akaList>
        <addressList>
            <address>
                <uid>789</uid>
                <city>Kabul</city>
                <country>Afghanistan</country>
            </address>
        </addressList>
    </sdnEntry>
</sdnList>""")
        yield path
        if os.path.exists(path):
            os.remove(path)

    @pytest.mark.asyncio
    async def test_ofac_parse_and_ingest(self, db_session, ofac_xml_path):
        """Test complete OFAC ingestion flow."""
        # 1. Parse
        parser = OFACParser()
        with open(ofac_xml_path) as f:
            xml_content = f.read()
        entities = parser.parse(xml_content)
        assert len(entities) == 1

        entity = entities[0]
        assert entity.primary_name == "MOHAMMED ALI"
        assert len(entity.aliases) == 1
        assert "Afghanistan" in entity.addresses[0]

        # 2. Ingest
        service = IngestionService(session=db_session)
        stats = await service.ingest_entities(
            entities=entities, source_list="OFAC_SDN_TEST", version="2025-12-28"
        )

        assert stats["total"] == 1
        assert stats["created"] == 1

        # 3. Verify in DB
        from sqlalchemy import select

        result = await db_session.execute(select(Entity).where(Entity.entity_id == "ofac:sdn:123"))
        db_entity = result.scalar_one()
        assert db_entity.primary_name == "MOHAMMED ALI"
        assert db_entity.risk_category == "SANCTION"

        # Verify embedding
        result = await db_session.execute(
            select(EntityEmbedding).where(EntityEmbedding.entity_id == "ofac:sdn:123")
        )
        db_emb = result.scalar_one()
        assert db_emb.embedding is not None
        assert len(db_emb.embedding) == 384

        # Verify version
        result = await db_session.execute(
            select(ListVersion).where(ListVersion.list_id == "OFAC_SDN_TEST")
        )
        db_ver = result.scalar_one()
        assert db_ver.version == "2025-12-28"
        assert db_ver.status == "ACTIVE"
