# @amlfilter/publisher

**TL;DR** — the Node-side tool that turns a list of sanctioned entities into the
four signed static files the browser tier syncs and screens against, fully
offline. No backend, no Postgres, no torch at runtime.

It reads a source-entities JSONL, maps each record to the v3 wire shape
(recomputing `name_canonical` with the **same** `canonicalize()` the browser
uses), precomputes each entity's name embedding with transformers.js (the same
`Xenova/all-MiniLM-L6-v2`, 384-dim model the browser runs), packs the vectors,
and emits a **signed** `watchlist.json` + `watchlist.manifest.json` (each with a
detached Ed25519 `.sig`). The wire contract is `docs/WATCHLIST_FORMAT.md`.

## Why precompute vectors?

So the browser never embeds the list — only the one query/customer name in-tab.
The publisher does the heavy embedding once, at publish time, in Node.

## Quickstart — regenerate the committed demo artifact

```bash
# from frontend/
pnpm install
pnpm --filter @amlfilter/publisher run build-demo
```

That signs `fixtures/demo_entities.jsonl` (8 fake `DEMO_SDN` entities) with the
demo key and writes the four files to `frontend/app/public/watchlist/`, which
`vite preview` serves same-origin for the C1 e2e. `generatedAt` is pinned so the
output is byte-stable. The demo key's public half is the committed
`frontend/app/public/public.key`, so the artifact verifies in-tab.

## Publish your own list

```bash
pnpm --filter @amlfilter/publisher run publish -- \
  --in ./entities.jsonl \
  --version 2026-06-19 \
  --key ./signing.key \      # raw 32-byte Ed25519 seed
  --out ./public/watchlist \
  --models ../app/public/models   # dir containing Xenova/all-MiniLM-L6-v2/...
```

## Programmatic API

```ts
import { publishWatchlist, createNodeEmbedder } from "@amlfilter/publisher";

await publishWatchlist({
  entitiesJsonlPath: "./entities.jsonl",
  version: "2026-06-19",
  privateKey,                 // Uint8Array(32)
  outDir: "./public/watchlist",
  embedder: createNodeEmbedder("../app/public/models"),
});
```

The `embedder` is injected: tests pass a fake (no 23 MB model), production passes
`createNodeEmbedder`.

## OFAC ingestion (`src/fetchOfac.ts`)

`fetchOfacJsonl(listVersion)` fetches the live OFAC `SDN.CSV` + `ALT.CSV` and maps
`entity_id` / `primary_name` / `entity_type` / `aliases` **for real** (joining
aliases by `ent_num`). **DOB and country are NOT extracted** — OFAC carries them
only in freeform `Remarks` text, and reliable extraction is a marked `TODO`. The
**demo** path (`demo_entities.jsonl`) is fully real and is what the tests and the
committed artifact exercise.

## Tests

```bash
pnpm --filter @amlfilter/publisher run test
```

- **format** — contract keys, `dim === 384`, base64 vectors decode to
  `entities * 384` Float32 values, sorted countries, `dob[0] ?? null`, alias names.
- **signature round-trip** — the demo key's public half equals `public.key`, signed
  files verify via the browser's `verifyEd25519`, and a flipped byte fails closed
  (`SignatureError`).
- **determinism** — same input ⇒ identical bytes.

Tests use a deterministic fake embedder; the real model is exercised by `build-demo`.
