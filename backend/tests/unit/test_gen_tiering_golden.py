"""The tiering-golden generator emits classify_tier verdicts, edges included."""

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

from aml_filter.scoring.tiers import STRONG_TIER_FLOOR, classify_tier

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "gen_tiering_golden.py"


def _load_script() -> ModuleType:
    """Load the generator script as a module (scripts/ is not a package)."""
    spec = importlib.util.spec_from_file_location("gen_tiering_golden", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Register before exec (importlib docs recipe): the script's @dataclass needs
    # sys.modules[cls.__module__] to resolve its stringified annotations.
    sys.modules["gen_tiering_golden"] = module
    spec.loader.exec_module(module)
    return module


def _generate(tmp_path: Path) -> list[dict[str, object]]:
    """Run the generator into tmp_path and parse the emitted golden."""
    out = tmp_path / "golden.json"
    _load_script().main(out)
    return list(json.loads(out.read_text()))


def test_every_case_matches_classify_tier(tmp_path: Path) -> None:
    """Each emitted verdict is exactly what the canonical classifier returns."""
    for case in _generate(tmp_path):
        strong = case["strong"] if case["strong"] is not None else STRONG_TIER_FLOOR
        expected = classify_tier(
            float(case["score"]),  # type: ignore[arg-type]
            float(case["possible_threshold"]),  # type: ignore[arg-type]
            strong=float(strong),  # type: ignore[arg-type]
        )
        assert case["expected_tier"] == expected.value


def test_inclusive_band_edges_are_covered(tmp_path: Path) -> None:
    """The golden carries both inclusive lower edges (spec §8.1 hard rule)."""
    pairs = {(c["score"], c["possible_threshold"]) for c in _generate(tmp_path)}
    assert (STRONG_TIER_FLOOR, 0.65) in pairs
    assert (0.65, 0.65) in pairs


def test_a_default_band_case_is_present(tmp_path: Path) -> None:
    """At least one case pins the DEFAULT strong band (strong is null)."""
    assert any(c["strong"] is None for c in _generate(tmp_path))
