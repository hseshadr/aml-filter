"""Diff two snapshots of a sanctions list into added / modified / removed.

The delta-rescan path (``screening/delta_rescan.py``) screens only the entries that
*changed* between two ``ListVersion``s, so its cost scales with the size of the list
change rather than the customer count. This module computes that change set.

A "modification" is a same-``entity_id`` entry whose *screening-relevant* fields
changed — the fields the scorer actually reads (name, aliases, DOB, countries,
nationalities, entity type). Cosmetic churn (e.g. ``raw_source`` provenance) is
intentionally ignored so it does not trigger needless re-screens. The result is
deterministic (entries sorted by ``entity_id``) so the diff is reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aml_filter.domain.entity import Entity


@dataclass(frozen=True, slots=True)
class ListDiff:
    """The change set between an old and new sanctions-list snapshot.

    ``added`` / ``modified`` carry the *new* entity for each changed id (ready to
    embed and screen); ``removed`` carries just the ids whose matches must be closed.
    """

    added: list[Entity] = field(default_factory=list)
    modified: list[Entity] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)


def _fingerprint(entity: Entity) -> tuple[object, ...]:
    """A hashable snapshot of the screening-relevant fields used to detect changes."""
    aliases = tuple(sorted(a.name_canonical for a in entity.aliases))
    return (
        entity.entity_type,
        entity.name_canonical,
        aliases,
        tuple(d.isoformat() for d in entity.dob),
        tuple(entity.countries),
        tuple(entity.nationalities),
    )


def diff_lists(old: list[Entity], new: list[Entity]) -> ListDiff:
    """Compute the added / modified / removed change set between two list snapshots."""
    old_by_id = {e.entity_id: e for e in old}
    new_by_id = {e.entity_id: e for e in new}
    added = [new_by_id[i] for i in sorted(new_by_id.keys() - old_by_id.keys())]
    removed = sorted(old_by_id.keys() - new_by_id.keys())
    modified = _modified_entries(old_by_id, new_by_id)
    return ListDiff(added=added, modified=modified, removed=removed)


def _modified_entries(old_by_id: dict[str, Entity], new_by_id: dict[str, Entity]) -> list[Entity]:
    """New entities whose screening fingerprint differs from the old snapshot."""
    common = sorted(old_by_id.keys() & new_by_id.keys())
    return [
        new_by_id[i] for i in common if _fingerprint(old_by_id[i]) != _fingerprint(new_by_id[i])
    ]
