"""Unit tests for API key generation and validation service."""

from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import ApiKey, Tenant
from aml_filter.security.api_key import (
    create_api_key,
    generate_api_key,
    hash_api_key,
    list_api_keys,
    revoke_api_key,
    validate_api_key,
    verify_api_key,
)


class TestGenerateApiKey:
    """Test API key generation."""

    def test_generate_api_key_returns_tuple(self) -> None:
        """Test that generate_api_key returns a tuple of (key_id, plaintext_key)."""
        result = generate_api_key()
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_generate_api_key_id_format(self) -> None:
        """Test that key_id starts with 'ak_'."""
        key_id, _ = generate_api_key()
        assert key_id.startswith("ak_")
        assert len(key_id) > 5  # ak_ + at least some characters

    def test_generate_api_key_plaintext_format(self) -> None:
        """Test that plaintext_key starts with 'aml_'."""
        _, plaintext_key = generate_api_key()
        assert plaintext_key.startswith("aml_")
        assert len(plaintext_key) > 40  # Should be reasonably long

    def test_generate_api_key_unique(self) -> None:
        """Test that generated keys are unique."""
        keys = [generate_api_key() for _ in range(100)]
        key_ids = [k[0] for k in keys]
        plaintext_keys = [k[1] for k in keys]

        # All key_ids should be unique
        assert len(set(key_ids)) == 100
        # All plaintext keys should be unique
        assert len(set(plaintext_keys)) == 100


class TestHashApiKey:
    """Test API key hashing."""

    def test_hash_api_key_returns_string(self) -> None:
        """Test that hash_api_key returns a string."""
        plaintext = "aml_test_key_12345"
        hashed = hash_api_key(plaintext)
        assert isinstance(hashed, str)

    def test_hash_api_key_bcrypt_format(self) -> None:
        """Test that hash is in bcrypt format."""
        plaintext = "aml_test_key_12345"
        hashed = hash_api_key(plaintext)
        assert hashed.startswith("$2b$")

    def test_hash_api_key_different_from_plaintext(self) -> None:
        """Test that hash is different from plaintext."""
        plaintext = "aml_test_key_12345"
        hashed = hash_api_key(plaintext)
        assert hashed != plaintext

    def test_hash_api_key_produces_different_hashes_for_same_input(self) -> None:
        """Test that the same plaintext produces different hashes (due to salt)."""
        plaintext = "aml_test_key_12345"
        hash1 = hash_api_key(plaintext)
        hash2 = hash_api_key(plaintext)
        # Different salts should produce different hashes
        assert hash1 != hash2


class TestVerifyApiKey:
    """Test API key verification."""

    def test_verify_api_key_correct_key(self) -> None:
        """Test that verification succeeds with correct key."""
        plaintext = "aml_test_key_12345"
        hashed = hash_api_key(plaintext)
        assert verify_api_key(plaintext, hashed) is True

    def test_verify_api_key_wrong_key(self) -> None:
        """Test that verification fails with wrong key."""
        plaintext = "aml_test_key_12345"
        wrong_key = "aml_wrong_key_67890"
        hashed = hash_api_key(plaintext)
        assert verify_api_key(wrong_key, hashed) is False

    def test_verify_api_key_empty_key(self) -> None:
        """Test that verification fails with empty key."""
        plaintext = "aml_test_key_12345"
        hashed = hash_api_key(plaintext)
        assert verify_api_key("", hashed) is False

    def test_verify_api_key_works_with_generated_key(self) -> None:
        """Test that generated and hashed keys can be verified."""
        _, plaintext_key = generate_api_key()
        hashed = hash_api_key(plaintext_key)
        assert verify_api_key(plaintext_key, hashed) is True


