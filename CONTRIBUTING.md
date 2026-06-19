# Contributing

Contributions are welcome. aml-filter is small enough to read end-to-end in an
afternoon — start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> aml-filter is a portfolio demo, not a compliance product — see [`NOTICE`](NOTICE).

aml-filter is a pure-TypeScript, zero-server, in-browser app. It's a pnpm
workspace under [`frontend/`](frontend) with three packages: `frontend/app` (the
React app), `frontend/packages/amlfilter-browser` (the in-browser screening tier),
and `frontend/packages/amlfilter-workstation` (the local-first KYC tier). Tooling
is **pnpm + Biome** — no bun, ESLint, or Prettier.

## Local setup

```bash
cd frontend
pnpm install
```

## Quality gate (run before opening a PR)

Run from `frontend/`, in order — this mirrors CI:

```bash
cd frontend
pnpm install
pnpm -r run lint        # Biome (lint + format check)
pnpm -r run typecheck   # tsc --noEmit (TS strict)
pnpm -r run test        # Vitest
pnpm -r run build       # production build
```

Then the two end-to-end lanes, from `frontend/app`:

```bash
cd frontend/app
pnpm test:e2e:c1   # in-browser screening against the committed signed demo bundle
pnpm test:e2e:kyc  # backend-free onboard → screen → review → resolve journey
```

## How we work

- **Test-first.** Write the failing test, watch it fail for the right reason, then
  write the smallest code that turns it green.
- **TypeScript strict, no escape hatches.** No `any`, no default exports, no
  loosening Biome or tsconfig to make the gate pass.
- **Explainability is non-negotiable.** Every screening match must carry its signal
  breakdown — don't add a scoring path that returns a bare number.

## Invariants

The scoring signals and preset weights are the load-bearing contract (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#scoring--explainability-contract)).
Changing them changes the explanation shape — update the scorer and its tests
together.
