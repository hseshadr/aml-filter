# Architecture

**TL;DR.** aml-filter is a **zero-server, pure-TypeScript** app. It screens a name
against **multiple sanctions lists** (OFAC SDN, EU, UN, UK/OFSI) and returns a
**scored, explained** result — and it does the whole thing in the browser tab, with no
application backend, no database, and no API call. A small **publisher** turns each
official list into a signed, self-contained file and registers them in a signed
**catalog**; the **browser engine** verifies the catalog and every list and screens
across all enabled lists in-tab; the **workstation** app stores your KYC customers
locally, keeps them re-screened, and wraps the matches in an auditable review workflow.
One screening pipeline, one explainable scoring contract, three TypeScript units.

There is no Python, no Postgres, no Docker, no HTTP screening endpoint. The lists ship as
a signed, content-addressed bundle of static files you can host on any CDN, delta-synced
and cached durably in the browser (OPFS) so the app works offline; the trust comes from
an Ed25519 signature the browser checks — over fetched *and* cached bytes — before it
will load a single byte.

## Why zero-server

Sanctions screening usually means standing up a service, a vector database, and an
ingestion pipeline. But the major sanctions lists are small — each on the order of ~10⁴
entities — small enough that a browser tab can hold them in memory and scan them. Once
you accept that, the server disappears:

- **No database.** Candidate retrieval is a brute-force cosine scan over precomputed
  vectors, one index per list. At this list size an exact scan is both correct and fast
  — no ANN index, no pgvector, nothing to operate.
- **No backend.** Embedding the *query* name runs in the tab via transformers.js, once,
  and is reused across every list. The lists' vectors were precomputed once at publish
  time, so the tab never has to embed a list.
- **No trusted server in the request path.** The lists ship as a signed,
  content-addressed bundle: a signed pointer names a content-hashed manifest that names
  every chunk. The tab verifies the signed pointer against a pinned public key and
  content-verifies every chunk + reassembled file before loading — and re-verifies the
  same way over the durable OPFS cache — so a hostile or buggy CDN (or a poisoned cache)
  can't slip in a tampered list. Verification is **fail-closed**.

What you give up is server-side scale; what you get is a screening tool that runs
entirely on the user's machine, with the customer's KYC data never leaving the device.

## The pipeline (the same shape everywhere)

Every screen — whether it's a one-off query or an automatic re-screen of a stored
customer — follows the same five stages:

```
normalize → embed → cosine retrieve → explainable weighted score → threshold → reasons
```

1. **Normalize.** Lower-case the name, strip accents and honorifics, and run it through
   `canonicalize()`. This is the load-bearing detail: the **same** `canonicalize()`
   (`frontend/packages/amlfilter-browser/src/engine/normalize.ts`) is used by both the
   publisher (when it precomputes each entity's `name_canonical`) and the browser (when
   it normalizes the query). If query and corpus were canonicalized differently, vector
   similarity would be comparing apples to oranges. The publisher imports the exact
   function from `@amlfilter/browser`, so there is one source of truth.
2. **Embed.** A sentence-transformers model — `Xenova/all-MiniLM-L6-v2`, 384-dim
   (`EMBEDDING_MODEL` / `EMBEDDING_DIM` in `embedder.ts`) — turns the normalized name
   into a vector. The publisher runs this model **in Node** to precompute one vector per
   entity name; the browser runs the **same** model **in the tab** to embed the query or
   customer name. Same model, same space, both runtimes — which is what makes the
   precomputed vectors comparable to the live query vector.
3. **Retrieve.** A brute-force **cosine** scan (`vectorIndex.ts`, exact top-k dot product
   over L2-normalized rows) ranks every list entity against the query vector. There is
   **one index per enabled list**; the `MultiListScreeningEngine` runs the scan against
   each, then merges and re-ranks the per-list candidates. No approximate index — the
   lists are small enough that exact is plenty fast.
4. **Score.** Each candidate is scored by `computeScore` (`scoring.ts`) — a transparent,
   weighted sum of five signals (below).
5. **Threshold → reasons.** A candidate whose final score is **at or above the active
   threshold for its list** becomes a match (per-list threshold =
   `perList[id] ?? query.threshold ?? default`). Each match carries `reasons[]` (one per
   signal: its value, weight, contribution, and a plain-language description), the
   `source_list` it came from, plus a single plain-language `explanation`.

