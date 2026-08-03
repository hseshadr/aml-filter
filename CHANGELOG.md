# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Retrieval recall is measured, published, and gated — it never was before.** The
  product exists to find a sanctioned entity whose name is spelled differently, and
  nothing in the repository measured whether it does: no labelled set, no recall@k, no
  query→expected-entity fixture anywhere. The scoring golden froze
  `computeScore(entity, query)` on pre-selected pairs and never touched retrieval, so it
  passed at any recall. A new harness (`amlfilter-publisher/src/recall`) rebuilds the
  screening engine over a frozen 19,181-entity OFAC SDN snapshot with the real MiniLM
  embedder and screens labelled queries derived from the feed's own published aliases —
  every alias is a known-true variant of a known parent, which yields **24,026 labelled
  pairs with no human labelling and no involvement from the ranker being measured**. The
  first number, at the parameters `/screen` actually sends (threshold 0.30, k 25):
  alias-derived queries **recall@1 0.5930, @10 0.6185, @25 0.6195, and 38.05% where the
  true entity appears nowhere in the results**; canonical-name queries 0.9995 across the
  board. Reported as two segments and never averaged — looking an entity up by its own
  indexed name works, looking it up by a name OFAC publishes for that same entity fails
  about two times in five. `pnpm gate` now fails when any of those drops below the
  committed measured floors. **The gate was watched failing:** re-narrowing retrieval
  from `search(queryVec, k * 2)` to `search(queryVec, 1)` leaves all 510
  `@amlfilter/browser` tests green (exit 0) and drives alias recall@10 to 0.3885 — the
  recall gate exits 1 on four breached floors, and goes green again on restore. See
  [docs/RECALL.md](docs/RECALL.md).
- **The Ed25519 signature check is now actually tested.** The score-receipt suite had
  two "tamper" tests and neither one ever reached the signature: the mutated-score case
  leaves a stale `payload_hash` and dies at the content-hash compare, and the wrong-key
  case dies at the signer compare. Measured, not assumed — forcing avow's Ed25519
  verdict to always-succeed left all 366 tests in `@amlfilter/browser` green. A new test
  builds a genuinely valid receipt and flips **one hex nibble of the `signature` only**,
  leaving `payload_hash` and `public_key` correct, so both earlier gates pass and control
  reaches the Ed25519 check. Under that same always-succeed mutation this test — and only
  this test — turns red. No verification behavior changed; this is test coverage only.
- **Visible, verifiable score receipts** — every scored match card on `/screen` now
  renders its signed Avow receipt through `@edgeproc/receipt-ui` (v0.1.0): a compact
  icon+text verdict badge beside the score (WCAG 1.4.1 — never color-only) and a
  "Score receipt" disclosure with the full envelope (algorithm, signer key, payload
  hash, signature) plus the sealed subject (score, tier, engine and watchlist
  versions, inputs hash). Verification is fail-closed against this install's own
  key — the same localStorage seed the engine's sealer signs with — with three
  distinct non-verified states: pending, tampered/invalid signature, and untrusted
  signer. Guarded property-based end to end: the C1 e2e re-keys the store under the
  sealer's pinned key and asserts the badge drops to "untrusted signer".

### Fixed

- **A short network blip during the first download is a pause, not a dead end.** The
  per-chunk retry ladder was budgeted in attempts rather than in seconds of outage:
  three attempts at a 250 ms base absorb only 750–1250 ms, so a measured 3-second
  offline blip mid-download stranded the cold boot **0/5** — the ladder expired about
  1.9 s before the network came back and the visitor got a Retry banner for a blip they
  never noticed. Six attempts now absorb 7.75–9.0 s, and the same harness survives the
  same blip **5/5** with the clean cold-boot median unchanged (865 ms → 865 ms). The
  budget is bounded from above too: it stays inside the engine client's 30 s
  no-progress watchdog, because a retry pause is silence on the progress channel. The
  cost is paid only by a visitor who loses the network *mid*-download — they wait ~9 s
  instead of ~1 s for the Retry button. Someone offline before the boot starts is
  unaffected: the signed-pointer fetch has no ladder and still fails immediately. The
  tests assert seconds of outage survived rather than attempts taken; the previous
  attempt-counting tests passed at any budget, however short.
- **A failed sync no longer leaves seven chunk downloads running behind it.** The
  eight-way fetch pool used `Promise.all`, which rejects the moment the first worker
  exhausts its ladder — the other seven kept retrying against a network that was still
  down, firing requests after the boot had already shown its Retry banner and producing
  unhandled promise rejections in the console. It now waits for every worker and
  re-throws the first failure; fail-closed behavior is unchanged.
