# Architecture

**TL;DR.** aml-filter is a **zero-server, pure-TypeScript** app. It screens a name
against the OFAC SDN sanctions list and returns a **scored, explained** result — and
it does the whole thing in the browser tab, with no application backend, no database,
and no API call. A small **publisher** turns the official OFAC list into a signed,
self-contained file; the **browser engine** verifies that file and screens against it
in-tab; the **workstation** app stores your KYC customers locally and keeps them
re-screened. One screening pipeline, one explainable scoring contract, three
TypeScript units.

There is no Python, no Postgres, no Docker, no HTTP screening endpoint. The watchlist
is a static file you can host on any CDN; the trust comes from an Ed25519 signature the
browser checks before it will load a single byte.

## Why zero-server

Sanctions screening usually means standing up a service, a vector database, and an
ingestion pipeline. But the OFAC SDN list is small — on the order of ~10⁴ entities —
small enough that a browser tab can hold the whole thing in memory and scan it. Once
you accept that, the server disappears:

- **No database.** Candidate retrieval is a brute-force cosine scan over precomputed
  vectors. At this list size an exact scan is both correct and fast — no ANN index, no
  pgvector, nothing to operate.
- **No backend.** Embedding the *query* name runs in the tab via transformers.js. The
  list's vectors were precomputed once at publish time, so the tab never has to embed
  the list.
- **No trusted server in the request path.** The list is a signed static file. The tab
  verifies the signature against a pinned public key before loading it, so a hostile or
  buggy CDN can't slip in a tampered list — verification is **fail-closed**.

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
   over L2-normalized rows) ranks every list entity against the query vector. No
   approximate index — the list is small enough that exact is plenty fast.
4. **Score.** Each candidate is scored by `computeScore` (`scoring.ts`) — a transparent,
   weighted sum of five signals (below).
5. **Threshold → reasons.** A candidate whose final score is **at or above the preset's
   threshold** becomes a match. Each match carries `reasons[]` (one per signal: its
   value, weight, contribution, and a plain-language description) plus a single
   plain-language `explanation`.

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

`frontend/packages/amlfilter-publisher`. A Node CLI that turns the official OFAC list
into a signed, self-contained watchlist. It runs offline, ahead of time — typically in
CI — and **never ships the list inside the app**.

The pipeline (`publishWatchlist`):

1. **Fetch** the OFAC SDN source and map it to source-JSONL (`fetchOfacJsonl`,
   `parseSdn`).
2. **Canonicalize** each entity's `name_canonical` with the **same** `canonicalize()`
   the browser uses (imported from `@amlfilter/browser`), so query and corpus match.
3. **Precompute name vectors** with transformers.js in Node (`createNodeEmbedder`, on
   `@huggingface/transformers`) — **no torch, no Python**. One 384-dim vector per entity
   name. `packVectors` packs them into a single little-endian Float32 buffer.
