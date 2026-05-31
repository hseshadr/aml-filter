# Contributing

Contributions are welcome. aml-filter is small enough to read end-to-end in an
afternoon — start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> aml-filter is a portfolio demo, not a compliance product — see [`NOTICE`](NOTICE).

## Local setup

```bash
cd backend
uv sync
```

The admin/demo frontend uses pnpm:

```bash
cd frontend
pnpm install
```

## Quality gate (run before opening a PR)

```bash
cd backend
uv run poe gate
```

`poe gate` runs the exact commands CI runs, in order:

- `ruff check` + `ruff format --check`
- `mypy --strict`
- `xenon` (Radon Grade A — functions stay simple and ≤15 lines)
- `pytest` (unit; integration tests need Postgres + Valkey, ≥90% coverage)

For the frontend: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## How we work

- **Test-first.** Write the failing test, watch it fail for the right reason, then
  write the smallest code that turns it green.
- **Typed boundaries, no escape hatches.** No `dict[str, Any]`, no `# type: ignore`
  to dodge the gate, no loosening tool config to make it pass.
- **Explainability is non-negotiable.** Every screening match must carry its signal
  breakdown — don't add a scoring path that returns a bare number.
- **The sanctions list is never bundled.** It's downloaded from OFAC at runtime;
  keep it out of the repo and out of any container image.

## Invariants

The scoring signals and preset weights are the load-bearing contract (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#scoring--explainability-contract)).
Changing them changes the explanation shape — update the scorer and its tests
together.
