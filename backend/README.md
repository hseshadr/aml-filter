# AML-Filter v2 Backend

Python FastAPI backend for AML-Filter v2.

## Quick Start

### Prerequisites

- Python 3.13+
- PostgreSQL 15+ with pgvector extension
- Redis/Valkey 7+

### Installation

1. **Install uv (if not already installed):**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. **Sync dependencies:**
```bash
cd backend
uv sync
```

3. **Set up environment variables (optional):**
```bash
export DATABASE_URL="postgresql+asyncpg://amlfilter:amlfilter_dev_password@localhost:5432/amlfilter"
```

4. **Start services with Docker Compose:**
```bash
# From project root
docker-compose up -d postgres redis
```

5. **Initialize database:**
```bash
cd backend
uv run python scripts/init_db.py
uv run alembic upgrade head
```

6. **Run the API:**
```bash
uv run uvicorn aml_filter.api.main:app --reload
```

API will be available at `http://localhost:8000`

## Project Structure

```
backend/
  aml_filter/      # Main application package
    api/           # FastAPI endpoints
    db/            # Database models and session
    domain/        # Domain models (Pydantic)
    embedding/     # Embedding service
    ingest/        # Data ingestion (OFAC parser)
    scoring/       # Scoring engine
    search/        # Search backends (vector + lexical)
  alembic/         # Database migrations
  tests/           # Test suite
  scripts/         # Utility scripts
  pyproject.toml   # Dependencies and project config
```

## Development

See [../docs/README_PYTHON.md](../docs/README_PYTHON.md) for detailed development guide.

## API Documentation

Once the server is running:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

