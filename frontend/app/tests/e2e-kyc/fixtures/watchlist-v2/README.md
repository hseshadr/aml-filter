# e2e fixture: the "demo-2" signed watchlist (a second publish)

These four files are a SECOND signed watchlist artifact, version `demo-2`, used by
the KYC e2e (`tests/e2e-kyc/local-kyc-journey.spec.ts`) to prove **live
new-publish detection** end to end with no test seam.

- The boot watchlist served from `app/public/watchlist/` is version `demo-1`.
- The e2e routes these `demo-2` bytes in (via `page.route`) once the test flips its
  `servePublishV2` flag, so the running tab's cheap signed-manifest poll sees a
  genuinely newer, validly-signed list and reloads + re-screens.

They are produced by `@amlfilter/publisher` with the **same demo key**
(`packages/amlfilter-publisher/fixtures/demo.key`, whose public half is the pinned
`app/public/public.key`) over the **same fixtures** as `demo-1`. The publisher is
deterministic, so the entities + vectors are byte-identical to `demo-1` — only the
`version` string (and therefore the signatures) differ. That keeps Ivan Fakovich a
match across the reload, so a prior disposition carries forward.

Regenerate with:

```bash
cd frontend/packages/amlfilter-publisher
pnpm build-demo-v2
```
