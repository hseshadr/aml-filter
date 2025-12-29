# AML-Filter v2 Quick Start Guide

## Prerequisites

- Python 3.13+
- PostgreSQL 15+ with pgvector extension
- Docker and Docker Compose (for local development)

## Setup Steps

### 1. Install Dependencies

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Sync dependencies
uv sync
```

### 2. Start Database

```bash
# Start PostgreSQL with pgvector
docker-compose up -d postgres

# Wait for database to be ready (about 10 seconds)
sleep 10
```

### 3. Initialize Database

```bash
# Create extensions and run migrations
uv run python scripts/init_db.py
uv run alembic upgrade head
```

### 4. Ingest Sample Data (Optional)

```bash
# Download OFAC SDN XML from https://ofac.treasury.gov
# Then ingest:
uv run python scripts/ingest_ofac.py path/to/sdn.xml
```

### 5. Start API Server

```bash
uv run uvicorn aml_filter.api.main:app --reload
```

The API will be available at `http://localhost:8000`

## Testing the API

### Using curl

```bash
# Screen an entity
curl -X POST "http://localhost:8000/v1/screen" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "country": "US",
    "entity_type": "PERSON",
    "threshold": 0.65,
    "k": 10
  }'
```

### Using the Swagger UI

Visit `http://localhost:8000/docs` for interactive API documentation.

## Environment Variables

Set these environment variables if needed:

```bash
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/aml_filter"
```

## Project Structure

```
aml_filter/
  api/          # FastAPI endpoints
  db/           # Database models and session
  domain/       # Domain models (Pydantic)
  embedding/    # Embedding service
  ingest/       # Data ingestion (OFAC parser)
  scoring/      # Scoring engine
  search/       # Search backends (vector + lexical)
```

## Next Steps

- Read the full [README_PYTHON.md](./README_PYTHON.md) for detailed documentation
- Check [docs/SPEC.md](./docs/SPEC.md) for architecture details
- Review [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) for roadmap

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running: `docker-compose ps`
- Check database URL in environment variables
- Verify pgvector extension: `psql -c "CREATE EXTENSION IF NOT EXISTS vector;"`

### Migration Issues

- Ensure database extensions are created: `uv run python scripts/init_db.py`
- Check Alembic configuration in `alembic.ini`

### Import Errors

- Ensure virtual environment is activated: `source .venv/bin/activate`
- Reinstall dependencies: `uv sync`

