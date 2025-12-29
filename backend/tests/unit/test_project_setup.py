"""Test project setup and imports."""

import pytest


def test_project_imports() -> None:
    """Test that the project package can be imported."""
    import aml_filter  # noqa: F401

    assert aml_filter.__version__ == "2.0.0"


def test_project_structure() -> None:
    """Test that all main modules exist."""
    from aml_filter import domain  # noqa: F401
    from aml_filter import ingest  # noqa: F401
    from aml_filter import embedding  # noqa: F401
    from aml_filter import search  # noqa: F401
    from aml_filter import scoring  # noqa: F401
    from aml_filter import api  # noqa: F401
    from aml_filter import worker  # noqa: F401
    from aml_filter import security  # noqa: F401
    from aml_filter import audit  # noqa: F401
    from aml_filter import usage  # noqa: F401
    from aml_filter import db  # noqa: F401


def test_python_version() -> None:
    """Test that we're using Python 3.13+."""
    import sys

    assert sys.version_info >= (3, 13), "Python 3.13+ required"

