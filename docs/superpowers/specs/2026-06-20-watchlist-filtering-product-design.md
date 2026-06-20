# aml-filter v4 — local-first watchlist-filtering + KYC-review product (design)

Status: approved 2026-06-20. Built on the shipped v3 (zero-server, pure-TS, in-browser OFAC
screening). This spec grows it into a complete, local **watchlist-filtering + KYC-review** product.
Everything stays zero-server / in-tab. Source of truth for the implementation plan.

## Why

v3 screens one list (OFAC) and has a thin review surface. Gaps:
- **Review tool**: threshold hardcoded (`ONBOARDING_THRESHOLD=0.65`); no audit trail (the match row
  is overwritten on disposition); re-screen carry-forward keyed on `entity_id` only, so a change to
  the *matched entity's content* is silently carried forward.
- **Single list**; no adapters, no selection.
- **Watchlist not cached** — refetched + rebuilt every load (fine for the demo; ~26 MB × 4 lists for
  real lists). The client list already persists in SQLite-WASM/OPFS.

## Locked decisions
- Threshold: global default sensitivity (Strict/Balanced/Lenient) **+ optional per-list override**.
- Re-review: on material change (profile **or** matched-entity content) → flag **"CHANGED — needs
  re-review"**, keep the prior disposition + notes. Never silently clear; never silently re-alert an
  unchanged false positive.
- Lists at launch: OFAC SDN + EU + UN + UK OFSI, behind a pluggable adapter.
- Foundational: namespace entity IDs by source (`OFAC_SDN:123`); fail-closed Ed25519 trust spine on
  every list + the catalog + the cache.

## Architecture — 3 additive themes (today's single-list path is the N=1 case)

### Theme A — Multi-list (adapters, signed catalog, multi-index engine, selection)
- `WatchlistSource` adapter interface (publish-time): `{id,title,fetchRaw(),parse(raw,version)→SourceLine[]}`.
  Four adapters (OFAC wraps the existing `parseSdn`; EU/UN/UK new). Shared embed + sign. Per-list
  artifacts at `watchlist/<id>/`; adapters stamp namespaced `entity_id`.
- Signed `catalog.json(+.sig)` = `{schema:1, generatedAt, lists:[{id,title,version,entitiesCount,path}]}`
  — the trust-rooted registry.
- Browser: `fetchVerifiedCatalog` + `loadList` (reuse verify-before-parse + `buildLoaded`), a
  `MultiListScreeningEngine` = one `ScreeningEngine` per list over **one shared embedder**, query
  embedded **once** (extract `screenWithVector`), matches merged + top-k. `Match` already carries
  `source_list`/`list_version`; `MultiListScreeningEngine` satisfies the `NameScreener` seam →
  onboarding/rescan/review unchanged.
- Per-list threshold: `perList[id] ?? query.threshold ?? default`, thresholded before the merge.
- Selection in the `settings` table (`enabled_watchlists` default all; `list_thresholds`). Composite
  rescan stamp from per-list versions.

### Theme B — Enterprise review tool (build FIRST)
- **Configurable threshold**: `screening_config.ts` (keys `screening_sensitivity`,
  `screening_threshold_overrides`); `resolveThreshold`, `loadScreeningConfig` (default balanced =
  today's 0.65). onboarding/rescan read config at screen time. Apply → persist + `rescanAll()`
  (never silently drop rows; below-bar matches logged `SUPPRESSED`, history kept); re-screen only on
  real change, with an affected-count confirmation.
- **Immutable audit trail**: append-only `match_events` (`event_id, match_id?, customer_id,
  ofac_entity_id, event_type[DETECTED|DISPOSITIONED|REOPENED|CHANGED|SUPPRESSED], from_status,
  to_status, reviewer_id, notes, at`), keyed on `(customer_id, ofac_entity_id)` so it survives
  match_id rotation. Writes in `recordMatches`/`resolveMatch`/`replaceMatches`. New
  `getMatchEvents(matchId)` store method (4-file plumbing).
- **Review-once / re-review-on-change**: `fingerprint.ts` — FNV-1a over canonicalized
  `{profile:{name_canonical,country}, entity:{name_canonical,aliases,dob,countries}}`
  (lowercased/trimmed/sorted/fixed-key — stability is critical). Computed in `tier_match.ts` (new
  `profile` param). New `material_fingerprint TEXT` + `review_state TEXT NOT NULL DEFAULT 'CURRENT'`
  (`CURRENT|CHANGED`, orthogonal to `resolution_status`). `replaceMatches`: unchanged → carry +
  suppress (no event); changed → carry disposition + set `CHANGED` + emit CHANGED; vanished →
  SUPPRESSED; new → DETECTED. NULL fingerprint (migrated rows) → adopt silently first time.
- **Review board UX**: View filter (`All | Needs review | Changed only`), `CHANGED` badge, per-row
  history drawer (`getMatchEvents`), `source_list` column; new `/settings` page (sensitivity control
  + per-list overrides + analyst name). `api.ts`/`localApi.ts` gain `getMatchEvents`,
  `get/setScreeningConfig`; `ReviewMatch` gains `review_state`.
- **Migration**: convert `db/schema.ts` to an ordered version list; `MIGRATION_V2` = additive
  `ADD COLUMN material_fingerprint`, `ADD COLUMN review_state … DEFAULT 'CURRENT'`,
  `CREATE TABLE match_events`. `SCHEMA_VERSION=2`. No table rebuild, no OPFS wipe.

### Theme C — Durable cache
- `listCache.ts` (IndexedDB): store verified bytes + sig per `(listId, version)`; on load poll the
  signed catalog → re-run `verifyEd25519` over cached bytes **fail-closed** → parse; else network +
  write. Cache is a byte store, never a trust store. `navigator.storage.persist()`, "Clear cache",
  size sanity-check. SQLite/OPFS = rows; IndexedDB = big list blobs.

## Build order
1. Theme B on the current OFAC/demo list (self-contained, immediate value, list-aware, namespaced ids).
2. Theme A (adapters + catalog + multi-engine + selection + EU/UN/UK).
3. Theme C (cache under `loadList`).
Each ships as its own PR behind the full gate + e2e lanes + a real-browser drive; northstar after each.

## Verification
- Unit (TDD): fingerprint stability; replaceMatches suppress/CHANGED/SUPPRESSED/DETECTED; NULL-adopt;
  threshold resolve + apply-rescans; match_events history across match_id rotation; v1→v2 migration
  preserves rows; (A) per-list+catalog determinism + multi-engine aggregation + per-list threshold;
  (C) cache fail-closed re-verify.
- e2e (real Chromium, secure-context localhost, real signed artifacts): FP stays suppressed on
  unchanged re-screen; profile/entity change → CHANGED with prior call kept → re-disposition clears;
  sensitivity change re-screens with history; list enable/disable changes screening; reload persists
  (OPFS + IndexedDB), offline works.

## Risks
Fingerprint stability (#1); cross-list id collisions (→ namespaced ids); partial list-load (→ fail
closed); cache poisoning (→ re-verify); migration on existing DBs (→ silent first-adopt +
(customer_id, entity_id) key); threshold churn (→ change-only + confirm); EU/UN/UK adapter DOB/country
completeness (→ fixture-validated).
