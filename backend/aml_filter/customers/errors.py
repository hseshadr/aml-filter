"""Typed errors for the customer onboarding service (mapped to HTTP at the router)."""

from __future__ import annotations


class DuplicateCustomerReferenceError(Exception):
    """Raised when onboarding a customer whose ``customer_reference`` already exists.

    The (tenant_id, customer_reference) pair is unique; the router maps this to HTTP 409.
    """
