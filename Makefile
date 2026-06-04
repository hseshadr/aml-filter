# aml-filter — top-level demo targets.
#
# The headline is `make demo-browser`: one command from a cold clone to a working
# in-browser /screen page, screening a name against a signed OFAC bundle with NO
# backend. It serves the committed demo bundle + builds the SPA via docker compose
# (mirrors edge-reco's `docker compose up` bar).

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

.DEFAULT_GOAL := help
.PHONY: help demo demo-browser demo-server demo-bundle

help: ## Show this help.
	@echo "aml-filter demos:"
	@echo "  make demo            Fast dev-mode in-browser /screen (Caddy edge + Vite dev SPA)"
	@echo "                       unminified Vite dev — a quick local look, NOT the shippability proof"
	@echo "  make demo-browser   ONE command: in-browser /screen over a signed bundle (no backend)"
	@echo "                      minified PROD build — the canonical demo (same artifact the C1 e2e guards)"
	@echo "  make demo-server     the DB-backed API stack (Postgres + Valkey + api + worker)"
	@echo "  make demo-bundle     regenerate the committed demo bundle + pinned key from the CLI"

# Fast dev-mode showcase, runnable from the repo root. Delegates to the backend
# poe task (poe config lives in backend/pyproject.toml, not the root) so you do not
# have to `cd backend` first. Serves the UNMINIFIED Vite dev SPA — for proof the
# shipped artifact works, use `make demo-browser` (minified prod) + the C1 e2e.
demo: ## Fast dev-mode in-browser /screen — edge (:8081) + Vite dev SPA (:5173); override via AML_EDGE_PORT / AML_SPA_PORT. For shippability use `make demo-browser`.
	cd $(BACKEND_DIR) && uv run poe demo

demo-browser: ## One command: serve the signed demo bundle + build the SPA, open http://localhost:5173/screen (ports override via AML_EDGE_PORT / AML_SPA_PORT)
	@echo ">> edge     -> http://localhost:$${AML_EDGE_PORT:-8081}        (signed demo bundle the browser syncs)"
	@echo ">> /screen  -> http://localhost:$${AML_SPA_PORT:-5173}/screen <- open THIS in your browser"
	cd $(FRONTEND_DIR) && docker compose up --build

demo-server: ## The DB-backed API stack (Postgres + Valkey + api + worker) on :8000.
	docker compose up -d

# Regenerate the committed demo bundle + pinned public key from FICTIONAL entities.
# Slow once (downloads the MiniLM embedder + builds the index); the result is
# committed so `make demo-browser` never needs a model download. The private key
# stays under backend/examples/keys/ (git-ignored); the public verify key is pinned
# into the SPA build at frontend/app/public/public.key.
demo-bundle: ## Rebuild backend/examples/catalog + frontend/app/public/public.key from the demo entities.
	cd $(BACKEND_DIR) && uv run amlfilter keygen examples/keys/trust.key ../frontend/app/public/public.key
	cd $(BACKEND_DIR) && uv run amlfilter bundle examples/demo_entities.jsonl examples/catalog \
		examples/keys/trust.key --list-id DEMO_SDN --version demo-v1
