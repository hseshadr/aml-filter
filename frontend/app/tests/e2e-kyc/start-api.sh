#!/usr/bin/env bash
#
# Boot the DB-backed FastAPI app for the e2e-kyc Playwright suite, fully wired:
#   1. mint a matching ed25519 attestation keypair (so generated attestations are
#      SIGNED and /verify returns valid — the verify-key pin is satisfied);
#   2. bring the DB schema up (extensions + Base.metadata.create_all) AND seed the
#      deterministic KYC fixture (tenant + fixed API key + sanctions entity w/
#      embedding + enabled list + a non-STRONG match) — both via seed_e2e_kyc.py,
#      mirroring how the integration test suite builds its schema (no alembic, so
#      no dependency on alembic.ini's static sqlalchemy.url);
#   3. exec uvicorn on $E2E_API_PORT.
#
# Every step is idempotent, so Playwright may re-run this on each boot. Run from
# the backend/ directory (the Playwright config sets cwd). Required env:
#   DATABASE_URL, REDIS_URL, E2E_API_PORT, EMBEDDING_MODEL_PATH (optional, for CI).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${E2E_API_PORT:?E2E_API_PORT is required}"

KEY_DIR="${E2E_KEY_DIR:-/tmp/aml-e2e-kyc-keys}"
PRIVATE_KEY="${KEY_DIR}/attestation_signing.key"
PUBLIC_KEY="${KEY_DIR}/attestation_verify.key"

echo "==> [e2e-kyc] minting attestation keypair"
uv run python scripts/gen_attestation_keypair.py "${PRIVATE_KEY}" "${PUBLIC_KEY}"

echo "==> [e2e-kyc] ensuring schema + seeding deterministic KYC fixture"
uv run python scripts/seed_e2e_kyc.py

echo "==> [e2e-kyc] starting uvicorn on :${E2E_API_PORT}"
export VERIFY_KEY_PATH="${PUBLIC_KEY}"
export ATTESTATION_SIGNING_KEY_PATH="${PRIVATE_KEY}"
# Tier the STRONG floor at 0.70 for the e2e tenant. The "balanced" scoring preset
# caps an EXACT name-only match (no DOB/country corroboration) at ~0.75, which is
# below the production 0.80 STRONG floor — so without this override an
# exact-name onboarding match classifies as POSSIBLE and the STRONG-only File-SAR
# path is never reachable. 0.70 keeps the 0.75 exact match STRONG while leaving
# the seeded 0.55 non-match below it (POSSIBLE), preserving the STRONG-gate test.
# This is the documented TIER_STRONG env override (see scoring/tiers.py).
export TIER_STRONG="${TIER_STRONG:-0.70}"
exec uv run uvicorn aml_filter.api.main:app --host 127.0.0.1 --port "${E2E_API_PORT}"
