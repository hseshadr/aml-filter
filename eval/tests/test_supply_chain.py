"""Registry provenance for the exact Assay evaluator release."""

from __future__ import annotations

import tomllib
from importlib.metadata import distribution
from pathlib import Path

EVAL_ROOT = Path(__file__).parents[1]
WHEEL_SHA256 = "72beb0a3b33962147e5174c7b71feb629cd76b8b0efbd127f52ed6a43c1f2f43"
SDIST_SHA256 = "303ef50ee174ce3d7de1d2ab0401873eb5bc2d09668f47083a991fe7a3a84f62"


def test_should_load_exact_assay_engine_from_registry_when_evaluating() -> None:
    """The evaluator must not silently use a path, editable, or newer build."""
    installed = distribution("assay-engine")

    assert installed.version == "0.5.0.dev3"
    assert installed.read_text("direct_url.json") is None


def test_should_lock_the_reviewed_assay_registry_hashes() -> None:
    """The evaluator lock must retain the independently verified registry bytes."""
    lock = tomllib.loads((EVAL_ROOT / "uv.lock").read_text())
    packages = [package for package in lock["package"] if package["name"] == "assay-engine"]

    assert len(packages) == 1
    package = packages[0]
    assert package["version"] == "0.5.0.dev3"
    assert package["source"] == {"registry": "https://pypi.org/simple"}
    assert package["sdist"]["hash"] == f"sha256:{SDIST_SHA256}"
    assert {wheel["hash"] for wheel in package["wheels"]} == {f"sha256:{WHEEL_SHA256}"}
