"""Shared unit-test fixtures that keep the embedder offline.

The real `SentenceTransformersProvider` loads `sentence-transformers/all-MiniLM-L6-v2`
from the HuggingFace CDN on first use. Under CI that download is hard-rate-limited
(HTTP 429), so any unit test that constructs a real provider/service hangs and fails.

`_offline_embedder` (autouse) patches the heavy `SentenceTransformer` class at its
import site in the provider module with a deterministic, model-free stub. The provider
*wrapper* (lazy load, `embed`, `embed_batch`, `get_model_info`, normalization, caching)
still runs and stays covered — only the network download is replaced.
"""

from __future__ import annotations

from typing import Final

import numpy as np
import numpy.typing as npt
import pytest

EMBEDDING_DIM: Final[int] = 384


def _deterministic_vector(text: str) -> npt.NDArray[np.float32]:
    """A reproducible, text-dependent unit vector of the real model dimension."""
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    raw = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
    return raw / np.linalg.norm(raw)


class _StubSentenceTransformer:
    """Stand-in for `sentence_transformers.SentenceTransformer` — never hits the network."""

    def __init__(self, model_name: str, device: str | None = None) -> None:
        self.model_name = model_name
        self.device = device or "cpu"

    def get_sentence_embedding_dimension(self) -> int:
        return EMBEDDING_DIM

    def encode(
        self,
        texts: str | list[str],
        batch_size: int = 32,
        show_progress_bar: bool = False,
    ) -> npt.NDArray[np.float32]:
        if isinstance(texts, str):
            return _deterministic_vector(texts)
        return np.stack([_deterministic_vector(t) for t in texts])


@pytest.fixture(autouse=True)
def _offline_embedder(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace the heavy model class so no unit test downloads from HuggingFace."""
    monkeypatch.setattr(
        "aml_filter.embedding.providers.sentence_transformers.SentenceTransformer",
        _StubSentenceTransformer,
    )


class FakeEmbeddingProvider:
    """Deterministic `EmbeddingProvider` for service-logic tests (no model, no network)."""

    model_name: str = "fake-provider"
    dimension: int = EMBEDDING_DIM

    async def embed(self, text: str) -> list[float]:
        return [float(value) for value in _deterministic_vector(text)]

    async def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        return [await self.embed(text) for text in texts]

    def get_model_info(self) -> dict[str, str | int]:
        return {"model_name": self.model_name, "dimension": self.dimension}
