import pytest

import aml_filter.api.dependencies as deps


@pytest.mark.asyncio
async def test_get_db_session_raises_when_not_initialized() -> None:
    deps._db = None
    gen = deps.get_db_session()
    with pytest.raises(RuntimeError):
        await anext(gen)


