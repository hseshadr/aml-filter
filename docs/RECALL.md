# Retrieval recall — how well does this actually find people?

**TL;DR.** AML-Filter exists to find a sanctioned entity when you spell the name
differently. Until now, nothing measured whether it does. This document describes
the harness that measures it, the numbers it currently produces, and the CI gate
that stops those numbers from getting worse.

The current measurement, against the frozen 19,181-entity OFAC SDN snapshot, at
the parameters the live `/screen` page actually sends:

| Segment | Queries | recall@1 | recall@10 | recall@25 | Found nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| **alias** — a published alias, looking for its parent | 2,000 | 0.5930 | 0.6185 | 0.6195 | **38.05%** |
| **canonical** — an entity's own name, looking for itself | 2,000 | 0.9995 | 0.9995 | 0.9995 | 0.05% |

Read that as: looking an entity up by its own indexed name works. Looking it up
by a name OFAC itself publishes for that same entity fails **about two times in
five**. The two segments are never averaged — averaging them would hide the only
number that describes the product's actual promise.

## Run it

```bash
cd frontend
# The gate: measure, compare against the committed floors, exit non-zero on a drop.
pnpm --filter @amlfilter/publisher run gate:recall

# The headline number: every labelled query, not a sample. Several minutes.
pnpm --filter @amlfilter/publisher run measure-recall -- --full
```

The gate takes about a minute and needs no network — it runs inside `pnpm gate`
on every pull request.

## Where the labels come from

Nobody labelled anything by hand, and — this is the part that matters — the
ranker had no say in it.

OFAC publishes, for each designated entity, the other names that entity is known
by. Every published alias is therefore a known-true spelling variant of a known
parent. Query the alias, and the parent is the correct answer, by the feed's own
account. That yields **24,026 distinct labelled queries** from the SDN list alone,
for free.

A label the ranker helped choose measures nothing: the system would score well on
the questions it picked. So the derivation (`src/recall/labels.ts`) reads only the
feed's structure, and the harness never consults a score to decide what the right
answer is.

Where a name legitimately belongs to more than one designation — it happens; 25
canonical primary names are shared in the current list, and aliases collide more
often — the label is the **set** of entities that publish that name, and any one
of them counts as correct. Scoring a shared name against one arbitrarily-chosen
owner would report a miss for a right answer.

## What the numbers mean

- **recall@k** — the true entity appeared in the first `k` results.
- **Found nothing** — the true entity appeared *nowhere* in the results. This
  deliberately does not distinguish "pruned before scoring" from "scored but
  under the threshold": both render the same screen to the user, one that does
  not contain the sanctioned entity.
- **k = 25, threshold = 0.30** — what `/screen` sends on a default (Balanced)
  search, not the engine's own `screen()` defaults. The engine falls back to the
  Balanced *preset* threshold of 0.65, which returns an empty result list for
  almost every query; measuring there would report a number for a configuration
  nobody runs. `frontend/app/src/pages/recallParity.test.ts` pins both values so
  the app cannot move them without the harness noticing.

## How the corpus is held still

The gate measures against `fixtures/recall/ofac-sdn-corpus.jsonl.gz` — a dated
snapshot of the OFAC feed (595 KB, names and aliases only), with its source URL,
fetch instant and upstream byte hash recorded in `provenance.json` beside it.

A gate whose input changes daily is not a ratchet. OFAC republishes constantly;
measuring against the live list would mean a number that moves when nothing in
this repository changed, and a failure nobody could reproduce. Refreshing the
snapshot is a deliberate, reviewable commit:

```bash
pnpm --filter @amlfilter/publisher run build-recall-fixture   # re-freeze the feed
pnpm --filter @amlfilter/publisher run measure-recall -- --write   # re-measure
```

The 19,181 float32 embeddings are ~29 MB, so the snapshot stores the *names* and
re-embeds them at gate time (about eleven seconds). That is both smaller and
stricter: the gate exercises the real MiniLM embedder and the real index build,
so a regression in either is visible to it.

Queries are sampled — 2,000 per segment, from a committed seed — while the
**corpus stays whole**. Sampling questions is unbiased; a retrieved rank is the
real rank among all 19,181 entities. Shrinking the haystack instead would inflate
recall and report a number nobody experiences.

## The gate can fail — here is it failing

A gate nobody has watched fail is not evidence. The defect this gate exists to
close is that retrieval takes the top `k*2` candidates by raw cosine and nothing
notices if that window collapses. Narrowing it to a single candidate —

```diff
-const candidates = this.#index.search(queryVec, k * 2);
+const candidates = this.#index.search(queryVec, 1);
```

— leaves **all 510 tests in `@amlfilter/browser` green** (verified, exit code 0).
The recall gate, on the same tree:

```
  alias     n=  2000  @1=0.3885  @10=0.3885  @25=0.3885  absent=1223 (0.6115)
  canonical n=  2000  @1=0.9975  @10=0.9975  @25=0.9975  absent=5 (0.0025)

recall gate FAILED — 4 floor(s) breached:
  alias recall@1: measured 0.3885, floor 0.5730
  alias recall@10: measured 0.3885, floor 0.5985
  alias recall@25: measured 0.3885, floor 0.5995
  alias absentRate: measured 0.6115, floor 0.4005
```

Exit code 1. Note the canonical segment barely moves (0.9995 → 0.9975): an
entity's own name is already the top vector hit, so narrowing retrieval costs it
nothing. One averaged number would have absorbed the alias collapse almost
entirely. That is why the segments are reported apart.

## The floors ratchet

Floors live in `fixtures/recall/recall-baseline.json` next to the measurement they
came from, so raising them is a visible diff and lowering them is a visible diff.
They are set from the **measured** value, not an aspirational one — the baseline
must pass on today's code, or the number is not honest.

Each floor sits one `PLATFORM_TOLERANCE` (0.02) below its measured value. That is
not headroom: the corpus vectors come from a quantized ONNX model whose last-bit
arithmetic differs between an arm64 laptop and an x86_64 CI runner, and two
entities scoring within 1e-4 can swap rank across them. The tolerance is the width
of that platform noise. It is subtracted once, when the floor is written; the
comparison in CI is exact.
