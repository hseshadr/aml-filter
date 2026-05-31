# aml-filter

> **Screen a name against the sanctions list — and see exactly why it matched.**

[![CI](https://github.com/hseshadr/aml-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/hseshadr/aml-filter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.13+](https://img.shields.io/badge/python-3.13+-blue.svg)](https://www.python.org/downloads/)

Banks and businesses are legally required to check that the people they deal with
aren't on government sanctions lists. That sounds easy until you try it: the same
person shows up as "Robert", "Bob", and "Rob"; names get spelled a dozen ways when
they cross alphabets; and a single typo can hide a real match. So the hard part
isn't looking a name up — it's deciding when two *differently-spelled* names are
the same person.

**aml-filter does that fuzzy name-matching, and then shows its work.** You send it
a name; it searches the sanctions list two ways at once (by meaning and by
spelling), scores each candidate, and hands back a number *plus a plain-English
reason for that number* — "strong name-vector similarity, country match." No black
box. A human reviewer can always see why.

> _aml-filter is an engineering-portfolio demo, **not** a compliance product. Do not
> use it to meet any legal or regulatory obligation. See the
> [Disclaimer](#disclaimer) and [`NOTICE`](NOTICE)._

## Try it

You need this repo, Docker, and `curl`. The sanctions data is **not** shipped — you
load the official OFAC list yourself (it's public domain; see [the OFAC list](#the-ofac-list-data)).

```bash
# 1. Start the stack (Postgres + Valkey + API + worker)
docker compose up -d

# 2. Create the schema and load the official OFAC SDN list
#    (download SDN.XML from https://sanctionslist.ofac.treasury.gov first)
docker compose exec api uv run python scripts/init_db.py
docker compose exec api uv run python scripts/ingest_ofac.py SDN.XML

# 3. Screen a name — get a scored, explained result
curl -s http://localhost:8000/v1/screen \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jon Q. Fakename", "threshold": 0.65}' | jq
```

A made-up name like `Jon Q. Fakename` returns no matches. Swap in a name from the
SDN list and you get back something like:

```json
{
  "request_id": "…",
  "matches": [
    {
      "score": 0.87,
      "risk_category": "SANCTION",
      "source_list": "OFAC_SDN",
      "primary_name": "…",
      "explanation": "High-confidence match: strong vector similarity, country match.",
      "reasons": [
        { "signal": "name_vector",  "value": 0.91, "weight": 0.55, "contribution": 0.50 },
        { "signal": "country_match", "value": 1.0,  "weight": 0.05, "contribution": 0.05 }
      ]
    }
  ],
  "list_versions_used": { "OFAC_SDN": "…" },
  "execution_time_ms": 145
}
```

That `reasons` array is the whole point: every score is broken down into the
weighted signals that produced it.

## Under the hood (for developers)

### Architecture

A single FastAPI service over one PostgreSQL database. `POST /v1/screen` is the
front door; the screening engine lives in `backend/aml_filter/{search,scoring,embedding}/`;
Redis/Valkey backs rate limiting and the batch-screening worker. Full write-up and
diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### How matching & scoring works

Each request flows through five stages: **normalize** the name (strip accents,
honorifics, casing) → **embed** it with a local sentence-transformers model →
**generate candidates** via hybrid search (the union of pgvector cosine similarity
*and* `pg_trgm` lexical similarity) → **score** each candidate with a transparent
weighted policy → **threshold** to keep only confident matches.

The score is a sum of weighted signals (`name_vector`, `name_trigram`,
`alias_match`, `dob_match`, `country_match`), clamped to `[0, 1]`, drawn from a
named preset (`strict` / `balanced` / `lenient`). Every match carries the
per-signal breakdown and a plain-language summary. The contract — *a reviewer can
always see why a score is what it is* — is spelled out in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#scoring--explainability-contract).

### Quickstart (development)

```bash
cd backend
uv sync
uv run poe gate    # ruff + mypy --strict + xenon (Radon A) + pytest (≥90% cov)
```

Run the API locally against the Docker Postgres/Valkey:

```bash
cp backend/.env.example backend/.env
cd backend && uv run uvicorn aml_filter.api.main:app --reload
```

The admin/demo frontend (React + Vite, pnpm):

```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

### Configuration

All runtime config is env-driven through Pydantic `BaseSettings`
(`backend/aml_filter/config.py`) — no hardcoded knobs, and it **fails closed** if
`DATABASE_URL` is missing. Scoring weights/thresholds and rate-limit tiers are
overridable via env (`SCORING_*`, `RATE_LIMIT_*`). Copy `backend/.env.example` →
`backend/.env` to start.

### The OFAC list (data)

aml-filter never bundles or redistributes the sanctions list. You download the
**SDN List** from the U.S. Treasury's Office of Foreign Assets Control
(<https://sanctionslist.ofac.treasury.gov>) — a U.S. Government work in the public
domain — and ingest it locally with `scripts/ingest_ofac.py`. Always screen against
the current official list; it changes often. Attribution and the full data note are
in [`NOTICE`](NOTICE).

### Docs

- [`docs/QUICKSTART.md`](docs/QUICKSTART.md) — clone → gate → load a list → screen a name.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the pipeline, scoring contract, data model.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — docker-compose, env vars, refreshing the OFAC list.
- [`docs/diagrams/`](docs/diagrams/) — d2 sources + rendered SVGs.

### Repo layout

```
aml-filter/
├── backend/              # FastAPI service (Python 3.13, uv)
│   ├── aml_filter/       #   api/ · search/ · scoring/ · embedding/ · ingest/ · db/ · …
│   ├── scripts/          #   init_db.py · ingest_ofac.py
│   └── tests/            #   unit/ + integration/
├── frontend/             # React + Vite admin/demo UI (pnpm)
├── docs/                 # ARCHITECTURE · QUICKSTART · DEPLOY · diagrams/
├── docker-compose.yml    # Postgres (pgvector) + Valkey + api + worker
├── LICENSE  NOTICE  CHANGELOG.md  CONTRIBUTING.md
```

## Disclaimer

aml-filter is a software demonstration and engineering-portfolio project. It is
**NOT legal advice, NOT a regulatory-compliance product, and NOT a substitute for a
qualified compliance program or a commercial sanctions-screening vendor.** Sanctions
screening has real legal consequences; any match — or absence of a match — must be
reviewed by qualified compliance personnel against the official OFAC source before
any decision is made. The software is provided "as is", without warranty. See
[`NOTICE`](NOTICE) and [`LICENSE`](LICENSE).

## License

[MIT](LICENSE). Third-party data attribution is in [`NOTICE`](NOTICE).
