"""Unit tests for restricting screening to a tenant's enabled lists."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from aml_filter.api.v1.screen import _resolve_enabled_lists
from aml_filter.domain.search import SearchQuery


def _query(lists: list[str] | None) -> SearchQuery:
    return SearchQuery(name="John Doe", lists=lists)


@pytest.mark.asyncio
async def test_should_default_to_tenant_enabled_lists_when_query_unscoped() -> None:
    # Given a tenant with two enabled lists and a query that names none
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = ["OFAC_SDN", "EU_CONSOLIDATED"]
    session.execute.return_value = result

    # When resolving enabled lists for an unscoped query
    resolved = await _resolve_enabled_lists(session, "tenant-1", _query(None))

    # Then the query is scoped to the tenant's enabled lists
    assert set(resolved) == {"OFAC_SDN", "EU_CONSOLIDATED"}


@pytest.mark.asyncio
async def test_should_keep_caller_specified_lists() -> None:
    # Given a query that explicitly names a list
    session = AsyncMock()

    # When resolving
    resolved = await _resolve_enabled_lists(session, "tenant-1", _query(["OFAC_SDN"]))

    # Then the caller's choice is preserved and the DB is not consulted
    assert resolved == ["OFAC_SDN"]
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_none_for_anonymous_caller() -> None:
    # Given no tenant (unauthenticated)
    session = AsyncMock()

    # When resolving
    resolved = await _resolve_enabled_lists(session, None, _query(None))

    # Then no list filter is applied (None) and the DB is not consulted
    assert resolved is None
    session.execute.assert_not_awaited()
