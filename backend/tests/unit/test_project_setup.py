"""Test project setup and imports."""


def test_project_imports() -> None:
    """Test that the project package can be imported."""
    import aml_filter

    assert aml_filter.__version__ == "2.0.0"


def test_project_structure() -> None:
    """Test that all main modules exist."""
    from aml_filter import (
        api,  # noqa: F401
        audit,  # noqa: F401
        db,  # noqa: F401
        domain,  # noqa: F401
        embedding,  # noqa: F401
        ingest,  # noqa: F401
        scoring,  # noqa: F401
        search,  # noqa: F401
        security,  # noqa: F401
        usage,  # noqa: F401
        worker,  # noqa: F401
    )


def test_python_version() -> None:
    """Test that we're using Python 3.13+."""
    import sys

    assert sys.version_info >= (3, 13), "Python 3.13+ required"
