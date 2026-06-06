"""Renderer registry — dispatch a SAR renderer by (jurisdiction, template).

The registry is a dict keyed on the ``(jurisdiction, template)`` pair so new
jurisdictions (UK, AU) drop in by registering an entry, with no edits to callers.
Lookups fail closed: an unregistered pair raises ``SarRenderError``.
"""

from __future__ import annotations

from types import MappingProxyType

from aml_filter.domain.sar import SarJurisdiction, SarTemplate
from aml_filter.sar.errors import SarRenderError
from aml_filter.sar.renderers.base import SarRenderer
from aml_filter.sar.renderers.fincen import FincenRenderer

_RENDERERS: MappingProxyType[tuple[SarJurisdiction, SarTemplate], SarRenderer] = MappingProxyType(
    {
        (SarJurisdiction.US, SarTemplate.FINCEN): FincenRenderer(),
    }
)


def get_renderer(jurisdiction: SarJurisdiction, template: SarTemplate) -> SarRenderer:
    """Return the renderer for a jurisdiction/template, or raise ``SarRenderError``."""
    renderer = _RENDERERS.get((jurisdiction, template))
    if renderer is None:
        raise SarRenderError(f"No SAR renderer for {jurisdiction.value}/{template.value}")
    return renderer
