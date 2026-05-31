# @amlfilter/browser

**The in-browser tier of aml-filter — OFAC name screening that runs entirely in the tab, with no backend.**

It syncs a signed, content-addressed OFAC bundle into the browser's origin-private file system (OPFS), verifies it fail-closed (ed25519 + sha256), and then screens a name locally with an explainable score. Because the native (Python) producer and this browser consumer share one wire format and one scoring contract, an in-browser match is byte-compatible with the server.

> aml-filter is an engineering-portfolio demonstration. It is **not** legal advice and **not** a compliance product — see the root `NOTICE` and `LICENSE`.

## Two export surfaces

### `.` — domain screening (OFAC)

The full OFAC tier: bootstrap the engine over a synced bundle and screen names.

```ts
import { EngineRuntime } from "@amlfilter/browser";

const engine = await EngineRuntime.bootstrap();
const result = await engine.screen({ name: "Some Name" });
```

This surface owns the OFAC domain: entity/alias types, the explainable scoring presets, the embedder seam, and the `ScreeningEngine`.

### `./engine` — the reusable, domain-agnostic bundle-sync tier

The production substrate underneath the OFAC tier, with **zero** domain coupling (no screening, no embeddings, no OFAC). Spawn an `EngineClient`, `sync()` a signed bundle into OPFS in a Web Worker, `readFile()` the synced assets, then run your own compute over them.

```ts
import { EngineClient } from "@amlfilter/browser/engine";

const client = new EngineClient(/* ... */);
await client.sync(/* version pointer */);
const bytes = await client.readFile("some/asset");
```

Use this surface to build any in-browser edge-proc consumer — aml-filter just layers OFAC name screening on top of it.

> `./testing` exposes low-level sync primitives and the Worker-backed client for tests only — it is not a production surface.

## Attribution

The `./engine` tier is a **TypeScript port of edge-proc's browser bundle-sync engine** — the sync state machine, content-addressed store, fail-closed ed25519/sha256 crypto, and the canonical manifest/wire format. Individual files carry per-file provenance comments (e.g. "TS port of edgeproc.bundles.sync.sync_index", "mirrors edge-proc's …"). It shares one wire format and one trust root with every other edge-proc consumer.

edge-proc is MIT licensed, © Harish Seshadri — https://github.com/hseshadr/edge-proc.

This package is also MIT licensed (see the repository root `LICENSE` and `NOTICE`).
