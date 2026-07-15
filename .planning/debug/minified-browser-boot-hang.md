---
status: diagnosed
trigger: "Investigate the deterministic AML-Filter minified browser boot hang in /Users/harish/dev/oss/aml-filter. Read AGENTS/instructions and the superpowers systematic-debugging/TDD constraints. DO NOT edit yet. Reproduction: from frontend/app, pnpm exec playwright test -c playwright.c1.config.ts tests/e2e-c1/screen-flow.spec.ts --workers=1; twice the search input remains disabled 160s with \"Downloading the signed sanctions list…\". Trace: all 31 network responses 200; signed demo bundle chunks complete; model config/tokenizer/23MB model_quantized.onnx fetched; no page errors; only content-length warnings from embedderWorker; no ready/error message. Determine the exact stalled await/component by tracing ScreenPage -> runtime -> bundle sync -> embedder client/worker -> transformers/ORT config. Compare working unit/e2e paths. Add temporary diagnostics only in your isolated workspace if necessary, but do not commit or push and do not propose a fix before root cause evidence. Return a concise root-cause report with file:line and the minimal red test/fix strategy."
created: 2026-07-12T17:08:29Z
updated: 2026-07-12T17:52:00Z
---

## Current Focus

hypothesis: confirmed — one Transformers pipeline triplicates the ONNX GET through its progress metadata path; overlapping conditional HTTP-cache writers fail, the model load rejects with `network error`, and the C1 test then spends 160s waiting for an input that correctly remains disabled in the error phase
test: two independent counterfactuals: disable only HTTP cache via pass-through routing, and omit only the Transformers progress callback
expecting: both confirmed — unchanged minified C1 reaches ready in 3.8s and 2.9s respectively
next_action: report exact root cause and smallest RED/fix strategy; do not edit production code

## Symptoms

expected: ScreenPage boot completes and enables the search input after sanctions bundle and embedding model initialization.
actual: Search input remains disabled for at least 160 seconds with "Downloading the signed sanctions list…"; no ready or error message arrives.
errors: No page errors; embedderWorker emits only content-length warnings. All 31 observed network responses return HTTP 200.
reproduction: From frontend/app run `pnpm exec playwright test -c playwright.c1.config.ts tests/e2e-c1/screen-flow.spec.ts --workers=1`; reproduced twice.
started: Not specified; currently deterministic in the minified browser C1 path.

## Eliminated

- hypothesis: transformers browser CacheStorage write/match remains pending after the model response
  evidence: with only `env.useBrowserCache = false` in an isolated worktree, the exact minified C1 test failed identically after 160s and still never requested `/ort/`.
  timestamp: 2026-07-12T17:30:00Z

- hypothesis: signed bundle sync or OPFS materialization is stalled
  evidence: model-worker script and all model assets are requested only after runtime.ts:507 completes bundle load and runtime.ts:515 enters loading-model.
  timestamp: 2026-07-12T17:34:00Z

- hypothesis: ORT loader/session creation is stalled
  evidence: failing traces contain no `/ort/` loader request; the pipeline has not reached ORT. With only ONNX response framing corrected, the same ORT configuration completes and C1 passes.
  timestamp: 2026-07-12T17:34:00Z

- hypothesis: production minification corrupts the worker/private-field call path
  evidence: the same minified worker/build passes in 2.6s when the ONNX response has an explicit length; minification was unchanged in the causal counterfactual.
  timestamp: 2026-07-12T17:34:00Z

- hypothesis: missing Content-Length/quadratic buffer growth alone causes the 160s hang
  evidence: a pass-through Playwright route preserved the same Vite gzip/chunked/no-Content-Length responses while disabling only HTTP cache; the unchanged app then passed C1 in 3.8s.
  timestamp: 2026-07-12T17:48:00Z

