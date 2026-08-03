# Retrieval recall — how well does this actually find people?

**TL;DR.** AML-Filter exists to find a sanctioned entity when you spell the name
differently. Until now, nothing measured whether it does. This document describes
the harness that measures it, the numbers it currently produces, and the CI gate
that stops those numbers from getting worse.

The current measurement, against the frozen 19,181-entity OFAC SDN snapshot, at
the parameters the live `/screen` page actually sends:

Every labelled query, no sampling. "Before" is vector-only retrieval, which is
what the first measurement found; "now" is the lexical/phonetic union:

| Segment | Queries | recall@1 | recall@10 | recall@25 | Found nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| **alias** — a published alias, looking for its parent | 24,026 | 0.5739 → **0.9891** | 0.6076 → **0.9988** | 0.6083 → **0.9992** | 39.17% → **0.08%** |
| **canonical** — an entity's own name, looking for itself | 19,154 | 0.9997 → 0.9921 | 0.9999 → **1.0000** | 0.9999 → **1.0000** | 0.01% → **0.00%** |

Read the alias row plainly: looking a sanctioned entity up by a name OFAC itself
publishes for it used to fail about two times in five. It now fails eight times
in ten thousand.

Canonical recall@1 went the other way — 0.9997 to 0.9921, roughly 150 of 19,154
queries where an entity's own exact name no longer puts that entity first. All of
them still return inside the top 10, and canonical @10 and @25 both rose to
1.0000. The cause is the fuzzy alias tier reordering near-ties. Its floor was not
lowered to accommodate it.

The two segments are never averaged. Blended, the "before" number would have read
about 0.81 and hidden the only half that describes the promise.

The gate screens a 2,000-query sample of each segment rather than the whole
population, and tracks it closely:

| Segment | Gate sample (2,000) @10 | Full population @10 | Difference |
| --- | ---: | ---: | ---: |
| alias | 0.9995 | 0.9988 | 0.0007 |
| canonical | 1.0000 | 1.0000 | 0 |

### What this number can and cannot tell you

The alias segment is now close to saturated, and part of that is by
construction: the labels are OFAC's published alias strings, and retrieval now
indexes those strings directly. So a high score here confirms published aliases
are reachable — which is exactly what was broken — but it is **not** independent
evidence that an unpublished misspelling, the kind a user actually types, will
be found. With so little headroom the segment can no longer detect a regression
of that sort. A held-out segment of deterministically perturbed queries
(transpositions, vowel swaps, dropped letters), never added to the index, is the
missing measurement.

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

A gate nobody has watched fail is not evidence. Each retrieval path was disabled
in turn, against the full corpus, to find out which one the number actually rests
on:

| Build | alias @1 | alias @10 | alias @25 | Found nothing | Gate | Exit |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Unmodified | 0.9905 | 0.9995 | 1.0000 | 0.0000 | PASSED | 0 |
| Lexical/phonetic candidates removed | 0.6195 | 0.6195 | 0.6195 | 0.3805 | **FAILED**, 6 floors | **1** |
| Vector search narrowed to `search(queryVec, 1)` | 0.9930 | 0.9995 | 1.0000 | 0.0000 | PASSED | 0 |

Delete the lexical path and alias recall lands back on 0.6195 with 38.05% of
queries returning nothing — the exact pre-union number — and the gate exits 1
naming six breached floors. That is the guard working.

The third row is the uncomfortable one, and it is recorded here rather than left
for someone to discover. **Narrowing the vector scan 40× costs no measurable
recall at all.** Before the union, that same mutation drove alias recall@10 from
0.6185 to 0.3885 and was the entire reason this gate exists; now the lexical path
covers it completely and the gate stays green.

That is defence in depth doing its job, not a bug — the vector path still carries
the canonical segment, which holds at 0.9920/0.9995 with lexical retrieval
switched off. But it does mean the ~23 MB model download and the ~29 MB of
shipped vectors are currently **unguarded for the alias case**: if embedding
quality degraded, no test in this repository would notice. Anyone touching the
embedder should know that the recall gate will not catch them.

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

The width was then checked rather than assumed. The same gate, same seed, same
fixture, on the two architectures — **measured on the pre-union retrieval, whose
alias recall was 0.6185, because that is where the ranks were close enough
together for platform noise to reorder them:**

| Metric | macOS arm64 | Linux x86_64 (CI) | Drift |
| --- | ---: | ---: | ---: |
| alias recall@1 | 0.5930 | 0.5920 | 0.0010 |
| alias recall@10 | 0.6185 | 0.6180 | 0.0005 |
| alias recall@25 | 0.6195 | 0.6190 | 0.0005 |
| alias found-nothing | 0.3805 | 0.3810 | 0.0005 |
| canonical (all three) | 0.9995 | 0.9995 | 0 |

Real drift, and about twenty times smaller than the tolerance — so 0.02 is
conservative, and a 2-point recall regression cannot hide inside it. The union
retrieval that landed since then makes the alias segment less sensitive to this
effect, not more: an exact lexical hit does not depend on a cosine tie-break.
