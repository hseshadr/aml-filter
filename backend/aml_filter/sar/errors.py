"""Typed domain errors for the SAR engine.

These are translated to HTTP status codes at the API boundary; the engine itself
never raises bare ``Exception`` or returns sentinels on failure.
"""

from __future__ import annotations


class SarGatingError(Exception):
    """A SAR cannot be created because the match fails the fail-closed gate.

    Raised when the referenced match is missing, not owned by the tenant, or not
    classified STRONG. The API layer maps this to a 4xx response.
    """


class SarRenderError(Exception):
    """No renderer is registered for the requested jurisdiction/template pair."""
