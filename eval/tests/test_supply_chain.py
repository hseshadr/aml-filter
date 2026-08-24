"""Registry provenance for the exact Assay evaluator release."""

from __future__ import annotations

from importlib.metadata import distribution


def test_should_load_exact_assay_engine_from_registry_when_evaluating() -> None:
    """The evaluator must not silently use a path, editable, or newer build."""
    installed = distribution("assay-engine")

    assert installed.version == "0.5.0.dev2"
    assert installed.read_text("direct_url.json") is None