- **The overall boot ceiling no longer fires on healthy slow connections.** The ceiling
  does bind — verified in a real browser against the production build, where a
  slow-but-moving sync is terminated at exactly the configured deadline — but at 180 s
  it sat *below* the ~535 s a completely healthy Fast-3G download of the ~47 MB bundle
  takes. The first visitors it would ever have fired on were the ones it was never meant
  to catch, handed "Screening list could not be loaded" two-thirds of the way through a
  working download. It is now 900 s, and is documented as what it actually is: a
  backstop, not the stall detector. Genuine stalls are still caught in seconds by the
  bounds that key on silence rather than elapsed time — the 15 s per-fetch transport
  ceiling and the 30 s no-progress watchdog — and a unit test now pins the ceiling above
  the slowest healthy download so it cannot drift back under it.
- **Retry is proven to recover, by clicking it.** Nothing had ever exercised the one
  control a stranded visitor has. A new browser test fails a cold boot on a chunk
  outage, lifts the outage, presses Retry, and requires the app to reach a screenable
  state and actually match the committed sanctioned name.
- **The quickstart works from a cold clone, and the docs no longer call the repository
  private.** A fresh `git clone` plus the documented steps ended at "Local screening
  engine unavailable — signature verification failed", because (a) `dev` was bare `vite`
  and only `prebuild` staged the git-ignored MiniLM weights and onnxruntime WASM runtime,
  and (b) a local server served the production trust root `public/public.key` against the
  committed demo bundle, which is signed with the throwaway demo key. The plugin that
  pairs them existed but was opt-in behind `AMLFILTER_E2E_DEMO_PUBKEY=1`, set only by the
  Playwright `webServer` blocks — so every browser lane was green while the human path was
  broken. `dev` now shares `prebuild`'s `stage:assets` step, the demo pin is the default
  for any local dev/preview server (announced at server start), and the lanes dropped the
  env so they exercise what a cold clone gets. Shipped bytes are unchanged: `vite build`
  copies the real `public.key` into `dist/`. Repository-visibility claims are corrected in
  `README.md`, `docs/QUICKSTART.md`, `CONTRIBUTING.md`, and `public/llms.txt`, and the
  guard that asserted the app must not link its own source is inverted — the footer now
  links the MIT repository.
- **Decompression bound survives the zstd API change** — `@hpcc-js/wasm-zstd` 1.15.0
  removes `decompressChunk`'s `outputSize` parameter ("Callers must not guess an
  output size"). That argument *was* the expansion-bomb guard: WASM allocated exactly
  the size we passed. Because JavaScript drops extra arguments silently, the old
  two-argument call would have kept compiling and running while enforcing nothing —
  a 147-byte frame expands to 4 MiB unchecked. The bound now moves ahead of the
  decoder: the Zstandard frame header (RFC 8878 §3.1.1) is parsed and a chunk is
  refused unless it is exactly one frame, spanning every input byte, declaring a
  `Frame_Content_Size` within the chunk ceiling. The single-frame rule matters on its
  own — `decompressChunk` decodes concatenated frames in one call, so bounding only
  the first frame still lets 512 KiB of input decode to ~14.9 GB. Decoding then runs
  `resetDecompression` → `decompressChunk` → `decompressEnd` (which reports truncated
  frames), with the output length re-checked as a final fail-closed gate. All five
  checks are mutation-tested: each one, removed, turns a specific test red. Both
  workspace packages that declare the library are moved together — the app and the
  browser tier each resolve their own copy, and a split version is how the bundle
  ends up decoding through a decoder the code was not written for.
- **Bounded, accessible watchlist directory** — `/screen` no longer mounts the entire
  real-list population as tens of thousands of dossier cards. It renders 24 cards per
  page behind semantic Previous/Next controls, an announced visible range, and stable
  focus behavior; a 31,348-entity regression fixture locks the DOM bound.
- **Signed-pointer rollback prevention end to end** — `sequence` is now required on
  every newly published pointer, derived by both deployment workflows from the
  signature-verified live pointer, verified after live publication, and rejected by
  the browser before manifest/chunk fetch when missing or stale. A verified
  sequence-less live pointer is treated as zero only while bootstrapping the first
  sequence-aware publish; a cached legacy pointer may upgrade once; equal sequence is
  idempotent only for the same pointer identity, while a different pointer reusing it
  is rejected before manifest fetch.
- **Production response contract** — Cloudflare Pages now ships a browser-validated,
  worker/WASM-safe CSP without unsafe or network-wide escape hatches; explicit MIME and
  cache rules for the trust root, mutable pointer, and immutable CAS; and no wildcard
  CORS. A test derives the JSON-LD script hash so HTML/CSP drift fails locally.
