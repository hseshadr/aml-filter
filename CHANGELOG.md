# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Live match-strictness slider on `/screen`** (Lenient / Balanced / Strict) — gates
  candidate generation on lexical (trigram) relevance to the query, cutting
  embedding-baseline false positives. Search-layer only; the scoring contract and
  cross-path parity are untouched. (#8)
- **Cross-language scoring parity test + drift-guard** — the TS scorer is now asserted
  against a golden emitted by the Python source of truth (`scripts/gen_scoring_golden.py`),
  with a `poe scoring-golden-check` guard so the two sides cannot silently diverge. (#5)
- **Bundle↔key drift-guard test** — fails closed if the committed demo bundle
  (`backend/examples/catalog`) stops verifying against the pinned key
  (`frontend/app/public/public.key`), and boot errors now name the bundle origin. (#9)
- **Overridable demo ports** — `AML_EDGE_PORT` / `AML_SPA_PORT` let the `/screen` demo
  run when the default ports are taken. (#7)

### Changed

- **Honest claims pass.** Corrected the overstated "byte-compatible scoring" claim by
  fixing a multi-country description divergence on both sides (deterministic sorted
  output) and dropping the unsupported embedder-parity claim. (#5)
- **Honest security docs.** Documented Row Level Security as currently inert scaffolding
  — the app layer is the real tenant-isolation control — and clarified that the
  `X-API-Key` scope applies only to the DB-backed `POST /v1/screen` HTTP tier; also
  fixed a GUC-name / "set by middleware" doc bug. (#12)
- **Smaller `/screen` payload.** Code-split the admin routes out of the `/screen`
  bundle. (#11)
- **More reliable e2e CI.** The Playwright e2e job now fetches the MiniLM model weights
  from the `model-weights-v1` GitHub Release asset instead of live Hugging Face (which
  429s GitHub runners); `download-model.mjs` honors `Retry-After` and backs off on
  429/5xx. (#15)

### Fixed

- **`/screen` in-browser boot hang.** Added boot-path timeouts and a StrictMode-safe
  Retry, self-hosted SHA-256-pinned MiniLM weights (no runtime HF CDN dependency), and
  model-load progress. (#6)
- **Unrecoverable signature failure from HTTP cache.** The mutable `/latest` bundle
  pointer is now fetched with `cache: "no-store"`, so a stale cached pointer can no
  longer poison signature verification. (#10)
- **Confusing port-collision failures.** A foreign bundle served on a colliding port no
  longer looks like a crypto failure — the demo diagnoses the collision (no crypto
  change). (#9)

### Security

- Constrained `pip >= 26.1.2` to clear PYSEC-2026-196. (#10)

## [2.1.0] — 2026-05-31

Built on the [edge-proc](https://github.com/hseshadr/edge-proc) substrate:
sanctions screening now runs **at the edge**. The OFAC list can be published as a
signed, versioned bundle and screened against locally — on the server with no vector
database, or entirely in a browser tab with no backend at all.

### Added

- **edge-proc localvec retrieval** (`aml_filter/search/localvec_backend.py`) — a
  drop-in for the pgvector ANN backed by edge-proc's FAISS `IndexFlatIP`, preserving
  aml's list/tenant filter semantics. Persisted via `VECTOR_INDEX_DIR`.
- **Signed OFAC bundle + `amlfilter` CLI** (`aml_filter/bundle/`,
  `aml_filter/cli.py`) — `keygen` / `bundle` / `sync` / `screen`. Publishes the list
  as a content-addressed, Ed25519-signed edge-proc bundle (`entities.jsonl` +
  prebuilt localvec `vector/` index + `ofac_meta.json` version pointer) and screens
  against it with fail-closed verification.
- **Config-gated, Postgres-free screening read-path** — `BUNDLE_BASE_URL` +
  `VERIFY_KEY_PATH` (+ `BUNDLE_CACHE_DIR`) source candidates from a synced bundle
  instead of a database (`aml_filter/bundle/runtime.py`).
- **In-browser screening tier** — `@amlfilter/browser`
  (`frontend/packages/amlfilter-browser/`), vendoring edge-proc's browser sync
  engine and porting the explainable scorer, plus a backend-free `/screen` page that
  syncs the signed bundle and screens names in-tab. Parity-tested against the Python
  runtime.

### Changed

- The frontend is now a **pnpm workspace** (`app/` + `packages/amlfilter-browser/`).
- Candidate generation is documented per path: hybrid search (pgvector + pg_trgm) on
  the DB path; localvec + a trigram stand-in on the bundle/browser path. The
  explainable `reasons[]` + `explanation` contract is identical across all three.
- `README.md`, `docs/ARCHITECTURE.md`, and `docs/QUICKSTART.md` updated to hero the
  edge-proc substrate and document both the server and in-browser paths.

## [2.0.0] — 2026-05-30

Public-launch readiness: a teen-readable two-altitude README, legal attribution and
disclaimers for the OFAC sanctions data, a green strict quality gate, and CI.

### Added

- `LICENSE` (MIT) and `NOTICE` — OFAC SDN attribution (public domain, never bundled)
  plus a prominent not-legal-advice / not-a-compliance-product disclaimer.
- Two-altitude `README.md` — a plain-language front door (what/why, one-command demo)
  over an "Under the hood" developer section.
- `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, and d2 diagrams (`docs/diagrams/`:
  `system-context`, `screening-pipeline`) with rendered SVGs.
- GitHub Actions CI: `.github/workflows/ci.yml` (backend gate) and
  `frontend.yml` (lint/typecheck/test/build + Playwright e2e).
- Typed, env-overridable configuration for scoring presets (`SCORING_*`) and
  rate-limit tiers (`RATE_LIMIT_*`), replacing in-source magic numbers.
- Frontend unit tests (vitest + Testing Library) for the API client, auth context,
  and error boundary.

### Changed

- Fail-closed configuration: a missing `DATABASE_URL` now aborts startup with an
  explicit error instead of silently degrading.
- Eliminated all `dict[str, Any]` from the backend in favour of precise Pydantic
  models and typed JSON aliases (`aml_filter/types.py`).
- Decomposed over-complex functions to the strict floor (≤15-line functions,
  Radon Grade A); `mypy --strict` clean across the backend.
- Frontend tooling moved from bun + eslint to **pnpm + Biome**, matching the
  portfolio standard.

### Removed

- Legacy `DEPLOYMENT_READY.md` status doc and `docs/archive/` implementation notes.
