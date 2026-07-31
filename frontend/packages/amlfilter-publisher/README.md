# @amlfilter/publisher

**TL;DR** — the Node-side tool that fetches the required OFAC, UN, EU, and UK
sanctions feeds, validates their size and freshness, precomputes name vectors, and
emits the signed content-addressed bundle the browser delta-syncs. No application
backend, Postgres, or Python ML runtime.

Each `WatchlistSource` adapter maps upstream bytes into one neutral entity shape.
Production requires all four feeds, broad source-specific entity-count bounds, and
an upstream update timestamp no older than 90 days; any failed or implausible feed
aborts publication. The publisher uses the browser's canonicalizer, embeds names with
`Xenova/all-MiniLM-L6-v2` (384 dimensions), stages `catalog.json` plus per-list files,
and delegates content-defined chunking and Ed25519 signing to edge-proc. The served
contract is `latest` → `manifest/<hash>` → `chunk/<hash>`.

## Why precompute vectors?

So the browser never embeds the list — only the one query/customer name in-tab.
The publisher does the heavy embedding once, at publish time, in Node.

## Quickstart — regenerate the committed demo artifact

```bash
# from frontend/
pnpm install
pnpm --filter @amlfilter/publisher run build-demo-bundle
```

That rebuilds the deterministic demo CAS at
`frontend/app/public/bundle/origin/`. The demo key's public half is the committed
`frontend/app/public/public.key`, so the complete artifact verifies in-tab.

## Build the required live bundle

```bash
pnpm --filter @amlfilter/publisher run build-real-bundle -- \
  --version 2026-07-15 \
  --sequence 42 \
  --key ./signing.key \
  --out ../app/public/bundle/origin \
  --models ../app/public/models
```

`--sequence` must be greater than the verified live signed pointer. Deployment uses
`next-published-sequence` to fetch, verify, and increment that pointer instead of
deriving order from a CI run identifier. If the live origin predates sequence
versioning, its verified sequence-less pointer is treated as zero for the first
publish only; newly emitted pointers always carry a sequence.

The older `publish` command still emits the retired flat single-list artifact for
source-tooling compatibility; the browser does not load it.

## Programmatic single-list API (legacy flat artifact)

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

## Source ingestion

The live adapters and fixture-tested parsers are under `src/sources/`. OFAC SDN is
read from the U.S. Commerce Department's Consolidated Screening List
(`data.trade.gov`), keeping only the rows whose `source` is
`Specially Designated Nationals (SDN) - Treasury Department` — Treasury's own
export now sits behind a bot-challenge WAF and can no longer be read by a build
(the rationale is in `src/sources/csl.ts`). UN and EU parse their consolidated
XML; UK parses the OFSI CSV. Entity IDs are namespaced by source so identical
upstream IDs cannot collide.

## Tests

```bash
pnpm --filter @amlfilter/publisher run test
```

- **format** — contract keys, `dim === 384`, base64 vectors decode to
  `entities * 384` Float32 values, sorted countries, `dob[0] ?? null`, alias names.
- **signature and bundle round-trip** — the demo key's public half equals
  `public.key`; pointer, manifest, chunks, and materialized files verify through the
  browser decoder, and mutation fails closed.
- **determinism** — same input ⇒ identical bytes.

- **publication safety** — required-feed fetch/count/freshness failures abort;
  sequences advance from the verified live pointer; compressed and expanded chunks
  are bounded before allocation.

Tests use a deterministic fake embedder; the real model is exercised by `build-demo`.
