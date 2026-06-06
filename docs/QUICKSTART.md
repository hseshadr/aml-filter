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

## A full KYC walkthrough (onboard → review → SAR → badge)

The DB-backed tier adds a compliance workflow on top of screening: onboard a customer,
work its matches on a tiered review board, file a SAR on a STRONG match, and generate a
verifiable review badge. These endpoints are **tenant-scoped** — they need an
`X-API-Key`. (Create one with `POST /v1/api-keys`; see [`API_SPEC.md`](API_SPEC.md).)

> Reference implementation, **not** a compliance product. The SAR export below produces
> a *fileable* FinCEN report — it does **NOT** submit anything to FinCEN or any
> government system. See [`../NOTICE`](../NOTICE).

Set your key once:

```bash
export AK='X-API-Key: ak_live_…'      # your tenant's API key
```

**1. Onboard a customer.** This creates a screened entity, screens it on the spot, and
persists any matches.

```bash
curl -s http://localhost:8000/v1/customers \
  -H "$AK" -H 'Content-Type: application/json' \
  -d '{"customer_reference": "CUST-001", "name": "Jon Q. Fakename", "country": "US"}' | jq
# → returns customer_id + match_entity_ids[] (the sanctions hits found on onboarding)
```

**2. Work the review board.** Matches are tiered STRONG / POSSIBLE / WEAK. List the
STRONG ones, then resolve one with a reviewer note.

```bash
curl -s "http://localhost:8000/v1/review/matches?tier=STRONG" -H "$AK" | jq
# grab a match_id, then resolve it:
curl -s -X PUT \
  "http://localhost:8000/v1/review/matches/<MATCH_ID>/resolve?resolution_status=TRUE_POSITIVE" \
  -H "$AK" -H 'Content-Type: application/json' \
  -d '{"reviewer_id": "analyst@acme.com", "review_notes": "Confirmed — sanctioned individual."}' | jq
```

**3. File a SAR on a STRONG match.** SAR creation is STRONG-gated (a non-STRONG match
returns `422`).

```bash
curl -s http://localhost:8000/v1/sars \
  -H "$AK" -H 'Content-Type: application/json' \
  -d '{
        "customer_id": "<CUSTOMER_ID>",
        "match_id": "<MATCH_ID>",
        "narrative": "Customer matched a sanctioned individual on the OFAC SDN list.",
        "filer": {"name": "Jane Compliance", "institution": "Acme Bank", "contact": "compliance@acme.com"}
      }' | jq
# export the fileable FinCEN report (PDF or JSON) — you file it; it is NOT submitted:
curl -s "http://localhost:8000/v1/sars/<SAR_ID>/export?format=pdf" -H "$AK" -o sar.pdf
```

**4. Generate a screening review badge.** A verifiable record of what the customer was
screened against, when, and the result. With a signing key configured
(`ATTESTATION_SIGNING_KEY_PATH`) it is ed25519-signed and verifiable.

```bash
curl -s http://localhost:8000/v1/attestations \
  -H "$AK" -H 'Content-Type: application/json' \
  -d '{"customer_id": "<CUSTOMER_ID>"}' | jq
# verify its signature against the pinned trust-root key:
curl -s "http://localhost:8000/v1/attestations/<ATTESTATION_ID>/verify" -H "$AK" | jq
# → {"valid": true, "reason": "..."}
```

See [`API_SPEC.md`](API_SPEC.md) for the full request/response shapes, including the
multi-list endpoints (`GET /v1/lists/available`, `PUT /v1/lists/{id}`). The frontend SPA
mounts a page for each step (`/customers`, `/review`, `/sars`, `/attestations`,
`/lists`).

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

The one-command `make demo` / `make demo-browser` path serves the edge + SPA on host
ports **8081 / 5173** by default; override either with `AML_EDGE_PORT` / `AML_SPA_PORT`
(e.g. `AML_EDGE_PORT=8091 make demo`).

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
