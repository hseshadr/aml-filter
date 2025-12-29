# AML-Filter v2

Open-Source AI-Native AML & Sanctions Screening Engine

## Project Structure

This is a monorepo containing both backend and frontend:

```
aml-filter/
  backend/         # Python FastAPI backend
  frontend/        # React TypeScript frontend
  docs/            # Documentation
  docker-compose.yml  # Docker services (postgres, redis, api, worker)
```

## Quick Start

### Backend

See [backend/README.md](./backend/README.md) for backend setup and API documentation.

### Frontend

See [frontend/README.md](./frontend/README.md) for frontend setup.

### Full Stack

```bash
# Start all services
docker-compose up -d

# Backend API: http://localhost:8000
# Frontend: http://localhost:5173 (when running bun run dev)
```

## Documentation

All documentation is in the `docs/` directory:

- [QUICKSTART.md](./docs/QUICKSTART.md) - Quick start guide
- [SPEC.md](./docs/SPEC.md) - Complete technical specification
- [API_SPEC.md](./docs/API_SPEC.md) - API reference
- [DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md) - Database design

## Development

### Backend Development

```bash
cd backend
uv sync
uv run pytest
uv run uvicorn aml_filter.api.main:app --reload
```

### Frontend Development

```bash
cd frontend
bun install
bun run dev
```

## License

MIT
