import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession
from aml_filter.usage.service import record_usage, get_usage_summary, get_usage_count
from aml_filter.db.models import UsageMeter

@pytest.mark.asyncio
async def test_record_usage():
    mock_session = AsyncMock(spec=AsyncSession)
    tenant_id = "tenant-123"
    event_type = "screen"
    units = 5
    request_id = "req-456"
    
    usage = await record_usage(
        session=mock_session,
        tenant_id=tenant_id,
        event_type=event_type,
        units=units,
        request_id=request_id
    )
    
    assert usage.tenant_id == tenant_id
    assert usage.event_type == event_type
    assert usage.units == units
    assert usage.request_id == request_id
    
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()
    mock_session.refresh.assert_called_once()

@pytest.mark.asyncio
async def test_get_usage_summary():
    mock_session = AsyncMock(spec=AsyncSession)
    tenant_id = "tenant-123"
    
    # Mock return rows
    mock_row1 = MagicMock()
    mock_row1.event_type = "screen"
    mock_row1.total_units = 100
    
    mock_row2 = MagicMock()
    mock_row2.event_type = "batch"
    mock_row2.total_units = 50
    
    mock_result = MagicMock()
    mock_result.all.return_value = [mock_row1, mock_row2]
    mock_session.execute.return_value = mock_result
    
    summary = await get_usage_summary(
        session=mock_session,
        tenant_id=tenant_id
    )
    
    assert summary == {"screen": 100, "batch": 50}
    mock_session.execute.assert_called_once()

@pytest.mark.asyncio
async def test_get_usage_summary_with_filters():
    mock_session = AsyncMock(spec=AsyncSession)
    tenant_id = "tenant-123"
    start_date = datetime.utcnow() - timedelta(days=7)
    end_date = datetime.utcnow()
    event_type = "screen"
    
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_session.execute.return_value = mock_result
    
    await get_usage_summary(
        session=mock_session,
        tenant_id=tenant_id,
        start_date=start_date,
        end_date=end_date,
        event_type=event_type
    )
    
    # We could assert on the query object, but that's complex with SQLAlchemy
    mock_session.execute.assert_called_once()

@pytest.mark.asyncio
async def test_get_usage_count():
    mock_session = AsyncMock(spec=AsyncSession)
    tenant_id = "tenant-123"
    
    mock_result = MagicMock()
    mock_result.scalar.return_value = 150
    mock_session.execute.return_value = mock_result
    
    count = await get_usage_count(
        session=mock_session,
        tenant_id=tenant_id
    )
    
    assert count == 150
    mock_session.execute.assert_called_once()

@pytest.mark.asyncio
async def test_get_usage_count_with_filters():
    mock_session = AsyncMock(spec=AsyncSession)
    tenant_id = "tenant-123"
    start_date = datetime.utcnow() - timedelta(days=7)
    end_date = datetime.utcnow()
    event_type = "screen"
    
    mock_result = MagicMock()
    mock_result.scalar.return_value = None
    mock_session.execute.return_value = mock_result
    
    count = await get_usage_count(
        session=mock_session,
        tenant_id=tenant_id,
        start_date=start_date,
        end_date=end_date,
        event_type=event_type
    )
    
    assert count == 0
    mock_session.execute.assert_called_once()

