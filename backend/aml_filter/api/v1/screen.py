"""Screening API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import TenantListConfig
from aml_filter.domain.search import SearchQuery, SearchResponse
from aml_filter.scoring.service import get_active_policy
from aml_filter.search.service import SearchService
from aml_filter.security.middleware import get_tenant_from_api_key
from aml_filter.usage.service import record_usage

router = APIRouter(prefix="/screen", tags=["screening"])


async def get_search_service(
    session: AsyncSession = Depends(get_db_session),
) -> SearchService:
    """Dependency to get search service."""
    return SearchService(session=session)


async def _resolve_enabled_lists(
    session: AsyncSession, tenant_id: str | None, query: SearchQuery
) -> list[str] | None:
    """Resolve which lists to screen against.

    Honors caller-specified ``query.lists``; otherwise, for an authenticated tenant,
    defaults to that tenant's enabled lists. Returns ``None`` (no list filter) for an
    anonymous caller or when the tenant has no list configuration.
    """
    if query.lists:
        return query.lists
    if tenant_id is None:
        return None
    result = await session.execute(
        select(TenantListConfig.list_id).where(
            TenantListConfig.tenant_id == tenant_id,
            TenantListConfig.enabled.is_(True),
        )
    )
    enabled = list(result.scalars().all())
    return enabled or None


@router.post("", response_model=SearchResponse, status_code=status.HTTP_200_OK)
async def screen_entity(
    query: SearchQuery,
    session: AsyncSession = Depends(get_db_session),
    search_service: SearchService = Depends(get_search_service),
    tenant_id: str | None = Depends(get_tenant_from_api_key),  # Optional auth
) -> SearchResponse:
    """
    Screen an entity against sanctions and watchlists.

    This endpoint performs hybrid search (vector + lexical) and returns
    scored matches with explanations.

    **Example Request:**
    ```json
    {
        "name": "John Doe",
        "dob": "1980-01-15",
        "country": "US",
        "entity_type": "PERSON",
        "threshold": 0.65,
        "k": 20
    }
    ```

    **Example Response:**
    ```json
    {
        "request_id": "uuid",
        "matches": [
            {
                "entity_id": "ofac:sdn:12345",
                "score": 0.87,
                "risk_category": "SANCTION",
                "source_list": "OFAC_SDN",
                "list_version": "2024-01",
                "primary_name": "JOHN DOE",
                "reasons": [...],
                "explanation": "High confidence match..."
            }
        ],
        "list_versions_used": {"OFAC_SDN": "2024-01"},
        "execution_time_ms": 145
    }
    """
    try:
        # Load tenant's active scoring policy if authenticated
        scoring_policy = None
        if tenant_id:
            scoring_policy = await get_active_policy(session, tenant_id)

        # Scope screening to the tenant's enabled lists unless the caller named some.
        query.lists = await _resolve_enabled_lists(session, tenant_id, query)

        response = await search_service.search(
            query=query, tenant_id=tenant_id, scoring_policy=scoring_policy
        )

        # Record usage if tenant is authenticated
        if tenant_id:
            await record_usage(
                session=session,
                tenant_id=tenant_id,
                event_type="screen",
                units=1,
                request_id=response.request_id,
            )

        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {exc!s}",
        ) from exc


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "screening"}
