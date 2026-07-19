# AML-Filter Frontend

The entire aml-filter product: a **zero-server, pure-TypeScript, in-browser** AML/sanctions
screening app. There is no backend — the React SPA and the screening engine run entirely in
the tab. This directory is a **pnpm workspace** (pnpm + Biome; not npm/bun).

## Packages

| Package | Name | What it is |
|---------|------|------------|
| `app/` | `aml-filter-app` | The React + TypeScript (Vite) SPA — routes `/`, `/screen`, `/customers`, `/review`. |
| `packages/amlfilter-browser/` | `@amlfilter/browser` | The in-tab screening engine: fetch + fail-closed-verify the signed watchlist, embed in-tab, cosine search, explainable score. |
| `packages/amlfilter-publisher/` | `@amlfilter/publisher` | The Node-side tool that builds + Ed25519-signs the static watchlist files. |
| `packages/amlfilter-workstation/` | `@amlfilter/workstation` | The local-first KYC tier: SQLite-WASM/OPFS store + onboarding, review, tiering, and the bidirectional rescan. |

## Setup

```bash
cd frontend
pnpm install
```

Requires Node 22.13.0 (see `.nvmrc`) and pnpm.

## Development

```bash
pnpm --filter aml-filter-app dev
```

The app is served at `http://localhost:5173` (Vite prints the exact URL). Open `/screen` for
the in-tab OFAC screening demo, then `/customers` and `/review` for the KYC workstation.
The Customers page supports preview-first local CSV/XLS/XLSX import and XLSX customer
table export; the spreadsheet is not a full match/audit backup.

## Build

```bash
pnpm --filter aml-filter-app build      # tsc --noEmit && vite build
pnpm --filter aml-filter-app preview    # serve the minified build locally
```

The `prebuild` hook self-hosts the MiniLM model weights and generates demo stats. The
production build ships everything as static files in `app/dist/` — host it on any static
host/CDN over HTTPS (a secure context is required for in-tab WebCrypto signature verification
and OPFS).

## The gate

There is no single `gate` script. The gate is the CI sequence, run from `frontend/`:

```bash
pnpm -r run lint        # Biome
pnpm -r run typecheck   # tsc
pnpm -r run test        # Vitest (incl. the frozen scoring + tiering golden parity tests)
pnpm -r run build       # production build across the workspace
```

Plus the two real-Chromium Playwright lanes (from `frontend/app`):

```bash
pnpm test:e2e:c1        # in-tab C1 screening
pnpm test:e2e:kyc       # backend-free local-first KYC journey
```

## Publish a watchlist

```bash
pnpm build-demo-list    # rebuild the committed signed DEMO watchlist
pnpm publish-list       # production publisher (CLI flags: --in --version --key --out [--models])
```

See `../docs/WATCHLIST_FORMAT.md` for the signed-watchlist wire contract and the package
READMEs above for details.

> aml-filter is an engineering-portfolio demonstration. It is **not** legal advice and **not**
> a compliance product — see the root `NOTICE` and `LICENSE`.
