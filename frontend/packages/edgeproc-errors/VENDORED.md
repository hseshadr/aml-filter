# VENDORED — `@edgeproc/errors`

This directory is a **vendored copy** of the `@edgeproc/errors` package — the
portfolio's canonical-errors standard library: register a per-app catalog of
stable error codes, classify raw transport/boot failures into those codes,
describe them via your own i18next, and serialize to RFC 9457 Problem Details.
**Zero runtime dependencies.**

It was vendored so a fresh clone of this repo builds with `pnpm install` alone —
no sibling checkout, no npm publish, no extra credentials — exactly the way this
repo already vendors `@amlfilter/browser` at `packages/amlfilter-browser/`.

| | |
|---|---|
| Source repo | `hseshadr/errors` |
| Source path | repo root (`src/`, `test/`) |
| Vendored commit | `7705a72c938c0e0e18ae51c87f38820d31b8be6e` (`Initial @edgeproc/errors: canonical error glue (TDD)`) |
| Vendored on | 2026-07-14 |
| License | MIT (see `LICENSE`, copied verbatim from the source repo) |

## How AML-Filter consumes it

AML-Filter's bundle-load error taxonomy is registered against this library in
`app/src/pages/bootErrorMessage.ts` (`bundleErrorRegistry`). The cold-boot /
unsupported-device error path now classifies raw failures through the library's
registry — its typed boot errors (`DeviceUnsupportedError`, `QuotaError`,
`IntegrityError`, the transport `NetworkError`) each `match` a canonical
`starterPack` code — instead of an ad-hoc `if`-chain. The mapping is
**behaviour-identical**: the same failure still renders the same existing
`errors:*` i18n string (the "could not load the screening bundle" wrapper, or the
unsupported-device dead-end), so no user-visible copy or i18n key moved. See
`app/src/pages/bootErrorMessage.ts` and `app/src/pages/bootErrorMessage.test.ts`.

## What was copied / what wasn't

- **Copied byte-identical:** `src/**` (the library), `test/**` (its 56-test
  suite), `tsconfig.json`, `vitest.config.ts`, `biome.json`, `README.md`,
  `.gitignore`.
- **Not copied:** git history, `node_modules/`, `dist/`, `coverage/`, the
  `pnpm-lock.yaml` / `pnpm-workspace.yaml`, `tsconfig.build.json` (no build step
  — see below).
- **Added here (not upstream):** `LICENSE` travels with the redistribution and
  this file.

## Local adaptations (the only diffs from upstream)

1. **`package.json`** — rewritten for this pnpm workspace, mirroring
   `@amlfilter/browser`:
   - `exports["."]` points at **`./src/index.ts`** (TypeScript source consumed
     directly by Vite/Vitest/`tsc`), so there is **no build step and no `dist/`**.
   - Kept only the `typecheck`, `test`, and `test:coverage` scripts — the ones
     the workspace gates fan out over (`pnpm -r run typecheck` /
     `pnpm -r run test:coverage`).
   - Dropped upstream's `build` / `demo` / `lint` / `lint:fix` / `gate` scripts
     and the `@biomejs/biome` devDependency (this repo does not run upstream's
     per-package Biome lint; `biome.json` is retained for reference only), and the
     `packageManager` / `engines` / `files` / `main` / `module` / `types` fields.
   - Pinned `typescript` / `@types/node` / `vitest` / `@vitest/coverage-v8` to
     this workspace's versions so `pnpm install` resolves a single shared copy.
2. **No source diffs.** `src/**` and `test/**` are byte-identical to upstream;
   `tsconfig.json` (NodeNext, `noEmit`) and `vitest.config.ts` are unchanged.