## Scoring & explainability contract

The score is **not** a black box. `computeScore` sums weighted signals:

```
final_score = Σ ( weight_i × value_i )      # clamped to [0, 1]
```

The five signals: `name_vector`, `name_trigram`, `alias_match`, `dob_match`,
`country_match`. The weights and the match threshold come from a named **preset**
(`PRESETS` in `scoring.ts`):

| Preset | name_vector | name_trigram | alias_match | dob_match | country_match | threshold |
| --- | --- | --- | --- | --- | --- | --- |
| strict | 0.60 | 0.25 | 0.05 | 0.05 | 0.05 | 0.75 |
| balanced | 0.55 | 0.20 | 0.10 | 0.10 | 0.05 | 0.65 |
| lenient | 0.50 | 0.15 | 0.15 | 0.10 | 0.10 | 0.55 |

Every match carries:

- `reasons[]` — the weighted signals, each with `value`, `weight`, and `contribution`
  (`weight × value`) plus a plain-language description.
- `explanation` — a plain-language summary (e.g. _"Match due to: strong vector
  similarity, country match"_).

This is the load-bearing contract: **a reviewer can always see why a score is what it
is.** If you change the signal set or the preset weights, the explanation shape changes
with it — keep the scorer and its golden test in lockstep.

## The three TypeScript units

### 1. Publisher — `@amlfilter/publisher`

`frontend/packages/amlfilter-publisher`. A Node tool that turns each official list into a
self-contained watchlist, registers them in a `catalog.json`, and packs the whole set
into a signed, content-addressed **bundle** (the `latest` pointer + chunked manifest the
browser delta-syncs). It runs offline, ahead of time — typically in CI — and **never
ships a list inside the app**.

**The adapter interface.** Each list is a `WatchlistSource` (`src/sources/source.ts`):
`{ id, title, fetchRaw(): Promise<RawListBytes>, parse(raw, version): SourceLine[] }`.
`fetchRaw()` pulls the raw source bytes; `parse()` maps them deterministically (no
network) to a neutral `SourceLine[]`. Four adapters ship — `OFAC_SDN`, `EU_CONSOLIDATED`,
`UN_CONSOLIDATED`, `UK_OFSI`. **OFAC and UN `fetchRaw` are live**; **EU and UK `fetchRaw`
are scaffolded** — the real endpoint URL is wired with a `TODO` (EU needs a rotating
access token, UK needs the consolidated-CSV asset path confirmed). **All four `parse()`
are real and fixture-tested** (`fixtures/sources/`).

The per-list pipeline:

1. **Fetch + parse** the source via the adapter.
2. **Canonicalize** each entity's `name_canonical` with the **same** `canonicalize()`
   the browser uses (imported from `@amlfilter/browser`), so query and corpus match.
   Entity IDs are namespaced `"<source_list>:<rawId>"` (e.g. `OFAC_SDN:12345`) so they
   stay unique once lists are merged into one engine.
3. **Precompute name vectors** with transformers.js in Node (`createNodeEmbedder`, on
   `@huggingface/transformers`) — **no torch, no Python**. One 384-dim vector per entity
   name. `packVectors` packs them into a single little-endian Float32 buffer.
4. **Pack + sign the bundle.** The lists + a `catalog.json` are content-defined-chunked
   into a content-addressed manifest, and a `latest` `VersionPointer` over that manifest
   is Ed25519-signed (`signBytes` / `derivePublicKey`) — the signed pointer the browser
   delta-syncs and verifies fail-closed (see
   [Signed-list trust model](#signed-list-trust-model)).

The single-list production CLI (`publish`) takes
`--in <jsonl> --version <v> --key <privkey-file> --out <dir> [--models <dir>]`. The
committed demo **bundle** is built by `build-demo-bundle` (`src/buildDemoBundle.ts`),
which writes the signed content-addressed bundle to `frontend/app/public/bundle/origin/`
— the tree the app actually loads at runtime. (`build-demo-bundle-v2` writes the
OFAC-bumped `demo-2` fixture the delta-sync e2e routes in.)

### 2. Browser engine — `@amlfilter/browser`

`frontend/packages/amlfilter-browser`. The in-tab screening engine. It runs the whole
pipeline above against the signed bundle, with no backend in the request path.

The boot + screen flow:

1. **Sync + verify the signed bundle.** It fetches the signed `latest` pointer
   (`cache: "no-store"`) from the bundle base URL (default `/bundle/origin`), verifies its
   detached Ed25519 signature fail-closed (`verifyEd25519`, `engine/crypto.ts`, against the
   pinned public key), then fetches the content-addressed `manifest/<hash>` and verifies it
   hashes to the signed `manifest_hash`. The signed pointer is the trust anchor:
   verify-before-parse, top to bottom.
2. **Delta-sync + content-verify the chunks.** It diffs the manifest's chunk set against
   OPFS and fetches only the missing `chunk/<hash>` files, verifying each chunk hashes to
   its name and each reassembled file hashes to its `file_sha256`. Any signature or hash
   mismatch aborts the load — there is no fallback to unverified bytes.
3. **Materialize + decode.** The verified bundle is materialized into `catalog.json` +
   per-list `{entities.jsonl, vectors.f32, meta.json}` files;
   `buildLoadedFromBundleFiles` (`engine/watchlist.ts`) reconstructs the Float32 vector
   rows (failing closed on any dim ≠ 384), one index per enabled list.
4. **Embed** the query name in-tab through the `Embedder` seam (`engine/embedder.ts`;
   stubbable for tests via `createEmbedder`) — **once**, then reused across all lists.
5. **Retrieve + score + merge**: the `MultiListScreeningEngine` (`engine/multiEngine.ts`)
   screens each list (brute-force cosine `vectorIndex` → `computeScore`), applies the
   per-list threshold (`perList[id] ?? query.threshold ?? default`), then concatenates
   and re-ranks the matches so a strong hit in *any* list surfaces.

**Durable, fail-closed bundle cache.** Verified chunks are promoted into a
content-addressed store in **OPFS** (separate from the customer DB). On every load the
bytes — cached or freshly fetched — are re-verified: chunks against their content hash
and the pointer against the pinned key. A tampered or version-mismatched entry is
rejected. If the network is down, the sync falls back to the cached active version
(`readActive`) and re-verifies it fail-closed, so the app screens **offline** with no
network call. ("Clear cached lists" in `/settings` drops the store.)

Entry point: `EngineRuntime.bootstrap()` drives the boot stages and yields a
`ScreeningEngine`; `ScreeningEngine.screen({ name })` runs one screen and returns the
scored, explained matches.

The package also exposes a domain-agnostic **`./engine` subpath** of fail-closed crypto
primitives — `verifyEd25519`, `sha256Hex`, and `SignatureError`. The signed
content-addressed **bundle-sync tier** (content-addressed OPFS store, content-defined
chunk reassembly, the signed `latest` pointer poll, delta sync — `engine/sync/`) is now
the **single** watchlist distribution path. (It was recovered after the v3 pivot briefly
removed it in favor of fetching flat signed JSON files; that JSON path has since been
**retired**.) The verify-before-parse, fail-closed trust model is unchanged in spirit.

### 3. Workstation app — `@amlfilter/workstation` + the React SPA

`frontend/packages/amlfilter-workstation` provides the local-first KYC store; `frontend/app`
is the React single-page app that drives it (entry `frontend/app/src/main.tsx`).

- **Local data, local DB.** KYC records live in **SQLite-WASM** (the official
  `@sqlite.org/sqlite-wasm` build) running inside a **Web Worker**, persisted to **OPFS**
  via the `opfs-sahpool` VFS (`src/db/sqlite.ts` — persistent, no COOP/COEP headers
  required). The customer's data never leaves the device.
- **Two stores, two trust models.** The reference lists come from the signed,
  fail-closed bundle-sync path (`@amlfilter/browser`), cached as content-addressed chunks
  in OPFS; your KYC records live in the local SQLite-WASM/OPFS database. The reference
  data is verified-and-trusted; your data is yours.

#### Bidirectional rescan — the key behavior

`src/rescan.ts` (`RescanService`) keeps customers and the watchlist in sync **both
ways**:

- A **customer edit** → re-screen that one customer. `screenCustomer(customerId)` loads
  the customer and re-runs the pipeline for it.
- A **watchlist update** → re-screen every customer. `rescanAll()` re-screens the whole
  book. `syncWatchlist(currentVersion)` compares the new watchlist `version` against the
  stored `last_synced_watchlist_version` setting; if it advanced, it triggers
  `rescanAll()` and records the new version (idempotent on version — it only rescans when
  the version actually changed).

So neither side drifts: edit a customer and only that customer is re-checked; publish a
new list and everyone is re-checked against it.

#### Review once, re-review on material change — the review workflow

A rescan should not force a reviewer to re-clear matches that haven't actually changed.
The workstation gates re-review on a **material fingerprint** (`fingerprint.ts`):
`materialFingerprint(profile, entity)` is an FNV-1a hash over a canonicalized
`{ profile: { name_canonical, country }, entity: { name_canonical, aliases, dob,
countries } }` — the customer's identity fields plus the matched entity's identity
fields. (It is for stability, not collision-resistance; it never gates trust — the
signed catalog does that.)

On a rescan (`replaceMatches` → `planReplacement`, `db/operations.ts`):

- **Unchanged** (fingerprint equal) → the match keeps its prior disposition and stays
  **suppressed** (no event, no re-review).
- **Materially changed** (fingerprint differs) → the match is flagged
  **`CHANGED`** while **keeping the prior disposition**, and a `CHANGED` event is
  appended. It then shows up under the review board's "Needs review" / "Changed only"
  views.
- **Dropped** (entity no longer in the new set, e.g. a list was disabled) → a
  `SUPPRESSED` event is appended.

Every transition is written to the append-only **`match_events`** audit trail
(`appendEvent` is INSERT-only — `match_events` is never updated or deleted): event types
are `DETECTED`, `DISPOSITIONED`, `REOPENED`, `CHANGED`, `SUPPRESSED`. The review board's
per-match **History drawer** reads this trail; `/settings` configures sensitivity,
per-list thresholds, list selection, and the analyst name (persisted in the SQLite
`settings` table).

## Signed-list trust model

The lists are distributed as a single **signed, content-addressed bundle** of plain
static files — host them on any server or CDN, no application backend required. The
directory layout:

```
bundle/origin/
  latest                        # the signed VersionPointer (JSON) — the trust anchor
  manifest/<manifest_hash>      # the content-addressed IndexManifest, named by its own sha256
  chunk/<chunk_hash>            # one file per content-defined chunk, named by its plaintext sha256
```

On open, the browser fetches and verifies the signed **`latest`** pointer first
(`cache: "no-store"`), then fetches the `manifest/<hash>` it names and checks the bytes
hash to that `manifest_hash`. It delta-syncs only the missing `chunk/<hash>` files,
verifying each chunk against its content hash and each reassembled file against its
`file_sha256`. The pointer's detached Ed25519 signature is checked against a public key
pinned in the app and served **same-origin** from `frontend/app/public/public.key` (never
from the untrusted list origin). Any verification failure aborts the load — and the same
check runs over OPFS-cached bytes, so a poisoned cache entry is never trusted. The
bundle then materializes into `catalog.json` + the per-list files the engine reads.

The signing **private** key never lives in the repo or the app — it is held only in CI
(the `WATCHLIST_SIGNING_KEY` secret); the committed demo bundle is signed with a
clearly-labeled non-production demo key whose public half is the pinned `public.key`.

The exact wire format (the signed `VersionPointer`, the content-addressed `IndexManifest`
+ `FileEntry`/`ChunkRef`, the per-list materialized files, the base64/Float32 vector
buffer layout) is specified in **[`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md)** — that
document is the single source of truth for the artifact and this one does not restate it.

## Local data model (SQLite-WASM)

The schema lives in `frontend/packages/amlfilter-workstation/src/db/schema.ts`
(`SCHEMA_VERSION = 2`; migrations are an ordered ledger applied by `migrate()`). The
tables that hold the workstation's state:

- **`customers`** — a KYC customer.
  - `customer_id` (PK), `customer_reference` (NOT NULL, UNIQUE), `name` (NOT NULL),
    `country`, `onboarding_status` (NOT NULL, default `'DRAFT'`), `kyc_risk_rating`,
    `id_documents` (JSON text, NOT NULL, default `'[]'`), `onboarded_by` (NOT NULL,
    default `'local'`), `created_at`, `updated_at`.
- **`kyc_matches`** — a match between a customer and a watchlist entity.
  - `match_id` (PK), `customer_id` (FK → `customers`, `ON DELETE CASCADE`),
    `ofac_entity_id`, `match_score` (REAL), `match_tier`, `list_version`,
    `sanctioned_name`, `source_list`, `reasons` (JSON text), `explanation`,
    `detected_at`, `resolution_status` (NOT NULL, default `'PENDING'`), `resolved_at`,
    `reviewer_id`, `review_notes`.
  - **v2 columns**: `material_fingerprint` (the re-review fingerprint above) and
    `review_state` (NOT NULL, default `'CURRENT'`; set to `'CHANGED'` on a material change).
  - `UNIQUE (customer_id, ofac_entity_id)` so a customer/entity pair has one match row.
  - Index `idx_kyc_matches_review` on `(resolution_status, match_tier)` for the review
    board.
- **`match_events`** (v2) — the **append-only audit trail**. `event_id` (PK),
  `match_id` (nullable — null for a `SUPPRESSED` event), `customer_id` (NOT NULL),
  `ofac_entity_id` (NOT NULL), `event_type` (NOT NULL), `from_status`, `to_status`,
  `reviewer_id`, `notes`, `at` (NOT NULL). Indexed on `(match_id)` and
  `(customer_id, ofac_entity_id)`. Written by `appendEvent` only — never updated or
  deleted.
- **`settings`** — `key` (PK), `value` (NOT NULL). Holds
  `last_synced_watchlist_version` (the rescan version pointer above), the screening
  sensitivity / per-list overrides, the enabled-watchlist selection, and the analyst
  name.

## Match tiers (review triage)

`src/tiering.ts` buckets each match's **final score** into a review tier. This layers
**on top of** the scoring contract and **never changes the score, reasons, or
explanation** — it only triages:

- **STRONG** — score ≥ `0.8` (`STRONG_TIER_FLOOR`).
- **POSSIBLE** — score ≥ the active preset threshold.
- **WEAK** — below that.

Boundaries are inclusive on the lower edge of each tier. The TS implementation is the
**source of truth**, parity-locked by a **frozen committed golden** snapshot
(`tiering.parity.test.ts`) so any unintended drift in a tier boundary fails CI.

## Parity / correctness

Both the **scoring** output (score, reasons, each reason's plain-language description)
and the **tiering** classification are locked by committed golden-JSON parity tests —
**frozen regression snapshots**. There is no Python side anymore: the TypeScript
implementation is the source of truth, and the goldens are TS-emitted snapshots (the old
Python golden generators were deleted in the v3 pivot). The fixtures:

- `frontend/packages/amlfilter-browser/src/engine/__fixtures__/scoring/golden.json`
- `frontend/packages/amlfilter-workstation/src/__fixtures__/tiering/golden.json`

A change to the scorer or the tier boundaries that isn't reflected in the golden fails
the parity test — that's the regression guard that keeps the explainable contract
stable.

## Invariants (load-bearing rules)

- **Explainability is non-negotiable.** Every match carries its full signal breakdown.
  Don't add a scoring path that returns a bare number.
- **The lists are never bundled into the app.** Each is published from its official
  source as a signed static file and verified at load time. Keep them out of the repo and
  out of the app build.
- **Same embedder, query and corpus.** The publisher (Node) and the browser (tab) must
  use the **same** model and the **same** `canonicalize()`, or vector similarity is
  meaningless. This is what makes precomputed vectors comparable to the live query.
- **Fail closed on trust.** A list is loaded only after the catalog and the list's
  Ed25519 signatures verify against the pinned, same-origin public key — over fetched
  *and* cached bytes. Any signature or SHA-256 mismatch aborts the load — never a silent
  fallback to an unverified list.
- **The audit trail is append-only.** `match_events` is INSERT-only; dispositions and
  re-review transitions are recorded, never rewritten.
- **Your data stays local.** KYC records live only in the in-tab SQLite-WASM/OPFS
  database; nothing is sent to a server.

## Further reading

- [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md) — the exact signed catalog + per-list
  wire contract (the single source of truth for the published artifacts).
- [`../NOTICE`](../NOTICE) — OFAC attribution and the not-a-compliance-product
  disclaimer.
