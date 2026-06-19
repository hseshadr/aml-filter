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
