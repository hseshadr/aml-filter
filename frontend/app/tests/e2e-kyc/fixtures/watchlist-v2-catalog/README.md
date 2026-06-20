# e2e fixture: the "demo-2" signed CATALOG (a second multi-list publish)

This directory is a SECOND signed multi-list **catalog** artifact, used by the
KYC e2e (`tests/e2e-kyc/local-kyc-journey.spec.ts`) to prove **live new-publish
detection** end to end with no test seam.

It mirrors the committed boot catalog under `app/public/watchlist/`
(`catalog.json(.sig)` + four per-list dirs `ofac/ eu/ un/ uk/`, each with
`watchlist.json(.sig)` + `watchlist.manifest.json(.sig)`), but the **OFAC list is
bumped to version `demo-2`** while EU/UN/UK stay at `demo-1`.

- The boot catalog served from `app/public/watchlist/` has every list at `demo-1`,
  so the engine's COMPOSITE version stamp is
  `EU_CONSOLIDATED@demo-1|OFAC_SDN@demo-1|UK_OFSI@demo-1|UN_CONSOLIDATED@demo-1`.
- This fixture's catalog advances only OFAC, so its composite stamp becomes
  `EU_CONSOLIDATED@demo-1|OFAC_SDN@demo-2|UK_OFSI@demo-1|UN_CONSOLIDATED@demo-1`.
- The e2e routes these bytes in (via `page.route("**/watchlist/**")`) once the
  test flips its `servePublishV2` flag, so the running tab's cheap signed
  manifest/catalog poll sees a genuinely newer, validly-signed catalog and
  reloads + re-screens.

It is produced by `@amlfilter/publisher` with the **same demo key**
(`packages/amlfilter-publisher/fixtures/demo.key`, whose public half is the pinned
`app/public/public.key`) over the **same fixtures** (`fixtures/demo/*.jsonl`) as the
boot catalog. The publisher is deterministic, so the EU/UN/UK lists are
byte-identical to the boot catalog's; only OFAC's `version` string (and therefore
its signatures + the catalog signature) differ. OFAC still carries
`name_canonical: "ivan fakovich"`, so Ivan Fakovich stays a match across the
reload and a prior disposition carries forward.

Regenerate with:

```bash
cd frontend/packages/amlfilter-publisher
pnpm build-demo-catalog-v2
```
