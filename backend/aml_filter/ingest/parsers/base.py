"""Generic sanctions-list parser interface and registry.

Every sanctions list (OFAC, EU, UK OFSI, UN) is parsed by a class that satisfies the
:class:`SanctionsListParser` protocol: it declares the ``list_id`` it handles and turns
raw bytes/str into a list of canonical :class:`~aml_filter.domain.entity.Entity` objects.

Parsers self-register against their ``list_id`` via the :func:`parser_for` decorator, so
the ingest service and downloader can resolve "the parser for ``EU_CONSOLIDATED``" without
hard-coding a dispatch table. Resolution is fail-closed — an unknown list id raises
:class:`ParserNotRegisteredError` rather than silently returning an empty list.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from typing import Final, Protocol, runtime_checkable

from aml_filter.domain.entity import Entity

#: Parser modules imported on first registry access so their ``@parser_for`` decorators run.
_BUILTIN_PARSER_MODULES: Final = (
    "aml_filter.ingest.parsers.ofac",
    "aml_filter.ingest.parsers.eu",
    "aml_filter.ingest.parsers.uk",
    "aml_filter.ingest.parsers.un",
)


class ParserNotRegisteredError(LookupError):
    """Raised when no parser is registered for a requested list id (fail-closed)."""


@runtime_checkable
class SanctionsListParser(Protocol):
    """Structural contract every sanctions-list parser implements.

    ``list_id`` is the canonical identifier of the list the parser handles (e.g.
    ``"OFAC_SDN"``). ``parse`` accepts the raw published payload (bytes or str) and
    returns canonical :class:`Entity` objects; it must raise on malformed payloads
    rather than returning a partial/empty result silently.
    """

    list_id: str

    def parse(self, raw: str | bytes) -> list[Entity]:
        """Parse a raw list payload into canonical entities."""
        ...


_REGISTRY: dict[str, SanctionsListParser] = {}


def _bootstrap_builtins() -> None:
    """Import the built-in parser modules so they self-register (idempotent).

    ``importlib.import_module`` is cached after the first import, so calling this on every
    registry access is cheap and avoids a module-level mutable flag.
    """
    for module in _BUILTIN_PARSER_MODULES:
        importlib.import_module(module)


def parser_for[T: SanctionsListParser](list_id: str) -> Callable[[type[T]], type[T]]:
    """Class decorator that instantiates and registers a parser under ``list_id``."""

    def register(cls: type[T]) -> type[T]:
        _REGISTRY[list_id] = cls()
        return cls

    return register


def get_parser(list_id: str) -> SanctionsListParser:
    """Resolve the registered parser for ``list_id`` (fail-closed)."""
    _bootstrap_builtins()
    parser = _REGISTRY.get(list_id)
    if parser is None:
        raise ParserNotRegisteredError(f"No parser registered for list id {list_id!r}")
    return parser


def registered_list_ids() -> tuple[str, ...]:
    """Return all list ids that currently have a registered parser."""
    _bootstrap_builtins()
    return tuple(_REGISTRY)
