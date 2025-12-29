import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from aml_filter.scoring.service import (
    create_policy,
    get_active_policy,
    list_policy_versions,
    rollback_to_version
)
from aml_filter.db.models import ScoringPolicy as DBScoringPolicy
from aml_filter.domain.scoring import ScoringWeights, ScoringPolicy as DomainScoringPolicy

@pytest.mark.asyncio
async def test_get_active_policy_default():
    """Test getting active policy when none exists in DB."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    
    policy = await get_active_policy(mock_session, "tenant_1")
    
    assert policy.tenant_id == "tenant_1"
    assert policy.version == 1  # Default version is 1

@pytest.mark.asyncio
async def test_get_active_policy_from_db():
    """Test getting active policy from DB."""
    mock_session = AsyncMock()
    db_policy = DBScoringPolicy(
        policy_id="pol_1",
        tenant_id="tenant_1",
        name="Custom Policy",
        version=2,
        is_active=True,
        weights={"name_vector": 0.5, "name_trigram": 0.5, "alias_match": 0.0, "dob_match": 0.0, "country_match": 0.0},
        threshold=0.8
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = db_policy
    mock_session.execute.return_value = mock_result
    
    policy = await get_active_policy(mock_session, "tenant_1")
    
    assert policy.tenant_id == "tenant_1"
    assert policy.version == 2
    assert policy.weights.name_vector == 0.5

@pytest.mark.asyncio
async def test_create_policy():
    """Test creating a new policy version."""
    mock_session = AsyncMock()
    
    # Mock result from execute for max version
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = 1
    mock_session.execute.return_value = mock_result
    
    # Mock search for active policies
    mock_active_result = MagicMock()
    mock_active_result.scalars.return_value.all.return_value = []
    
    # Update mock_session.execute to handle multiple calls
    async def mock_execute(stmt):
        stmt_str = str(stmt)
        if "max" in stmt_str:
            return mock_result
        return mock_active_result

    mock_session.execute.side_effect = mock_execute
    
    # Weights must sum to 1.0
    weights = ScoringWeights(
        name_vector=0.5, 
        name_trigram=0.2,
        alias_match=0.1,
        dob_match=0.1,
        country_match=0.1
    )
    new_policy = await create_policy(
        mock_session,
        tenant_id="tenant_1",
        name="New Version",
        weights=weights,
        threshold=0.85
    )
    
    assert new_policy.version == 2
    assert new_policy.weights.name_vector == 0.5
    assert mock_session.add.called
    assert mock_session.commit.called

@pytest.mark.asyncio
async def test_rollback_to_version():
    """Test rolling back to a previous policy version."""
    mock_session = AsyncMock()
    
    # Mock policies in DB
    v1 = DBScoringPolicy(
        policy_id="pol_1",
        tenant_id="tenant_1", 
        version=1, 
        is_active=False,
        weights={"name_vector": 0.5, "name_trigram": 0.5, "alias_match": 0.0, "dob_match": 0.0, "country_match": 0.0},
        threshold=0.8,
        name="V1"
    )
    v2 = DBScoringPolicy(policy_id="pol_2", tenant_id="tenant_1", version=2, is_active=True)
    
    # Mock result for finding the policy to rollback to
    mock_result_v1 = MagicMock()
    mock_result_v1.scalar_one_or_none.return_value = v1
    
    # Mock result for finding active policies to deactivate
    mock_result_active = MagicMock()
    mock_result_active.scalars.return_value.all.return_value = [v2]
    
    # Mock execute to return different results based on query
    async def mock_execute(stmt):
        stmt_str = str(stmt)
        if "version = :version_1" in stmt_str or "version = 1" in stmt_str:
            return mock_result_v1
        return mock_result_active

    mock_session.execute.side_effect = mock_execute
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    
    success_policy = await rollback_to_version(mock_session, "tenant_1", 1)
    
    assert success_policy.version == 1
    assert v1.is_active is True
    assert v2.is_active is False
    assert mock_session.commit.called