- hypothesis: multiple app warmups or an embedder-worker memoization race creates three pipelines
  evidence: runtime calls `embedder.embed` once; embedderWorker creates one memoized embedder and receives one request. The three GETs map to Transformers pipeline progress preflight, actual model load, and missing-length fallback metadata, and disappear sufficiently for C1 to pass when only the progress callback is omitted.
  timestamp: 2026-07-12T17:48:00Z

## Evidence

- timestamp: 2026-07-12T17:10:00Z
  checked: repository instructions and project skill discovery
  found: CLAUDE.md requires real production-build Chromium validation and isolated agents; no project-local .claude/skills or .agents/skills exist, and no debug knowledge base exists.
  implication: the C1 Playwright reproduction is the authoritative path; unit/build success cannot eliminate a minification/browser-worker initialization bug.

- timestamp: 2026-07-12T17:10:00Z
  checked: registered agent capability
  found: no callable Agent/subagent tool is exposed in this session.
  implication: use isolated read-only Codex worker processes as the closest available execution substrate, and verify all findings directly.

- timestamp: 2026-07-12T17:12:00Z
  checked: initial symbol and test inventory
  found: current code contains EngineRuntime, chunked bundle sync, embedderClient/embedderWorker, and a Vite config comment explicitly referencing a transformers.js minified-worker mis-compilation; CLAUDE.md's statement that chunked sync was removed is stale.
  implication: production minification configuration is a high-priority hypothesis, but must be traced to the exact unresolved await before confirmation.

- timestamp: 2026-07-12T17:17:00Z
  checked: ScreenPage → EngineRuntime → embedder worker control flow
  found: ScreenPage disables input until bootstrap resolves (ScreenPage.tsx:331); runtime emits loading-model only after `#loadEnabledLists` resolves (runtime.ts:507-515), then awaits `withTimeout(embedder.embed(WARMUP_PROMPT))` (runtime.ts:532-537). WorkerEmbedder settles only on a `type: result` message (embedderClient.ts:83-102); embedderWorker posts that only after `embedder.embed` resolves/rejects (embedderWorker.ts:77-100).
  implication: observed model asset fetches prove bundle sync/load completed and isolate the pending operation to the embedder worker warmup, not bundle sync. No result/error means the worker's internal embed promise has not settled or its terminal event is not delivered.

- timestamp: 2026-07-12T17:17:00Z
  checked: embedder internals
  found: PipelineEmbedder first awaits transformers `pipeline(...)` at embedder.ts:182, then awaits the first extractor invocation at embedder.ts:184-187. All model files returning 200 is necessary but does not prove either transformers pipeline construction or ORT session/inference completion.
  implication: next evidence must distinguish pipeline construction from first inference and identify the production-only transformation causing it.

- timestamp: 2026-07-12T17:23:00Z
  checked: retained Playwright trace network and console timeline
  found: bundle latest/manifest/chunks complete first; embedder worker then fetches model assets. The ONNX response completes, two internal requests for the same ONNX asset carry `_failureText: net::ERR_CACHE_WRITE_FAILURE`, and no `/ort/` loader request occurs. Only transformers content-length warnings appear. At the 120s runtime deadline ScreenPage transitions to an error banner (misclassified as bundle network error).
  implication: sync is conclusively complete; ORT initialization has not started. The pending operation lies in transformers resource loading after response read and before `InferenceSession.create`, with browser cache persistence the leading falsifiable cause.

- timestamp: 2026-07-12T17:23:00Z
  checked: transformers 4.2.0 source
  found: `loadResourceFile` awaits browser `cache.put` after fully reading each response (hub.js:420-428), then re-reads via `cache.match` (hub.js:462-468) before model construction can continue. The Cache API write path is therefore on the critical pipeline promise observed pending at embedder.ts:182.
  implication: a cache write/match that neither resolves nor rejects exactly explains successful HTTP responses, progress warnings, no ORT request, no worker result/error, and eventual outer timeout.

