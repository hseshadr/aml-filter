"""Unit tests for name normalization."""

from aml_filter.domain.normalization import normalize_name, prepare_embedding_text


class TestNormalizeName:
    """Test name normalization."""

    def test_basic_normalization(self):
        """Test basic name normalization."""
        result = normalize_name("John Doe")
        assert result["name_canonical"] == "john doe"
        assert result["name_tokens"] == ["john", "doe"]
        assert result["name_trigram"] == "john doe"

    def test_title_removal(self):
        """Test that titles are removed."""
        result = normalize_name("Dr. John Doe")
        assert "dr" not in result["name_canonical"]
        assert result["name_canonical"] == "john doe"

        result = normalize_name("Mr. John Doe")
        assert "mr" not in result["name_canonical"]

        result = normalize_name("Prof. Jane Smith")
        assert "prof" not in result["name_canonical"]

    def test_punctuation_removal(self):
        """Test that punctuation is removed."""
        result = normalize_name("John O'Doe")
        assert "o'doe" in result["name_canonical"] or "odoe" in result["name_canonical"]

        result = normalize_name("John-Doe")
        assert "john-doe" in result["name_canonical"] or "john doe" in result["name_canonical"]

    def test_whitespace_canonicalization(self):
        """Test that multiple spaces are normalized."""
        result = normalize_name("John    Doe")
        assert result["name_canonical"] == "john doe"
        assert "    " not in result["name_canonical"]

    def test_case_normalization(self):
        """Test that case is normalized to lowercase."""
        result = normalize_name("JOHN DOE")
        assert result["name_canonical"] == "john doe"

        result = normalize_name("John Doe")
        assert result["name_canonical"] == "john doe"

    def test_unicode_normalization(self):
        """Test Unicode normalization."""
        # Test with accented characters
        result = normalize_name("José García")
        assert isinstance(result["name_canonical"], str)

    def test_empty_string(self):
        """Test handling of empty string."""
        result = normalize_name("")
        assert result["name_canonical"] == ""
        assert result["name_tokens"] == []
        assert result["name_trigram"] == ""

    def test_whitespace_only(self):
        """Test handling of whitespace-only string."""
        result = normalize_name("   ")
        assert result["name_canonical"] == ""
        assert result["name_tokens"] == []


class TestPrepareEmbeddingText:
    """Test embedding text preparation."""

    def test_name_only(self):
        """Test with name only."""
        text = prepare_embedding_text("John Doe")
        assert text == "John Doe"

    def test_name_with_country(self):
        """Test with name and country."""
        text = prepare_embedding_text("John Doe", "US")
        assert text == "John Doe US"

    def test_name_with_none_country(self):
        """Test with None country."""
        text = prepare_embedding_text("John Doe", None)
        assert text == "John Doe"
