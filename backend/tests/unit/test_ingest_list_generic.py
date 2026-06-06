"""Unit tests for the parser-agnostic ``ingest_list`` entry point."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from aml_filter.ingest.parsers.base import ParserNotRegisteredError
from aml_filter.ingest.service import IngestionService

_EU_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "eu_consolidated_sample.xml"


@pytest.mark.asyncio
async def test_should_parse_with_registry_parser_and_delegate_to_ingest_entities() -> None:
    # Given an ingestion service with a stubbed ingest_entities
    service = IngestionService(session=MagicMock(), embedding_service=MagicMock())
    service.ingest_entities = AsyncMock(return_value={"list_id": "EU_CONSOLIDATED"})  # type: ignore[method-assign]

    # When ingesting the EU list by its list_id
    await service.ingest_list(
        list_id="EU_CONSOLIDATED",
        raw=_EU_FIXTURE.read_bytes(),
        version="2025-01-15",
    )

    # Then ingest_entities was called with the parsed EU entities and source list
    service.ingest_entities.assert_awaited_once()
    kwargs = service.ingest_entities.await_args.kwargs
    assert kwargs["source_list"] == "EU_CONSOLIDATED"
    assert kwargs["version"] == "2025-01-15"
    assert len(kwargs["entities"]) == 2
    assert kwargs["entities"][0].source_list == "EU_CONSOLIDATED"


@pytest.mark.asyncio
async def test_should_fail_closed_for_unregistered_list_id() -> None:
    # Given an ingestion service
    service = IngestionService(session=MagicMock(), embedding_service=MagicMock())

    # When ingesting an unknown list id
    # Then it raises rather than silently ingesting nothing
    with pytest.raises(ParserNotRegisteredError):
        await service.ingest_list(list_id="MADE_UP", raw=b"<x/>", version="v1")


@pytest.mark.asyncio
async def test_ingest_ofac_sdn_still_delegates_to_generic_path() -> None:
    # Given an ingestion service with stubbed ingest_entities and OFAC parser
    service = IngestionService(session=MagicMock(), embedding_service=MagicMock())
    service.ingest_entities = AsyncMock(return_value={})  # type: ignore[method-assign]

    xml = b"""<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry><uid>1</uid><lastName>Doe</lastName><sdnType>Individual</sdnType></sdnEntry>
    </sdnList>"""

    # When ingesting via the OFAC-specific entry point
    await service.ingest_ofac_sdn(xml, version="2024-01-01")

    # Then it still routes through ingest_entities with OFAC entities
    service.ingest_entities.assert_awaited_once()
    assert service.ingest_entities.await_args.kwargs["source_list"] == "OFAC_SDN"
