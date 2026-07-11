# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Self-hosted ORT wasm loader (§8.1b)** — onnxruntime-web dynamically imports its wasm
  loader module (`ort-wasm-simd-threaded.asyncify.mjs` + sibling `.wasm`) from the
  jsDelivr CDN at runtime; a cold audit with jsDelivr aborted proved /screen never
  reached ready. Fixed end-to-end: `scripts/stage-ort-wasm.mjs` stages the pair from the
  lockfile-pinned node_modules into `public/ort/` on every `prebuild`,
  `env.backends.onnx.wasm.wasmPaths = "/ort/"` (embedder) makes the import same-origin,
  a dev-server middleware keeps dev === prod, and the C1 cold spec now aborts jsDelivr
  permanently alongside the HF globs (context-level routing, so Worker requests are
  covered). Includes a Cloudflare Pages 25 MiB asset-size preflight over the staged ORT
  runtime and the pinned model manifest, so a runtime/model bump fails in CI, not on
  deploy.
- **Canonical `pnpm gate`** (`frontend/package.json`): one command fanning out to Biome
  lint → tsc typecheck → Vitest units → production build → all three Playwright e2e
  lanes. `ci.yml` now literally runs `pnpm run gate`, so the local gate and CI cannot
  silently drift (ENGINEERING-STANDARDS §3/§4).
