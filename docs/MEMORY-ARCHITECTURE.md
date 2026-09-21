# Browser memory architecture

**TL;DR.** AML-Filter uses SQLite for two separate jobs without mixing their trust
boundaries. Public semantic search runs in a Worker through `@edgeproc/browser`, SQLite
3.53.4, and sqlite-vector 1.1.2; each immutable signed list gets a derived in-memory
database. The verified bundle remains durably cached in the public OPFS-first bundle
store. Private KYC records live in a different SQLite-WASM database persisted to OPFS.

## What is resident

There are three deliberately separate storage classes:

| Data | Durable browser storage | Runtime cost | Why it stays separate |
| --- | --- | --- | --- |
| MiniLM weights | Same-origin CacheStorage | ~23 MB model asset plus runtime/WASM allocations | The model is loaded once by its worker and reused; it is not customer data |
| Signed public watchlist bundle | Worker-owned content-addressed store: OPFS preferred, bounded IndexedDB WebKit fallback | Verified bytes plus the lists selected for the current route | Ed25519, SHA-256, monotonic pointer, cached reuse, and verify-before-parse remain byte-level invariants |
| Public semantic index | One in-memory SQLite 3.53.4 database per immutable signed list, with sqlite-vector 1.1.2 in a Worker | Derived vector rows for the currently loaded lists | The database is disposable query state rebuilt only from verified bundle bytes; it is not another durable authority |
| Customers, matches, settings, audit events | Separate SQLite-WASM database on origin-private OPFS | Small transactional rows | Private state needs transactions, deletion, and audit semantics and never enters the public-list index |

The realistic 31,348 × 384 Float32 matrix is **48,150,528 bytes** (≤50 MiB) before
SQLite/WASM and model allocations. That matrix bound is still useful, but end-to-end
sqlite-vector latency and total browser memory come from the real Chromium lane; native
WASM memory and iOS tab limits still require a physical-device measurement.

## Residency policy

`frontend/app/src/lib/memoryPolicy.ts` is deterministic:

- unknown browser memory, mobile/iPadOS, or reported memory ≤8 GB → `streaming`;
- only a desktop explicitly reporting >8 GB may use `eager`;
- streaming retains metadata, loads one verified list, serializes screens, and disposes
  the prior index before loading the next one;
- the persisted list selection and scoring thresholds do not change with the policy.

The public `/screen` route eagerly initializes only OFAC SDN. Its Ready state therefore
means the SQLite Worker, sqlite-vector runtime, and vector rows are already local, so
typing and scoring make zero network requests; it does not load the rest of the signed
catalog. The configurable workstation keeps the policy above, so a low-power laptop is
not treated as safe merely because it identifies as a desktop or omits
`navigator.deviceMemory`.

The Chromium C1 gate keeps post-boot JavaScript heap below **384 MiB** when the metric is
available. This is a regression ceiling, not a claim about total RSS or WebAssembly
memory; the physical iPhone acceptance run remains a separate release evidence item.

## Shipped sqlite-vector design

`VectorIndex` calls `createSqliteVectorIndex` from
`@edgeproc/browser/vector/sqlite`. The shared runtime packages SQLite 3.53.4 with the
Apache-2.0 sqlite-vector 1.1.2 extension and executes it in a Worker. AML inserts decoded
vectors in bounded batches and requests `persistence: "memory"`; consequently each
loaded immutable list has its own isolated, disposable database.

This does **not** move the signed bundle into an additional durable database. The
OPFS-first content-addressed bundle store remains the recovery source of truth and every
input is verified before rows are derived. Streaming residency disposes the prior list's
database before loading the next, while eager residency may retain one database per
enabled list. A reload can always rebuild these indexes from the verified cached bundle.

The KYC store is intentionally unrelated: `@amlfilter/workstation` owns its own
SQLite-WASM Worker and OPFS database for customers, matches, settings, and audit events.
No customer record or query is written to the public-list databases or bundle cache.
This keeps the design composable: the shared package owns vector execution, the signed
bundle owns public-data durability, and the workstation owns private transactional data.
