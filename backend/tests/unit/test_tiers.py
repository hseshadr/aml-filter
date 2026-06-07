"""Unit tests for the match-strength tier classifier."""

import pytest

from aml_filter.scoring.tiers import (
    MatchTier,
    TierBands,
    classify_tier,
    get_tier_bands,
)


class TestMatchTierEnum:
    """The MatchTier enum exposes the three review tiers."""

    def test_values(self):
        assert MatchTier.STRONG.value == "STRONG"
        assert MatchTier.POSSIBLE.value == "POSSIBLE"
        assert MatchTier.WEAK.value == "WEAK"


class TestClassifyTier:
    """classify_tier maps a score onto a tier using the band thresholds."""

    def test_at_strong_boundary_is_strong(self):
        # Exactly the strong floor (0.80) classifies STRONG.
        assert classify_tier(0.80, possible_threshold=0.65) is MatchTier.STRONG

    def test_just_below_strong_is_possible(self):
        assert classify_tier(0.7999, possible_threshold=0.65) is MatchTier.POSSIBLE

    def test_at_possible_threshold_is_possible(self):
        # Exactly the policy threshold classifies POSSIBLE.
        assert classify_tier(0.65, possible_threshold=0.65) is MatchTier.POSSIBLE

    def test_just_below_possible_threshold_is_weak(self):
        assert classify_tier(0.6499, possible_threshold=0.65) is MatchTier.WEAK

    def test_well_above_strong_is_strong(self):
        assert classify_tier(0.99, possible_threshold=0.65) is MatchTier.STRONG

    def test_zero_is_weak(self):
        assert classify_tier(0.0, possible_threshold=0.65) is MatchTier.WEAK

    @pytest.mark.parametrize(
        ("possible_threshold", "score", "expected"),
        [
            # strict preset (threshold 0.75)
            (0.75, 0.80, MatchTier.STRONG),
            (0.75, 0.75, MatchTier.POSSIBLE),
            (0.75, 0.7499, MatchTier.WEAK),
            # balanced preset (threshold 0.65)
            (0.65, 0.80, MatchTier.STRONG),
            (0.65, 0.65, MatchTier.POSSIBLE),
            (0.65, 0.6499, MatchTier.WEAK),
            # lenient preset (threshold 0.55)
            (0.55, 0.80, MatchTier.STRONG),
            (0.55, 0.55, MatchTier.POSSIBLE),
            (0.55, 0.5499, MatchTier.WEAK),
        ],
    )
    def test_preset_boundaries(self, possible_threshold, score, expected):
        assert classify_tier(score, possible_threshold=possible_threshold) is expected

    def test_custom_strong_floor(self):
        # The strong floor is overridable.
        assert classify_tier(0.70, possible_threshold=0.65, strong=0.70) is MatchTier.STRONG
        assert classify_tier(0.69, possible_threshold=0.65, strong=0.70) is MatchTier.POSSIBLE


class TestTierBands:
    """TierBands carries the strong floor and is env-overridable."""

    def test_defaults(self):
        bands = TierBands()
        assert bands.strong == 0.80

    def test_classify_uses_band_strong_floor(self):
        bands = TierBands(strong=0.90)
        assert bands.classify(0.85, possible_threshold=0.65) is MatchTier.POSSIBLE
        assert bands.classify(0.90, possible_threshold=0.65) is MatchTier.STRONG

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("TIER_STRONG", "0.70")
        bands = TierBands()
        assert bands.strong == 0.70

    def test_get_tier_bands_is_cached(self):
        assert get_tier_bands() is get_tier_bands()
