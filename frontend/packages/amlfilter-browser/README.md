# @amlfilter/browser

**The in-browser screening engine of AML-Filter — multi-list sanctions screening that runs entirely in the tab, with no backend.**

Through an exact public-commit pin of `@edgeproc/browser` it delta-syncs a
same-origin OFAC/EU/UN/UK bundle, verifies the signed pointer,
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

For memory-constrained browsers, opt into bounded residency. Metadata remains available
for the directory, while one selected list's vector index is loaded and released at a
time; overlapping screens are serialized and a single most-recent index is retained:

```ts
const engine = await runtime.bootstrap(config, onStage, {
	residency: "streaming",
	enabledLists: ["OFAC_SDN", "EU_CONSOLIDATED"],
});
```

The SPA's deterministic memory policy uses streaming by default when the browser's
memory budget is unknown or ≤8 GB; eager residency is reserved for an explicitly
reported >8 GB desktop. Callers that need desktop throughput can still pass
`residency: "eager"` explicitly. The public `/screen` route uses streaming with OFAC
SDN selected, matching its visible OFAC-only copy and keeping iOS Safari within its
tab/WebAssembly memory budget. `EngineRuntime` serializes bootstrap, reload, and
cache-clear lifecycle operations; clear-cache disposes vector matrices, metadata, and
the optional model worker before the next verified boot.

### `./engine` — shared fail-closed primitives

This compatibility subpath re-exports the Ed25519/SHA-256 primitives and keeps
two tiny call-shape adapters over `@edgeproc/browser`; AML does not carry a
second sync engine.
Production bundle sync runs the shared Worker through the one-line
`edgeproc.worker.ts` Vite entry, and AML's vector class is a thin `{id, score}`
adapter over the shared `PackedVectorIndex`. Publisher/browser parity tests pin
the same public package contract:

```ts
import { verifyEd25519, sha256Hex, SignatureError } from "@amlfilter/browser/engine";

// throws SignatureError if the detached signature does not verify (fail-closed)
await verifyEd25519(pubkeyRaw32, bytes, sigBase64);
```

## Shared substrate

`@edgeproc/browser` is a normal Git dependency pinned to one reviewed public
commit, not vendored source or a local sibling link. That makes clean-clone CI
and downstream installs reproduce the same built package.

This package is also MIT licensed (see the repository root `LICENSE` and `NOTICE`).