class TestCreateApiKey:
    """Test create_api_key function."""

    @pytest.mark.asyncio
    async def test_create_api_key_success(self) -> None:
        """Test successful API key creation."""
        mock_session = AsyncMock()

        # Mock tenant exists
        mock_tenant = Tenant(tenant_id="tenant_123", name="Test Tenant", plan="starter")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_tenant
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        key_id, plaintext_key = await create_api_key(
            session=mock_session,
            tenant_id="tenant_123",
            name="Test Key",
        )

        assert key_id.startswith("ak_")
        assert plaintext_key.startswith("aml_")
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_api_key_tenant_not_found(self) -> None:
        """Test API key creation fails when tenant doesn't exist."""
        mock_session = AsyncMock()

        # Mock tenant doesn't exist
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="Tenant tenant_nonexistent does not exist"):
            await create_api_key(
                session=mock_session,
                tenant_id="tenant_nonexistent",
            )

        mock_session.add.assert_not_called()
        mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_api_key_with_expiration(self) -> None:
        """Test API key creation with expiration."""
        mock_session = AsyncMock()

        # Mock tenant exists
        mock_tenant = Tenant(tenant_id="tenant_123", name="Test Tenant", plan="starter")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_tenant
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        # Capture the ApiKey object that gets added
        added_key = None

        def capture_add(obj: ApiKey) -> None:
            nonlocal added_key
            added_key = obj

        mock_session.add = MagicMock(side_effect=capture_add)

        await create_api_key(
            session=mock_session,
            tenant_id="tenant_123",
            name="Expiring Key",
            expires_in_days=30,
        )

        assert added_key is not None
        assert added_key.expires_at is not None
        # Expiration should be approximately 30 days from now
        expected_expiry = datetime.utcnow() + timedelta(days=30)
        assert abs((added_key.expires_at - expected_expiry).total_seconds()) < 10

    @pytest.mark.asyncio
    async def test_create_api_key_without_name(self) -> None:
        """Test API key creation without optional name."""
        mock_session = AsyncMock()

        mock_tenant = Tenant(tenant_id="tenant_123", name="Test Tenant", plan="starter")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_tenant
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        added_key = None

        def capture_add(obj: ApiKey) -> None:
            nonlocal added_key
            added_key = obj

        mock_session.add = MagicMock(side_effect=capture_add)

        await create_api_key(
            session=mock_session,
            tenant_id="tenant_123",
        )

        assert added_key is not None
        assert added_key.name is None


