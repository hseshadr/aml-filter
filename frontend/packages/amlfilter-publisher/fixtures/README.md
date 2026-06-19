# Publisher fixtures — DEMO/TEST ONLY

These files are **not** production data and **`demo.key` is not a trust root.**

- **`demo.key`** — a 32-byte raw Ed25519 **seed**, a self-contained committed demo
  fixture. Its public half is the committed
  `frontend/app/public/public.key`, so artifacts signed with it verify in-tab via
  the browser tier's `verifyEd25519`. It exists solely so the committed demo
  watchlist is reproducible and self-verifying. **Production signs in CI** with a
  key held as a repo secret (`WATCHLIST_SIGNING_KEY`); this demo key never touches
  a real list.
- **`demo_entities.jsonl`** — 8 fabricated `DEMO_SDN` entities, a self-contained
  committed demo fixture. Every name, DOB, and address is invented.
- **`tiny_entities.jsonl`** — a 3-entity fixture for the format/determinism tests.

Regenerate the committed demo artifact with `pnpm --filter @amlfilter/publisher run build-demo`.
