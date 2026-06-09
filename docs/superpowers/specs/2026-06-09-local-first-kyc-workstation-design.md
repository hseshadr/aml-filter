# Local-First In-Browser KYC Workstation — Design Spec

**Date:** 2026-06-09 · **Status:** Locked design, pre-implementation · **Repo state:** main @ `2b3cf36`

## 1. TL;DR

We are porting the KYC workstation (today: React pages calling a FastAPI+Postgres
backend behind `/login`) to run **fully in the browser with zero backend**. KYC customer
records move into SQLite-WASM persisted in OPFS (the browser's private origin
filesystem) behind a dedicated Web Worker; OFAC screening keeps using the existing
signed-bundle FAISS engine already live in `@amlfilter/browser`. Login and API keys are
removed: the app boots straight into the workstation, and the existing pages keep
working unchanged because all their server I/O already flows through one `apiClient`
singleton that we swap for a local implementation. We build a **vertical slice first**
— onboard a customer → auto-screen against OFAC → tiered matches persisted → Review
Board → resolve one match — to prove the whole architecture on the smallest path.

## 2. Problem

- The admin workstation (`/customers /review /sars /attestations /lists /usage
  /api-keys`) needs the FastAPI+Postgres backend. In the backend-free demo deployment —
  the project's headline pitch — those pages are dead weight behind a `/login` that has
  nothing to log into.
- The `/screen` page already proves the opposite is possible: the full OFAC list syncs
  into the tab as a signed bundle and screens locally. The workstation contradicts the
  "local / in-browser, your data never leaves the machine" story on the landing page.
- Goal: a **turnkey local-first KYC workstation** — clone, `pnpm dev`, onboard real
  customers, review real matches, zero servers — completing the pitch instead of
  undercutting it.

Jargon, defined once:
- **OPFS** — Origin Private File System; a browser-private filesystem per origin,
  available in secure contexts (https / localhost).
- **opfs-sahpool** — a SQLite-WASM storage backend (VFS) that uses pre-acquired OPFS
  sync access handles; works without special HTTP headers.
- **COOP/COEP** — HTTP headers required for `SharedArrayBuffer`; the *default* SQLite
  OPFS VFS needs them, sahpool does not.
- **Signed bundle** — edge-proc's content-addressed distribution format: ed25519
  signature + sha256 chunk hashes, verified fail-closed before any data is used.

## 3. Locked decisions

These were settled with the user in the 2026-06-09 brainstorming session. This spec
documents them; it does not re-open them.

### D1 — Vertical slice first

Slice = boot straight in (no login) → onboard a customer → embed + search the signed
OFAC FAISS bundle in-tab → matches tiered & written to SQLite-WASM → Review Board (SQL
join) → resolve one match.

*Why:* the slice crosses every architectural boundary exactly once — new DB worker, new
local services, the apiClient swap, the engine reuse, the parity gate — so it proves
the whole local-first architecture on the smallest path. A full workstation port would
multiply surface before the foundations are proven; a foundation-only cycle (DB worker
with no user journey) would be unvalidatable end-to-end, which this repo has learned
the hard way is where green-gates-broken-product lives. SARs, attestations, lists, and
delta-rescan become repetitions of the proven pattern afterward.

### D2 — Persistence = SQLite-WASM in a DB Web Worker, opfs-sahpool VFS

Official `@sqlite.org/sqlite-wasm`, running in a dedicated DB Web Worker, persisted via
the **`opfs-sahpool`** VFS. Worker-RPC clones the existing `EngineClient` +
`protocol.ts` typed-envelope pattern from `@amlfilter/browser`. SQLite stores ONLY the
user's KYC records.

