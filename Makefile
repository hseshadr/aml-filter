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
.PHONY: help demo-browser demo-server demo-bundle

help: ## Show this help.
	@echo "aml-filter demos:"
	@echo "  make demo-browser   ONE command: in-browser /screen over a signed bundle (no backend)"
	@echo "  make demo-server     the DB-backed API stack (Postgres + Valkey + api + worker)"
	@echo "  make demo-bundle     regenerate the committed demo bundle + pinned key from the CLI"

demo-browser: ## One command: serve the signed demo bundle + build the SPA, open http://localhost:5173/screen
	@echo ">> edge     -> http://localhost:8081        (signed demo bundle the browser syncs)"
	@echo ">> /screen  -> http://localhost:5173/screen <- open THIS in your browser"
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