- **Honest public discovery** — the public pages and `llms.txt` no longer advertise a
  private source repository as publicly accessible. `robots.txt` no longer contradicts
  Cloudflare's managed training-bot policy, and deployment docs identify the external
  `www` → apex redirect that must be verified on the host.
- **Complete local customer deletion** — deleting a customer now atomically erases its
  match-event ledger, reviewer identity, and notes as well as the customer/match rows;
  the prior append-only table intentionally lacked a customer FK and retained that
  private history indefinitely.
- **Measurable production truth and performance** — deploys stamp and live-verify the
  exact Git SHA/run id so a stale no-op cannot pass. A 31,348 × 384 retrieval benchmark
  enforces fixed p50/p95 and memory budgets, while C1 enforces cold boot, warm search,
  DOM/heap, single-model-request, zero third-party egress, and zero query-time network.
- **Immutable CDN caching for the self-hosted model (`/models/*`)** — Cloudflare Pages
  served the ~23 MB pinned MiniLM model with `max-age=0, must-revalidate` and no
  Content-Length, so production re-downloaded it in full on every visit. A `_headers`
  rule now caches `/models/*` as `public, max-age=31536000, immutable` (safe: the
  weights are SHA-256-pinned at build time and never mutate in place), guarded by a
  deploy-config test. Also graduates the stashed triple-fetch boot-hang diagnosis to
  `.planning/debug/minified-browser-boot-hang.md` (its app-level fix shipped in #57)
  and makes the C1 lane's preview port env-overridable (`E2E_C1_SPA_PORT`) like the
  kyc/bundle lanes.

### Added

- **Full SPA localization with i18next (#61)** — every user-facing string in the SPA is
  extracted to namespaced i18n keys with an English baseline bundled **offline** (no runtime
  network fetch); a `verify-i18n` step keeps the catalog complete, and coded errors plug in
  as i18n keys.
- **Graceful, observable iOS `/screen` boot (#60)** — a capability preflight, a bounded
  whole-boot timeout (`VITE_BOOT_TIMEOUT_MS`, default 180s), per-stage progress, and lower
  peak memory make the cold boot legible and keep locked-down iOS Safari / WebViews from
  hanging silently; a device that cannot run the local engine dead-ends gracefully (no
  futile Retry) instead of spinning.
- **Vendored `@edgeproc/errors` for the bundle-load error path (#63)** — the portfolio's
  canonical-errors library is vendored (`frontend/packages/edgeproc-errors`, source consumed
  directly) and classifies raw boot/screen failures through a registered taxonomy expressed
  in the shared error vocabulary. Behavior-identical: every failure still renders the exact
  same existing `errors:*` string — no user-visible copy or i18n key moved.
- **Self-hosted ORT wasm loader** — onnxruntime-web dynamically imports its wasm
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
- **Vitest coverage floors, enforced** — every workspace package pins
  `coverage.thresholds` (statements 90 / lines 90 / functions 90 / branches 85) and the
  gate's unit step now runs `pnpm -r run test:coverage`, so the thresholds actually
  enforce (they are inert under a plain `vitest run`). Reached honestly with ~230 new
  behavior tests — no floor was lowered: app 86/79/82/87 → 95/88/94/96,
  browser 90/84/89/90 → 98/94/100/98, publisher 84/67/86/84 → 100/93/100/100,
  workstation already above at 95/94/91/94 (s/b/f/l).
- **Canonical `pnpm gate`** (`frontend/package.json`): one command fanning out to Biome
  lint → tsc typecheck → Vitest units (with coverage thresholds) → production build →
  all three Playwright e2e lanes. `ci.yml` now literally runs `pnpm run gate`, so the
  local gate and CI cannot silently drift.
- **`.gitleaks.toml` documented allowlist** — full upstream ruleset kept; the only
  exceptions are verified false positives (pre-v4 dummy docs/test fixture keys on
  deleted paths, and the EU webgate's public non-rotating list-download token). The
  weekly full-history secret scan is green again.
- **CLAUDE.md**: scarred "Quality Gates (Non-Negotiable)" section and the
  WASM / edge-compute patterns writeup (vendored/self-hosted WASM runtimes +
  parity-tested TS and sqlite-wasm-over-OPFS).
- **README 4-part TL;DR** (what / why it works / worked example / core invariants).
- **Post-publish live-origin integrity gate** — after the nightly publish deploys,
  `publish-watchlist.yml` now runs `verify-published-origin` (publisher package): it
  re-fetches the LIVE `/bundle/origin` and verifies the whole chain through the exact
  decode path the in-tab verifier enforces (`@amlfilter/browser` zstd decompress →
  sha256 == content-address, 8-way like the client) — signed pointer (version pinned to
  the stamp just published), manifest hash, and every chunk. A deploy that serves bytes
  the client would reject now fails the workflow loudly instead of shipping silently.

### Fixed

- **Permanent "failed content-address check" screen outage (2026-07-13)** — OPFS
  `getFileHandle(create: true)` creates the durable chunk entry BEFORE any bytes are
  written, so a sync interrupted mid-write (tab close, quota abort) could strand a
  zero-byte `chunk/<hash>` file. `hasChunk()` checked existence only, so every
  subsequent sync skipped re-fetching it, and reassembly then failed fail-closed with
  `chunk <hash> failed content-address check` on every boot — Retry could never heal
  (observed live: 1264 chunks in OPFS, exactly one zero-byte, exactly the chunk named
  in the error; the served origin verified byte-perfect). The store now implements the
  missing remove half of edge-proc cas.py's `_verify_or_remove`: a zero-byte chunk
  counts as absent (silently re-fetched on the next sync), a chunk failing integrity on
  read is evicted before the error propagates (fail-closed preserved, next sync heals),
  and a failed write removes whatever partial entry it created.
- **Browser model boot could fail as a fake network error** — transformers.js 4.2.0's
  progress callback starts three overlapping requests for the same 23 MB ONNX model.
  Under Chromium cache pressure that produced `ERR_CACHE_WRITE_FAILURE` and left
  screening unavailable even though the self-hosted model was healthy. Production now
  uses the indeterminate loading banner and omits that callback; the minified-browser
  gate asserts exactly one model request and races readiness against the error banner so
  failures surface immediately instead of after a 160-second disabled-input wait.
- **Silent false-clear on /screen (§C1, critical)** — the screen call was fired from a
  `setTimeout` with no `try/catch`, so a rejected `engine.screen()` left the previous
  (stale or empty) results on screen, reading as a confident "no matches". It is now
  awaited inside a guard that surfaces a visible `role="alert"` error state and never
  presents an empty result as a clear. Regression-tested with a rejecting engine.
- **Watchlist rollback via a stale signed pointer** — a monotonic `sequence` on the
  signed `VersionPointer` now rejects promoting an older watchlist over a newer active
  one (downgrade/replay), while a sequence-less legacy pointer still upgrades once and an
  equal sequence is an idempotent re-sync. `sequence` is part of the existing signed
  canonical bytes, so no signing/crypto/storage change. Replay-tested.
- **Model remote-fallback fail-closed** — `env.allowRemoteModels = false` so a missing or
  renamed local weight throws instead of silently fetching an unpinned model from
  huggingface.co. Tested: zero HF fetch on a missing weight.
- **Exact-alias recall** — alias scoring scored only the first alias that partially hit
  and early-returned at 0.5, so an exact-alias-only entity listed after a substring alias
  was silently halved and could drop below the threshold (a false clear). Every alias is
  now scored; an exact hit wins full weight regardless of order. The 0.5 substring
  behavior and the frozen scoring golden are unchanged; guarded by a shadowing test.
- **Zero font-CDN egress** — the marketing landing loaded Fraunces / Hanken Grotesk from
  `fonts.googleapis.com` via a `<link>` in `index.html` that fired on every route
  (including /screen). Removed; the faces now resolve local-or-system (see
  `--landing-font-*`). The C1 cold-blocked e2e asserts zero font-CDN requests.
- **ORT wasm env fails loud** — `ortWasmEnv()` now throws when
  `env.backends.onnx.wasm` is absent instead of configuring a throwaway `{}` (which would
  have left the loader on the jsDelivr CDN default). Guarded by a mocked-env import test.
- **Dev `/ort/` middleware path-traversal guard** — the dev-server raw-serve middleware
  now resolves each request through `resolveOrtAsset`, which rejects anything escaping the
  staged `/ort` dir via `..`. Dev-only; unit-tested (`src/dev/ortDevAsset.test.ts`).
- **Stale tab title** — `index.html` `<title>` was `AML-Filter v2`; corrected to
  `AML-Filter v4` (matches the header and `package.json`).
- **Weekly security-audit red** — `undici` (transitive via `jsdom`) bumped 7.26.0 →
  7.28.0 in the lockfile, clearing GHSA-hm92-r4w5-c3mj and the undici header-injection
  advisory; `pnpm audit --audit-level low` is clean again with no suppressions.
- **Action floors**: `gitleaks/gitleaks-action` v2 → v3; `astral-sh/setup-uv`
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
> the annotated `v4.0.0` tag ("aml-filter 4.0.0 —
> browser-local screening workstation") is cut at the 2026-07 `main` tip reached
> during the standards-alignment work, not at the 2026-06-20 feature commit —
> history is not backfilled._

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