- timestamp: 2026-07-12T17:30:00Z
  checked: isolated cache-disabled counterfactual
  found: disabling transformers browser cache did not change the outcome. The model still had no Content-Length, emitted the same warnings, and no `/ort/` request occurred before timeout.
  implication: CacheStorage is not causal; the failure is earlier in model-byte consumption/parsing.

- timestamp: 2026-07-12T17:30:00Z
  checked: transformers `readResponse` implementation and production response headers
  found: the ONNX response is gzip/chunked with no Content-Length. Because local-only mode prevents usable remote metadata, `expectedSize` is absent. `readResponse` starts with a zero-length buffer and, on every chunk, allocates a new exact-size buffer and copies all prior bytes (hub/utils.js:88-133), making the 23 MB stream quadratic.
  implication: the retained content-length warning is mechanically tied to a potentially unbounded CPU/memory-copy path before ORT initialization; explicit length is the next causal counterfactual.

- timestamp: 2026-07-12T17:34:00Z
  checked: explicit-content-length counterfactual in isolated worktree
  found: restoring browser cache and changing only the intercepted ONNX response to the identical committed bytes with `Content-Length: 22972370` and no Content-Encoding made the exact minified C1 test pass in 2.6 seconds (8.1 seconds total including build/server).
  implication: missing response length is causal, not merely correlated; minification, cache, bundle sync, and ORT config are ruled out.

- timestamp: 2026-07-12T17:34:00Z
  checked: dev versus production preview response headers
  found: Vite dev serves the ONNX file with `Content-Length: 22972370`; Vite preview GET serves it as `Content-Encoding: gzip` + `Transfer-Encoding: chunked` with no Content-Length. The default Playwright lane uses Vite dev and only asserts the static shell; C1 uses preview and waits for ready.
  implication: this explains the production-only/minified-lane appearance and why unit/default-e2e paths passed without exercising the bad streaming condition.

- timestamp: 2026-07-12T17:42:00Z
  checked: Transformers 4.2.0 pipeline/model-registry call graph and trace request headers
  found: the app posts one warmup. `pipeline()` first probes every expected file for progress totals (pipelines.js:133-151), model loading then starts the real ONNX fetch (session.js:93-126), and the no-length streaming branch performs another metadata lookup (hub.js:385-414). The metadata memo keys differ (`revision` omitted vs `main`), so they do not deduplicate. Trace shows one unconditional GET followed by two conditional GETs carrying the first response's ETag.
  implication: triplication is upstream Transformers progress/metadata behavior within one pipeline initialization, not an embedder memoization race.

- timestamp: 2026-07-12T17:42:00Z
  checked: host disk state
  found: data volume has about 6 GiB free and reports 99% capacity, so cache pressure is plausible; however the failure also reproduces with Transformers CacheStorage disabled, which does not disable Chromium's HTTP cache.
  implication: a pass-through route that disables HTTP cache without changing response headers is required to distinguish cache pressure from missing-length processing.

- timestamp: 2026-07-12T17:48:00Z
  checked: pass-through routing counterfactual
  found: adding only `page.route("**/*", route => route.continue())` made the unchanged minified C1 path pass in 3.8s. Playwright documents that enabling routing disables HTTP cache; response compression/framing and app code were unchanged.
  implication: Chromium HTTP cache interaction is causal. Missing Content-Length is part of why Transformers issues its fallback metadata request, but buffer growth alone is not the hang.

- timestamp: 2026-07-12T17:48:00Z
  checked: progress-callback counterfactual
  found: with normal HTTP caching restored, changing only `createEmbedder` to omit the Transformers `progress_callback` made C1 pass in 2.9s. This skips pipeline metadata preflight/fallback streaming and reduces the model load to the ordinary path.
  implication: the smallest app-level causal fix is to stop opting into Transformers 4.2.0's progress metadata path (accept an indeterminate model-loading banner) unless upstream fixes local-file metadata deduplication/cancellation.

