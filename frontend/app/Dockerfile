# aml-filter SPA image — multi-stage: Vite build -> static serve.
#
# The /screen page is backend-free: it syncs the signed OFAC bundle from the Caddy
# edge and runs the matcher entirely in the browser. There is no API server in the
# request path.
#
# Build context: the pnpm-WORKSPACE ROOT (frontend/), because the SPA depends on
# the in-repo @amlfilter/browser workspace package (frontend/packages/
# amlfilter-browser) and the lockfile lives at the root. Built via docker compose
# with `context: .` + `dockerfile: app/Dockerfile`.
#
# VITE_BUNDLE_BASE_URL is baked at BUILD time (Vite inlines import.meta.env at
# compile). It must be the origin the BROWSER reaches — i.e. the host-mapped edge
# port (http://localhost:8081), NOT the in-network `edge` hostname.

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

# Caddy edge origin the browser syncs the signed bundle from. Default targets the
# host-mapped edge port; compose can override.
ARG VITE_BUNDLE_BASE_URL=http://localhost:8081
ENV VITE_BUNDLE_BASE_URL=${VITE_BUNDLE_BASE_URL}

# Build only the SPA workspace; it resolves @amlfilter/browser via the workspace link.
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
