# Quickstart

Clone → run the quality gate → load a sanctions list → screen a name. About ten
minutes, mostly waiting on Docker and the OFAC download.

> Reminder: aml-filter is a portfolio demo, **not** a compliance product. See
> [`../NOTICE`](../NOTICE).

## Prerequisites

- **Python 3.13+** and [`uv`](https://docs.astral.sh/uv/)
- **Docker** + Docker Compose
- `curl` and `jq` (for the demo request)

## 1. Clone and check the build

```bash
git clone https://github.com/hseshadr/aml-filter.git
cd aml-filter/backend
uv sync
uv run poe gate     # ruff + mypy --strict + xenon (Radon A) + pytest (≥90% cov)
```

`uv run poe gate` must pass before anything else — it's the same gate CI runs.

## 2. Start the services

From the repo root:

```bash
docker compose up -d
```

This starts Postgres (pgvector, published on `localhost:5435`), Valkey/Redis
(`localhost:6380`), the API (`localhost:8000`), and the batch worker.

## 3. Create the schema

```bash
docker compose exec api uv run python scripts/init_db.py
```

(Schema migrations live in `backend/alembic/`; `init_db.py` brings a fresh database
up to head.)

## 4. Load the official OFAC SDN list

aml-filter does **not** ship the sanctions data. Download the current SDN list as
`SDN.XML` from the official source —
<https://sanctionslist.ofac.treasury.gov> — then ingest it:

```bash
docker compose exec api uv run python scripts/ingest_ofac.py SDN.XML
```

This parses the XML, upserts sanctioned entities + aliases, builds a name embedding
for each, and stamps a `list_version`. Re-run it whenever you refresh the list.

## 5. Screen a name

```bash
curl -s http://localhost:8000/v1/screen \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jon Q. Fakename", "threshold": 0.65}' | jq
```

### Request fields (`SearchQuery`)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | — | **Required.** The name to screen. |
| `dob` | date | — | Optional `YYYY-MM-DD`; feeds the `dob_match` signal. |
| `country` | string | — | Optional ISO-3166 alpha-2; feeds `country_match`. |
| `entity_type` | `PERSON`\|`ORGANIZATION` | — | Optional filter. |
| `threshold` | float | `0.65` | Minimum score to count as a match. |
| `k` | int | `20` | Max candidates to retrieve. |

The response is a `SearchResponse` with scored `matches[]` — each carrying a
`reasons[]` signal breakdown and a plain-language `explanation`. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the scoring contract.

## Troubleshooting

- **`DATABASE_URL` error on startup** — aml-filter fails closed by design. For a
  host-run API, `cp backend/.env.example backend/.env` first.
- **No matches ever** — confirm step 4 succeeded (the SDN list is loaded) and that
  you're screening a name that's actually on it.
- **Port already in use** — Postgres/Valkey publish on `5435`/`6380` (not the
  defaults) specifically to avoid clashing with local installs; adjust
  `docker-compose.yml` if needed.
