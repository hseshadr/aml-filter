# Wise-AI Integration

> How AML-Filter realizes the Wise-AI pattern catalog — and what AML-Filter would gain by importing Wise-AI when it adds its first LLM flow.

## What Wise-AI is

[Wise-AI](https://github.com/hseshadr/wise-ai) is a four-layer framework for governed pattern-driven AI engineering: a curated **Patterns** catalog, semantic + graph **Retrieval**, a reconcile-loop **Runtime** with cost and outcome drift detection, and a long-term **Wisdom** layer that promotes runtime evidence to pattern updates via PR. AML-Filter is its first reference consumer.

## How AML-Filter modules map to Wise-AI patterns

AML-Filter's existing modules implement four of the five flagship Wise-AI patterns directly. The mapping is bidirectional: AML-Filter's working code is concrete evidence for the patterns, and the patterns describe the discipline AML-Filter already follows.

| AML-Filter module | Wise-AI pattern(s) | Notes |
|---|---|---|
| `aml_filter/embedding/` | [`controlled-cardinality.v1`](https://github.com/hseshadr/wise-ai/blob/main/patterns/controlled-cardinality.md), [`entity-normalization.v1`](https://github.com/hseshadr/wise-ai/blob/main/patterns/entity-normalization.md) | Sentence-transformer use is preceded by name + address + country normalization (NFKC, libpostal, ISO-3166). The controlled-cardinality discipline is what makes embedding similarity stable across re-ingests. |
| `aml_filter/search/` | [`fuzzy-name-matching.v1`](https://github.com/hseshadr/wise-ai/blob/main/patterns/fuzzy-name-matching.md) | Hybrid `pgvector` + `pg_trgm` search over normalized names; explanation surfaces both lexical and vector signals; bounded by per-query budget. |
| `aml_filter/scoring/` | [`explainable-risk-scoring.v1`](https://github.com/hseshadr/wise-ai/blob/main/patterns/explainable-risk-scoring.md), [`policy-aware-thresholding.v1`](https://github.com/hseshadr/wise-ai/blob/main/patterns/policy-aware-thresholding.md) | Multi-signal scoring with per-signal provenance and human-readable explanations; thresholds are explicit `Policy` objects under `aml_filter/scoring/policies/`, versioned per jurisdiction. |
| `aml_filter/screening/` | composes the above into a future `pattern.aml-screening-flow.v1` | The end-to-end flow (normalize → fuzzy-match → score → threshold → emit decision) is itself a candidate Wise-AI pattern. It will be authored after Wise-AI Phase 1 ships and we have runtime traces to point at as evidence. |
| `aml_filter/audit/` | future `pattern.auditable-decision-trail.v1` | Maps to a pattern not yet authored. Audit's invariants (every decision references its inputs, signals, and policy ID) line up with `explainable-risk-scoring`'s `inputs_hash` field. |

## What AML-Filter gains today

Today, with Wise-AI v0 (docs only), AML-Filter gains **conceptual coherence**:

- The discipline AML-Filter already follows (controlled cardinality on entity fields, hybrid fuzzy search, explainable scoring, versioned thresholds) is now named and shareable.
- New contributors to AML-Filter can read the Wise-AI patterns to understand *why* AML-Filter is shaped this way.
- The patterns are reusable: when EdgeReco or another consumer asks "how should we organize entity matching?", the answer is `pattern.fuzzy-name-matching.v1` — and the reference implementation is right here in AML-Filter's `search/`.

No code changes to AML-Filter are required for this. The integration is positional: this document binds AML-Filter's modules to the Wise-AI vocabulary.

## What AML-Filter would gain by importing Wise-AI (Phase 1+)

When AML-Filter adds its first LLM-using flow — most likely **false-positive narrative review**, **sanctions explanation generation**, or **operator query interpretation** — the natural step is to import Wise-AI as a Python dependency. At that point AML-Filter would gain:

- **Pattern retrieval before generation.** Instead of free-form prompting, the LLM flow is governed by a retrieved pattern (e.g., `pattern.doc-summarization-chunked.v1`) with explicit budget bounds.
- **Convergence-aware routing.** Stable LLM flows can be migrated to cheaper models or deterministic execution per the runtime's drift monitor; high-risk AML decisions correctly remain on strong models or human review under `pattern.policy-aware-thresholding.v1`.
- **Auditable decision trail.** Every LLM call's pattern, policy, and cost is recorded; the audit story stays consistent with AML-Filter's existing `audit/` module.
- **Wisdom contribution path.** Runtime evidence (false-positive distributions, override patterns, model-cost dynamics) becomes candidate Wise-AI patterns via PR — AML-Filter contributes back to the framework.

## Storage compatibility

When AML-Filter eventually imports Wise-AI, no infrastructure changes are required. Wise-AI's adapter-first storage discipline ([Wise-AI ADR-001](https://github.com/hseshadr/wise-ai/blob/main/docs/architecture.md#adr-001-adapter-first-storage-no-required-external-db)) means:

- AML-Filter's existing **Postgres + pgvector** plugs into Wise-AI's `EmbeddingIndex` Protocol via the pgvector adapter — same data, same queries.
- AML-Filter's existing **SQLAlchemy + Alembic** stack plugs into Wise-AI's `TraceStore` Protocol via the Postgres adapter — Wise-AI runtime traces become rows in a new schema, migrated by Alembic alongside AML-Filter's existing migrations.
- **Zero new infrastructure** is added. No Qdrant. No Neo4j. No new services to operate.

## See also

- [Wise-AI repo](https://github.com/hseshadr/wise-ai)
- [Wise-AI THESIS](https://github.com/hseshadr/wise-ai/blob/main/THESIS.md) — one-page positioning
- [Wise-AI architecture](https://github.com/hseshadr/wise-ai/blob/main/docs/architecture.md) — full reconcile-loop architecture, ADRs, Triggers
- [Wise-AI roadmap](https://github.com/hseshadr/wise-ai/blob/main/docs/roadmap.md) — phased delivery and exit criteria
