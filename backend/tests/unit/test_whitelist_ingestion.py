"""Unit tests for WhitelistIngestionService."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aml_filter.ingest.whitelist import WhitelistIngestionService
from aml_filter.db.models import Entity as DBEntity, EntityEmbedding

@pytest.fixture
def mock_session():
    return AsyncMock()

@pytest.fixture
def mock_embedding_service():
    service = MagicMock()
    service.embed = AsyncMock(return_value=[0.1, 0.2, 0.3])
    service.get_model_info.return_value = {"model_name": "test-model"}
    return service

@pytest.fixture
def service(mock_session, mock_embedding_service):
    return WhitelistIngestionService(mock_session, mock_embedding_service)

@pytest.mark.asyncio
async def test_add_customer_new(service, mock_session, mock_embedding_service):
    """Test adding a new customer."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    
    customer = await service.add_customer(
        tenant_id="t1",
        name="John Doe",
        country="US",
        aliases=[{"name": "Johnny"}]
    )
    
    assert customer.primary_name == "John Doe"
    assert customer.countries == ["US"]
    assert len(customer.aliases) == 1
    assert customer.aliases[0]["name"] == "Johnny"
    
    assert mock_session.add.called
    assert mock_session.commit.called
    assert mock_embedding_service.embed.called

@pytest.mark.asyncio
async def test_add_customer_existing(service, mock_session, mock_embedding_service):
    """Test adding an existing customer (update)."""
    existing = MagicMock(spec=DBEntity)
    existing.primary_name = "Old Name"
    existing.entity_id = "e1"
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute.return_value = mock_result
    
    customer = await service.add_customer(
        tenant_id="t1",
        name="John Doe",
        country="US"
    )
    
    assert customer == existing
    assert existing.primary_name == "John Doe"
    assert mock_session.commit.called

@pytest.mark.asyncio
async def test_delete_customer_success(service, mock_session):
    """Test successful customer deletion."""
    existing = MagicMock(spec=DBEntity)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute.return_value = mock_result
    
    result = await service.delete_customer("t1", "e1")
    
    assert result is True
    assert mock_session.delete.called
    assert mock_session.commit.called

@pytest.mark.asyncio
async def test_delete_customer_not_found(service, mock_session):
    """Test deletion of non-existent customer."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    
    result = await service.delete_customer("t1", "e1")
    
    assert result is False
    mock_session.delete.assert_not_called()

@pytest.mark.asyncio
async def test_list_customers(service, mock_session):
    """Test listing customers."""
    customers = [MagicMock(spec=DBEntity), MagicMock(spec=DBEntity)]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = customers
    mock_session.execute.return_value = mock_result
    
    result = await service.list_customers("t1")
    
    assert len(result) == 2
    assert result == customers

