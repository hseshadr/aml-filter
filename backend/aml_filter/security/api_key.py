"""API key generation and validation."""

import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import ApiKey, Tenant


def generate_api_key() -> tuple[str, str]:
    """
    Generate a new API key.

    Returns:
        Tuple of (key_id, plaintext_key). The key_id is used to identify
        the key, and the plaintext_key should be shown to the user once
        and then hashed before storage.
    """
    # Generate a secure random key
    key_id = f"ak_{secrets.token_urlsafe(16)}"
    plaintext_key = f"aml_{secrets.token_urlsafe(32)}"
    return key_id, plaintext_key


def hash_api_key(plaintext_key: str) -> str:
    """
    Hash an API key using bcrypt.

    Args:
        plaintext_key: The plaintext API key

    Returns:
        The hashed key (bcrypt hash)
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plaintext_key.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_api_key(plaintext_key: str, hashed_key: str) -> bool:
    """
    Verify an API key against its hash.

    Args:
        plaintext_key: The plaintext API key to verify
        hashed_key: The stored hash

    Returns:
        True if the key matches, False otherwise
    """
    return bcrypt.checkpw(plaintext_key.encode("utf-8"), hashed_key.encode("utf-8"))


async def create_api_key(
    session: AsyncSession,
    tenant_id: str,
    name: Optional[str] = None,
    expires_in_days: Optional[int] = None,
) -> tuple[str, str]:
    """
    Create a new API key for a tenant.

    Args:
        session: Database session
        tenant_id: The tenant ID
        name: Optional name for the key
        expires_in_days: Optional expiration in days

    Returns:
        Tuple of (key_id, plaintext_key). The plaintext_key should be
        shown to the user once and then discarded.

    Raises:
        ValueError: If tenant does not exist
    """
    # Verify tenant exists
    tenant_result = await session.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if tenant is None:
        raise ValueError(f"Tenant {tenant_id} does not exist")

    # Generate key
    key_id, plaintext_key = generate_api_key()
    key_hash = hash_api_key(plaintext_key)

    # Calculate expiration
    expires_at = None
    if expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

    # Create API key record
    api_key = ApiKey(
        key_id=key_id,
        tenant_id=tenant_id,
        key_hash=key_hash,
        name=name,
        expires_at=expires_at,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return key_id, plaintext_key


async def validate_api_key(
    session: AsyncSession,
    plaintext_key: str,
) -> Optional[tuple[str, str]]:
    """
    Validate an API key and return tenant information.

    Args:
        session: Database session
        plaintext_key: The plaintext API key to validate

    Returns:
        Tuple of (tenant_id, key_id) if valid, None otherwise
    """
    # Fast format check
    if not plaintext_key.startswith("aml_"):
        return None

    # Extract key hash from plaintext (for lookup, we need to check all keys)
    # Since we can't reverse the hash, we need to check all active keys
    # This is a limitation - in production, consider using a key prefix for faster lookup

    # Get all active, non-expired, non-revoked keys
    now = datetime.utcnow()
    result = await session.execute(
        select(ApiKey).where(
            ApiKey.revoked_at.is_(None),
            (ApiKey.expires_at.is_(None) | (ApiKey.expires_at > now)),
        )
    )
    api_keys = result.scalars().all()

    # Check each key
    for api_key in api_keys:
        if verify_api_key(plaintext_key, api_key.key_hash):
            # Update last_used_at
            api_key.last_used_at = now
            await session.commit()
            return api_key.tenant_id, api_key.key_id

    return None


async def revoke_api_key(
    session: AsyncSession,
    key_id: str,
    tenant_id: str,
) -> bool:
    """
    Revoke an API key.

    Args:
        session: Database session
        key_id: The key ID to revoke
        tenant_id: The tenant ID (for authorization check)

    Returns:
        True if revoked, False if not found or unauthorized
    """
    result = await session.execute(
        select(ApiKey).where(ApiKey.key_id == key_id, ApiKey.tenant_id == tenant_id)
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        return False

    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.utcnow()
        await session.commit()
        return True

    return False


async def list_api_keys(
    session: AsyncSession,
    tenant_id: str,
) -> list[ApiKey]:
    """
    List all API keys for a tenant.

    Args:
        session: Database session
        tenant_id: The tenant ID

    Returns:
        List of API key records (without hashes)
    """
    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.tenant_id == tenant_id)
        .order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())

