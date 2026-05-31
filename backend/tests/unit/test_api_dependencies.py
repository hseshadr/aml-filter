from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from aml_filter.api.dependencies import get_db_session


@pytest.mark.asyncio
async def test_get_db_session_raises_when_db_state_missing() -> None:
    request = MagicMock()
    request.app.state = SimpleNamespace()  # no `db` attribute
    gen = get_db_session(request)
    with pytest.raises(RuntimeError, match="Database not initialized"):
        await anext(gen)