4. **Sign** the output Ed25519 (`signBytes` / `derivePublicKey` / `writeSigned`) and
   emit four static files (see [Signed-watchlist trust model](#signed-watchlist-trust-model)).

CLI flags: `--in <jsonl> --version <v> --key <privkey-file> --out <dir> [--models <dir>]`.

### 2. Browser engine — `@amlfilter/browser`

`frontend/packages/amlfilter-browser`. The in-tab screening engine. It runs the whole
pipeline above against the signed watchlist, with no backend in the request path.

The boot + screen flow:

1. **Fetch** the signed watchlist same-origin.
2. **Verify** it fail-closed: `verifyEd25519` (`engine/crypto.ts`) checks the detached
   Ed25519 signature against a public key pinned in the app build. Any signature or
   SHA-256 mismatch aborts the load — there is no fallback to an unverified list.
3. **Decode** the precomputed vectors: `buildLoadedWatchlist` (`engine/watchlist.ts`)
   reconstructs the Float32 vector rows (failing closed on any dim ≠ 384).
4. **Embed** the query name in-tab through the `Embedder` seam (`engine/embedder.ts`;
   stubbable for tests via `createEmbedder`).
5. **Retrieve + score**: brute-force cosine `vectorIndex` → `computeScore`.

Entry point: `EngineRuntime.bootstrap()` drives the boot stages and yields a
`ScreeningEngine`; `ScreeningEngine.screen({ name })` runs one screen and returns the
scored, explained matches.

The package also exposes a domain-agnostic **`./engine` subpath** that is now **just the
fail-closed crypto primitives** — `verifyEd25519`, `sha256Hex`, and `SignatureError`,
with zero screening/embedding/OFAC coupling. (In the v3 pivot the old heavy chunked-CAS
sync tier — content-addressed OPFS store, GearCDC chunk reassembly, zstd, the sync Web
Worker — was **removed**. The browser now fetches **one signed JSON file and verifies
it**; there is no bundle-sync client.)

### 3. Workstation app — `@amlfilter/workstation` + the React SPA

`frontend/packages/amlfilter-workstation` provides the local-first KYC store; `frontend/app`
is the React single-page app that drives it (entry `frontend/app/src/main.tsx`).

- **Local data, local DB.** KYC records live in **SQLite-WASM** (the official
  `@sqlite.org/sqlite-wasm` build) running inside a **Web Worker**, persisted to **OPFS**
  via the `opfs-sahpool` VFS (`src/db/sqlite.ts` — persistent, no COOP/COEP headers
  required). The customer's data never leaves the device.
- **Two stores, two trust models.** The OFAC reference list comes from the signed,
  fail-closed watchlist path (`@amlfilter/browser`); your KYC records live in the local
  SQLite-WASM/OPFS database. The reference data is verified-and-trusted; your data is
  yours.

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

## Signed-watchlist trust model

The watchlist is distributed as **plain signed static files** — host them on any
server or CDN, no application backend required. There are four files:

| File | Purpose |
| --- | --- |
| `watchlist.manifest.json` | tiny — for cheap version polling on app-open |
| `watchlist.manifest.json.sig` | detached Ed25519 signature over the manifest bytes |
| `watchlist.json` | the full list: entities + precomputed name vectors |
| `watchlist.json.sig` | detached Ed25519 signature over the `watchlist.json` bytes |

On open, the browser polls the small **manifest** for its `version`. If the version
differs from the last-synced value, it fetches the full `watchlist.json`. **Both** files
are signature-verified **fail-closed**: a detached Ed25519 signature is checked against a
public key pinned in the app and served **same-origin** from `frontend/app/public/public.key`
(never from the untrusted watchlist origin). Any verification failure aborts the load.

The signing **private** key never lives in the repo or the app — it is held only in CI
(the `WATCHLIST_SIGNING_KEY` secret); the committed demo artifact is signed with a
clearly-labeled non-production demo key whose public half is the pinned `public.key`.

The exact wire format (manifest fields, the entity shape, the base64 Float32 vector
buffer layout) is specified in **[`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md)** — that
document is the single source of truth for the artifact and this one does not restate it.

## Local data model (SQLite-WASM)

The schema lives in `frontend/packages/amlfilter-workstation/src/db/schema.ts`. Three
tables hold the workstation's state:

- **`customers`** — a KYC customer.
  - `customer_id` (PK), `customer_reference` (NOT NULL, UNIQUE), `name` (NOT NULL),
    `country`, `onboarding_status` (NOT NULL, default `'DRAFT'`), `kyc_risk_rating`,
    `id_documents` (JSON text, NOT NULL, default `'[]'`), `onboarded_by` (NOT NULL,
    default `'local'`), `created_at`, `updated_at`.
- **`kyc_matches`** — a match between a customer and an OFAC entity.
  - `match_id` (PK), `customer_id` (FK → `customers`, `ON DELETE CASCADE`),
    `ofac_entity_id`, `match_score` (REAL), `match_tier`, `list_version`,
    `sanctioned_name`, `source_list`, `reasons` (JSON text), `explanation`,
    `detected_at`, `resolution_status` (NOT NULL, default `'PENDING'`), `resolved_at`,
    `reviewer_id`, `review_notes`.
  - `UNIQUE (customer_id, ofac_entity_id)` so a customer/entity pair has one match row.
  - Index `idx_kyc_matches_review` on `(resolution_status, match_tier)` for the review
    board.
- **`settings`** — `key` (PK), `value` (NOT NULL). Holds
  `last_synced_watchlist_version` (the rescan version pointer above), among others.

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
- **The list is never bundled into the app.** It is published from the official OFAC
  source as a signed static file and verified at load time. Keep it out of the repo and
  out of the app build.
- **Same embedder, query and corpus.** The publisher (Node) and the browser (tab) must
  use the **same** model and the **same** `canonicalize()`, or vector similarity is
  meaningless. This is what makes precomputed vectors comparable to the live query.
- **Fail closed on trust.** The watchlist is loaded only after its Ed25519 signature
  verifies against the pinned, same-origin public key. Any signature or SHA-256 mismatch
  aborts the load — never a silent fallback to an unverified list.
- **Your data stays local.** KYC records live only in the in-tab SQLite-WASM/OPFS
  database; nothing is sent to a server.

## Further reading

- [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md) — the exact signed-watchlist wire
  contract (the single source of truth for the published artifact).
- [`../NOTICE`](../NOTICE) — OFAC attribution and the not-a-compliance-product
  disclaimer.
