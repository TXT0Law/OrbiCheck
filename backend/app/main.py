import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user
from app.core.exceptions import register_exception_handlers
from app.core.middleware import (
    CsrfProtectionMiddleware,
    SecurityHeadersMiddleware,
    SimpleRateLimitMiddleware,
)
from app.db.session import get_engine

logger = logging.getLogger(__name__)


async def _inline_monitor_dispatch_loop() -> None:
    """Development-friendly scheduler when Celery beat/worker are not running."""
    from app.services.monitor_service import run_due_monitor_checks_inline

    interval = max(2.0, float(settings.MONITOR_INLINE_DISPATCH_INTERVAL_S))
    while True:
        await asyncio.sleep(interval)
        try:
            summary = await run_due_monitor_checks_inline()
            if summary.get("dispatched"):
                logger.debug(
                    "monitor_inline_dispatch",
                    dispatched=summary["dispatched"],
                )
        except Exception:
            logger.exception("monitor_inline_dispatch_tick_failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    engine = get_engine()
    # Startup: verify DB connection.
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))

    # Check Scan service reachability; warn if unreachable (avoids cryptic "Connection refused" later)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.SCAN_SERVICE_URL}/health")
            r.raise_for_status()
    except Exception as e:
        logger.warning(
            "Scan service unreachable at %s: %s. Start it with: cd backend/scan && node server.js",
            settings.SCAN_SERVICE_URL,
            e,
        )

    dispatch_task: asyncio.Task | None = None
    if settings.MONITOR_INLINE_DISPATCH:
        logger.info(
            "Monitor inline dispatch enabled (interval=%ss). "
            "Disable MONITOR_INLINE_DISPATCH when using Celery beat to avoid duplicate checks.",
            settings.MONITOR_INLINE_DISPATCH_INTERVAL_S,
        )
        dispatch_task = asyncio.create_task(_inline_monitor_dispatch_loop())
        app.state.monitor_inline_dispatch_task = dispatch_task

    yield

    if dispatch_task is not None:
        dispatch_task.cancel()
        try:
            await dispatch_task
        except asyncio.CancelledError:
            pass

    # Shutdown: dispose engine.
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Web OSINT API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(CsrfProtectionMiddleware)
    app.add_middleware(SimpleRateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )

    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix="/api/v1")

    if settings.PROMETHEUS_METRICS_ENABLED:

        @app.get("/metrics", include_in_schema=False)
        async def prometheus_metrics(
            current_user: CurrentUser = Depends(get_current_user),
        ) -> Response:
            _ = current_user
            return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
