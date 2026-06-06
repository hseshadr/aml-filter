"""API v1 endpoints."""

from fastapi import APIRouter

from aml_filter.api.v1.api_keys import router as api_keys_router
from aml_filter.api.v1.audit import router as audit_router
from aml_filter.api.v1.batch import router as batch_router
from aml_filter.api.v1.customers import router as customers_router
from aml_filter.api.v1.lists import router as lists_router
from aml_filter.api.v1.review import router as review_router
from aml_filter.api.v1.screen import router as screen_router
from aml_filter.api.v1.tenants import router as tenants_router
from aml_filter.api.v1.usage import router as usage_router
from aml_filter.api.v1.weights import router as weights_router
from aml_filter.api.v1.whitelist import router as whitelist_router

router = APIRouter(prefix="/v1")
router.include_router(screen_router)
router.include_router(tenants_router)
router.include_router(api_keys_router)
router.include_router(usage_router)
router.include_router(lists_router)
router.include_router(weights_router)
router.include_router(whitelist_router)
router.include_router(batch_router)
router.include_router(audit_router)
router.include_router(customers_router)
router.include_router(review_router)

__all__ = ["router"]