*Why SQLite over IndexedDB:* the Review Board is a relational join with filters
(tier, resolution status) over customers × matches — exactly what SQL is for, and the
local schema can mirror the verified Postgres schema nearly 1:1, keeping the two tiers
conceptually one product. IndexedDB would force hand-rolled indexes and join logic, and
the official SQLite-WASM build is the industry-standard, well-supported choice.
*Why sahpool over the default OPFS VFS:* the default VFS needs COOP/COEP headers
(SharedArrayBuffer), which would break the current static hosting story and is known to
conflict with cross-origin resources; sahpool needs **no special headers** and drops
into the existing deployment unchanged. Its cost — effectively single-connection
(one tab) — is acceptable for a single-analyst local workstation (see Risks).
*Why a dedicated worker:* sahpool's sync access handles are worker-only, it keeps SQL
off the main thread, and the repo already has a proven typed-envelope worker pattern to
clone (verified in §6.5).

### D3 — API keys / login removed; `LocalApiClient` becomes `apiClient`

No `VITE_*` server/local mode flag, no `ProtectedRoute` key check, no `/login`, no
`/api-keys`. The app boots straight into the workstation. `LocalApiClient` simply
**becomes** the `apiClient` export of `frontend/app/src/lib/api.ts` — no env swap.
Server/DB tier code is NOT deleted, just no longer wired into boot.

*Why full replacement over a mode flag:* the pages already route 100% of server I/O
through the `apiClient` singleton (verified in §6.1), so the swap is one seam. A mode
flag would double the test matrix, keep dead `/login` UX in the local product, and
preserve exactly the confusion this initiative exists to remove. The server tier
remains in the repo for SaaS deployments; re-wiring it later is a routing decision, not
an architecture one.

### D4 — Embedding/vector search is NOT in SQLite: two stores, two trust models

