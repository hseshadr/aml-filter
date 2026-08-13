# AML-Filter

Private sanctions screening and KYC review for small and midsize teams. AML-Filter
runs in the browser, explains every score, and keeps customer data on the device.

[![CI](https://github.com/hseshadr/aml-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/hseshadr/aml-filter/actions)
[![Live demo](https://img.shields.io/badge/demo-aml--filter.com-brightgreen.svg)](https://aml-filter.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

![AML-Filter screening a misspelled name and showing scored matches with evidence](docs/assets/aml-filter-screening-demo.gif)

**[Try AML-Filter](https://aml-filter.com)** — no account or installation required.

## What it does

- Screens names against OFAC SDN, EU, UN, and UK OFSI lists.
- Returns a numeric score with the evidence behind it, not a vague match label.
- Onboards customers and keeps a local KYC review queue and audit history.
- Imports `.csv`, `.xls`, and `.xlsx` customer files and exports `.xlsx` snapshots.
- Checks for a new signed watchlist at boot and every 30 minutes while the tab is open.
  A changed list is loaded and customers are re-screened; an unchanged list is a no-op.
- Stores private customer state in SQLite-WASM on OPFS. There is no application server
  or hosted customer database.

AML-Filter is a reference implementation, not legal advice or a replacement for a
qualified compliance program. See [Limitations](#limitations).

## Run it locally

You need [Node 22.13](frontend/.nvmrc), pnpm, and internet access for the first build.
The first run downloads and verifies the 23 MB MiniLM embedding model so the browser
does not fetch model weights from a runtime CDN.

```bash
git clone https://github.com/hseshadr/aml-filter
cd aml-filter/frontend
corepack enable
pnpm install
pnpm --filter aml-filter-app dev
```

Open the URL printed by Vite. No backend, API key, database, or account is required.

## Try the real workflow

1. Open **Screen** and search for a name. Inspect the numeric score and per-signal
   evidence on each result.
2. Open **Customers** and add one customer, or import a CSV/XLS/XLSX file.
3. Open **Review** to resolve possible matches and record the decision.
4. Open **Settings** to enable additional lists and see their versions and ages.
5. Return to **Customers** to check for list updates or export an XLSX snapshot.

Customer imports, screening, review decisions, and exports all happen in the browser.

## How it works

AML-Filter is four small, separately tested pieces:

| Lego | Responsibility |
| --- | --- |
| `@amlfilter/publisher` | Converts public source lists into signed, content-addressed static bundles. |
| `@amlfilter/browser` | Verifies bundles, embeds the query, retrieves candidates, and calculates explained scores. |
| `@amlfilter/workstation` | Owns customer records, review state, rescans, and the SQLite audit ledger. |
| React app | Composes the three capabilities into Screen, Customers, Review, and Settings pages. |

```text
Public lists -> publisher -> signed static bundle
                              |
                              v
Customer name -> browser engine -> numeric score + evidence
                                      |
                                      v
                              workstation review ledger
```

There is no backend in that path. Package boundaries are typed contracts; infrastructure
details stay behind adapters. See [Architecture](docs/ARCHITECTURE.md) for the full DAG
and failure model.

## Privacy and security

- **Customer data stays local.** Customer records and review history live in
  SQLite-WASM on the browser's Origin Private File System.
- **Verify before parse.** The engine verifies the signed `latest` pointer, monotonic
  sequence, manifest, and every content-addressed chunk before using any list data.
- **Fail closed.** A bad signature, hash, rollback, or incomplete update does not become
  an active list.
- **Safe spreadsheet boundaries.** Imports are validated and bounded; exports escape
  spreadsheet formulas.
- **Auditable decisions.** Score receipts contain signed fingerprints and inputs, not
  customer text. The local review ledger is append-only during a customer's lifecycle.
- **Deletion is explicit.** Deleting a customer removes that customer's matches and
  review history in the same SQLite transaction.

The hosted page still needs a network connection to open and to check for list updates.
There is no service worker, so this is not presented as a fully offline website.

## Memory and browser support

The model and sanctions lists are large enough to exhaust a mobile tab if they are
loaded carelessly. The app therefore:

- serializes boot behind one shared promise;
- keeps one runtime owner instead of compiling duplicate ONNX sessions;
- uses one-list-at-a-time vector residency on mobile, unknown-memory devices, and
  desktops reporting 8 GB or less;
- stores compressed, content-addressed list chunks behind one durable-store contract:
  OPFS when it opens, with an IndexedDB compatibility adapter for affected WebKit;
- disposes the old engine before a reload, then builds and swaps the replacement;
- prevents overlapping update checks and clears recurring timers on unmount.

The supported baseline is the current and previous desktop Chrome, Edge, Firefox, and
Safari 17+. Mobile Safari and Chrome use the bounded-memory path. Embedded WebViews are
outside the release contract. Screening requires Workers, durable browser storage
(OPFS or IndexedDB), WebCrypto, Web Locks, and a secure context. The KYC workstation
additionally requires OPFS for its SQLite database.

Read [Memory architecture](docs/MEMORY-ARCHITECTURE.md) for the ownership and disposal
invariants.

## Prove the current state

Three machine-owned signals replace hand-written status claims:

- The [CI badge](https://github.com/hseshadr/aml-filter/actions) reports the latest
  checks on `main`.
- [`aml-filter.com/build.json`](https://aml-filter.com/build.json) reports the exact
  commit deployed to the live site.
- `pnpm gate` reproduces the release gate locally.

```bash
cd frontend
pnpm gate
curl -fsSL https://aml-filter.com/build.json
```

The gate runs strict type checks, lint, unit and coverage suites, production builds,
the recall and evaluation gates, translation checks, signed-bundle contracts, and the
real-browser KYC, receipt, bundle, and mobile lanes, including iPhone-shaped WebKit
cold boot and reload. Physical iPhone Safari remains a device-level check.

## Production build

```bash
cd frontend
pnpm --filter aml-filter-app build
pnpm --filter aml-filter-app preview
```

The build stages the verified model and ONNX-WASM assets from local dependencies. The
production browser does not download executable code or model weights from a third-party
CDN. Deployment and rollback instructions are in [Deploy](docs/DEPLOY.md).

## Data and scoring

Publisher adapters support the U.S. Treasury OFAC SDN list, EU Consolidated list, UN
Consolidated list, and UK/OFSI consolidated list. The committed fallback demo bundle
uses fictional entities; it is safe for tests and local demonstrations. Production
bundles are generated from the public sources described in
[Watchlist format](docs/WATCHLIST_FORMAT.md).

Candidate retrieval uses in-browser MiniLM embeddings. A deterministic five-signal
scorer then combines name similarity, token evidence, date of birth, country, and
identifier evidence. Frozen golden fixtures lock score and tier behavior. The recall
gate measures retrieval against the real OFAC corpus with named spelling probes and
fails below its published floors. See [Recall](docs/RECALL.md).

## Repository map

```text
aml-filter/
├── frontend/                  pnpm workspace
│   ├── app/                   React + Vite browser app
│   └── packages/
│       ├── amlfilter-browser/ verification, retrieval, scoring
│       ├── amlfilter-publisher/ source adapters and signed bundles
│       └── amlfilter-workstation/ SQLite KYC workflow
├── eval/                      independent Python evaluation harness
└── docs/                      architecture and operating guides
```

## Documentation

- [Quickstart](docs/QUICKSTART.md) — first screening and KYC workflow
- [Architecture](docs/ARCHITECTURE.md) — capability contracts and data flow
- [Memory architecture](docs/MEMORY-ARCHITECTURE.md) — mobile memory ownership
- [Watchlist format](docs/WATCHLIST_FORMAT.md) — signatures and bundle schema
- [Recall](docs/RECALL.md) — evaluation corpus, metrics, and floors
- [Operations](docs/OPERATIONS.md) — publishing and incident procedures
- [Deploy](docs/DEPLOY.md) — build, release, rollback, and live proof

## Limitations

AML-Filter is an engineering reference implementation. It is **not legal advice, not a
certified regulatory-compliance product, and not a substitute for a qualified compliance
program or commercial screening vendor**. Sanctions decisions have real consequences.
A qualified reviewer must confirm possible matches against official sources and own any
required filings. The software is provided “as is,” without warranty. See [NOTICE](NOTICE).

## License

[MIT](LICENSE)
