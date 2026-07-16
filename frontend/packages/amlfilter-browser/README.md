# @amlfilter/browser

**The in-browser screening engine of AML-Filter — multi-list sanctions screening that runs entirely in the tab, with no backend.**

It delta-syncs a same-origin OFAC/EU/UN/UK bundle, verifies the signed pointer,
manifest, compressed chunks, and materialized files **fail-closed** against a pinned
Ed25519 public key and SHA-256 content addresses, embeds the query in-tab with MiniLM,
and produces an explainable weighted score. Verified bytes are cached in OPFS for
offline reuse; customer queries never enter that public-data cache.

> aml-filter is an engineering-portfolio demonstration. It is **not** legal advice and **not** a compliance product — see the root `NOTICE` and `LICENSE`.

## Two export surfaces

### `.` — domain screening

Bootstrap the engine over the signed multi-list bundle and screen names.

```ts
import { EngineRuntime } from "@amlfilter/browser";

const engine = await EngineRuntime.bootstrap();
const result = await engine.screen({ name: "Some Name" });
```

This surface owns entity/alias types, the explainable scoring presets (`computeScore` /
`PRESETS`, five weighted signals), the embedder seam, and `ScreeningEngine`.

### `./engine` — fail-closed bundle and crypto primitives

The domain-neutral engine surface includes Ed25519/SHA-256 verification plus the
bounded fetch, zstd decode, content-addressed delta-sync, OPFS store, and Worker client.
The publisher/browser parity tests pin this shared contract:

```ts
import { verifyEd25519, sha256Hex, SignatureError } from "@amlfilter/browser/engine";

// throws SignatureError if the detached signature does not verify (fail-closed)
await verifyEd25519(pubkeyRaw32, bytes, sigBase64);
```

## Attribution

The fail-closed Ed25519 / SHA-256 crypto and the canonical signed-watchlist wire format are a **TypeScript port of edge-proc's browser tier** — individual files carry per-file provenance comments (e.g. "TS port of edgeproc…", "mirrors edge-proc's …"). It shares one wire format and one trust root with every other edge-proc consumer.

edge-proc is MIT licensed, © Harish Seshadri — https://github.com/hseshadr/edge-proc.

This package is also MIT licensed (see the repository root `LICENSE` and `NOTICE`).
