# @amlfilter/browser

**The in-browser screening engine of aml-filter — OFAC name screening that runs entirely in the tab, with no backend.**

It fetches a signed OFAC watchlist same-origin, verifies its detached Ed25519 signature **fail-closed** against a pinned public key, decodes the precomputed name vectors, embeds the query name in-tab (transformers.js MiniLM, `Xenova/all-MiniLM-L6-v2`, 384-dim), runs a brute-force cosine search, and produces an **explainable** weighted score — all locally. The wire contract is `docs/WATCHLIST_FORMAT.md`; the `@amlfilter/publisher` package produces the signed files this consumer reads.

> aml-filter is an engineering-portfolio demonstration. It is **not** legal advice and **not** a compliance product — see the root `NOTICE` and `LICENSE`.

## Two export surfaces

### `.` — domain screening (OFAC)

The full OFAC tier: bootstrap the engine over the signed watchlist and screen names.

```ts
import { EngineRuntime } from "@amlfilter/browser";

const engine = await EngineRuntime.bootstrap();
const result = await engine.screen({ name: "Some Name" });
```

This surface owns the OFAC domain: entity/alias types, the explainable scoring presets (`computeScore` / `PRESETS`, five weighted signals), the embedder seam, and the `ScreeningEngine`.

### `./engine` — the fail-closed crypto primitives

After the v3 pivot to a single signed JSON watchlist, the heavy chunked-CAS sync tier (OPFS store, GearCDC chunk reassembly, zstd, the sync Worker) is **gone** — the browser fetches one signed file and verifies it. What remains reusable, and what the publisher's round-trip test pins against, is the fail-closed Ed25519 primitive plus a content hash, with **zero** domain coupling (no screening, no embeddings, no OFAC):

```ts
import { verifyEd25519, sha256Hex, SignatureError } from "@amlfilter/browser/engine";

// throws SignatureError if the detached signature does not verify (fail-closed)
await verifyEd25519(pubkeyRaw32, bytes, sigBase64);
```

## Attribution

The fail-closed Ed25519 / SHA-256 crypto and the canonical signed-watchlist wire format are a **TypeScript port of edge-proc's browser tier** — individual files carry per-file provenance comments (e.g. "TS port of edgeproc…", "mirrors edge-proc's …"). It shares one wire format and one trust root with every other edge-proc consumer.

edge-proc is MIT licensed, © Harish Seshadri — https://github.com/hseshadr/edge-proc.

This package is also MIT licensed (see the repository root `LICENSE` and `NOTICE`).
