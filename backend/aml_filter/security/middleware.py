"""Authentication middleware for FastAPI."""


from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.security.api_key import validate_api_key


async def get_tenant_from_api_key(
    api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
) -> str | None:
    """
    Extract and validate API key, returning tenant ID.

    This is a dependency that can be used in FastAPI routes.

    Args:
        api_key: The API key from the X-API-Key header
        session: Database session

    Returns:
        Tenant ID if valid, None if no key provided

    Raises:
        HTTPException: If API key is invalid or expired
    """
    if api_key is None:
        return None

    # Validate the API key
    result = await validate_api_key(session, api_key)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    tenant_id, _key_id = result
    return tenant_id


async def require_api_key(
    request: Request,
    api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
) -> str:
    """
    Require and validate API key, returning tenant ID.

    This is a dependency that requires authentication.

    Args:
        api_key: The API key from the X-API-Key header
        session: Database session
        request: FastAPI request object (for setting state)

    Returns:
        Tenant ID

    Raises:
        HTTPException: If API key is missing, invalid, or expired
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Fast format check
    if not api_key.startswith("aml_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Validate the API key
    result = await validate_api_key(session, api_key)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    tenant_id, _key_id = result

    # Store tenant_id in request state for rate limiting
    if request is not None:
        request.state.tenant_id = tenant_id

    return tenant_id