- **`.gitleaks.toml` documented allowlist** — full upstream ruleset kept; the only
  exceptions are verified false positives (pre-v4 dummy docs/test fixture keys on
  deleted paths, and the EU webgate's public non-rotating list-download token). The
  weekly full-history secret scan is green again.
- **CLAUDE.md**: scarred "Quality Gates (Non-Negotiable)" section and the
  ENGINEERING-STANDARDS §8 declaration (exemplar for §8.1(b) vendored/self-hosted WASM
  runtimes + parity-tested TS and §8.1(c) sqlite-wasm-over-OPFS).
- **README 4-part TL;DR** (what / why it works / worked example / core invariants).

### Fixed

- **Weekly security-audit red** — `undici` (transitive via `jsdom`) bumped 7.26.0 →
  7.28.0 in the lockfile, clearing GHSA-hm92-r4w5-c3mj and the undici header-injection
  advisory; `pnpm audit --audit-level low` is clean again with no suppressions.
- **Action floors (§4)**: `gitleaks/gitleaks-action` v2 → v3; `astral-sh/setup-uv`
  full-pinned 8.2.0 → 8.3.2 (no floating major tag exists).

### Changed

- **Signed content-addressed bundle is now the only watchlist transport.** The browser
  delta-syncs a signed `latest` pointer → content-hashed `manifest` → deduplicated
  `chunk/` files, verifies every byte fail-closed (Ed25519 + SHA-256) against the pinned
  key, and materializes the catalog + per-list files into the durable OPFS store. The
  standalone `catalog.json` / per-list `watchlist.json` fetch path was retired.
- **OSS presentation pass** — README and docs aligned to the signed-bundle reality, plus
  a guarded (inert-until-secrets) Cloudflare Pages deploy workflow for the static SPA.

## [4.0.0] — 2026-06-20

> _Release tags v2.2–v3.x were never cut; per the tag-forward-only rule
> (ENGINEERING-STANDARDS §5) the `v4.0.0` tag is cut at the 2026-07 standards-alignment
> merge commit — history is not backfilled._

**From a single-list screener to a watchlist-filtering + KYC-review product.** aml-filter
still runs entirely in the browser tab — zero-server, pure-TypeScript — but it now screens
against **multiple sanctions lists** you select, wraps the matches in an **enterprise
review workflow** with an immutable audit trail, and **caches the lists durably** so it
works offline. Shipped on branch `feat/review-tool-v4`.

### Added

- **Multi-list screening.** A `WatchlistSource` adapter (`@amlfilter/publisher`
  `src/sources/`) per list — **OFAC SDN, EU, UN, UK/OFSI** — each with `fetchRaw()` +
  `parse()`. The publisher emits a **signed `catalog.json`** registry plus per-list signed
  artifacts under `watchlist/<id>/`, and the browser's `MultiListScreeningEngine`
  (`engine/multiEngine.ts`) holds one vector index per list over a single shared embedder,
  screening across all enabled lists and merging the results. _(OFAC/UN `fetchRaw` are live;
  EU/UK `fetchRaw` are scaffolded — real endpoint URL + a `TODO` for the access token /
  asset path — while all four `parse()` are real and fixture-tested.)_
- **List selection + per-list thresholds.** `/settings` lets you enable/disable lists and
  set a per-list sensitivity override; the engine applies
  `perList[id] ?? query.threshold ?? default`.
- **Enterprise review tool.** A `/settings` page (sensitivity Strict/Balanced/Lenient,
  per-list overrides, watchlist selection, analyst name) and a review board with a **View
  filter** (All / Needs review / Changed only), a **Source** column, a **"CHANGED — needs
  re-review"** badge, and a per-match **History drawer** backed by an append-only
  `match_events` audit trail (`DETECTED` / `DISPOSITIONED` / `REOPENED` / `CHANGED` /
  `SUPPRESSED`).
- **Review-once / re-review-on-material-change.** A `material_fingerprint`
  (`@amlfilter/workstation` `fingerprint.ts`) hashed over the customer's and matched
  entity's identity fields: an unchanged match stays suppressed with its prior disposition;
  a materially-changed one is flagged `CHANGED` while keeping the prior disposition.
- **Durable IndexedDB list cache** (`@amlfilter/browser` `engine/listCache.ts`,
  `watchlistCache.ts`) — verified list bytes cached in a store separate from the customer
  DB, **re-verified fail-closed on every load**, enabling **offline** screening. "Clear
  cached lists" lives in `/settings`.

### Changed

- **Single signed watchlist → signed catalog + per-list artifacts.** The browser now loads
  `watchlist/catalog.json` (verified first) and then each enabled list, instead of one flat
  `watchlist.json`. The v3 per-list file format is unchanged — it is exactly the N=1 case.
- **Namespaced entity ids.** Every adapter stamps `entity_id = "<source_list>:<rawId>"`
  (e.g. `OFAC_SDN:12345`) so ids stay unique once lists are merged into one engine.
- **SQLite schema bumped to v2** (`SCHEMA_VERSION = 2`): `kyc_matches` gains
  `material_fingerprint` and `review_state`; a new append-only `match_events` table records
  the audit trail.

## [3.0.0] — 2026-06-19

**The pivot to zero-server.** aml-filter is now a free, **pure-TypeScript, in-browser**
AML/sanctions screening app — no backend, no database, no signup. The entire
Python/FastAPI/Postgres server tier was removed; screening, customer storage, and
watchlist sync all run in the browser tab. (Closes #13, #16, #23 as won't-fix — there is
no Postgres, no server, and no torch left to fix.)

### Added

- **Signed-watchlist publisher** (`@amlfilter/publisher`) — fetch OFAC SDN → embed names
  with **transformers.js in Node** (no torch, no Python) → Ed25519-sign
  `{version, entities, vectors}` → emit 4 signed static files. Wire format documented in
  [`docs/WATCHLIST_FORMAT.md`](docs/WATCHLIST_FORMAT.md); published by
  `.github/workflows/publish-watchlist.yml`.
- **Bidirectional auto-rescan** — a watchlist change re-screens every customer; a
  customer change re-screens just that customer. Sync runs on app-open and via a
  "Check for updates" button. A resolved match keeps its disposition across rescans.
- **In-tab signed-watchlist load** — the browser engine verifies the watchlist
  **fail-closed** (Ed25519 / WebCrypto) and loads precomputed name vectors; only the
  query / customer name is embedded in-tab, so cold start stays fast.

### Changed

- **Screening engine** now consumes a single signed JSON watchlist + brute-force cosine,
  replacing the chunked content-addressed bundle + FAISS index (and its OPFS/zstd/GearCDC
  sync tier, ~1.5k lines, removed).
- **Goldens are now frozen committed regression snapshots** — the TS scorer/tiering is the
  single source of truth (the Python golden generators were removed with the backend).
- **Frontend majors**: React 18→19, React Router 6→7, Vite 7→8, `@vitejs/plugin-react`
  5→6, TypeScript 5→6.
- **CI is pure pnpm** — Biome → tsc → Vitest → build → Playwright C1 + KYC e2e.

### Removed

- **The entire Python/FastAPI server tier**: Postgres/pgvector, alembic + RLS,
  multi-tenancy / API-keys / rate-limiting, batch + RQ workers, OFAC ingest, the DB-path
  search backends, the `amlfilter` CLI, torch / sentence-transformers, and docker-compose.
- The dead admin/auth SPA surface (login, the 8 server-tier pages, the axios client,
  `@tanstack/react-query`).
- `docs/API_SPEC.md` and `docs/DATABASE_SCHEMA.md` (no HTTP API, no SQL schema).

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
