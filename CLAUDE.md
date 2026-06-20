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
  committed demo catalog (`frontend/app/public/watchlist/` — `catalog.json(.sig)` plus the
  per-list dirs `ofac/ eu/ un/ uk/`, each with `watchlist.json(.sig)` +
  `watchlist.manifest.json(.sig)`) against the actual pinned key
  (`frontend/app/public/public.key`) in-tab — not only a synthetic test catalog — so a
  catalog/list/key/verification regression is caught.
- If a browser pass genuinely cannot be run in the harness, **say so explicitly and state
  what remains unverified** — never imply a screen works that you did not watch work.

## Project Overview

aml-filter v4 is a free, **zero-server, pure-TypeScript, in-browser** watchlist-filtering
and KYC-review app. There is **no backend, no signup, no database server** — the entire
product runs in the tab. The flow:

1. Open the app in a browser → it downloads a **signed catalog of sanctions lists** (OFAC
   SDN, EU, UN, UK/OFSI) and **verifies the catalog and every enabled list in-tab**
   (Ed25519, fail-closed — any signature/hash mismatch aborts the load). Lists are
   selectable in `/settings`, with per-list thresholds.
2. You load your customers (the **whitelist**) → they are kept **locally** in SQLite-WASM
   over OPFS and **never leave the machine**.
3. It screens every customer across all enabled lists **entirely in the browser** and
   returns a **scored, explained** result tagged with its source list.
4. **Review workflow**: each match is reviewed once; a re-screen only re-flags it
   (`CHANGED`) when a `material_fingerprint` over the customer + matched-entity data
   changes. Dispositions are written to an append-only `match_events` audit trail.
5. **Bidirectional sync**: a list change re-screens all customers; a customer change
   re-screens just that customer.
6. **Durable, offline cache**: verified list bytes are cached in IndexedDB (separate from
   the customer DB) and **re-verified fail-closed on every load**; "Clear cached lists" is
   in `/settings`.

**Tech Stack**: React + TypeScript (Vite) SPA, a pnpm workspace, Biome, transformers.js
MiniLM (`Xenova/all-MiniLM-L6-v2`, 384-dim) running both in-tab and in-Node, SQLite-WASM
over OPFS (customers), IndexedDB (durable list cache), and an Ed25519-signed catalog of
static watchlist files (served same-origin).

## Common Commands

Everything is a pnpm workspace under `frontend/` — **there is no root `package.json` and
no `gate` script**. Run all commands from `frontend/`.

```bash
cd frontend && pnpm install               # Install workspace dependencies

pnpm --filter aml-filter-app dev          # Vite dev server (default :5173); routes / /screen /customers /review /settings
pnpm --filter aml-filter-app build        # tsc --noEmit && vite build (prebuild downloads MiniLM weights + gen demo stats)
pnpm --filter aml-filter-app preview      # Serve the production build
```

### The gate — the literal sequence (NOT a single `gate` script), from `frontend/`
```bash
pnpm -r run lint        # Biome check across the workspace
pnpm -r run typecheck   # tsc across the workspace
pnpm -r run test        # Vitest across the workspace
pnpm -r run build       # Production build across the workspace
```

### e2e lanes (from `frontend/app`)
```bash
pnpm test:e2e:c1        # Browser-engine e2e in real Chromium
pnpm test:e2e:kyc       # Backend-free local-first KYC journey in real Chromium
```

### Publish signed lists (from `frontend/`)
```bash
pnpm --filter @amlfilter/publisher run build-demo-multilist  # Build the committed multi-list demo catalog (what the app loads)
pnpm build-demo-list    # Build the legacy single-list demo watchlist
pnpm publish-list       # Build a production single-list watchlist; CLI flags: --in --version --key --out [--models]
```

**Note**: the frontend is a **pnpm workspace** (`pnpm` + **Biome**, not bun / ESLint /
Prettier). Three packages: `frontend/app` (the React app),
`frontend/packages/amlfilter-browser` (`@amlfilter/browser`, the in-browser screening
engine), and `frontend/packages/amlfilter-workstation` (`@amlfilter/workstation`, the
local-first KYC tier — SQLite-WASM/OPFS DB worker + TS tiering/onboarding/review +
fingerprint-based re-review + the `match_events` audit trail). There
is also `frontend/packages/amlfilter-publisher` (`@amlfilter/publisher`, the Node-side
signed-watchlist publisher). Always use `pnpm` for frontend package management.

## Code Quality Requirements

Frontend-only — the codebase is entirely TypeScript.
- Biome (lint + format)
- TypeScript strict mode; no `any`, no default exports
- Vitest for unit tests; Playwright for e2e
- The gate is the literal `lint → typecheck → test → build` sequence above (it mirrors CI)

## Architecture

The product is **three TypeScript units**. The screening pipeline shape is constant:
normalize → embed → vector candidate retrieval → transparent weighted scoring → threshold
→ return matches with per-signal reasons.

### 1. Publisher — `frontend/packages/amlfilter-publisher` (`@amlfilter/publisher`)
The Node-side build step: per-list `WatchlistSource` adapters (`src/sources/`: OFAC SDN,
EU, UN, UK/OFSI; each `fetchRaw()` + `parse()`) → normalize → embed names with
transformers.js **in Node** (no torch, no Python) → Ed25519-sign each list's 4 static
files under a per-list dir → emit a **signed `catalog.json`(.sig)** registry. Entity IDs
are namespaced (`OFAC_SDN:…`). **OFAC/UN `fetchRaw` are live; EU/UK `fetchRaw` are
scaffolded** (real URL + TODO); all four `parse()` are real + fixture-tested. The
committed demo catalog is built by `build-demo-multilist`. The single-list `publish` CLI
(run by `.github/workflows/publish-watchlist.yml` for OFAC) still emits the flat 4-file
set. Wire format: `docs/WATCHLIST_FORMAT.md`.

