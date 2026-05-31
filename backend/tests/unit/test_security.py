from unittest.mock import AsyncMock

import pytest

from aml_filter.security.api_key import (
    generate_api_key,
    hash_api_key,
    verify_api_key,
)
from aml_filter.security.rate_limit import check_rate_limit, get_rate_limit_for_plan


def test_api_key_generation_and_verification():
    """Test generating, hashing, and verifying an API key."""
    # generate_api_key returns (key_id, plaintext_key)
    key_id, plaintext = generate_api_key()
    assert key_id.startswith("ak_")
    assert plaintext.startswith("aml_")
    assert len(plaintext) > 40

    hashed_key = hash_api_key(plaintext)
    assert hashed_key != plaintext
    assert hashed_key.startswith("$2b$")

    assert verify_api_key(plaintext, hashed_key) is True
    assert verify_api_key("wrong_key", hashed_key) is False


def test_get_rate_limit_for_plan():
    """Test rate limit values for different plans."""
    starter_limit = get_rate_limit_for_plan("starter")
    assert starter_limit["screen"] == 100

    professional_limit = get_rate_limit_for_plan("professional")
    assert professional_limit["screen"] == 1000

    enterprise_limit = get_rate_limit_for_plan("enterprise")
    assert enterprise_limit["screen"] == 10000


@pytest.mark.asyncio
async def test_check_rate_limit_allowed():
    """Test rate limit check when allowed."""
    mock_redis = AsyncMock()
    mock_redis.incr.return_value = 50
    mock_redis.ttl.return_value = 60

    allowed, remaining, reset_after = await check_rate_limit(
        mock_redis, tenant_id="tenant_1", endpoint="screen", limit=100
    )
    assert allowed is True
    assert remaining == 50
    assert reset_after == 60


@pytest.mark.asyncio
async def test_check_rate_limit_exceeded():
    """Test rate limit check when exceeded."""
    mock_redis = AsyncMock()
    mock_redis.incr.return_value = 101
    mock_redis.ttl.return_value = 60

    allowed, remaining, _ = await check_rate_limit(
        mock_redis, tenant_id="tenant_1", endpoint="screen", limit=100
    )
    assert allowed is False
    assert remaining == 0


@pytest.mark.asyncio
async def test_check_rate_limit_no_redis():
    """Test rate limit check when Redis is not available."""
    allowed, _, _ = await check_rate_limit(None, tenant_id="tenant_1", endpoint="screen", limit=100)
    assert allowed is True