class TestValidateApiKey:
    """Test validate_api_key function."""

    @pytest.mark.asyncio
    async def test_validate_api_key_invalid_format(self) -> None:
        """Test validation fails for keys not starting with 'aml_'."""
        mock_session = AsyncMock()

        result = await validate_api_key(
            session=mock_session,
            plaintext_key="invalid_key_format",
        )

        assert result is None
        mock_session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_validate_api_key_valid_key(self) -> None:
        """Test validation succeeds for valid key."""
        mock_session = AsyncMock()

        # Generate a real key pair
        _, plaintext_key = generate_api_key()
        key_hash = hash_api_key(plaintext_key)

        # Create mock API key
        mock_api_key = MagicMock()
        mock_api_key.key_id = "ak_test123"
        mock_api_key.tenant_id = "tenant_123"
        mock_api_key.key_hash = key_hash
        mock_api_key.revoked_at = None
        mock_api_key.expires_at = None
        mock_api_key.last_used_at = None

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_api_key]
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        result = await validate_api_key(
            session=mock_session,
            plaintext_key=plaintext_key,
        )

        assert result is not None
        assert result == ("tenant_123", "ak_test123")
        # Should update last_used_at
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_validate_api_key_wrong_key(self) -> None:
        """Test validation fails for wrong key."""
        mock_session = AsyncMock()

        # Create mock API key with different hash
        mock_api_key = MagicMock()
        mock_api_key.key_hash = hash_api_key("aml_different_key")

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_api_key]
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await validate_api_key(
            session=mock_session,
            plaintext_key="aml_wrong_key_123456789012345678901234567890",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_validate_api_key_no_active_keys(self) -> None:
        """Test validation fails when no active keys exist."""
        mock_session = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await validate_api_key(
            session=mock_session,
            plaintext_key="aml_test_key_123456789012345678901234567890",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_validate_api_key_finds_correct_key_among_many(self) -> None:
        """Test validation finds the correct key among multiple keys."""
        mock_session = AsyncMock()

        # Generate multiple keys
        _, correct_key = generate_api_key()
        correct_hash = hash_api_key(correct_key)

        # Create mock API keys
        mock_keys = []
        for i in range(5):
            mock_key = MagicMock()
            mock_key.key_id = f"ak_key{i}"
            mock_key.tenant_id = f"tenant_{i}"
            mock_key.key_hash = hash_api_key(f"aml_other_key_{i}")
            mock_keys.append(mock_key)

        # Add the correct key
        correct_mock_key = MagicMock()
        correct_mock_key.key_id = "ak_correct"
        correct_mock_key.tenant_id = "tenant_correct"
        correct_mock_key.key_hash = correct_hash
        correct_mock_key.last_used_at = None
        mock_keys.append(correct_mock_key)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_keys
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        result = await validate_api_key(
            session=mock_session,
            plaintext_key=correct_key,
        )

        assert result == ("tenant_correct", "ak_correct")


class TestRevokeApiKey:
    """Test revoke_api_key function."""

    @pytest.mark.asyncio
    async def test_revoke_api_key_success(self) -> None:
        """Test successful API key revocation."""
        mock_session = AsyncMock()

        # Create mock API key
        mock_api_key = MagicMock()
        mock_api_key.key_id = "ak_test123"
        mock_api_key.tenant_id = "tenant_123"
        mock_api_key.revoked_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_api_key
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        result = await revoke_api_key(
            session=mock_session,
            key_id="ak_test123",
            tenant_id="tenant_123",
        )

        assert result is True
        assert mock_api_key.revoked_at is not None
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_revoke_api_key_not_found(self) -> None:
        """Test revocation fails when key not found."""
        mock_session = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await revoke_api_key(
            session=mock_session,
            key_id="ak_nonexistent",
            tenant_id="tenant_123",
        )

        assert result is False
        mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_revoke_api_key_already_revoked(self) -> None:
        """Test revocation when key is already revoked."""
        mock_session = AsyncMock()

        # Create mock API key that's already revoked
        mock_api_key = MagicMock()
        mock_api_key.key_id = "ak_test123"
        mock_api_key.tenant_id = "tenant_123"
        mock_api_key.revoked_at = datetime.now(UTC)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_api_key
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await revoke_api_key(
            session=mock_session,
            key_id="ak_test123",
            tenant_id="tenant_123",
        )

        # Should return False for already revoked key
        assert result is False

    @pytest.mark.asyncio
    async def test_revoke_api_key_wrong_tenant(self) -> None:
        """Test revocation fails when tenant doesn't match."""
        mock_session = AsyncMock()

        # Query will return None because tenant_id doesn't match
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await revoke_api_key(
            session=mock_session,
            key_id="ak_test123",
            tenant_id="wrong_tenant",
        )

        assert result is False


class TestListApiKeys:
    """Test list_api_keys function."""

    @pytest.mark.asyncio
    async def test_list_api_keys_returns_list(self) -> None:
        """Test that list_api_keys returns a list."""
        mock_session = AsyncMock()

        mock_keys = [
            MagicMock(key_id="ak_1", tenant_id="tenant_123"),
            MagicMock(key_id="ak_2", tenant_id="tenant_123"),
        ]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_keys
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await list_api_keys(
            session=mock_session,
            tenant_id="tenant_123",
        )

        assert isinstance(result, list)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_api_keys_empty_list(self) -> None:
        """Test list_api_keys returns empty list when no keys exist."""
        mock_session = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await list_api_keys(
            session=mock_session,
            tenant_id="tenant_no_keys",
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_list_api_keys_filters_by_tenant(self) -> None:
        """Test that list_api_keys filters by tenant_id."""
        mock_session = AsyncMock()

        # Only keys for the specific tenant should be returned
        mock_keys = [
            MagicMock(key_id="ak_tenant1_key", tenant_id="tenant_123"),
        ]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_keys
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await list_api_keys(
            session=mock_session,
            tenant_id="tenant_123",
        )

        assert len(result) == 1
        assert result[0].tenant_id == "tenant_123"

        # Verify the query was executed
        mock_session.execute.assert_called_once()


class TestApiKeyIntegration:
    """Integration-style tests for API key workflow."""

    def test_full_key_lifecycle(self) -> None:
        """Test the full lifecycle: generate, hash, verify."""
        # Generate key
        key_id, plaintext_key = generate_api_key()

        # Hash it
        hashed = hash_api_key(plaintext_key)

        # Verify it
        assert verify_api_key(plaintext_key, hashed) is True
        assert verify_api_key("wrong_key", hashed) is False

    def test_key_format_consistency(self) -> None:
        """Test that key formats are consistent."""
        for _ in range(10):
            key_id, plaintext_key = generate_api_key()

            # Key ID format
            assert key_id.startswith("ak_")
            assert len(key_id) > 3

            # Plaintext key format
            assert plaintext_key.startswith("aml_")
            assert len(plaintext_key) > 40

            # Hash format
            hashed = hash_api_key(plaintext_key)
            assert hashed.startswith("$2b$")
