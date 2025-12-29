# Vector Management Library

AML-Filter v2 uses a shared vector management library for HNSW indexing and partitioning strategies.

## Library Location

**Project**: `shared-libs-python`  
**Package**: `shared_libs_python`  
**Repository**: `https://github.com/hseshadr/shared-libs-python`  
**Installation**: Automatically installed via Git dependency in `pyproject.toml`

## Usage in AML-Filter

The vector management library provides:

1. **Partitioning Strategies**: Global, bucketed, two-tier
2. **Index Management**: Abstract interface for vector indices
3. **Reindexing Utilities**: Background rebuild + atomic swap patterns

## Integration

```python
from shared_libs_python import IndexManager, GlobalPartitionStrategy, IndexConfig
from shared_libs_python.core.types import VectorEmbedding

# In aml_filter/search/pgvector_backend.py
# Create pgvector-specific index factory
async def create_pgvector_index(name: str, config: IndexConfig):
    # Return PgVectorIndex instance
    ...

# Setup for AML-Filter
strategy = GlobalPartitionStrategy(
    index_factory=create_pgvector_index,
    index_name="entity_embeddings_global",
    config=IndexConfig(
        m=32,
        ef_construction=200,
        ef_search=100,
        dimension=384,  # 384 for all-MiniLM-L6-v2, 1536 for OpenAI
    ),
)

manager = IndexManager(partition_strategy=strategy)
```

## Documentation

See `https://github.com/hseshadr/shared-libs-python` for full library documentation.

## Benefits

- **Reusable**: Can be used by other projects needing vector management
- **Tested**: Shared test suite ensures quality
- **Maintained**: Single source of truth for partitioning strategies
- **Type-safe**: Full Pydantic models and type hints

