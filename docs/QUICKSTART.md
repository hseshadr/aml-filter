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

## The edge-proc path — backend-free screening

aml-filter is built on the [edge-proc](https://github.com/hseshadr/edge-proc)
substrate: the OFAC list can be published as a **signed, versioned bundle** and
screened against **without Postgres** — from the terminal, or entirely in a browser
tab. This path needs no Docker and no database.

### 1. Mint a trust root and build a signed bundle

You provide an `entities.jsonl` (one JSON domain `Entity` per line — e.g. produced
from the OFAC SDN load above, or your own export):

```bash
cd backend
uv sync

uv run amlfilter keygen ./trust.key ./trust.pub
uv run amlfilter bundle ./entities.jsonl ./origin ./trust.key --list-id OFAC_SDN
```

`bundle` embeds each name with the sentence-transformers encoder, builds the
localvec FAISS index, and writes a **content-addressed origin** under `./origin`
(`latest` pointer + `manifest/<hash>` + `chunk/<hash>`).

### 2. Screen against the bundle (no Postgres)

```bash
# sync + verify + screen in one shot:
uv run amlfilter screen "Jon Q. Fakename" ./origin ./trust.pub

# or just sync + verify into a local cache and report the version:
uv run amlfilter sync ./origin ./trust.pub --cache ./.ofac_bundle
```

Verification is **fail-closed** — a tampered or unsigned bundle aborts the load.

### 3. Run the in-browser `/screen` demo

Serve the origin as static files, point the frontend at it, and screen in the tab:

```bash
# serve the bundle origin at, say, http://localhost:8080 (any static server)
#   e.g.  (cd backend/origin && python -m http.server 8080)
# set VITE_BUNDLE_BASE_URL to that origin in frontend/.env

cd frontend
pnpm install
pnpm --filter aml-filter-app dev      # open http://localhost:5173/screen
```

The `/screen` page syncs the signed bundle into the browser (ed25519 + sha256,
fail-closed), loads the MiniLM matcher once (~23 MB), and screens names **in-tab** —
no FastAPI on this path. The ed25519 public key is pinned in the app build, not
fetched from the (untrusted) bundle origin.

## Troubleshooting

- **`DATABASE_URL` error on startup** — aml-filter fails closed by design. For a
  host-run API, `cp backend/.env.example backend/.env` first.
- **No matches ever** — confirm step 4 succeeded (the SDN list is loaded) and that
  you're screening a name that's actually on it.
- **Port already in use** — Postgres/Valkey publish on `5435`/`6380` (not the
  defaults) specifically to avoid clashing with local installs; adjust
  `docker-compose.yml` if needed.
