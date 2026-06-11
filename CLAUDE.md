# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Execution Discipline (non-negotiable)

**Dispatch superpowers Agents to do the work — do not solo-crawl, and do not just narrate.**
Any task that is codebase exploration, multi-file research, implementation, validation, or
gate-running MUST be executed by dispatching `Agent`(s) (via `superpowers:dispatching-parallel-agents`
or `superpowers:subagent-driven-development`), not by the main thread doing it sequentially.
Agents are an **execution substrate**, not just for exploration — orchestrate
implementation/validation/gates across them too. The main thread coordinates and reviews;
it does not hand-run the work. Treat "let me just do this one step myself first" as a red flag.

## Browser validation (non-negotiable for any `/screen`, demo, or frontend change)

**A UI/demo change is NOT done until a real browser has driven it like a human and the
on-screen result was observed.** Green unit tests, a green build, and green CI are NOT
sufficient — they have repeatedly passed while the actual `/screen` demo was broken
(es2020 model-load crash; a silent boot hang; and the demo bundle failing in-tab signature
verification — none caught by units/CI because the C1 e2e exercises a *different* test
bundle than the real demo catalog+key).

Required before claiming any such change works:
- **Drive the real app in a real browser on `http://localhost:<port>`** (localhost is a
  secure context — required for WebCrypto `crypto.subtle` signature verification and OPFS;
  a LAN IP or `host.docker.internal` is **not** a secure context and will fail differently,
  so it does NOT count as validation). Navigate to `/screen`, watch it boot, type a query,
  read the rendered result, and confirm a clean console.
- **Use host Playwright** (the same runner as the C1 e2e, `frontend/app` → `pnpm test:e2e:c1`)
  — NOT the Docker browser-MCP, which cannot reach the host's secure-context localhost and
  will report misleading failures (OPFS `persist`, host-not-allowed). Prefer encoding the
  check as a Playwright spec so it becomes a permanent regression guard.
- **Cover the REAL artifacts, not stand-ins.** The C1 e2e must (also) verify the actual
  committed demo bundle (`backend/examples/catalog`) against the actual pinned key
  (`frontend/app/public/public.key`) in-tab — not only a synthetic test catalog — so a
  bundle/key/verification regression is caught.
- If a browser pass genuinely cannot be run in the harness, **say so explicitly and state
  what remains unverified** — never imply a screen works that you did not watch work.

## Project Overview

