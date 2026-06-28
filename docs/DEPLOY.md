# Deploy

> aml-filter is a portfolio demo, **not** a compliance product. Do not deploy it as a
> production sanctions-screening control. See [`../NOTICE`](../NOTICE).

**TL;DR.** aml-filter is a **static single-page app** plus a **signed catalog of static
watchlist files**. There is nothing to provision — no server, no database, no
containers. Build it, then host the output directory on any static host or CDN
(Netlify, Vercel, GitHub Pages, S3 + CloudFront, Cloudflare Pages, …). The only hard
requirement is that it be served over a **secure context (HTTPS)** so the browser can do
WebCrypto signature verification and use OPFS.

## 1. Build the static site

All commands run from `frontend/` — there is no root `package.json`.

```bash
cd frontend
pnpm install
pnpm --filter aml-filter-app build
```

`build` runs `tsc --noEmit && vite build`. A `prebuild` hook first fetches the embedding
model weights and regenerates demo stats, so the output is self-contained.

The build emits **`frontend/app/dist/`**. Ship that directory as-is. It already includes
everything the app needs at runtime:

| Bundled into `dist/` | What it is |
| --- | --- |
| the SPA (HTML/JS/CSS) | the React app and the in-tab screening/scorer code |
| `watchlist/` | the committed **signed** demo catalog: `catalog.json(.sig)` + per-list dirs (`ofac/ eu/ un/ uk/`) |
| `public.key` | the pinned Ed25519 public key the app verifies the catalog + lists against |
| `models/` | the MiniLM embedding-model weights (loaded once, in-tab) |

## 2. Serve it (secure context required)

Serve `dist/` as plain static files over **HTTPS**. A secure context is required:

- **WebCrypto** (`crypto.subtle`) — the in-tab Ed25519 signature verification of the
  watchlist. The verification is **fail-closed**: any signature or hash mismatch aborts
  the load.
- **OPFS** — where the local-first KYC store (SQLite-WASM) persists in the browser.

`localhost` also counts as a secure context, which is what local preview and the e2e
lanes rely on; a LAN IP does **not** and will fail differently. Any static host that
serves over HTTPS works without further configuration.

## 3. Refreshing the lists

The sanctions lists change frequently; screening against a stale copy can miss
newly-listed entities. The OFAC list is regenerated and re-signed by the
**`publish-watchlist` GitHub Action** (the workflow runs the single-list `publish` CLI
for OFAC SDN; the committed demo **bundle** the app loads is rebuilt locally with
`build-demo-bundle`)
([`../.github/workflows/publish-watchlist.yml`](../.github/workflows/publish-watchlist.yml)).

**Trigger.** It runs **daily on a cron** (`0 6 * * *`, 06:00 UTC) and on manual
**`workflow_dispatch`** (with an optional `version` stamp input that defaults to the run
date).

**What it does.** Install workspace deps → resolve the version stamp → fetch the live
OFAC SDN list into `entities.jsonl` (via `fetchOfacJsonl`) → decode the signing key →
run the publisher → scrub the key → upload the four signed files as a build artifact.

**The signing key.** The `WATCHLIST_SIGNING_KEY` repository secret holds the **raw
32-byte Ed25519 seed, base64-encoded** (so it round-trips cleanly through a GitHub
secret). The job decodes it back to 32 raw bytes before signing and **fails if it is not
exactly 32 bytes**. The key's public half is the `public.key` pinned in the app build —
that pairing is what makes in-tab verification meaningful, so never rotate one without
the other.

**The signed artifact.** For a single list, the publisher emits four static files into
the out directory:

```
watchlist.json
watchlist.json.sig
watchlist.manifest.json
watchlist.manifest.json.sig
```

The committed demo **bundle** (`build-demo-bundle`) packs those per-list files plus a
`catalog.json` into the signed, content-addressed distribution the app loads at runtime:
a signed `latest` pointer → a content-hashed `manifest` → a `chunk/` CAS, under
`frontend/app/public/bundle/origin/`. See [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md).

Running the single-list publisher directly (the same CLI the Action invokes):

```bash
cd frontend
pnpm publish-list -- \
  --in <entities.jsonl> \
  --version <version-stamp> \
  --key <raw-32-byte-ed25519-seed-file> \
  --out <output-dir> \
  [--models <model-weights-dir>]
```

(`pnpm publish-list` is an alias for `pnpm --filter @amlfilter/publisher run publish`.)
The wire format is documented in [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md).

**Honest note on delivery.** The Action currently **uploads the four signed files as a
build artifact for review**. Actually getting them onto your static host — committing
them back to the repo, or pushing them to your object store / CDN — is **left as the
deployment choice**; wire that step to match wherever you host `dist/`.

## 4. How clients pick up a refresh

Once a new bundle is live, browser clients **auto-detect the new `version`** (the signed
`latest` pointer carries it), then delta-sync the changed chunks and **re-verify
fail-closed** against the pinned `public.key`, re-screening every customer. The durable
OPFS cache is content-addressed, so unchanged chunks are reused and a new publish only
fetches what changed. So the refresh flow is: rebuild + re-sign the bundle (the Action /
`build-demo-bundle`) → publish the new `latest`/`manifest`/`chunk` files to your host →
clients converge on their own.

## Deploy to Cloudflare (Pages + R2)

