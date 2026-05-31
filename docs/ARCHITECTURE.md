# Architecture

aml-filter is a FastAPI service that screens a query name against the OFAC SDN
sanctions list and returns a **scored, explained** result. One request path:
normalize the name → generate candidates with hybrid search → score each
candidate with a transparent weighted policy → threshold → return matches with
per-signal reasons.

Three pieces, one database:

- **`backend/aml_filter/api/`** — FastAPI app + the `/v1` routers. `POST /v1/screen` is the front door.
- **`backend/aml_filter/{search,scoring,embedding}/`** — the screening engine: hybrid retrieval, the weighted scorer, the local embedder.
- **PostgreSQL (pgvector + pg_trgm)** — stores sanctioned entities, their name embeddings, and trigram indexes. Redis/Valkey backs rate limiting and the batch-screening worker queue.

## System context

![system context](diagrams/system-context.svg)

A client POSTs a name to the API. The search service embeds and normalizes it,
asks PostgreSQL for candidates two ways (vector + lexical), scores them, and
returns matches. The sanctioned-entity data is loaded ahead of time from the
**official OFAC source** (the list is never bundled — see [`../NOTICE`](../NOTICE)).

## Screening pipeline

![screening pipeline](diagrams/screening-pipeline.svg)

A `POST /v1/screen` request (`SearchQuery`: `name`, optional `dob`, `country`,
`entity_type`, plus `threshold` and `k`) flows through five stages:

1. **Normalize** — `aml_filter/domain/normalization.py` lower-cases the name,
   strips accents and honorifics, and canonicalizes it so spelling and
   diacritic noise don't break the match.
2. **Embed** — the normalized name is embedded by a local sentence-transformers
   model (`aml_filter/embedding/`), with an in-process cache.
3. **Candidate generation (hybrid search)** — `aml_filter/search/hybrid_search.py`
   takes the **union** of two retrievals over sanctioned entities:
   - **Vector** (`pgvector_backend.py`) — cosine similarity over name embeddings;
     catches transliterations and near-spellings.
   - **Lexical** (`lexical_backend.py`) — `pg_trgm` trigram similarity; catches
     typos and partial names.
   Each candidate carries a `vector_score` and/or `lexical_score`.
4. **Score** — `aml_filter/scoring/policy.py` (`DefaultScoringPolicy`) turns
   each candidate into a final score plus a `MatchExplanation`.
5. **Threshold → decision** — candidates at or above the request `threshold`
   become `matches`; the rest are dropped.

The orchestration lives in `aml_filter/search/service.py` (`SearchService.search`),
which assembles the `SearchResponse` (`request_id`, `matches[]`,
`list_versions_used`, `execution_time_ms`).

## Scoring & explainability contract

The score is **not** a black box. `DefaultScoringPolicy.compute_score` sums
weighted signals, and emits each one as a `MatchSignal`:

```
final_score = Σ ( weight_i × value_i )      # clamped to [0, 1]
```

Signals: `name_vector`, `name_trigram`, `alias_match`, `dob_match`,
`country_match`. Weights come from a named **preset** — each preset is a
`ScoringWeights` + `threshold` pair:

| Preset | name_vector | name_trigram | alias | dob | country | threshold |
| --- | --- | --- | --- | --- | --- | --- |
| strict | 0.60 | 0.25 | 0.05 | 0.05 | 0.05 | 0.75 |
| balanced | 0.55 | 0.20 | 0.10 | 0.10 | 0.05 | 0.65 |
| lenient | 0.50 | 0.15 | 0.15 | 0.10 | 0.10 | 0.55 |

Every match in the API response carries:

- `reasons[]` — the weighted signals, each with `value`, `weight`, and
  `contribution` (`weight × value`).
- `explanation` — a plain-language summary (e.g. _"Match due to: strong vector
  similarity, country match"_).

This is the load-bearing contract: **a reviewer can always see why a score is
what it is.** If you change the signal set or the preset weights, the
explanation shape changes with it — keep the scorer and its tests in lockstep.

## Data model (high level)

Stored in PostgreSQL (`aml_filter/db/models.py`), populated by ingestion:

- **Entity** — a sanctioned person or organization: `entity_id`, `primary_name`,
  `entity_type`, `risk_category` (SANCTION / PEP / CUSTOM / WHITELIST),
  `source_list`, `list_version`, plus `countries[]` and `dob[]`.
- **Alias** — alternate names for an entity (with canonical forms), used by the
  `alias_match` signal.
- **Name embedding** — the pgvector vector per name, built at ingest time by the
  same local embedder used at query time (so query and corpus live in the same
  space).
- **SearchRequest** — an audit row per screening call.

The query/response shapes (`SearchQuery`, `Match`, `MatchReason`,
`MatchSignal`, `MatchExplanation`, `SearchResponse`) are Pydantic models in
`aml_filter/domain/search.py` — the typed contract at the API boundary.

## Ingestion (loading the OFAC list)

aml-filter does not ship the SDN list. The operator downloads it from the
official OFAC source and ingests it:

- `aml_filter/ingest/parsers/ofac.py` parses the OFAC SDN XML.
- `aml_filter/ingest/service.py` (`IngestionService.ingest_ofac_sdn`) upserts
  entities + aliases, builds embeddings, and stamps a `list_version`.
- `scripts/ingest_ofac.py <sdn.xml> [list_id] [version]` is the CLI wrapper.

See [`QUICKSTART.md`](QUICKSTART.md) for the end-to-end load and
[`../NOTICE`](../NOTICE) for the source and public-domain status of the list.

## Where config lives

All runtime configuration is env-driven through Pydantic `BaseSettings` in
`aml_filter/config.py` — no hardcoded knobs:

- `DATABASE_URL` — async Postgres DSN. Required; the app fails closed without it.
- `REDIS_URL` — Redis/Valkey for rate limiting + the worker queue.
- `SCREENING_QUEUE_NAME` — RQ queue name for batch jobs.

Copy `.env.example` → `.env` to set them. See [`DEPLOY.md`](DEPLOY.md) for the
deployment surface.

## Invariants (load-bearing rules)

- **Explainability is non-negotiable.** Every match carries its signal
  breakdown. Don't add a scoring path that returns a bare number.
- **The list is never bundled.** It's downloaded from OFAC at runtime. Keep it
  out of the repo and out of any container image.
- **Same embedder, query and corpus.** Query names and stored names must be
  embedded by the same model, or vector similarity is meaningless.
- **Fail closed on config.** Missing `DATABASE_URL` aborts startup with an
  explicit error rather than silently degrading.

## Further reading

- [`QUICKSTART.md`](QUICKSTART.md) — clone → gate → load a list → screen a name.
- [`DEPLOY.md`](DEPLOY.md) — docker-compose, env vars, refreshing the OFAC list.
- [`diagrams/`](diagrams/) — d2 sources (`system-context.d2`, `screening-pipeline.d2`) + rendered SVGs.
- [`../NOTICE`](../NOTICE) — OFAC attribution and the not-a-compliance-product disclaimer.