- timestamp: 2026-07-12T17:48:00Z
  checked: Chromium error semantics
  found: Chromium defines ERR_CACHE_WRITE_FAILURE as inability to write the disk cache; trace conditional requests overlap the initial same-URL transfer. Host data volume is 99% full with ~6 GiB free, so pressure can amplify the write failure, but a single normal cached model load succeeds without freeing disk when the progress callback is omitted.
  implication: low disk is an environmental contributor, not the root application race; the deterministic integration bug is the upstream triplicated progress-loading path against one cache key.

- timestamp: 2026-07-12T17:52:00Z
  checked: final retained DOM supplied by user and ScreenPage error path
  found: final DOM is `phase.kind === "error"` with `Could not load the screening bundle: network error`. That detail cannot come from the runtime's model timeout text; it is the model fetch rejection wrapped by bootErrorMessage.ts:11-13. C1 checks the alert only after `toBeEnabled({timeout:160000})` at screen-flow.spec.ts:53-57.
  implication: the app is not still booting at test completion. The model pipeline rejected and the worker/client error path settled; the apparent 160s hang is the test waiting on enabled state after boot has already failed.

## Resolution

root_cause: `EngineRuntime.#build` makes one worker warmup at runtime.ts:533; there is no app memoization race. `createEmbedder` passes a progress callback (embedder.ts:234-236), opting into Transformers 4.2.0's pipeline metadata preflight (pipelines.js:133-151). For the local ONNX URL, preflight performs a full GET; session loading performs the real GET (session.js:93-126); Vite preview gzip/chunks it without Content-Length, so `loadResourceFile` performs a fallback metadata GET (hub.js:385-414) under a different memo key. Those are the three overlapping requests. Trace shows one unconditional transfer and two conditional ETag requests failing Chromium's disk HTTP cache with `ERR_CACHE_WRITE_FAILURE`; model loading rejects `network error` before ORT. embedderWorker posts ok:false (embedderWorker.ts:91-99), ScreenPage enters error (ScreenPage.tsx:242-252), and the apparent 160s hang is screen-flow.spec.ts:53 waiting for enabled before it checks the already-present alert at lines 55-57. Host disk is 99% full/~6 GiB free and likely amplifies the cache failure, but is not sufficient cause: under the same disk state, disabling only HTTP cache passes in 3.8s and omitting only the progress callback passes with normal cache in 2.9s.
fix: Not applied. Smallest app-level fix is to stop passing `progress_callback` to Transformers 4.2.0 for this self-hosted model, retaining the indeterminate "Loading model" stage. Longer-term, report/consume an upstream fix that deduplicates local metadata requests, cancels metadata bodies, and reuses one consistent metadata key; do not change ES2022 or ORT configuration.
verification: Baseline fails deterministically. Disabling Transformers CacheStorage alone still fails (not Cache API). Disabling only Chromium HTTP cache via pass-through routing passes in 3.8s. Omitting only the Transformers progress callback with normal HTTP caching passes in 2.9s. No disk cleanup, ORT change, minification change, or bundle change was involved.
files_changed: []

## Postscript (2026-07-15)

The app-level fix described above shipped as PR #57 (commit 712c58c, "Fix browser
model boot cache failures", 2026-07-12): `createEmbedder` no longer passes a
`progress_callback` to Transformers 4.2.0, the boot banner keeps an honest
indeterminate "loading model" stage, and `screen-flow.spec.ts` now asserts a
single model request so the triple-fetch cannot silently return.

The production-CDN complement landed with this document's graduating PR: live
aml-filter.com served `/models/…/model_quantized.onnx` with
`cache-control: public, max-age=0, must-revalidate` and no Content-Length, so
every visit re-downloaded the full 23 MB model even after #57. A Cloudflare
Pages `_headers` rule now caches `/models/*` as
`public, max-age=31536000, immutable` — correct because the weights are
SHA-256-pinned at build time (`scripts/download-model.mjs`) and never mutate in
place. This file was recovered from the diagnosing session's stash
(`stash@{0}^3`) and committed so the analysis is not stranded.
