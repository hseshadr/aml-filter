# Quickstart

aml-filter is a **zero-server, in-browser** watchlist-filtering and KYC-review app: a
static React SPA that syncs a **signed catalog of sanctions lists** (OFAC, EU, UN,
UK/OFSI) into the tab and screens names locally — embedding, search, and the explainable
scorer all run in the browser. No server, no database, nothing to provision.

Clone → install → run → screen a name → work it in the review board. About **ten
minutes**, mostly the first build fetching the embedding-model weights.

> The source repository is currently private. The clone path below requires collaborator
> access; the public live demo remains available at <https://aml-filter.com>.

> Reminder: aml-filter is a portfolio demo, **not** a compliance product. See
> [`../NOTICE`](../NOTICE).

## Prerequisites

- **Node 22.13.0** (see [`../frontend/.nvmrc`](../frontend/.nvmrc); `nvm use` picks it up)
- **pnpm** (`corepack enable` provides the pinned version)
- **A supported desktop browser** — current or previous Chrome, Edge, Firefox, or
  Safari 17+, with module Workers, OPFS, WebCrypto, and Web Locks enabled

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
2. syncs the committed **signed catalog** into the tab — it verifies `catalog.json`
   first, then each enabled list it points at (Ed25519 + SHA-256, fail-closed — a
   tampered or unsigned file aborts the load),
3. is then ready to screen names across all enabled lists entirely in-tab.

Type a sanctioned-ish name (something close to a demo entry) and submit. You get a
**scored result with a `reasons[]` breakdown and a plain-language explanation** —
which name signals fired (name similarity, alias, country, DOB), how they rolled up
into the score, and which **source list** the match came from. Adjust the strictness
slider (Lenient / Balanced / Strict) to see the match threshold tighten. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the scoring contract.

## 3. Choose lists and sensitivity (`/settings`)

Go to **`/settings`** to configure the screening run. It persists to the local SQLite
`settings` table (not the server — there is no server):

- **Screening sensitivity** — Strict / Balanced / Lenient. This is the global match
  threshold; Strict surfaces fewer, higher-confidence matches.
- **Watchlists** — tick the lists to screen against (OFAC SDN, EU, UN, UK/OFSI). A list
  you disable drops out of future screens; its matches become `SUPPRESSED` on the next
  rescan.
- **Per-list overrides** — tighten or loosen the threshold for one list independently.
- **Analyst name** — stamped on the dispositions you record.
- **Clear cached lists** — drops the durable OPFS bundle cache; the next load
  re-fetches and re-verifies fail-closed.

## 4. Onboard a customer and work a match (`/customers` → `/review`)

The app is a small **local-first KYC workstation** on top of screening. Its store is a
SQLite-WASM database persisted in your browser's OPFS — local to the tab, no server.

1. Go to **`/customers`** and onboard a customer (name, and optionally country / DOB).
   The customer is **auto-screened on the spot** across all enabled lists; any hits are
   saved with the customer.
2. Go to **`/review`** to work the resulting matches. They are tiered
   (STRONG / POSSIBLE / WEAK) and carry a **Source** column naming the list. Use the
   **View filter** (All / Needs review / Changed only) to focus; open the per-match
   **History drawer** to read the audit trail; open a match, read its reasons, and
   **resolve** it with a reviewer note (e.g. true positive / false positive).
3. **Re-screen behavior.** When a list version advances (or you edit the customer), the
   match is re-screened. If nothing material changed, the match keeps your prior
   disposition and stays suppressed — you don't re-review it. If the matched entity's
   identity data changed, the match is flagged **CHANGED — needs re-review** (keeping the
   prior disposition) and shows up under "Needs review" / "Changed only". Every
   transition is appended to the `match_events` audit trail. Deleting that customer
   atomically erases the customer, matches, reviewer notes, and event history.

Everything — onboarding, screening, and the review decision — happens in the browser
against the in-tab database and the signed lists.

## 5. Build a demo bundle

The repo already ships a committed **demo** bundle (the signed, content-addressed
distribution under `frontend/app/public/bundle/origin/` — the `latest` pointer +
`manifest/<hash>` + `chunk/<hash>` CAS) so `/screen` works on a cold clone. To rebuild it:

```bash
cd frontend
pnpm --filter @amlfilter/publisher run build-demo-bundle
```

This regenerates the signed `latest` pointer, the content-hashed manifest, and the chunk
store the browser delta-syncs (carrying `catalog.json` + each list's `entities.jsonl` /
`vectors.f32` / `meta.json`). For building lists from your own exports, and for refreshing
the live data, see [`DEPLOY.md`](DEPLOY.md) and the wire format in
[`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md).

## 6. Run the gate

Run the same canonical gate CI runs, from `frontend/`:

```bash
cd frontend
pnpm gate
```

This runs lint, strict typechecking, thresholded coverage, production builds, i18n
verification, and all three real-browser lanes. The golden parity tests guard the
in-browser scorer and tier classifier against their frozen reference output.

### End-to-end browser lanes

Three Playwright lanes drive the **real minified build** against the **committed signed
demo bundle** in real Chromium (from `frontend/app`):

```bash
cd frontend/app
pnpm test:e2e:c1     # the in-tab C1 screening lane (boot → verify → screen)
pnpm test:e2e:kyc    # the backend-free KYC journey: onboard → auto-screen → review → resolve
pnpm test:e2e:bundle # signed-bundle delta sync: verify → OPFS → offline reload
```

CI runs all three. A green build is **not** proof the app works — these lanes are the
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
  watchlist bundle on first load; give the model fetch a moment on a cold cache, and
  confirm a clean browser console.
- **"signature verification failed"** — verification is fail-closed by design. Make sure
  you're serving the committed signed bundle (`bundle/origin/` — the `latest` pointer +
  `manifest/` + `chunk/`) and the pinned `public.key` together, over a secure context
  (`localhost` or HTTPS) — not a LAN IP. The same check runs over cached bytes, so a
  stale/corrupt cache also fails closed; use **Clear cached lists** in `/settings` to
  force a re-fetch.
- **No matches ever** — screen a name that's actually close to one on an enabled list
  (the committed demo lists are small), and confirm the list is enabled in `/settings`.
