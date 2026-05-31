# Demo data (fictional — NOT the real OFAC list)

`demo_entities.jsonl` is a handful of **obviously made-up** sanctioned entities
("Ivan Fakovich", "Madeupistan Imaginary Bank", …) in aml-filter's domain `Entity`
JSON shape — one record per line. It exists so the in-browser `/screen` demo and
the `amlfilter` CLI have something to screen against **without** downloading the
real sanctions list.

It is **not** the OFAC SDN list and must never be used for real screening. The
real list is a U.S. Treasury public-domain work you download yourself — see
[`../../README.md`](../../README.md#the-ofac-list-data) and [`../../NOTICE`](../../NOTICE).

## How the prebuilt demo bundle is generated

The committed signed bundle (`catalog/`) and its pinned public key
(`frontend/app/public/public.key`) are produced from this file with the `amlfilter`
CLI, so the one-command browser demo (`make demo-browser`) needs no model download
at startup. To regenerate after editing the demo entities:

```bash
cd backend
uv run amlfilter keygen examples/keys/trust.key ../frontend/app/public/public.key
uv run amlfilter bundle examples/demo_entities.jsonl examples/catalog \
  examples/keys/trust.key --list-id DEMO_SDN --version demo-v1
```

`keygen` mints the ed25519 trust root (the private key stays under
`examples/keys/`, git-ignored; the public verify key is pinned into the SPA build).
`bundle` embeds + indexes the entities and writes the signed, content-addressed
origin (`latest` → `manifest/<hash>` → `chunk/<hash>`) the browser tab syncs.
