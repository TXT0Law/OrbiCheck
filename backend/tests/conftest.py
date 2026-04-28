from collections.abc import AsyncGenerator, Callable
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.router import api_v1_router
from app.core.deps import CurrentUser, get_current_user, get_db, get_redis
from app.core.exceptions import register_exception_handlers
from app.models.scan import ModuleStatus, ScanStatus


class _FakeDbSession:
    """Bare-bones session double for endpoint tests.

    Only mocks methods we hit during request handling: ``execute``, ``commit``,
    ``rollback``, ``refresh``, plus the ``add``/``flush`` pair the Phase 3
    notification dispatch log uses to record a pending row.
    """

    def __init__(self) -> None:
        self._added: list[object] = []

    async def execute(self, *args, **kwargs):
        return None

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None

    async def refresh(self, _obj) -> None:
        return None

    def add(self, obj: object) -> None:
        from app.models.notification_dispatch import NotificationDispatchLog

        if isinstance(obj, NotificationDispatchLog):
            if obj.id is None:
                obj.id = uuid4()
            if obj.status is None:
                obj.status = "pending"
            if obj.attempts is None:
                obj.attempts = 0
        self._added.append(obj)

    async def flush(self) -> None:
        return None


class _FakePubSub:
    def __init__(self) -> None:
        self._channel: str | None = None

    async def subscribe(self, channel: str) -> None:
        self._channel = channel

    async def unsubscribe(self, *channels: str) -> None:
        self._channel = None

    async def get_message(self, *args, **kwargs):
        return None

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


class _FakeRedis:
    def __init__(self) -> None:
        self._kv: dict[str, str] = {}

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str) -> None:
        self._kv[key] = value

    async def exists(self, key: str) -> bool:
        return key in self._kv

    async def setex(self, key: str, _ttl: int, value: str) -> None:
        self._kv[key] = value

    async def publish(self, *_args, **_kwargs) -> int:
        return 0

    def pubsub(self) -> _FakePubSub:
        return _FakePubSub()

    async def aclose(self) -> None:
        return None


async def _test_current_user() -> CurrentUser:
    return CurrentUser(id=1, email="admin@orbicheck.local", csrf_token="csrf-token")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def test_app():
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix="/api/v1")

    shared_redis = _FakeRedis()

    async def _get_db():
        yield _FakeDbSession()

    async def _get_redis():
        yield shared_redis

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_redis] = _get_redis
    app.dependency_overrides[get_current_user] = _test_current_user
    return app


@pytest.fixture(autouse=True)
def _noop_monitor_webhook_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid background httpx/redis tasks when tests trigger _publish_monitor_event."""
    from unittest.mock import AsyncMock

    monkeypatch.setattr(
        "app.services.monitor_service.publish_monitor_lifecycle_webhook",
        AsyncMock(),
    )


@pytest_asyncio.fixture
async def async_client(test_app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture
def client(async_client: AsyncClient) -> AsyncClient:
    return async_client


@pytest.fixture
def module_result_factory() -> Callable[..., SimpleNamespace]:
    def _factory(
        module_name: str,
        status: ModuleStatus = ModuleStatus.PENDING,
        raw_result: dict | None = None,
        error_message: str | None = None,
        duration_ms: int | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid4(),
            module_name=module_name,
            status=status,
            raw_result=raw_result,
            error_message=error_message,
            duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc) if status != ModuleStatus.PENDING else None,
        )

    return _factory


@pytest.fixture
def scan_record_factory(module_result_factory) -> Callable[..., SimpleNamespace]:
    def _factory(
        *,
        scan_id: UUID | None = None,
        url: str = "https://example.com",
        domain: str = "example.com",
        status: ScanStatus = ScanStatus.PENDING,
        progress: int = 0,
        total_modules: int = 3,
        completed_modules: int = 0,
        security_score: int | None = None,
        module_results: list[SimpleNamespace] | None = None,
    ) -> SimpleNamespace:
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            id=scan_id or uuid4(),
            url=url,
            domain=domain,
            status=status,
            progress=progress,
            total_modules=total_modules,
            completed_modules=completed_modules,
            security_score=security_score,
            error_message=None,
            started_at=now,
            completed_at=now if status == ScanStatus.COMPLETED else None,
            created_at=now,
            module_results=module_results
            or [
                module_result_factory("whois", ModuleStatus.PENDING),
                module_result_factory("ports", ModuleStatus.PENDING),
                module_result_factory("features", ModuleStatus.PENDING),
            ],
        )

    return _factory
