"""Name normalization utilities."""

import re
import unicodedata

from pydantic import BaseModel


class NormalizedName(BaseModel):
    """Result of the name-normalization pipeline."""

    name_canonical: str
    name_tokens: list[str]
    name_trigram: str


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


def _canonicalize(name: str) -> str:
    """Run the NFKD → strip-punctuation → lowercase → de-title → whitespace pipeline."""
    normalized = unicodedata.normalize("NFKD", name)
    normalized = re.sub(r"[^\w\s-]", "", normalized).lower()
    kept = [word for word in normalized.split() if word not in TITLES]
    return re.sub(r"\s+", " ", " ".join(kept)).strip()


def normalize_name(name: str) -> NormalizedName:
    """Normalize a name into canonical form, tokens, and a pg_trgm string."""
    if not name or not name.strip():
        return NormalizedName(name_canonical="", name_tokens=[], name_trigram="")
    canonical = _canonicalize(name)
    tokens = [token for token in canonical.split() if token]
    # name_trigram mirrors canonical; pg_trgm generates trigrams internally.
    return NormalizedName(name_canonical=canonical, name_tokens=tokens, name_trigram=canonical)


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
