"""Unit tests for get_db dependency - no auto-commit, explicit commit required."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.deps import get_db


@pytest.mark.asyncio
@pytest.mark.unit
async def test_session_does_not_auto_commit(monkeypatch):
    """Session must not auto-commit when consumer does not call commit."""
    mock_session = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session.close = AsyncMock()
    mock_context = AsyncMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_context.__aexit__ = AsyncMock(return_value=None)

    mock_factory = MagicMock(return_value=mock_context)

    monkeypatch.setattr(
        "app.core.deps.async_session_factory",
        mock_factory,
    )

    gen = get_db()
    session = await gen.__anext__()
    assert session is mock_session
    mock_session.commit.assert_not_called()
    try:
        await gen.__anext__()
    except StopAsyncIteration:
        pass
    mock_session.commit.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_session_rollbacks_on_exception(monkeypatch):
    """Session rollback is called when consumer raises exception."""
    mock_session = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_context = AsyncMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_context.__aexit__ = AsyncMock(return_value=None)

    mock_factory = MagicMock(return_value=mock_context)

    monkeypatch.setattr(
        "app.core.deps.async_session_factory",
        mock_factory,
    )

    gen = get_db()
    await gen.__anext__()
    with pytest.raises(ValueError):
        await gen.athrow(ValueError("test error"))
    mock_session.rollback.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_explicit_commit_can_be_called(monkeypatch):
    """Consumer can call commit explicitly; session supports it."""
    mock_session = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_context = AsyncMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_context.__aexit__ = AsyncMock(return_value=None)

    mock_factory = MagicMock(return_value=mock_context)

    monkeypatch.setattr(
        "app.core.deps.async_session_factory",
        mock_factory,
    )

    gen = get_db()
    session = await gen.__anext__()
    await session.commit()
    mock_session.commit.assert_called_once()
    try:
        await gen.__anext__()
    except StopAsyncIteration:
        pass


@pytest.mark.asyncio
@pytest.mark.unit
async def test_session_context_exits_properly(monkeypatch):
    """Session context manager is exited when generator finishes."""
    mock_session = AsyncMock()
    mock_context = AsyncMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_context.__aexit__ = AsyncMock(return_value=None)

    mock_factory = MagicMock(return_value=mock_context)

    monkeypatch.setattr(
        "app.core.deps.async_session_factory",
        mock_factory,
    )

    gen = get_db()
    async for _ in gen:
        pass
    mock_context.__aexit__.assert_called_once()
