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
for OFAC SDN; the committed multi-list demo catalog is rebuilt locally with
`build-demo-multilist`)
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

For the multi-list catalog (`build-demo-multilist`), those four files live under a
per-list directory (`ofac/`, `eu/`, `un/`, `uk/`), and a signed `catalog.json` +
`catalog.json.sig` registers them one level up. See [`WATCHLIST_FORMAT.md`](WATCHLIST_FORMAT.md).

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

Once new list files are live, browser clients **auto-detect the new `version`** (the
catalog and the per-list manifest carry it), then re-sync and **re-verify fail-closed**
against the pinned `public.key`, re-screening every customer. The durable IndexedDB cache
only serves a row whose version matches the signed catalog entry, so a version bump
invalidates it. So the refresh flow is: re-sign the lists (the Action / `build-demo-multilist`)
→ publish the new files to your host → clients converge on their own.

## Operational caveats

- **Same embedder on both sides.** The publisher precomputes name vectors with the same
  MiniLM model the app loads at query time. They must match, or vector similarity is
  meaningless — don't swap one without re-publishing.
- **This is a demo.** Re-read [`../NOTICE`](../NOTICE): not legal advice, not a
  compliance product. Every match must be reviewed by qualified compliance personnel
  against the official OFAC source.