AML-Filter v2.1 is an open-source AML and sanctions screening engine, **rebuilt to run
on the [edge-proc](https://github.com/hseshadr/edge-proc) local-compute substrate**. It
screens a query name against the OFAC SDN list and returns a **scored, explained**
result. One scoring contract is served over **three paths**:

- **Server, DB-backed** — the FastAPI app over PostgreSQL; `POST /v1/screen` is the
  front door. Candidates come from **hybrid search** (pgvector + pg_trgm). This is the
  default HTTP path and the only path with an HTTP surface.
- **Server, bundle-backed (no Postgres)** — `backend/aml_filter/bundle/` syncs a signed
  edge-proc bundle and screens against its **localvec** FAISS index + in-memory
  entities. Driven by the `amlfilter` CLI; gated on `BUNDLE_BASE_URL` + `VERIFY_KEY_PATH`.
- **Browser, backend-free** — `frontend/packages/amlfilter-browser` (`@amlfilter/browser`)
  syncs the same signed bundle into the tab and searches/screens the list in-tab, no
  application backend.

The HTTP `/v1/screen` endpoint stays **DB-backed**; the bundle + browser path is the new
edge-proc capability layered on top.

**Tech Stack**: Python 3.13+ FastAPI backend, React + TypeScript (Vite) frontend,
PostgreSQL with pgvector, Redis/Valkey for job queues, edge-proc (localvec FAISS +
signed content-addressed bundles), sentence-transformers (all-MiniLM-L6-v2, 384-dim).

## Common Commands

### Backend (from `backend/` directory)
```bash
uv sync                                           # Install dependencies
uv run poe gate                                   # Full gate: ruff + mypy --strict + xenon (Radon A) + pytest (≥90% cov)
uv run pytest                                     # Run all tests
uv run pytest tests/unit/                         # Run unit tests only
uv run pytest tests/integration/ -m integration   # Run integration tests
uv run pytest -k "test_name"                      # Run single test by name
uv run uvicorn aml_filter.api.main:app --reload   # Start dev server (port 8000)
uv run alembic upgrade head                       # Run database migrations
uv run alembic revision --autogenerate -m "msg"   # Create new migration
```

### `amlfilter` CLI — the edge-proc bundle path (from `backend/`)
```bash
uv run amlfilter keygen ./trust.key ./trust.pub                          # Mint an ed25519 trust root
uv run amlfilter bundle ./entities.jsonl ./origin ./trust.key --list-id OFAC_SDN  # Build a signed, content-addressed bundle
uv run amlfilter sync ./origin ./trust.pub --cache ./.ofac_bundle        # Sync + ed25519/sha256-verify (fail-closed)
uv run amlfilter screen "Jon Q. Fakename" ./origin ./trust.pub           # Sync + verify + screen, no Postgres
```

### Frontend (pnpm workspace, from `frontend/` directory)
```bash
pnpm install                          # Install workspace dependencies
pnpm --filter aml-filter-app dev      # Start dev server (port 5173); the /screen page is backend-free
pnpm -r run build                     # Production build across the workspace
pnpm -r run lint                      # Biome check across the workspace
pnpm -r run format                    # Biome formatting
```

**Note**: the frontend is a **pnpm workspace** (`pnpm` + **Biome**, not bun / ESLint /
Prettier). Three packages: `frontend/app` (the React app),
`frontend/packages/amlfilter-browser` (`@amlfilter/browser`, the in-browser screening
tier — a port of edge-proc's browser sync tier + the OFAC scoring contract), and
`frontend/packages/amlfilter-workstation` (`@amlfilter/workstation`, the local-first
KYC tier — SQLite-WASM/OPFS DB worker + TS ports of tiering/onboarding/review, tiering
parity-locked via `poe tiering-golden-check`). Always use `pnpm` for frontend package
management.

### Infrastructure
```bash
docker compose up -d              # Start all services (postgres, valkey, api, worker)
docker compose up -d postgres     # Start just PostgreSQL
docker compose exec api uv run python scripts/init_db.py  # Create schema / bring DB to head (run once)
```

## Code Quality Requirements

**Backend (Python)**:
- Ruff for linting and formatting (line length: 100)
- MyPy in strict mode — all functions must have type annotations
- xenon / Radon Grade A complexity; functions ≤15 lines
- Test coverage minimum: 90%
- `uv run poe gate` is the single source of truth (it mirrors CI)

**Frontend**:
- Biome (lint + format)
- TypeScript strict mode; no `any`, no default exports

## Architecture

aml-filter is **two layers**: edge-proc (the generic local-compute substrate —
localvec + signed bundles) at the bottom, and aml-filter (the OFAC domain model, the
explainable weighted scorer, the screening pipeline) on top. The pipeline shape is the
same on every path: normalize → embed → generate candidates by vector retrieval → score
with a transparent weighted policy → threshold → return matches with per-signal reasons.

### Backend Structure (`backend/aml_filter/`)
```
api/         # FastAPI routers + endpoints (the DB-backed HTTP tier)
bundle/      # edge-proc bundle producer/consumer: publish.py (build+sign), sync.py
             #   (sync+verify, fail-closed), runtime.py (server bundle read-path gate),
             #   screening.py (BundleScreeningSource), meta.py (OfacBundleMeta)
db/          # SQLAlchemy models and database session
domain/      # Pydantic domain models + name normalization
embedding/   # Local sentence-transformers embedding service (in-process cache)
ingest/      # Data ingestion (OFAC SDN XML parser)
scoring/     # DefaultScoringPolicy — weighted, explainable scoring + named presets
search/      # Retrieval backends: hybrid_search, pgvector_backend (DB path),
             #   localvec_backend (edge-proc FAISS, bundle/browser path), lexical_backend
```

### Retrieval — DB path vs edge-proc path
- **DB path — hybrid search** (`search/hybrid_search.py`): union of **vector**
  (`pgvector_backend.py`, cosine over name embeddings) and **lexical**
  (`lexical_backend.py`, `pg_trgm` trigram similarity).
- **Bundle / browser path — localvec** (`search/localvec_backend.py`): in-process vector
  retrieval against edge-proc's `FaissVectorIndex` (`IndexFlatIP`), a drop-in for the
  pgvector ANN with the same `vector_search(query_vector, k, tenant_id, filters)`
  contract. Lexical signal derived in Python (no Postgres).

### Signed-bundle distribution (the edge-proc tier)
The OFAC list is distributed as a signed, content-addressed bundle: `build_bundle`
chunks (GearCDC) + signs (Ed25519) + lays out a flat origin (`latest` version pointer →
immutable `manifest/<hash>` → `chunk/<hash>`). The consumer's `sync_index`
(`Ed25519Verifier` over a pinned public key) is **fail-closed** — any signature or
SHA-256 mismatch aborts the load. The same wire format + trust root serves the browser
tier (`@amlfilter/browser`), which syncs into OPFS in a Web Worker.

### Key Patterns
- **One scoring contract, three paths**: DB, server-bundle, and browser all emit the
  same `reasons[]` + plain-language `explanation`. The browser TS scorer is a faithful
  port of `DefaultScoringPolicy` (identical weights, thresholds, and signal order); the
  wire format, the normalizer, and the scorer's **full output** — score, reasons, and each
  reason's plain-language description — are parity-tested against Python.
- **Async everywhere**: SQLAlchemy async with asyncpg driver.
- **Multi-tenancy (DB path)**: tenant isolation is enforced **at the application
  layer** — the search backends and queries filter by `tenant_id` (e.g.
  `search/localvec_backend.py`'s `_matches_tenant`, `pgvector_backend.py`'s tenant
  partition key). The Postgres RLS policies in
  `backend/alembic/versions/add_rls_policies.py` are **scaffolding for SaaS deployments
  and are not yet wired**: the `app.current_tenant_id` GUC they gate on is never set,
  and the app connects as the table owner (which bypasses RLS unless
  `FORCE ROW LEVEL SECURITY` is set), so the policies are currently inert.
- **Background jobs**: Redis Queue (RQ) for batch processing and ingestion.
- **Dependency injection**: FastAPI's `Depends()` for services.
- **Fail closed** on config (missing `DATABASE_URL` aborts the DB path) and on trust
  (bundle mode needs both `BUNDLE_BASE_URL` + `VERIFY_KEY_PATH`; no silent empty index).

### Entry Points
- Backend API: `backend/aml_filter/api/main.py`
- `amlfilter` CLI: `backend/aml_filter/bundle/` (behind the `amlfilter` console script)
- Frontend app: `frontend/app/src/main.tsx`
- In-browser screening tier: `frontend/packages/amlfilter-browser`
- Database models: `backend/aml_filter/db/models.py`

## Testing

Test markers (use with `-m`):
- `unit` - Unit tests (no external dependencies)
- `integration` - Requires PostgreSQL and Redis
- `slow` - Long-running tests

Tests use `pytest-asyncio` with `asyncio_mode = "auto"`. The browser tier's wire format,
normalizer, and **scoring output** are parity-tested against the Python side (see
`crypto.test.ts`, `normalize.test.ts`, and `scoring.parity.test.ts` — the last asserts the
TS scorer against a golden emitted by the Python source of truth via
`backend/scripts/gen_scoring_golden.py`). The workstation's **tier classification** is
parity-locked the same way: `backend/scripts/gen_tiering_golden.py` emits the golden,
`poe tiering-golden` refreshes it, and `poe tiering-golden-check` (part of `poe gate`,
alongside `scoring-golden-check`) fails on drift. The embedder is wired through a
`createEmbedderWith` seam for parity testing but is not yet covered by a committed
parity test.

The `e2e-kyc` Playwright lane (`frontend/app` → `pnpm test:e2e:kyc`) is the
**backend-free local-first journey**: onboard → auto-screen → review → resolve in real
Chromium against the minified production build and the committed signed demo bundle —
its webServers are `vite preview` + the static catalog server only (no Postgres, no
FastAPI).

## Documentation

Front-door docs live in `/docs` (the root `README.md` is the canonical index):
- `ARCHITECTURE.md` - the pipeline, the three paths, the scoring contract, data model
- `QUICKSTART.md` - clone → gate → load a list → screen a name (DB + edge-proc paths)
- `DEPLOY.md` - docker-compose, env vars, refreshing the OFAC list
- `API_SPEC.md` - REST reference for the **DB-backed** HTTP tier only
- `DATABASE_SCHEMA.md` - PostgreSQL schema (DB path only; the bundle/browser paths use no Postgres)
- `diagrams/` - d2 sources + rendered SVGs
