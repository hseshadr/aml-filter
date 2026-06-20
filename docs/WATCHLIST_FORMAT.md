# Signed Watchlist Format (v3 wire contract)

The single source of truth for the artifact the publisher emits and the browser consumes.
Zero-server: these are plain static files on any host/CDN. Trust is end-to-end via Ed25519.

## Files (served as static assets)

| File | Purpose |
|------|---------|
| `watchlist.manifest.json` | tiny, for cheap version polling on app-open |
| `watchlist.manifest.json.sig` | detached Ed25519 signature (base64) over the manifest bytes |
| `watchlist.json` | the full list: entities + precomputed name vectors |
| `watchlist.json.sig` | detached Ed25519 signature (base64) over the `watchlist.json` bytes |

The browser polls the **manifest** first (small). If `version` differs from the last-synced
value, it fetches the full `watchlist.json`. Both are signature-verified **fail-closed**
(reuse `engine/crypto.ts` `verifyEd25519(pubkeyRaw32, bytes, sigBase64)`; pubkey pinned
same-origin from `public.key`).

## `watchlist.manifest.json`
```json
{
  "listId": "OFAC_SDN",
  "version": "2026-06-19",            // change-detection key (date or content hash)
  "generatedAt": "2026-06-19T00:00:00Z",
  "model": "Xenova/all-MiniLM-L6-v2",
  "dim": 384,
  "entitiesCount": 17234
}
```

## `watchlist.json`
```json
{
  "listId": "OFAC_SDN",
  "version": "2026-06-19",
  "generatedAt": "2026-06-19T00:00:00Z",
  "model": "Xenova/all-MiniLM-L6-v2",
  "dim": 384,
  "entities": [
    {
      "entity_id": "OFAC-12345",
      "name_canonical": "...",        // produced by the SAME canonicalize() the browser uses
      "aliases": ["..."],
      "dob": "1965" | "1965-03-02" | null,
      "countries": ["CA", "US"],       // sorted, deterministic
      "risk_category": "...",
      "source_list": "OFAC_SDN",
      "list_version": "2026-06-19"
    }
  ],
  "vectors": "<base64>"               // raw little-endian Float32 buffer,
                                       // row-major, length = entities.length * dim.
                                       // Decoded in-tab: new Float32Array(decode(base64)).buffer
                                       // Row i is the embedding of entities[i].name_canonical.
}
```

### Notes
- **Vectors are precomputed at publish time** with transformers.js in Node (the SAME
  `EMBEDDING_MODEL` / `EMBEDDING_DIM` as the browser), so the browser never embeds the list —
  only the query/customer name in-tab. No torch, no Python.
- **Float32 base64** keeps it simple; gzip on the host cuts it ~3×. int8 quantization is a
  future size optimization, deliberately deferred (YAGNI).
- **Determinism**: `name_canonical` via the shared `canonicalize()`; `countries` sorted —
  same rules as the committed scoring golden, so screening output stays parity-locked.
- **Signing**: detached signature over the exact file bytes. Production signs in the GitHub
  Action with a key held as a repo secret; the committed **demo** artifact is signed with a
  clearly-labeled non-production demo key whose public half is `frontend/app/public/public.key`.

## Catalog (v4) — the multi-list registry

v4 keeps the per-list `watchlist.json` / `watchlist.manifest.json` format **unchanged** and
adds, one level up, a **signed catalog** plus a **per-list directory** layout so a host can serve
several lists (OFAC, EU, UN, UK …) side by side. The single-list v3 layout is exactly the N=1 case.

### Directory layout (served as static assets)

```
watchlist/
  catalog.json                  # the signed registry of lists (below)
  catalog.json.sig              # detached Ed25519 signature over catalog.json bytes
  ofac/                         # one dir per list, named by a slug of the list id
    watchlist.json(.sig)        # the v3 files, UNCHANGED
    watchlist.manifest.json(.sig)
  eu/   watchlist.json(.sig) + watchlist.manifest.json(.sig)
  un/   watchlist.json(.sig) + watchlist.manifest.json(.sig)
  uk/   watchlist.json(.sig) + watchlist.manifest.json(.sig)
```

> During the transition, the legacy **flat** `watchlist/watchlist.json(.sig)` + manifest stay in
> place alongside the per-list dirs; the browser wave switches to the catalog and removes them.

### `catalog.json`

```json
{
  "schema": 1,
  "generatedAt": "2026-06-19T00:00:00Z",
  "lists": [                          // sorted by id, deterministic
    {
      "id": "EU_CONSOLIDATED",
      "title": "EU Consolidated",
      "version": "demo-1",            // EQUALS that list's manifest version
      "entitiesCount": 2,
      "path": "eu/"                   // per-list dir, relative to the catalog
    },
    { "id": "OFAC_SDN", "title": "OFAC SDN", "version": "demo-1", "entitiesCount": 3, "path": "ofac/" }
    // … UK_OFSI, UN_CONSOLIDATED
  ]
}
```

### Notes
- **The catalog is the trust anchor.** It is signed with the SAME key as each list's
  `watchlist.json`. The browser verifies the catalog fail-closed, then verifies each list it points
  at fail-closed — verify-before-parse, top to bottom. `catalog.json.sig` is a detached base64
  Ed25519 signature over the exact `catalog.json` bytes, same scheme as the list files.
- **`version` mirrors the manifest.** Each entry's `version` is taken straight from the
  `WatchlistManifest` the publisher returns for that list, so the catalog and the per-list manifest
  never disagree.
- **Namespaced entity ids.** Every adapter stamps `entity_id = "<source_list>:<rawId>"`
  (e.g. `OFAC_SDN:12345`, `EU_CONSOLIDATED:13`) so ids stay unique once lists are merged into one
  engine. This is the foundational cross-list-uniqueness decision.
- **Determinism**: lists are sorted by id and serialized with the same pretty + trailing-newline
  byte form, so identical `(lists, generatedAt)` ⇒ byte-identical `catalog.json`.