**TL;DR.** **Cloudflare Pages** hosts the SPA at **`aml-filter.com`** (apex is canonical;
`www` redirects to it). **Cloudflare R2** hosts the signed watchlist bundle at
**`lists.aml-filter.com`** (bucket `aml-filter-lists`), and the app fetches it at runtime
via the build-time env var `VITE_BUNDLE_BASE_URL=https://lists.aml-filter.com`. A scheduled
GitHub Action republishes the bundle to R2 nightly. **Porkbun** stays the domain registrar;
**Cloudflare** does DNS + hosting + CDN. The `_redirects` / `_headers` files in
`frontend/app/public/` (copied verbatim into `dist/`) give you the SPA fallback and safe
security headers; `deploy/r2-cors.json` is the bucket's CORS policy.

### Cloudflare Pages (the SPA)

Create a Pages project (`aml-filter`) and point it at this repo. Use these settings:

| Setting | Value |
| --- | --- |
| Build command | `pnpm --filter aml-filter-app build` |
| Build output directory | `frontend/app/dist` |
| Root directory | repo root (`/`) |
| Build env: `VITE_BUNDLE_BASE_URL` | `https://lists.aml-filter.com` |
| Build env: `NODE_VERSION` | `22` |

The `_redirects` (SPA catch-all `/*  /index.html  200`) and `_headers` (security headers)
ship inside `dist/` automatically — Vite copies everything in `public/` verbatim, so Pages
picks them up with no extra config.

**Dashboard path.** Pages → *Connect to Git* → pick this repo → fill in the table above.
Every push to `main` builds and deploys.

**CLI path.** Build locally, then deploy the output directory with Wrangler:

```bash
cd frontend
VITE_BUNDLE_BASE_URL=https://lists.aml-filter.com pnpm --filter aml-filter-app build
npx wrangler pages deploy frontend/app/dist --project-name aml-filter --branch main
```

**Custom domains.** In the Pages project → *Custom domains*, add both `aml-filter.com` and
`www.aml-filter.com`. Make the apex canonical and send `www` → apex with a **Redirect Rule**
(Rules → Redirect Rules: `www.aml-filter.com/*` → `https://aml-filter.com/$1`, 301).

> Pages serves over HTTPS automatically, which is the secure context the app needs for
> WebCrypto signature verification and OPFS — nothing extra to configure.

### R2 (the signed bundle)

1. **Create the bucket** `aml-filter-lists`.
2. **Attach a public custom domain** `lists.aml-filter.com` to the bucket (R2 → bucket →
   *Settings* → *Public access* → *Custom Domains*). Use this, **not** the rate-limited
   `*.r2.dev` URL.
3. **Apply CORS** so the SPA on `aml-filter.com` can range-fetch the chunks:

   ```bash
   npx wrangler r2 bucket cors set aml-filter-lists --file deploy/r2-cors.json
   ```

   The policy ([`../deploy/r2-cors.json`](../deploy/r2-cors.json)) allows `GET`/`HEAD` from
   the apex + `www` origins, permits `Range` / conditional-request headers, and exposes
   `ETag` / `Content-Range` / `Accept-Ranges` so delta-sync range requests work.
4. **Cache headers are set per-object at upload time** by the publish workflow — immutable
   chunks and manifests get `Cache-Control: public, max-age=31536000, immutable`, and the
   `latest` pointer gets `Cache-Control: no-cache` so clients always re-check for a new
   version.

### CI secrets for the publish workflow

The scheduled publish-to-R2 Action needs these repository secrets / variables:

| Name | What it is |
| --- | --- |
| `WATCHLIST_SIGNING_KEY` | base64 of the raw 32-byte Ed25519 signing seed (pairs with the pinned `public.key`) |
| `R2_ACCESS_KEY_ID` | R2 API token access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret access key |
| `R2_ACCOUNT_ID` | your Cloudflare account ID |
| `R2_BUCKET` | `aml-filter-lists` |

Create the R2 credentials as an **Account API token** with **Object Read & Write** scoped
to the `aml-filter-lists` bucket (R2 → *Manage R2 API Tokens*). Never rotate the signing key
without re-pinning `public.key` in the app build — the pairing is what makes in-tab
verification meaningful.

### Validation (drive it in a real browser)

After the first deploy, confirm it actually works — green CI is not enough:

- Open **`https://aml-filter.com/screen`**, watch it boot, type a query, read the rendered
  result, and confirm a **clean console**.
- In the Network tab, confirm the bundle (`latest` / `manifest` / `chunk/...`) loaded from
  **`https://lists.aml-filter.com`** with no CORS errors.
- Deep-link **`/customers`**, **`/review`**, and **`/settings`** and refresh each one to
  confirm the SPA fallback serves the app (no 404).

> **CSP follow-up.** `_headers` deliberately ships **no** `Content-Security-Policy` — the app
> loads WASM, spawns module/web workers, and fetches the cross-origin R2 bundle, so a wrong
> CSP silently breaks the screen. If you add one later, it must at minimum allow
> `script-src 'self'`, `wasm-unsafe-eval`, `worker-src blob:`, and
> `connect-src https://lists.aml-filter.com` — and you must **browser-validate** the live
> `/screen` flow (clean console) before shipping it.

## Operational caveats

- **Same embedder on both sides.** The publisher precomputes name vectors with the same
  MiniLM model the app loads at query time. They must match, or vector similarity is
  meaningless — don't swap one without re-publishing.
- **This is a demo.** Re-read [`../NOTICE`](../NOTICE): not legal advice, not a
  compliance product. Every match must be reviewed by qualified compliance personnel
  against the official OFAC source.
