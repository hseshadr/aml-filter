# aml-filter SPA image — multi-stage: Vite build -> static serve.
#
# The /screen page is backend-free: the SPA bundles the committed signed-JSON OFAC
# watchlist as a static public/ asset and runs the matcher entirely in the browser.
# There is no edge origin, no VITE_BUNDLE_BASE_URL, and no API server in the request
# path.
#
# Build context: the pnpm-WORKSPACE ROOT (frontend/), because the SPA depends on
# the in-repo @amlfilter/browser workspace package (frontend/packages/
# amlfilter-browser) and the lockfile lives at the root. Build with
# `context: frontend/` + `dockerfile: app/Dockerfile`.

# ---- stage 1: build the static bundle ----
FROM node:24-slim AS build

# corepack ships with Node; it activates the pnpm version pinned in
# package.json's "packageManager" field.
RUN corepack enable

WORKDIR /workspace

# Install deps first (better layer caching): copy the workspace manifests + the
# root lockfile + the pnpm workspace config, then `pnpm install` resolves the
# whole workspace (app + package).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY packages/amlfilter-browser/package.json ./packages/amlfilter-browser/package.json
RUN pnpm install --frozen-lockfile

# Bring in the full workspace sources (the package is consumed as TS by Vite).
COPY . .

# Build only the SPA workspace; it resolves @amlfilter/browser via the workspace
# link. The app's `prebuild` hook (scripts/download-model.mjs) runs first and
# mirrors the MiniLM embedder weights into public/models/, so the shipped dist/
# serves them same-origin and /screen never depends on huggingface.co at runtime.
# (Requires network during build, same as the `pnpm install` above.)
RUN pnpm -F aml-filter-app run build

# ---- stage 2: serve the static dist/ ----
# `serve` is a tiny zero-config static server; -s rewrites unknown routes to
# index.html so the SPA's /screen route resolves on a hard refresh. Listens on
# 5173 to match the dev origin.
FROM node:24-slim AS serve

WORKDIR /app
RUN npm install -g serve@14

COPY --from=build /workspace/app/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
