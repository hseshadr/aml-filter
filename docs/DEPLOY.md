# Deploy

> aml-filter is a portfolio demo, **not** a compliance product. Do not deploy it
> as a production sanctions-screening control. See [`../NOTICE`](../NOTICE).

aml-filter runs as a small docker-compose stack: PostgreSQL (with the pgvector
extension), Redis/Valkey, the FastAPI **api**, and a background **worker** for
batch jobs.

## Bring up the stack

From the repo root:

```bash
docker compose up -d
```

This starts four services (`docker-compose.yml`):

| Service | Image | Host port | Role |
| --- | --- | --- | --- |
| `postgres` | `pgvector/pgvector:pg15` | `5435 → 5432` | Entities, embeddings, trigram indexes |
| `redis` | `valkey/valkey:7.2-alpine` | `6380 → 6379` | Rate limiting + worker queue |
| `api` | built from `backend/Dockerfile` (`target: api`) | `8000` | FastAPI screening API |
| `worker` | built from `backend/Dockerfile` (`target: worker`) | — | RQ batch-screening worker |

The API serves at `http://localhost:8000` (`/docs` for interactive OpenAPI).

## Required environment variables

All config is env-driven via Pydantic `BaseSettings`
(`backend/aml_filter/config.py`). The compose file injects DB/Redis URLs into
the `api` and `worker` containers; for a host-side run, copy `.env.example` →
`.env`. **Names only — never commit real secret values.**

| Variable | Purpose | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Async Postgres DSN (`postgresql+asyncpg://…`) | Required; app fails closed if unset |
| `REDIS_URL` | Redis/Valkey URL | Rate limiting + worker queue |
| `SCREENING_QUEUE_NAME` | RQ queue name for batch jobs | Defaults to `screening` |
| `ENVIRONMENT` | Deployment label | `development` in compose |

The committed `docker-compose.yml` uses a **development-only** Postgres password
for local convenience. Replace it (and route it through a secret manager) before
running anywhere real.

## Initialize the database

Once Postgres is healthy, create the extensions + tables (one time):

```bash
cd backend
uv run python scripts/init_db.py     # CREATE EXTENSION vector / pg_trgm / btree_gin
uv run alembic upgrade head          # apply migrations
```

## Load / refresh the OFAC SDN list

aml-filter does **not** bundle the sanctions list. Download it from the official
OFAC source, then ingest it:

```bash
# 1. download the current official OFAC SDN list (XML)
curl -o /tmp/sdn.xml https://sanctionslist.ofac.treasury.gov/Home/SdnList

# 2. ingest it (optionally pass list_id and a version label)
cd backend
uv run python scripts/ingest_ofac.py /tmp/sdn.xml OFAC_SDN 2026-05-01
```

Ingestion upserts entities + aliases and builds name embeddings. The
`list_version` you pass is echoed back in every screening response
(`list_versions_used`), so you can prove which list a decision was made against.

**Refresh cadence.** The SDN list changes frequently. Re-run the ingest on a
schedule (e.g. daily) against a freshly downloaded file. Screening against a
stale copy can miss newly-listed entities — operationally and legally, that
matters.

## Operational caveats

- **Embedding model download.** On first run, the sentence-transformers model is
  fetched and cached; cold start is slower than steady state. In a container,
  bake the model into the image or mount a warm cache to avoid per-boot fetches.
- **CORS.** The app ships `allow_origins=["*"]` for the demo. Lock this down to
  your frontend origin before exposing it.
- **Same embedder everywhere.** Ingestion and query-time must use the same
  embedding model, or vector similarity is meaningless. Don't swap one without
  re-ingesting.
- **This is a demo.** Re-read [`../NOTICE`](../NOTICE): not legal advice, not a
  compliance product. Every match must be reviewed by qualified compliance
  personnel against the official OFAC source.
