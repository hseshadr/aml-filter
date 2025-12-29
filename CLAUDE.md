# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AML-Filter v2 is an open-source AI-native Anti-Money Laundering (AML) and sanctions screening engine. It uses vector embeddings for semantic matching combined with lexical search for hybrid relevance scoring.

**Tech Stack**: Python FastAPI backend, React TypeScript frontend, PostgreSQL with pgvector, Redis/Valkey for job queues.

## Common Commands

### Backend (from `backend/` directory)
```bash
uv sync                                           # Install dependencies
uv run pytest                                     # Run all tests
uv run pytest tests/unit/                         # Run unit tests only
uv run pytest tests/integration/ -m integration   # Run integration tests
uv run pytest -k "test_name"                      # Run single test by name
uv run uvicorn aml_filter.api.main:app --reload   # Start dev server (port 8000)
uv run alembic upgrade head                       # Run database migrations
uv run alembic revision --autogenerate -m "msg"   # Create new migration
```

### Frontend (from `frontend/` directory)
```bash
npm install        # Install dependencies
npm run dev        # Start dev server (port 5173)
npm run build      # Production build
npm run lint       # ESLint check
npm run format     # Prettier formatting
```

### Infrastructure
```bash
docker-compose up -d              # Start all services (postgres, redis)
docker-compose up -d postgres     # Start just PostgreSQL
uv run python scripts/init_db.py  # Create database extensions (run once)
```

## Code Quality Requirements

**Backend (Python)**:
- Ruff for linting and formatting (line length: 100)
- MyPy in strict mode - all functions must have type annotations
- Test coverage minimum: 90%
- Pre-commit hooks run automatically on commit

**Frontend**:
- ESLint + Prettier
- TypeScript strict mode

## Architecture

### Backend Structure (`backend/aml_filter/`)
```
api/         # FastAPI routers and endpoints
db/          # SQLAlchemy models and database session
domain/      # Pydantic domain models
embedding/   # Vector embedding service (sentence-transformers)
ingest/      # Data ingestion (OFAC XML parser)
scoring/     # Relevance scoring engine with multiple policies
search/      # Hybrid search (vector + lexical backends)
```

### Search Pipeline
1. Query normalization and embedding generation
2. Hybrid search: pgvector similarity + pg_trgm lexical matching
3. Scoring engine combines signals with configurable weights
4. Results include match explanations for auditability

### Key Patterns
- **Async everywhere**: SQLAlchemy async with asyncpg driver
- **Multi-tenancy**: Row Level Security (RLS) with tenant_id isolation
- **Background jobs**: Redis Queue (RQ) for batch processing and ingestion
- **Dependency injection**: FastAPI's Depends() for services

### Entry Points
- Backend API: `backend/aml_filter/api/main.py`
- Frontend: `frontend/src/main.tsx`
- Database models: `backend/aml_filter/db/models.py`

## Testing

Test markers (use with `-m`):
- `unit` - Unit tests (no external dependencies)
- `integration` - Requires PostgreSQL and Redis
- `slow` - Long-running tests

Tests use `pytest-asyncio` with `asyncio_mode = "auto"`.

## Documentation

Detailed specs are in `/docs`:
- `SPEC.md` - Complete technical specification
- `API_SPEC.md` - REST API reference
- `DATABASE_SCHEMA.md` - PostgreSQL schema and RLS policies
- `QUICKSTART.md` - Setup guide
