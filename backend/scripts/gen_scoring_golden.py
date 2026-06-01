"""Generate the cross-language scoring parity golden the @amlfilter/browser tests load.

Runs the canonical Python ``DefaultScoringPolicy`` over a fixed set of
(entity, query) cases and writes their exact scored output — score, summary, and
weighted reasons — as a TS-shaped golden JSON. The browser TS scorer (a faithful
port of ``DefaultScoringPolicy``) must reproduce this byte-for-byte; see
``scoring.parity.test.ts``.

    backend $ uv run python scripts/gen_scoring_golden.py <out_file>

<out_file> should be the package fixture, e.g.
    ../frontend/packages/amlfilter-browser/src/engine/__fixtures__/scoring/golden.json
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from aml_filter.domain.entity import Alias, Entity
from aml_filter.domain.search import MatchExplanation, MatchSignal
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy

_LIST_ID = "OFAC_SDN"
_VERSION = "2026-05-30"


@dataclass(frozen=True)
class Case:
    """One (entity, query) scoring scenario, authored in native Python."""

    name: str
    preset: str
    primary_name: str
    name_canonical: str
    query_name_canonical: str
    vector_similarity: float
    trigram_similarity: float
    entity_type: str = "PERSON"
    aliases: tuple[tuple[str, str, str], ...] = ()
    dob: tuple[str, ...] = ()
    countries: tuple[str, ...] = ()
    query_dob: str | None = None
    query_country: str | None = None
    query_entity_type: str | None = None


def _cases() -> list[Case]:
    """The parity scenarios: both country divergences plus alias/DOB/full/miss."""
    return [
        Case(
            name="single-country exact match",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            countries=("RU",),
            query_country="RU",
        ),
        Case(
            name="multi-country match lists the sorted set",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            countries=("US", "CA"),
            query_country="CA",
        ),
        Case(
            name="multi-country no-match lists the sorted set",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            countries=("US", "CA"),
            query_country="JP",
        ),
        Case(
            name="alias match",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="v ivanov",
            vector_similarity=0.7,
            trigram_similarity=0.5,
            aliases=(("V. Ivanov", "v ivanov", "OFAC"),),
        ),
        Case(
            name="year-only DOB match",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            dob=("1970-06-15",),
            query_dob="1970-01-01",
        ),
        Case(
            name="full match (name + dob + country)",
            preset="lenient",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            dob=("1970-01-01",),
            countries=("RU",),
            query_dob="1970-01-01",
            query_country="RU",
            query_entity_type="PERSON",
        ),
        Case(
            name="low-confidence miss",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=0.1,
            trigram_similarity=0.1,
        ),
        Case(
            name="entity-type mismatch",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            query_entity_type="ORGANIZATION",
        ),
        Case(
            name="substring alias match (half weight)",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=0.7,
            trigram_similarity=0.6,
            aliases=(("Vladimir Ivanov II", "vladimir ivanov ii", "OFAC"),),
        ),
        Case(
            name="different-year DOB miss",
            preset="balanced",
            primary_name="Vladimir Ivanov",
            name_canonical="vladimir ivanov",
            query_name_canonical="vladimir ivanov",
            vector_similarity=1.0,
            trigram_similarity=1.0,
            dob=("1970-06-15",),
            query_dob="1985-01-01",
        ),
    ]


def _build_entity(c: Case) -> Entity:
    """Build a SANCTION Entity from a case (trigram unused by the scorer)."""
    return Entity(
        entity_id=f"e_{c.name_canonical.replace(' ', '_')}",
        entity_type=c.entity_type,  # type: ignore[arg-type]  # cases use valid literals
        primary_name=c.primary_name,
        name_canonical=c.name_canonical,
        name_trigram=c.name_canonical,
        aliases=[Alias(name=n, name_canonical=nc, source=s) for n, nc, s in c.aliases],
        dob=[date.fromisoformat(d) for d in c.dob],
        countries=list(c.countries),
        risk_category="SANCTION",
        source_list=_LIST_ID,
        list_version=_VERSION,
    )


def _score(c: Case) -> tuple[float, MatchExplanation]:
    """Run the canonical policy for a case; return (score, explanation)."""
    policy = create_preset_policy(c.preset, _LIST_ID, "tenant")  # type: ignore[arg-type]
    scorer = DefaultScoringPolicy(policy)
    return scorer.compute_score(
        _build_entity(c),
        c.primary_name,
        c.query_name_canonical,
        date.fromisoformat(c.query_dob) if c.query_dob else None,
        c.query_country,
        c.query_entity_type,
        c.vector_similarity,
        c.trigram_similarity,
    )


def _reason_json(s: MatchSignal) -> dict[str, object]:
    """One signal in TS MatchReason shape (Python `name` -> TS `signal`)."""
    return {
        "signal": s.name,
        "value": s.value,
        "weight": s.weight,
        "contribution": s.contribution,
        "description": s.description,
    }


def _entity_json(c: Case) -> dict[str, object]:
    """The case entity in the TS `Entity` shape the browser scorer consumes."""
    return {
        "entity_id": f"e_{c.name_canonical.replace(' ', '_')}",
        "entity_type": c.entity_type,
        "primary_name": c.primary_name,
        "name_canonical": c.name_canonical,
        "aliases": [{"name": n, "name_canonical": nc, "source": s} for n, nc, s in c.aliases],
        "dob": list(c.dob),
        "countries": list(c.countries),
        "risk_category": "SANCTION",
        "source_list": _LIST_ID,
        "list_version": _VERSION,
    }


def _query_json(c: Case) -> dict[str, object]:
    """The case query in the TS `ScoringQuery` shape."""
    return {
        "nameCanonical": c.query_name_canonical,
        "dob": c.query_dob,
        "country": c.query_country,
        "entityType": c.query_entity_type,
        "vectorSimilarity": c.vector_similarity,
        "trigramSimilarity": c.trigram_similarity,
    }


def _case_json(c: Case) -> dict[str, object]:
    """One golden case: TS-shaped input plus the canonical expected output."""
    score, explanation = _score(c)
    return {
        "name": c.name,
        "preset": c.preset,
        "entity": _entity_json(c),
        "query": _query_json(c),
        "expected": {
            "score": score,
            "summary": explanation.summary,
            "reasons": [_reason_json(s) for s in explanation.signals],
        },
    }


def main(out_file: Path) -> None:
    """Write the golden JSON for all parity cases to out_file."""
    cases = [_case_json(c) for c in _cases()]
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(cases, indent=2) + "\n")
    print(f"wrote {len(cases)} scoring parity cases to {out_file}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
