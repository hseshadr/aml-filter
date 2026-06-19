# Quickstart

aml-filter is a **zero-server, in-browser** AML / sanctions screening app: a static
React SPA that syncs a **signed OFAC watchlist** into the tab and screens names
locally — embedding, search, and the explainable scorer all run in the browser. No
server, no database, nothing to provision.

Clone → install → run → screen a name. About **ten minutes**, mostly the first build
fetching the embedding-model weights.

> Reminder: aml-filter is a portfolio demo, **not** a compliance product. See
> [`../NOTICE`](../NOTICE).

## Prerequisites

- **Node 22.13.0** (see [`../frontend/.nvmrc`](../frontend/.nvmrc); `nvm use` picks it up)
- **pnpm** (`corepack enable` provides the pinned version)

That's the whole list. There is no backend to install.

## 1. Clone, install, run

All commands run from `frontend/` — there is no root `package.json`.

```bash
git clone https://github.com/hseshadr/aml-filter.git
cd aml-filter/frontend
pnpm install
pnpm --filter aml-filter-app dev      # Vite dev server; prints the localhost URL
```

Open the printed URL (default <http://localhost:5173>). Use **`localhost`**, not a LAN
IP — a secure context is required for the in-tab WebCrypto signature check and OPFS
storage.

## 2. Screen a name (`/screen`)

Go to **`/screen`**. On first visit the page:

1. boots the **MiniLM** embedder once (cached after the first load),
2. syncs the committed **signed watchlist** into the tab and **verifies it**
   (Ed25519 + SHA-256, fail-closed — a tampered or unsigned list aborts the load),
3. is then ready to screen names entirely in-tab.

Type a sanctioned-ish name (something close to a real SDN entry) and submit. You get a
**scored result with a `reasons[]` breakdown and a plain-language explanation** —
which name signals fired (name similarity, alias, country, DOB) and how they rolled up
into the score. Adjust the strictness slider (Lenient / Balanced / Strict) to see the
match threshold tighten. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the scoring
contract.

## 3. Onboard a customer and work a match (`/customers` → `/review`)

The app is a small **local-first KYC workstation** on top of screening. Its store is a
SQLite-WASM database persisted in your browser's OPFS — local to the tab, no server.

1. Go to **`/customers`** and onboard a customer (name, and optionally country / DOB).
   The customer is **auto-screened on the spot** against the signed watchlist; any hits
   are saved with the customer.
2. Go to **`/review`** to work the resulting matches. They are tiered
   (STRONG / POSSIBLE / WEAK); open one, read its reasons, and **resolve** it with a
   reviewer note (e.g. true positive / false positive).

Everything — onboarding, screening, and the review decision — happens in the browser
against the in-tab database and the signed watchlist.

## 4. Build a demo watchlist

The repo already ships a committed **demo** watchlist (signed, under
`frontend/app/public/watchlist/`) so `/screen` works on a cold clone. To rebuild it:

```bash
cd frontend
pnpm build-demo-list      # alias for: pnpm --filter @amlfilter/publisher run build-demo
```

This regenerates the four signed static files (`watchlist.json`, `watchlist.json.sig`,
`watchlist.manifest.json`, `watchlist.manifest.json.sig`). For building a watchlist from
your own OFAC export, and for refreshing the live list, see [`DEPLOY.md`](DEPLOY.md) and
the wire format in [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md).

## 5. Run the gate

There is no single `gate` script — run these four commands from `frontend/`, in order:

```bash
cd frontend
pnpm -r run lint          # Biome lint + format check across the workspace
pnpm -r run typecheck     # tsc across the workspace
pnpm -r run test          # Vitest across all packages (incl. the frozen scoring +
                          #   tiering golden parity tests vs. the source of truth)
pnpm -r run build         # production build across the workspace
```

These mirror what CI runs. The golden parity tests are the guard that the in-browser
scorer and tier classifier stay byte-for-byte faithful to their reference output.

### End-to-end browser lanes

Two Playwright lanes drive the **real minified build** against the **committed signed
demo watchlist** in real Chromium (from `frontend/app`):

```bash
cd frontend/app
pnpm test:e2e:c1     # the in-tab C1 screening lane (boot → verify → screen)
pnpm test:e2e:kyc    # the backend-free KYC journey: onboard → auto-screen → review → resolve
```

CI runs both. A green build is **not** proof the app works — these lanes are the
guard that the actual demo bundle verifies and screens in a real browser.

## Production build + preview (browser-validation path)

To exercise exactly what ships (and what the e2e lanes drive):

```bash
cd frontend
pnpm --filter aml-filter-app build      # runs tsc --noEmit && vite build;
                                        #   a prebuild hook fetches the model weights
                                        #   and regenerates demo stats
pnpm --filter aml-filter-app preview    # serves the dist/ build; open the printed URL
```

## Troubleshooting

- **`/screen` never becomes ready** — it boots the embedder and verifies the signed
  watchlist on first load; give the model fetch a moment on a cold cache, and confirm a
  clean browser console.
- **"signature verification failed"** — verification is fail-closed by design. Make sure
  you're serving the committed `watchlist/` files and the pinned `public.key` together,
  over a secure context (`localhost` or HTTPS) — not a LAN IP.
- **No matches ever** — screen a name that's actually close to one on the loaded
  watchlist (the committed demo list is small).