### 2. Browser engine — `frontend/packages/amlfilter-browser` (`@amlfilter/browser`)
Fetch + **verify fail-closed** the signed `catalog.json` (the trust anchor), then each
enabled list (`verifyEd25519` against the pinned `frontend/app/public/public.key`) → decode
the precomputed name vectors → embed the query name in-tab once → **brute-force cosine**
retrieval per list → explainable weighted scorer (`computeScore` / `PRESETS`: `strict` /
`balanced` / `lenient`; 5 signals — `name_vector`, `name_trigram`, `alias_match`,
`dob_match`, `country_match`). The `MultiListScreeningEngine` (`engine/multiEngine.ts`)
holds one index per list over a shared embedder, applies the per-list threshold
(`perList[id] ?? query.threshold ?? default`), and merges. Verified bytes are cached in a
durable **IndexedDB** store (`engine/listCache.ts`, separate from the customer DB,
re-verified fail-closed every load → offline support). Entry points:
`EngineRuntime.bootstrap()` → `ScreeningEngine.screen({ name })`. (The old chunked-CAS /
OPFS / GearCDC / zstd sync tier and `EngineClient` were **removed**; the `./engine` export
is now just the crypto primitives.)

### 3. Workstation — `frontend/packages/amlfilter-workstation` (`@amlfilter/workstation`) + `frontend/app`
A **SQLite-WASM/OPFS DB worker** (schema v2, `SCHEMA_VERSION = 2`; tables `customers`,
`kyc_matches` (+ `material_fingerprint`, `review_state`), append-only `match_events`,
`settings`) holds customers + match history; the workstation supplies onboarding, review,
tiering, and the **bidirectional rescan** (`rescan.ts`: `screenCustomer(customerId)`,
`rescanAll()`, `syncWatchlist(version)`). **Review-once / re-review-on-change**:
`fingerprint.ts` hashes the customer + matched-entity identity fields; `planReplacement`
(`db/operations.ts`) keeps an unchanged match suppressed with its prior disposition and
flags a materially-changed one `CHANGED`. `match_events` (`appendEvent`, INSERT-only) is
the audit trail the review board's History drawer reads. The `/settings` page configures
sensitivity, per-list thresholds, list selection, and analyst name. Tiering
(`classifyTier`) maps a score to **STRONG** (≥0.8) / **POSSIBLE** (≥ the preset threshold)
/ **WEAK**; it is layered on top of scoring and **never alters the score**.

### Signed-catalog distribution
The lists ship as plain **signed static files** served same-origin: a signed `catalog.json`
registry over per-list `watchlist.json`/`manifest` files. The browser verifier is
**fail-closed** (Ed25519 over the pinned public key) for the catalog and every list — over
fetched and cached bytes alike; any signature or hash mismatch aborts the load, with no
silent empty list.

### Key Patterns
- **One scoring contract**: the TS scorer emits a numeric score plus `reasons[]` with a
  plain-language `explanation`. The scorer is the source of truth and is parity-locked by a
  frozen golden snapshot (see Testing).
- **Local-first**: customer data lives only in the browser (SQLite-WASM over OPFS) and
  never leaves the machine; lists cache durably in IndexedDB (separate store).
- **Fail closed** on trust: catalog + list verification aborts on any signature/hash
  mismatch — over fetched and cached bytes alike.
- **Review once, re-review on material change**: a `material_fingerprint` gates whether a
  re-screened match stays suppressed or flags `CHANGED`; the `match_events` trail is
  append-only.

### Entry Points
- Frontend app: `frontend/app/src/main.tsx`
- In-browser screening engine: `frontend/packages/amlfilter-browser` (`EngineRuntime.bootstrap()`)
- Local-first KYC tier: `frontend/packages/amlfilter-workstation`
- Signed-watchlist publisher: `frontend/packages/amlfilter-publisher`

## Testing

Unit tests run under **Vitest**; end-to-end runs under **Playwright** in real Chromium.

Two e2e lanes (`frontend/app`), both driving the **minified production build** against the
**committed signed demo catalog**:
- `pnpm test:e2e:c1` — the browser-engine lane (incl. an offline-cache spec).
- `pnpm test:e2e:kyc` — the **backend-free local-first journey**: onboard → auto-screen →
  review → resolve. Its webServers are `vite preview` + the static catalog server only.

**Parity is frozen committed golden JSON snapshots** — the TS implementation is the source
of truth (the former Python golden generators were deleted):
- Scoring: `frontend/packages/amlfilter-browser/src/engine/__fixtures__/scoring/golden.json`
- Tiering: `frontend/packages/amlfilter-workstation/src/__fixtures__/tiering/golden.json`

## Documentation

Front-door docs live in `/docs` (the root `README.md` is the canonical index):
- `ARCHITECTURE.md` - the in-browser pipeline, the three TypeScript units, the scoring contract
- `QUICKSTART.md` - clone → install → run the app → screen a name, all in the browser
- `DEPLOY.md` - building and hosting the static app + refreshing the signed lists
- `WATCHLIST_FORMAT.md` - the signed catalog + per-list wire format
- `diagrams/` - d2 sources + rendered SVGs
