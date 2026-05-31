"""Signed, versioned OFAC bundle distribution (producer + consumer).

Distributes the OFAC sanctions data as a content-addressed edge-proc bundle —
exactly how edge-reco ships and consumes its catalog. The OFAC ``ListVersion``
lifecycle (PENDING -> ACTIVE, version-stamped) becomes the bundle's version pointer.

edge-proc stays generic (opaque ``{relpath: bytes}`` only); every domain shape —
``Entity`` records, the localvec index layout, ``OfacBundleMeta`` — lives here.
"""

from aml_filter.bundle.meta import OfacBundleMeta

__all__ = ["OfacBundleMeta"]
