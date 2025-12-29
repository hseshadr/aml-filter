"""Name normalization utilities."""

import re
import unicodedata
from typing import Any

# Common titles to remove
TITLES = {
    "mr",
    "mrs",
    "miss",
    "ms",
    "dr",
    "prof",
    "professor",
    "sir",
    "dame",
    "lord",
    "lady",
    "hon",
    "honorable",
    "rev",
    "reverend",
    "fr",
    "father",
    "sr",
    "sister",
    "br",
    "brother",
}


def normalize_name(name: str) -> dict[str, Any]:
    """
    Normalize a name through the complete pipeline.

    Args:
        name: Original name string

    Returns:
        Dictionary with:
        - name_canonical: Fully normalized string
        - name_tokens: List of tokenized words
        - name_trigram: String for pg_trgm indexing (same as canonical for now)
    """
    if not name or not name.strip():
        return {
            "name_canonical": "",
            "name_tokens": [],
            "name_trigram": "",
        }

    # 1. Unicode Normalization: NFKD decomposition
    normalized = unicodedata.normalize("NFKD", name)

    # 2. Strip Punctuation: Remove special chars except spaces
    # Keep alphanumeric, spaces, and common characters
    normalized = re.sub(r"[^\w\s-]", "", normalized)

    # 3. Case Normalization: Convert to lowercase
    normalized = normalized.lower()

    # 4. Title Removal: Strip common titles
    words = normalized.split()
    filtered_words = []
    for word in words:
        # Remove common titles
        if word not in TITLES:
            filtered_words.append(word)
    normalized = " ".join(filtered_words)

    # 5. Whitespace Canonicalization: Multiple spaces → single space, trim
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # 6. Tokenization
    tokens = [token for token in normalized.split() if token]

    # name_trigram is the same as canonical for pg_trgm
    # pg_trgm will handle trigram generation internally
    return {
        "name_canonical": normalized,
        "name_tokens": tokens,
        "name_trigram": normalized,
    }


def prepare_embedding_text(name: str, country: str | None = None) -> str:
    """
    Prepare text for embedding generation.

    Combines name and country for better semantic matching.

    Args:
        name: Entity name
        country: Optional country code

    Returns:
        Text string for embedding
    """
    text = name
    if country:
        text = f"{name} {country}"
    return text

