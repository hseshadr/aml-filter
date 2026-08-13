# Browser memory architecture

**TL;DR.** SQLite is the right durable store for private KYC records. It is not the
right place to move AML-Filter's signed public vector bundle yet. The dominant runtime
cost is the local MiniLM/ONNX stack plus decoded vectors, so the release path bounds
vector residency first and treats any SQLite-vector migration as a measured experiment.

## What is resident

There are three deliberately separate storage classes:

| Data | Durable browser storage | Runtime cost | Why it stays separate |
| --- | --- | --- | --- |
| MiniLM weights | Same-origin CacheStorage | ~23 MB model asset plus runtime/WASM allocations | The model is loaded once by its worker and reused; it is not customer data |
| Signed public watchlists | Worker-owned content-addressed store: OPFS preferred, bounded IndexedDB WebKit fallback | One decoded list at a time in streaming mode | Ed25519, SHA-256, monotonic pointer, offline reuse, and verify-before-parse remain byte-level invariants |
| Customers, matches, settings, audit events | SQLite-WASM on origin-private OPFS | Small transactional rows | Private state needs transactions, deletion, and audit semantics rather than vector retrieval |

The realistic 31,348 × 384 Float32 index is **48,150,528 bytes** (≤50 MiB). The exact
flat scan measures **10.2 ms p50 / 17.0 ms p95** on the local macOS reference run.
Those numbers describe the vector matrix and scan, not the full browser process: native
WASM memory and iOS tab limits still require a physical-device measurement.

## Residency policy

`frontend/app/src/lib/memoryPolicy.ts` is deterministic:

- unknown browser memory, mobile/iPadOS, or reported memory ≤8 GB → `streaming`;
- only a desktop explicitly reporting >8 GB may use `eager`;
- streaming retains metadata, loads one verified list, serializes screens, and disposes
  the prior index before loading the next one;
- the persisted list selection and scoring thresholds do not change with the policy.

The public `/screen` route explicitly selects streaming with OFAC SDN. The workstation
uses the same policy, so a low-power laptop is not treated as safe merely because it
identifies as a desktop or omits `navigator.deviceMemory`.

The Chromium C1 gate keeps post-boot JavaScript heap below **384 MiB** when the metric is
available. This is a regression ceiling, not a claim about total RSS or WebAssembly
memory; the physical iPhone acceptance run remains a separate release evidence item.

## SQLiteAI / sqlite-vector decision

The official SQLiteAI browser bundle proves that a statically linked vector extension
can run in a Worker with OPFS, but it is a different SQLite-WASM build and VFS contract.
Browser WASM cannot dynamically load an extension. The bundle also carries a separate
Elastic-licensed runtime with an open-source grant whose downstream terms must be
reviewed before commercial distribution. Quantized scans are derived acceleration, not
an acceptable sole sanctions authority without exact-score parity evidence.

Therefore the current release **does not replace** the signed browser CAS or the exact
Float32 scan. A future `sqlite-vector-wasm` experiment must pass every gate below before
it can become a default:

1. verify the signed pointer, manifest, chunks, and file hashes before inserting any
   row; keep the signed CAS as the recovery source of truth;
2. prove exact-score and ranked-result parity against the current engine, including
   quantized fallback behavior and all explainable score reasons;
3. measure cold boot, warm query p50/p95, JS heap, WASM memory, and peak RSS on real
   Chromium, Android, and iPhone hardware;
4. prove crash-safe commit, rollback, clear-cache, offline reload, and two-tab recovery
   with the SQLite OPFS connection model;
5. verify the bundled license, dependency provenance, CSP/COOP/COEP requirements, and
   zero-egress privacy boundary; and
6. retain the current exact flat-scan fallback whenever the extension is unavailable,
   over budget, or fails parity.

This keeps the simple path simple: SQLite/OPFS for private durable records, one signed
browser-store contract for public verified artifacts, and bounded in-memory computation
for the query that is actually being screened.
