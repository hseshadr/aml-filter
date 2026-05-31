# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] — 2026-05-30

Public-launch readiness: a teen-readable two-altitude README, legal attribution and
disclaimers for the OFAC sanctions data, a green strict quality gate, and CI.

### Added

- `LICENSE` (MIT) and `NOTICE` — OFAC SDN attribution (public domain, never bundled)
  plus a prominent not-legal-advice / not-a-compliance-product disclaimer.
- Two-altitude `README.md` — a plain-language front door (what/why, one-command demo)
  over an "Under the hood" developer section.
- `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, and d2 diagrams (`docs/diagrams/`:
  `system-context`, `screening-pipeline`) with rendered SVGs.
- GitHub Actions CI: `.github/workflows/ci.yml` (backend gate) and
  `frontend.yml` (lint/typecheck/test/build + Playwright e2e).
- Typed, env-overridable configuration for scoring presets (`SCORING_*`) and
  rate-limit tiers (`RATE_LIMIT_*`), replacing in-source magic numbers.
- Frontend unit tests (vitest + Testing Library) for the API client, auth context,
  and error boundary.

### Changed

- Fail-closed configuration: a missing `DATABASE_URL` now aborts startup with an
  explicit error instead of silently degrading.
- Eliminated all `dict[str, Any]` from the backend in favour of precise Pydantic
  models and typed JSON aliases (`aml_filter/types.py`).
- Decomposed over-complex functions to the strict floor (≤15-line functions,
  Radon Grade A); `mypy --strict` clean across the backend.
- Frontend tooling moved from bun + eslint to **pnpm + Biome**, matching the
  portfolio standard.

### Removed

- Legacy `DEPLOYMENT_READY.md` status doc and `docs/archive/` implementation notes.
