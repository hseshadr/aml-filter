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

And it runs **at the edge**. aml-filter is built on the
[**edge-proc**](https://github.com/hseshadr/edge-proc) substrate: the OFAC list is
published once as a *signed, versioned bundle* that syncs to wherever you screen,
and the matching itself runs **locally** — on the server with no vector database,
or **entirely inside a browser tab** with no backend at all. Sync once, screen
anywhere, nothing leaves the device.

> _aml-filter is an engineering-portfolio demo, **not** a compliance product. Do not
> use it to meet any legal or regulatory obligation. See the
> [Disclaimer](#disclaimer) and [`NOTICE`](NOTICE)._

## Try it

Two honest ways to run it. **Path B is one command** (it ships a fictional demo
bundle, so it works on a cold clone). Path A is the real DB-backed API, which needs
the official OFAC list — **not** shipped, you download it yourself (it's public
domain; see [the OFAC list](#the-ofac-list-data)).

### Path A — the server demo (the default DB-backed API)

You need this repo, Docker, and `curl`. The HTTP `/v1/screen` endpoint is backed by
PostgreSQL and the official OFAC list you load into it.

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

### Path B — backend-free, in-browser screening (the edge-proc tier) — **one command**

No database, no API server, no model download. One command serves a **signed demo
bundle** and builds the SPA; then you screen a name **in your browser tab** — the
bundle syncs into the tab, gets ed25519-verified fail-closed against a pinned key,
and the matcher runs in-tab.

```bash
make demo-browser          # docker compose: serves the signed bundle + builds the SPA
# then open http://localhost:5173/screen and type:  Ivan Fakovich
```

> **`make demo-browser` vs `make demo`.** `make demo-browser` builds and serves the
> **minified production SPA** — the same artifact the C1 browser e2e
> (`cd frontend/app && pnpm test:e2e:c1`) guards, so it's the canonical proof the
> *shipped* thing works. For a faster local look there's also `make demo` (from the repo
> root; it delegates to `cd backend && uv run poe demo`), which runs the **unminified
> Vite dev** server instead. Reach for `make demo` to iterate; trust `make demo-browser`
> + C1 for shippability.

You'll get back a scored, explained match for `Ivan Fakovich` — an
**obviously-fictional** demo sanctioned entity (a made-up name like
`Jon Q. Fakename` returns nothing). The bundle here is built from
[`backend/examples/demo_entities.jsonl`](backend/examples/demo_entities.jsonl) — a
handful of fake entities, **not** the real OFAC list — so the demo is turnkey from a
cold clone. (Want to screen the real list? Build a bundle from the official SDN
data — see [the CLI](#the-signed-ofac-bundle-amlfilter-cli) and
[the OFAC list](#the-ofac-list-data).)

<details>
<summary>Under the hood: the same loop by hand (and with the real OFAC list)</summary>

`make demo-browser` is just the committed result of the `amlfilter` CLI delivery
loop, served behind a Caddy edge. To run the loop yourself over any entities JSONL:

```bash
cd backend
uv sync

# 1. mint a trust root, then build a signed bundle from an entities JSONL
uv run amlfilter keygen ./trust.key ./trust.pub
uv run amlfilter bundle ./entities.jsonl ./origin ./trust.key --list-id OFAC_SDN

# 2. screen a name straight against that bundle (no Postgres, terminal-only)
uv run amlfilter screen "Ivan Fakovich" ./origin ./trust.pub

# 3. …or serve ./origin as static files at VITE_BUNDLE_BASE_URL and run the SPA
cd ../frontend && pnpm install && pnpm --filter aml-filter-app dev
#    open http://localhost:5173/screen and type a name
```

To regenerate the committed demo bundle after editing the demo entities:
`make demo-bundle` (slow once — it downloads the MiniLM embedder; the signed result
is committed so `make demo-browser` never needs it).
</details>

Either path, a made-up name like `Jon Q. Fakename` returns no matches. A name on
the list (the demo's `Ivan Fakovich`, or a real SDN name in a real bundle) returns
something like:

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

### Built on edge-proc

aml-filter is two layers, not one. The bottom layer is
[**edge-proc**](https://github.com/hseshadr/edge-proc) — a generic local-compute
substrate: signed, content-addressed bundle sync, an OPFS/CAS (content-addressed
store) cache, Ed25519 + SHA-256 fail-closed verification, and local vector
retrieval (a FAISS **localvec** index over a sentence-transformers space). The top
layer is **aml-filter** — the sanctions-screening brain: the OFAC domain model, the
explainable weighted scorer, and the screening pipeline.

That dependency is real in both runtimes. The Python side pulls
[`edge-proc[localvec,bundles]`](backend/pyproject.toml); the browser side runs
[`@amlfilter/browser`](frontend/packages/amlfilter-browser/) — which vendors the
edge-proc browser sync tier verbatim — over the *same* signed bundle and the *same*
explainable scoring contract. The wire format, the normalizer, and the **scorer's output**
(score, reasons, and each reason's description) are parity-tested across the two tiers
against a golden emitted by the Python source of truth.

### Architecture

Three ways to screen, one scoring contract:

1. **Server, DB-backed** — a FastAPI service over PostgreSQL. `POST /v1/screen` is
   the front door; Redis/Valkey backs rate limiting and the batch worker. This is
   still the default HTTP path.
2. **Server, bundle-backed (no Postgres)** — when `BUNDLE_BASE_URL` +
   `VERIFY_KEY_PATH` are set, screening sources candidates from a synced,
   ed25519-verified edge-proc bundle (localvec FAISS index + in-memory entities)
   instead of a database. Exposed through the `amlfilter` CLI (`sync` / `screen`).
3. **Browser, backend-free** — the `/screen` page syncs the same signed bundle into
   the tab, verifies it fail-closed, loads the MiniLM matcher once, and screens
   names in-tab. No application backend in the request path. This mirrors
   edge-reco's Nimbus demo.

Full write-up and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### How matching & scoring works

Each request flows through the same shape: **normalize** the name (strip accents,
honorifics, casing) → **embed** it with a sentence-transformers model →
**generate candidates** via vector retrieval → **score** each candidate with a
transparent weighted policy → **threshold** to keep only confident matches.

The candidate-generation step is where the substrate shows through:

- **DB path** — hybrid search: the union of pgvector cosine similarity *and*
  `pg_trgm` lexical similarity.
- **Bundle / browser path** — edge-proc **localvec** (FAISS `IndexFlatIP`) for the
  vector candidates, with a Python/TS trigram stand-in for the lexical signal, so
  name scoring stays meaningful without Postgres.

The score is a sum of weighted signals (`name_vector`, `name_trigram`,
`alias_match`, `dob_match`, `country_match`), clamped to `[0, 1]`, drawn from a
named preset (`strict` / `balanced` / `lenient`). Every match carries the
per-signal breakdown and a plain-language summary, on **all three paths**. The
contract — *a reviewer can always see why a score is what it is* — is spelled out in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#scoring--explainability-contract).

### The signed OFAC bundle (`amlfilter` CLI)

The OFAC list is distributed exactly like edge-reco's catalog: a signed,
content-addressed bundle (a `latest` version pointer → an immutable
`manifest/<hash>` → immutable `chunk/<hash>` objects), carrying `entities.jsonl`, a
prebuilt localvec `vector/` index, and `ofac_meta.json` (the version pointer). The
`amlfilter` CLI is the whole delivery loop:

```
amlfilter keygen PRIVATE_KEY PUBLIC_KEY              # mint an ed25519 trust root
amlfilter bundle ENTITIES.jsonl ORIGIN_DIR PRIVATE_KEY [--list-id OFAC_SDN] [--version v1]
    # embed + index the entities, sign + publish a content-addressed origin
amlfilter sync   ORIGIN PUBLIC_KEY [--cache ./.ofac_bundle]
    # pull + ed25519-verify (fail-closed) a bundle into a local cache
amlfilter screen "NAME" ORIGIN PUBLIC_KEY [--threshold 0.65] [--k 20]
    # sync + screen a name against the bundle, no Postgres
```

`bundle` reads a JSONL of domain `Entity` records, embeds each name with the
sentence-transformers encoder, builds the localvec index, and lets edge-proc chunk
+ sign + lay out the flat origin a device can sync.

### Quickstart (development)

```bash
cd backend
uv sync
uv run poe gate    # ruff + mypy --strict + xenon (Radon A) + pytest (≥90% cov)
```

Run the API locally against the Docker Postgres/Valkey:

```bash
cp .env.example .env
cd backend && uv run uvicorn aml_filter.api.main:app --reload
```

The frontend is a **pnpm workspace** — the admin/demo SPA (`app/`) plus the
in-browser screening engine (`packages/amlfilter-browser/`):

```bash
cd frontend
pnpm install                          # resolves the whole workspace (app + package)
pnpm --filter aml-filter-app dev      # http://localhost:5173 (admin + /screen)
pnpm -r run test                      # vitest on both members (incl. wire-format + scoring parity)
```

### Configuration

All runtime config is env-driven through Pydantic `BaseSettings`
(`backend/aml_filter/config.py`) — no hardcoded knobs. The DB path **fails closed**
if `DATABASE_URL` is missing. Scoring weights/thresholds and rate-limit tiers are
overridable via env (`SCORING_*`, `RATE_LIMIT_*`).

The edge-proc paths add their own opt-in knobs:

- `VECTOR_INDEX_DIR` — where the localvec FAISS index is persisted (defaults to a
  local `.vector_index` dir, so a fresh checkout retrieves with zero config).
- `BUNDLE_BASE_URL` + `VERIFY_KEY_PATH` — set **both** to activate bundle-backed,
  Postgres-free screening (an `http(s)://` origin or local path, plus the pinned
  ed25519 public key). `BUNDLE_CACHE_DIR` sets the local sync cache.
- Frontend: `VITE_BUNDLE_BASE_URL` points the `/screen` page at the served bundle
  origin (the public key is pinned in the app build, never fetched from the bundle).

Copy `.env.example` → `.env` (repo root) to start.

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
├── Makefile                  # `make demo-browser` (turnkey /screen) · demo-server · demo-bundle
├── backend/                  # FastAPI service + bundle CLI (Python 3.13, uv)
│   ├── aml_filter/
│   │   ├── api/              #   FastAPI app + /v1 routers (DB-backed front door)
│   │   ├── search/           #   hybrid_search · pgvector_backend · localvec_backend (edge-proc FAISS)
│   │   ├── bundle/           #   publish · sync · screening · runtime · meta (signed OFAC bundle)
│   │   ├── scoring/ · embedding/ · ingest/ · db/ · domain/
│   │   └── cli.py            #   `amlfilter` — keygen · bundle · sync · screen
│   ├── deploy/caddy/         #   Caddyfile — the bundle edge/CDN the browser syncs from
│   ├── examples/             #   demo_entities.jsonl (FICTIONAL) + committed signed catalog/
│   ├── scripts/              #   init_db.py · ingest_ofac.py
│   └── tests/                #   unit/ + integration/
├── frontend/                 # pnpm workspace
│   ├── docker-compose.yml    #   the backend-free /screen demo (origin + Caddy edge + SPA)
│   ├── app/                  #   React + Vite admin UI + backend-free /screen page (Dockerfile)
│   └── packages/
│       └── amlfilter-browser/#   @amlfilter/browser — in-browser sync + screening engine
├── docs/                     # ARCHITECTURE · QUICKSTART · DEPLOY · diagrams/
├── docker-compose.yml        # Postgres (pgvector) + Valkey + api + worker
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
