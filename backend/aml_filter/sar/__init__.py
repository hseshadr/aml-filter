"""SAR (Suspicious Activity Report) engine.

Jurisdiction-agnostic SAR assembly + a pluggable renderer registry. The builder
assembles an immutable subject snapshot from a customer and its STRONG sanctions
match (fail-closed gating); the renderers turn a SAR record into a fileable JSON or
PDF artifact. A US-FinCEN-shaped renderer ships first; other jurisdictions register
against the same interface.
"""

from aml_filter.sar.errors import SarGatingError, SarRenderError
from aml_filter.sar.registry import get_renderer

__all__ = ["SarGatingError", "SarRenderError", "get_renderer"]