- **OFAC reference list** (read-only, *someone else's* data you must trust): signed
  content-addressed bundle → in-memory FAISS `IndexFlatIP` + MiniLM embedder Web
  Worker, ed25519+sha256 fail-closed. **Already live** in `@amlfilter/browser`; reused
  as-is via the engine runtime (see §6.6 for the verified call surface).
- **KYC records** (read-write, *your* data): SQLite-WASM/OPFS.

Onboarding writes the customer record to SQLite, then calls the existing engine to
screen the name against the bundle FAISS, then writes match records back to SQLite.

*Why not fold OFAC vectors into SQLite:* the bundle's value is its trust chain — every
byte is signature-verified before use, and the same artifact serves the CLI, the
server-bundle path, and the browser. Re-materializing entities/vectors into a mutable
local database would throw away that chain (a tampered row is undetectable), duplicate
~storage, and orphan the already-parity-tested screen path for zero gain.

### D5 — Code placement: new workspace package `@amlfilter/workstation`

`frontend/packages/amlfilter-workstation` (`@amlfilter/workstation`), depending on
`@amlfilter/browser` for the engine, crypto, and canonical-name pipeline. It holds the
DB worker + the TS service ports: `LocalOnboardingService`, `LocalMatchTracker`,
`classifyTier`. `LocalApiClient` + routing changes live in `frontend/app`.

*Why a package, not app code:* mirrors the existing split — `@amlfilter/browser` is the
reusable engine tier, `frontend/app` is presentation. The local KYC tier is similarly
reusable (and independently unit-testable against the Python goldens) and must not
entangle React. *Why not inside `@amlfilter/browser`:* that package is a faithful port
of edge-proc's generic sync tier + the OFAC scoring contract; KYC records are a
different domain with a different trust model (D4).

### Out of scope for the slice (later cycles)

See §7.

## 4. Architecture

Two stores, two trust models; three workers, one new.

```
                    Main thread — React pages (UNCHANGED)
                    CustomersPage, ReviewBoardPage, ...
                                  │
                       apiClient (= LocalApiClient)        frontend/app/src/lib/api.ts
                ┌─────────────────┴───────────────────┐
                │ screening (read-only)               │ KYC records (read-write)
                ▼                                     ▼
   ┌───────────────────────────┐          ┌───────────────────────────┐
   │ EXISTING engine tier      │          │ NEW: DB worker            │
   │ @amlfilter/browser        │          │ @amlfilter/workstation    │
   │                           │          │                           │
   │ sync Worker: OPFS bundle  │          │ @sqlite.org/sqlite-wasm   │
   │  ed25519+sha256 fail-closed          │ opfs-sahpool VFS          │
   │ embedder: MiniLM in-tab   │          │ (no COOP/COEP needed)     │
   │ ScreeningEngine:          │          │ typed-envelope RPC cloned │
   │  in-memory FAISS flat IP  │          │  from engine protocol.ts  │
   └───────────────────────────┘          └───────────────────────────┘
                │                                     │
                ▼                                     ▼
     signed OFAC bundle in OPFS              SQLite file in OPFS
     (read-only, verify-or-abort)            customers + kyc_matches
```

(The existing engine tier is itself two workers — the OPFS sync worker and the MiniLM
embedder — plus the in-memory FAISS index; the DB worker is the third and only new one.)

### Slice data flow (store/worker annotations)

| # | Step | Touches |
|---|------|---------|
| 1 | App boots; no login; workstation pages reachable | main thread; engine bootstrap (existing) + DB worker `open` |
| 2 | Analyst onboards a customer (reference, name, country, docs) | `LocalOnboardingService` → DB worker: dup-check `SELECT`, then `INSERT INTO customers` (SQLite/OPFS) |
| 3 | Auto-screen the name | engine tier: MiniLM embed → FAISS search → TS scorer → `ScreenResponse` (signed bundle, in-memory) |
| 4 | Tier each match | `classifyTier(score, possible_threshold)` — pure TS port, golden-parity-tested |
| 5 | Persist matches | `LocalMatchTracker` → DB worker: `INSERT INTO kyc_matches` with score/tier/reasons/explanation, `resolution_status='PENDING'` |
| 6 | Review Board lists tiered matches with customer fields | DB worker: `SELECT ... FROM kyc_matches JOIN customers` with tier/status filters |
| 7 | Analyst resolves one match (status + notes) | DB worker: `UPDATE kyc_matches SET resolution_status, resolved_at, reviewer_id, review_notes` |

Step 6 is deliberately simpler than the server's correlated scalar subqueries (§6.4):
the server needs them because multiple customers can share one screening `Entity` row;
locally there is no entity table — matches reference `customer_id` directly, so a plain
join cannot fan out.

## 5. The vertical slice

### User-visible journey

Open the app → land in the workstation (no login) → "Onboard customer" → fill
reference/name/country → submit → screening runs in-tab → matches appear tiered
(STRONG/POSSIBLE/WEAK) → open Review Board → filter to PENDING → resolve one match as
FALSE_POSITIVE with a note → it leaves the pending queue. Reload the tab: everything is
still there (OPFS persistence).

### Pages involved (existing pages, re-pointed — not rewritten)

- `frontend/app/src/pages/CustomersPage.tsx` — already calls only
  `apiClient.listCustomers / onboardCustomer / updateCustomer / deleteCustomer`.
- `frontend/app/src/pages/ReviewBoardPage.tsx` — already calls only
  `apiClient.listReviewMatches / resolveReviewMatch`.
- `frontend/app/src/App.tsx` — drop `/login` route and `ProtectedRoute` wrappers;
  workstation routes become directly reachable. Non-slice routes: see open questions.

### What `@amlfilter/workstation` exposes

```ts
// package: @amlfilter/workstation  (depends on @amlfilter/browser)
export class DbClient { /* spawn(), typed request/await per protocol below */ }
export class LocalOnboardingService { onboard(req): Promise<OnboardResult> }   // dup-rejection + screen + persist
export class LocalMatchTracker { record(...), listForReview(...), resolve(...) }
export function classifyTier(score: number, possibleThreshold: number, strong?: number): MatchTier;
export type MatchTier = "STRONG" | "POSSIBLE" | "WEAK";
export type ResolutionStatus = "PENDING" | "FALSE_POSITIVE" | "TRUE_POSITIVE" | "RESOLVED";
```

`frontend/app/src/lib/api.ts` keeps its exported types and the `apiClient` name; the
instance behind it becomes a `LocalApiClient` implementing the slice-relevant method
surface (same signatures as today's `ApiClient`, §6.1) on top of these services.

### SQLite schema sketch (mirrors the verified backend fields, §6.8)

```sql
-- Mirrors backend `customers` (db/models.py:426). Local deltas: no tenant_id (single
-- implicit local tenant → uniqueness is on customer_reference alone); name/country live
-- here because the server keeps them on the linked WHITELIST Entity row, which has no
-- local equivalent (the only entity store is the read-only signed bundle).
CREATE TABLE customers (
  customer_id        TEXT PRIMARY KEY,                  -- UUID string
  customer_reference TEXT NOT NULL UNIQUE,              -- dup-rejection key
  name               TEXT NOT NULL,
  country            TEXT,                              -- ISO 3166-1 alpha-2
  onboarding_status  TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT|PENDING_REVIEW|ACTIVE|REJECTED
  kyc_risk_rating    TEXT,                              -- LOW|MEDIUM|HIGH|null
  id_documents       TEXT NOT NULL DEFAULT '[]',        -- JSON array (JSONB analog)
  onboarded_by       TEXT NOT NULL DEFAULT 'local',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Mirrors backend `whitelist_blacklist_matches` (db/models.py:308). Local deltas:
-- keyed by customer_id + the bundle entity id (no local Entity rows, no match_type);
-- reasons/explanation persisted so the Review Board can explain without re-scoring.
CREATE TABLE kyc_matches (
  match_id          TEXT PRIMARY KEY,                   -- UUID string
  customer_id       TEXT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  ofac_entity_id    TEXT NOT NULL,                      -- entity_id within the signed bundle
  match_score       REAL NOT NULL,
  match_tier        TEXT,                               -- STRONG|POSSIBLE|WEAK
  list_version      TEXT,
  reasons           TEXT NOT NULL,                      -- JSON MatchReason[]
  explanation       TEXT NOT NULL,
  detected_at       TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING|FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED
  resolved_at       TEXT,
  reviewer_id       TEXT,
  review_notes      TEXT
);
```

### DB-worker RPC surface sketch (clones `engine/protocol.ts`, §6.5)

Service-level operations, not raw SQL over the wire — typed contracts at the boundary:

```ts
// Discriminated on `kind` (requests) and `ok` (responses), correlated by `id` —
// the exact shape of @amlfilter/browser/src/engine/protocol.ts.
export type DbRequest =
  | { kind: "open"; id: number }                                            // create-or-migrate schema
  | { kind: "onboardCustomer"; id: number; payload: OnboardPayload }
  | { kind: "listCustomers"; id: number }
  | { kind: "updateCustomer"; id: number; customerId: string; patch: CustomerPatch }
  | { kind: "recordMatches"; id: number; customerId: string; matches: TieredMatch[] }
  | { kind: "listReviewMatches"; id: number; filters: { tier?: MatchTier; resolutionStatus?: ResolutionStatus } }
  | { kind: "resolveMatch"; id: number; matchId: string; resolution: ResolutionStatus; reviewerId?: string; notes?: string };

export type DbResponse =
  | { ok: true; id: number; kind: DbRequest["kind"]; result: /* per-kind payload */ }
  | { ok: false; id: number; error: string };   // e.g. "DUPLICATE_REFERENCE:<ref>"
```

`DbClient` mirrors `EngineClient` (§6.5): one in-flight `Map<number, Pending>` keyed by
request id, a `spawn()` that creates the module worker, one typed method per `kind`.

## 6. Verified code facts (Part A)

Verified against main @ `2b3cf36` on 2026-06-09. Corrections from the recorded claims
are flagged inline and summarized at the end.

### 6.1 The apiClient swap seam — VERIFIED

- `frontend/app/src/lib/api.ts:12` — `export class ApiClient {`;
  `frontend/app/src/lib/api.ts:752` — `export const apiClient = new ApiClient();`.
- Slice-relevant methods: `onboardCustomer` (api.ts:180), `listCustomers` (:190),
  `getCustomer` (:202), `updateCustomer` (:209), `deleteCustomer` (:220),
  `listReviewMatches` (:225), `resolveReviewMatch` (:235).
- `CustomersPage.tsx` imports only `apiClient` (+ types) from `../lib/api`
  (CustomersPage.tsx:5–11) and calls it at :86/:103/:125/:138/:149. No `fetch(`/axios
  anywhere under `frontend/app/src/pages/` (repo-wide grep: zero hits).
- `ReviewBoardPage.tsx` likewise (imports :6–13; calls :88/:118).
- Page unit tests mock the module: `CustomersPage.test.tsx:15` and
  `ReviewBoardPage.test.tsx:16` — `vi.mock("../lib/api", ...)`.
- *Correction (naming only):* the review page file is `ReviewBoardPage.tsx`, not
  `ReviewPage.tsx`.

### 6.2 Tier thresholds — VERIFIED

`backend/aml_filter/scoring/tiers.py`: `STRONG_TIER_FLOOR: float = 0.80` (tiers.py:17);
enum `MatchTier` = STRONG/POSSIBLE/WEAK (:20–25); `classify_tier(score,
possible_threshold, strong=STRONG_TIER_FLOOR)` — `score >= strong` → STRONG, `score >=
possible_threshold` → POSSIBLE, else WEAK, lower edges inclusive (:28–42). Bands are
env-overridable via `TierBands` (`TIER_` prefix, :45–54). The POSSIBLE floor is the
**policy threshold**, not a constant — the parity golden must carry it per-case.

### 6.3 Match-resolution state machine — DIVERGED (weaker than recorded)

Reality in `backend/aml_filter/screening/match_tracker.py`: there is **no enforced
transition table**. The observable behavior:
- Created as `resolution_status="PENDING"` (match_tracker.py:127).
- A re-screen of an existing pair resets a resolved match to PENDING with the new
  score/tier (match_tracker.py:99).
- `resolve_match` (:221) accepts `FALSE_POSITIVE | TRUE_POSITIVE | RESOLVED` —
  validated only by the API regex `^(FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED)$` at
  `backend/aml_filter/api/v1/review.py:148` — and `_apply_resolution` (:251) overwrites
  status/`resolved_at`/`reviewer_id`/`review_notes` unconditionally. Any status can be
  re-resolved to any other; there is no PENDING-only guard.
- States on the column comment: PENDING, FALSE_POSITIVE, TRUE_POSITIVE, RESOLVED
  (`backend/aml_filter/db/models.py:336–338`).

The TS `LocalMatchTracker` ports this *observed* contract (PENDING on create;
re-resolution allowed; re-screen resets to PENDING) and TDDs it explicitly — the tests
encode behavior, they do not invent stricter transitions the backend doesn't have.

### 6.4 Review board denormalization — VERIFIED

Path is `backend/aml_filter/api/v1/review.py` (the recorded "maybe `api/` not `api/v1/`"
hedge resolves to **`api/v1/`**). `_customer_field` builds a correlated scalar subquery
— `.correlate(WhitelistBlacklistMatch).scalar_subquery()` (review.py:65–73) — to put
customer columns on match rows without fan-out when customers share a screening entity
(:57–61). Locally a plain JOIN suffices (no shared-entity fan-out; §4).

### 6.5 `EngineClient` + `protocol.ts` typed-envelope RPC — VERIFIED (path corrected)

- *Correction:* files live under `src/engine/`, not `src/worker/`:
  `frontend/packages/amlfilter-browser/src/engine/protocol.ts` and
  `frontend/packages/amlfilter-browser/src/engine/client.ts`.
- Envelope: requests are a union discriminated on `kind` with a numeric `id`
  (protocol.ts:8–22); responses discriminate on `ok` — per-kind `{ok: true, id, kind,
  ...payload}` plus a single `{ok: false, id, error: string}` arm (protocol.ts:24–44).
- `EngineClient` (client.ts:13): in-flight `Map<number, Pending>` keyed by request id
  (:15), `static spawn()` creating a module worker (:29–34), typed methods `sync` /
  `readFile` that send and narrow on `ok && kind` (:37–61).

### 6.6 `EngineRuntime.screen()` — DIVERGED (method lives on `ScreeningEngine`)

`EngineRuntime` exists (`frontend/packages/amlfilter-browser/src/engine/runtime.ts:190`)
but has **no `screen()`**. Its surface: `bootstrap(config, onStage)` (runtime.ts:205)
and `engine(): ScreeningEngine | null` (:200). Screening is
`ScreeningEngine.screen(query: ScreenQuery, options: ScreenOptions = {}):
Promise<ScreenResponse>` (`src/engine/screeningEngine.ts:95–98`; class at :67).
- `ScreenQuery` = `{name, dob?, country?, entityType?, threshold?, k?}`
  (`src/engine/domain.ts:75–85`).
- `Match` carries `entity_id, score, ..., reasons: ReadonlyArray<MatchReason>,
  explanation: string` (domain.ts:102–118); `ScreenResponse` = `{request_id, matches,
  list_versions_used, execution_time_ms}` (domain.ts:121–126).
- So the slice's reuse surface is: `EngineRuntime.bootstrap()` → `runtime.engine()` →
  `engine.screen(...)` — same net capability as recorded, one extra hop.

### 6.7 `@noble/ed25519` dependency — VERIFIED

`frontend/packages/amlfilter-browser/package.json:21` — `"@noble/ed25519": "^3.1.0"`
(runtime dependency).

### 6.8 Onboarding service + dup-rejection — VERIFIED

- `OnboardingService` at `backend/aml_filter/customers/service.py:34`;
  `onboard_customer(tenant_id, customer_reference, name, onboarded_by, country=None,
  id_documents=None)` (:48–55).
- Dup rule: a customer with the same `(tenant_id, customer_reference)` already existing
  raises `DuplicateCustomerReferenceError` (service.py:67–78, error class
  `customers/errors.py:6`); a duplicate-race during insert is also caught, with the
  orphan WHITELIST entity rolled back (service.py:103–119). API maps it to an error
  response (`api/v1/customers.py:129`).
- Customer record (`db/models.py:426–456`): `customer_id` (UUID str PK), `tenant_id`,
  `customer_reference`, `onboarding_status` (DRAFT/PENDING_REVIEW/ACTIVE/REJECTED,
  default DRAFT), `kyc_risk_rating` (LOW/MEDIUM/HIGH | null), `id_documents` (JSONB),
  `onboarded_by`, `screening_entity_id` (nullable FK), `created_at`, `updated_at`.
  Request model `CustomerOnboardRequest` (`api/v1/customers.py:23–30`) adds: `name`
  (1–500 chars) and `country` (2-char ISO) — which the server stores on the linked
  Entity, hence the local-schema delta in §5.

### 6.9 Scoring-golden pattern — VERIFIED

`backend/scripts/gen_scoring_golden.py` exists; it runs the canonical Python
`DefaultScoringPolicy` over fixed cases and writes a TS-shaped golden to
`frontend/packages/amlfilter-browser/src/engine/__fixtures__/scoring/golden.json`,
consumed by `frontend/packages/amlfilter-browser/src/engine/scoring.parity.test.ts`.
Poe tasks wire it into the gate: `scoring-golden` (regenerate) and
`scoring-golden-check` (diff-fail if stale), and `gate` includes the check
(`backend/pyproject.toml:277–279`). The tiering golden extends this exact pattern.

### 6.10 Workspace / tooling — VERIFIED (two nuances)

- `frontend/pnpm-workspace.yaml` — packages: `app`, `packages/*`; the two members today
  are `frontend/app` and `frontend/packages/amlfilter-browser`.
- TS strict: `frontend/app/tsconfig.json:19` and
  `frontend/packages/amlfilter-browser/tsconfig.json:20` both `"strict": true`.
- *Nuance 1:* the only Biome config found is `frontend/app/biome.json` (no
  workspace-root config; the browser package has `@biomejs/biome` as a devDep and is
  linted via its own `lint` script through the workspace `pnpm -r run lint`).
- *Nuance 2:* "no default exports" is a documented convention (CLAUDE.md), not an
  enforced `noDefaultExport` Biome rule (grep: no hits) — and `frontend/app` route
  components do use default exports (e.g. `App.tsx:5` default-imports
  `ProtectedRoute`; lazy-loaded pages follow the `React.lazy` default-export shape).
  `@amlfilter/workstation` follows the strict convention like `@amlfilter/browser` does.

### Corrections summary

| # | Recorded claim | Reality |
|---|----------------|---------|
| 1 | "ReviewPage" | File is `ReviewBoardPage.tsx`; seam itself verified clean |
| 3 | A resolution state machine with allowed transitions | Implied states only (PENDING → FALSE_POSITIVE/TRUE_POSITIVE/RESOLVED; re-screen → PENDING); **no transition enforcement** anywhere; API regex is the only validation |
| 5 | `src/worker/protocol.ts` | `src/engine/protocol.ts` (+ `src/engine/client.ts`) |
| 6 | `EngineRuntime.screen()` | `EngineRuntime.bootstrap()` → `.engine()` → `ScreeningEngine.screen()` |
| 10 | Biome + no-default-exports across workspace | Biome config only in `frontend/app`; no-default-exports is convention (app routes violate it by design), not a lint rule |

## 7. Out of scope for the slice

Each is a repetition of the proven pattern once the slice lands:

- **SARs + JS PDF (pdf-lib)** — new dependency + document generation; nothing about it
  stresses the architecture the slice doesn't already prove.
- **Attestations + ed25519 signing** — WebCrypto today only *verifies*; local signing
  is a new key-custody design question (`@noble/ed25519` is already available, §6.7).
- **`/lists` config** — list management assumes multiple lists; the slice ships with
  the one signed OFAC bundle.
- **Delta-rescan** — needs bundle-version change detection + re-screen orchestration;
  meaningless before matches persist locally (which the slice establishes).
- **Export/import durability** — OPFS-eviction insurance; explicitly accepted as a
  post-slice fast-follow (see Risks).
- **`/usage`** — server-metering concept; needs rethinking (or deletion) local-first.
- **`/whitelist`** — server-tier concept layered on the entities table; not needed for
  the slice journey.

## 8. Testing & acceptance gates

User hard rules, made concrete against the existing patterns:

1. **Tiering parity vs a Python-emitted golden.** New `backend/scripts/
   gen_tiering_golden.py` cloning `gen_scoring_golden.py` (§6.9): emit cases of
   `(score, possible_threshold[, strong]) → tier` from the canonical `classify_tier`,
   including the inclusive boundary edges (`score == 0.80`, `score ==
   possible_threshold`). TS `classifyTier` is asserted against the fixture in
   `tiering.parity.test.ts` (in `@amlfilter/workstation`). **No hardcoded thresholds in
   test expectations** — thresholds live only in the golden. Wire `tiering-golden` /
   `tiering-golden-check` poe tasks and add the check to `gate`, mirroring
   `backend/pyproject.toml:277–279`.
2. **TDD (red → green) for the ported behaviors.** Onboarding dup-rejection (same
   `customer_reference` → typed error, §6.8 semantics) and the resolution state
   behavior (§6.3 *observed* contract: PENDING on create, resolve sets
   status/timestamps/notes, re-resolution allowed, re-screen resets to PENDING) —
   failing Vitest first, in `@amlfilter/workstation`.
3. **Playwright e2e on the REAL app, real browser, `localhost`** (secure context —
   required for OPFS; LAN IPs / `host.docker.internal` do not count). Extend the
   existing KYC harness: `frontend/app/tests/e2e-kyc/` via `pnpm test:e2e:kyc`
   (`playwright.kyc.config.ts`, host Playwright like the C1 run). The spec drives
   onboard → review → resolve end-to-end, asserts the on-screen tiered match and the
   post-resolve queue state, asserts persistence across reload, and **fails on any
   console error**. Per CLAUDE.md, this browser pass is mandatory before the change is
   claimed done — green units/CI are not sufficient.
4. **Both gates green before done.** Backend: `cd backend && uv run poe gate` (ruff +
   mypy --strict + xenon + pytest ≥90% + golden checks). Frontend: `cd frontend && pnpm
   -r run lint && pnpm -r run build` + workspace unit tests + the Playwright runs.

## 9. Risks & open questions

### Risks (accepted or mitigated)

- **OPFS quota / eviction.** The browser may evict origin storage under pressure; KYC
  records would vanish. Mitigation: request `navigator.storage.persist()` at boot and
  surface the grant state. Residual risk **explicitly accepted for the slice** — the
  durable answer is export/import (deferred, §7).
- **sahpool single-connection across tabs.** opfs-sahpool does not support concurrent
  connections; a second tab will fail to acquire the handle pool. Slice stance: detect
  the acquisition failure in the DB worker and show a clear "already open in another
  tab" message rather than corrupt or hang. Multi-tab support is out of scope.
- **SQLite-WASM bundle size & Vite integration.** ~1 MB of wasm plus known friction
  bundling `@sqlite.org/sqlite-wasm` workers under Vite (asset URL resolution,
  `optimizeDeps` exclusion). Mitigated by lazy-loading the DB worker on first
  workstation use (the `/screen` demo path stays unaffected) and by the e2e gate
  running against the real built bundle.
- **TS-port divergence from the Python source of truth.** Tiering is golden-locked
  (§8.1), but dup-rejection and resolution semantics are mirrored by hand-written
  tests, not cross-language goldens — a behavior drift in the backend wouldn't
  auto-fail the local port. Accepted; revisit if the server tier evolves.
- **`ApiClient` surface breadth.** Pages outside the slice call methods
  (`createSar`, `generateAttestation`, `getUsage`, ...) that `LocalApiClient` won't
  implement yet. They must not be silently broken-but-reachable (the "unlinked tab"
  lesson): non-slice routes get unmounted or explicit not-yet-local placeholders —
  see open questions.
- **No backend regression risk:** server/DB tier code is untouched (D3) — only the
  frontend wiring changes; backend gate still must pass (tiering golden script lands
  backend-side).

### Open questions — RESOLVED at the user review gate (2026-06-09)

1. **Route `/` behavior:** **keep the public landing at `/`** (preserves PR #21); the
   workstation routes (`/customers`, `/review`, …) load directly with no login, and the
   landing CTA links into the workstation. This supersedes D3's literal "boots straight
   into the workstation" wording — D3's substance (no login, no key gate) is unchanged.
2. **Non-slice routes during the slice:** **hide them** — remove `/sars /attestations
   /lists /usage /whitelist` from nav and routing for the slice; no dead UI. They return
   as later cycles land them.
3. **`LocalApiClient` typing:** **full `ApiClient` surface** — slice methods are real;
   every non-slice method throws a typed `NotImplementedError`. Pages keep compiling
   against the same singleton type, and a stray call fails loudly instead of silently.
4. **Resolution semantics:** **port as-is** — the observed backend contract (§6.3:
   unconditional re-resolve, re-screen resets to PENDING). Keeps TS/Python parity
   meaningful; any tightening is a later cycle applied to BOTH sides.
5. **`reviewer_id` locally:** **one-time analyst name** — prompt once, persist in a
   SQLite settings row, stamp it on resolutions; editable later. Meaningful audit trail
   with zero auth machinery.
