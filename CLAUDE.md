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
- **Cover the REAL artifacts, not stand-ins.** The e2e lanes must (also) verify the
  actual committed signed demo bundle (`frontend/app/public/bundle/origin/` — the signed
  `latest` pointer + content-hashed `manifest/` + `chunk/` files) against the actual
  pinned key (`frontend/app/public/public.key`) in-tab — not only a synthetic test
  bundle — so a bundle/key/verification regression is caught.
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
6. **Durable, offline cache**: verified bundle bytes are cached in the OPFS bundle store
   (separate from the customer DB) and **re-verified fail-closed on every load**; "Clear
   cached lists" is in `/settings`.

**Tech Stack**: React + TypeScript (Vite) SPA, a pnpm workspace, Biome, transformers.js
MiniLM (`Xenova/all-MiniLM-L6-v2`, 384-dim) running both in-tab and in-Node, SQLite-WASM
over OPFS (customers), an OPFS bundle store (the durable, verified list cache), and an
Ed25519-signed, content-addressed watchlist bundle (served same-origin).

## Common Commands

Everything is a pnpm workspace under `frontend/` — there is no root `package.json`; the
canonical `gate` script lives in `frontend/package.json`. Run all commands from `frontend/`.

```bash
cd frontend && pnpm install               # Install workspace dependencies

pnpm --filter aml-filter-app dev          # Vite dev server (default :5173); routes / /screen /customers /review /settings
pnpm --filter aml-filter-app build        # tsc --noEmit && vite build (prebuild downloads MiniLM weights + gen demo stats)
pnpm --filter aml-filter-app preview      # Serve the production build
```

### The gate — one command, from `frontend/` (CI literally runs this same script)
```bash
pnpm gate               # lint → typecheck → test → build → the 3 Playwright e2e lanes
```
Individual stages (what `gate` fans out to):
```bash
pnpm -r run lint        # Biome check across the workspace
pnpm -r run typecheck   # tsc across the workspace
pnpm -r run test        # Vitest across the workspace
pnpm -r run build       # Production build across the workspace
```

### e2e lanes (from `frontend/app`; all three are part of the gate)
```bash
pnpm test:e2e:c1        # Browser-engine e2e in real Chromium
pnpm test:e2e:kyc       # Backend-free local-first KYC journey in real Chromium
pnpm test:e2e:bundle    # Signed-bundle delta-sync boot (verify → OPFS → offline reload)
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

## Quality Gates (Non-Negotiable)

The canonical gate is **`pnpm gate`** from `frontend/`, and `ci.yml` literally runs that
same command — the gate mirrors CI exactly, in both directions.
Each rule below carries the real shipped scar that makes it non-negotiable:

- **CI runs `pnpm run gate`, never a hand-copied step list.** Scar: the gate lived as a
  documented "literal sequence" in README + CLAUDE.md while `ci.yml` maintained its own
  step copy — the 2026-07 standards pass found CI running a whole lane
  (`test:e2e:bundle`) that neither doc mentioned. Three places to say one thing is two
  drifts waiting.
- **The three real-Chromium e2e lanes are part of the gate, not optional extras.** Scar:
  an es2020 model-load crash, a silent boot hang, and the demo bundle failing in-tab
  signature verification all shipped through green units + green build — only the
  production-build browser lanes catch this class.
- **Scheduled workflows are CI: a red scheduled run is a red repo.** Scar: the weekly
  security-audit ran red for weeks unnoticed — live undici CVEs sat behind a green CI
  badge (advisories move without commits) — because scheduled lanes don't block merges.
  Check them explicitly (`gh run list --workflow=security-audit.yml`).
- **`pnpm audit` has no ignore list.** Every finding is fixed by upgrading the offending
  dependency (undici 7.26.0 → 7.28.0, 2026-07), never silenced.
- **gitleaks keeps the full upstream ruleset; exceptions live only in `.gitleaks.toml`,
  each with a documented why.** Scar: the full-history scan sat red on provably-dummy
  pre-v4 fixtures and the EU webgate's *public* download token — the fix is a documented
  allowlist, never a disabled scan or a trimmed ruleset.
- **Run the gate on dependabot branches before merging them.** Scar: the Biome 2.4 → 2.5
  group bump (PR #49) turned lint red via a NEW rule firing on a long-committed SVG — a
  green gate on main says nothing about a bumped toolchain.
- **Tag at release time — tag-forward-only.** Scar: the CHANGELOG reached 4.0.0
  while tags stopped at v2.1.0; CHANGELOG-only releases decay silently.

Composition floor (frontend-only — the codebase is entirely TypeScript):
- Biome (lint + format; its complexity rules are the TS stand-in for xenon)
- TypeScript strict mode; no `any`, no default exports
- Vitest for unit tests (incl. frozen parity goldens); Playwright for e2e

## WASM / edge-compute patterns

This repo ships two WASM / edge-compute patterns worth calling out:

- **Vendored WASM runtimes + parity-tested TS.** Real WASM executes inside
  vendored runtimes (transformers.js MiniLM over ORT-WASM, `@hpcc-js/wasm-zstd`); model
  weights are **self-hosted** (`frontend/app/public/models/`, populated by
  `scripts/download-model.mjs` — no CDN fetch at runtime), and engine behavior is pinned
  by frozen golden parity fixtures (scoring + tiering).
- **Browser storage = sqlite-wasm over OPFS.** Customer/KYC data lives in
  `@sqlite.org/sqlite-wasm` over OPFS (`@amlfilter/workstation` DB worker); verified
  bundle bytes live in the OPFS bundle store owned by the sync worker
  (`amlfilter-browser` `engine/sync/opfsStore.ts`). No IndexedDB list cache remains — the
  signed content-addressed bundle over OPFS is the single verified-list store.

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
Delta-sync the signed, content-addressed watchlist **bundle** — **the ONLY catalog/list
path** — same-origin from `/bundle/origin` (`VITE_BUNDLE_BASE_URL` only OVERRIDES the base
origin): the signed `latest` pointer → the content-hashed `manifest` → only the missing
deduplicated `chunk/` files. **Verify fail-closed** every byte (Ed25519 + SHA-256 against the
pinned `frontend/app/public/public.key`; any signature or hash mismatch aborts the load) →
decode the precomputed name vectors → embed the query name in-tab once → **brute-force
cosine** retrieval per list → explainable weighted scorer (`computeScore` / `PRESETS`:
`strict` / `balanced` / `lenient`; 5 signals — `name_vector`, `name_trigram`, `alias_match`,
`dob_match`, `country_match`). The `MultiListScreeningEngine` (`engine/multiEngine.ts`)
holds one index per list over a shared embedder, applies the per-list threshold
(`perList[id] ?? query.threshold ?? default`), and merges. Verified bundle bytes are cached
durably in the **OPFS bundle store** (`engine/sync/opfsStore.ts`, owned by the sync Web
Worker, separate from the customer DB), re-verified fail-closed on every load → offline
support; a zero-byte or integrity-failing chunk is evicted and re-fetched (self-healing).
Entry points: `EngineRuntime.bootstrap()` → `ScreeningEngine.screen({ name })`. (The
standalone `catalog.json` / per-list `watchlist.json` JSON fetch path and its IndexedDB list
cache were **retired** — the signed content-addressed bundle over OPFS is now the only
transport.)

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

### Signed-bundle distribution
The lists ship as a signed, content-addressed **bundle** served same-origin from
`/bundle/origin`: a signed `latest` pointer → a content-hashed `manifest` → deduplicated
`chunk/` CAS files. The browser verifier is **fail-closed** (Ed25519 + SHA-256 over the
pinned public key) for the pointer, manifest, and every chunk — over fetched and cached bytes
alike; any signature or hash mismatch aborts the load, with no silent empty list.

### Key Patterns
- **One scoring contract**: the TS scorer emits a numeric score plus `reasons[]` with a
  plain-language `explanation`. The scorer is the source of truth and is parity-locked by a
  frozen golden snapshot (see Testing).
- **Local-first**: customer data lives only in the browser (SQLite-WASM over OPFS) and
  never leaves the machine; verified list bytes cache durably in the OPFS bundle store
  (separate store).
- **Fail closed** on trust: catalog + list verification aborts on any signature/hash
  mismatch — over fetched and cached bytes alike.
- **Review once, re-review on material change**: a `material_fingerprint` gates whether a
  re-screened match stays suppressed or flags `CHANGED`; the `match_events` trail is
  append-only during the customer's lifecycle. Explicit customer deletion atomically
  erases its matches, events, reviewer identity, and notes.

### Entry Points
- Frontend app: `frontend/app/src/main.tsx`
- In-browser screening engine: `frontend/packages/amlfilter-browser` (`EngineRuntime.bootstrap()`)
- Local-first KYC tier: `frontend/packages/amlfilter-workstation`
- Signed-watchlist publisher: `frontend/packages/amlfilter-publisher`

## Testing

Unit tests run under **Vitest**; end-to-end runs under **Playwright** in real Chromium.

Three e2e lanes (`frontend/app`), all driving the **minified production build** against the
**committed signed demo catalog**:
- `pnpm test:e2e:c1` — the browser-engine lane (incl. an offline-cache spec).
- `pnpm test:e2e:kyc` — the **backend-free local-first journey**: onboard → auto-screen →
  review → resolve. Its webServers are `vite preview` + the static catalog server only.
- `pnpm test:e2e:bundle` — the signed-bundle delta-sync lane: verify → OPFS → offline
  reload.

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
