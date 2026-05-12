import uuid

import httpx

from app.core.config import settings

SCAN_SERVICE_BASE = settings.SCAN_SERVICE_URL.rstrip("/")
TIMEOUT = httpx.Timeout(
    timeout=settings.SCAN_TIMEOUT_MS / 1000,
    connect=10.0,
)


def _build_missing_module_result(module_name: str) -> dict:
    return {
        "success": False,
        "statusCode": 404,
        "data": {
            "error": (
                f"Module '{module_name}' is not available in scan-service. "
                "Skipping this module for current run."
            )
        },
        "durationMs": 0,
    }


def _build_trace_headers(scan_id: str | None = None, trace_id: str | None = None) -> dict[str, str]:
    """Build X-Scan-Id / X-Trace-Id headers for cross-service correlation.

    P1-3: every Python -> scan-service call MUST carry an identifier so the
    scan-service `pino`-style logger can scope each module log line by
    scanId, and the FastAPI side can join logs across the boundary.
    """
    sid = scan_id or str(uuid.uuid4())
    tid = trace_id or sid
    return {"X-Scan-Id": sid, "X-Trace-Id": tid}


async def call_screenshot_service(
    url: str,
    *,
    viewport_width: int,
    viewport_height: int,
    full_page: bool,
    scan_id: str | None = None,
    trace_id: str | None = None,
) -> dict:
    """Call Scan Service screenshot module (Playwright). Returns JSON body."""
    t = max(float(settings.MONITOR_SCREENSHOT_TIMEOUT_S), 5.0)
    timeout = httpx.Timeout(t, connect=10.0)
    params = {
        "url": url,
        "viewportWidth": str(int(viewport_width)),
        "viewportHeight": str(int(viewport_height)),
        "fullPage": "true" if full_page else "false",
    }
    headers = _build_trace_headers(scan_id, trace_id)
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        response = await client.get(
            f"{SCAN_SERVICE_BASE}/api/scan/screenshot",
            params=params,
        )
        response.raise_for_status()
        return response.json()


async def call_scan_module(
    module_name: str,
    url: str,
    *,
    scan_id: str | None = None,
    trace_id: str | None = None,
) -> dict:
    """Call a single scan module on the Scan Service."""
    headers = _build_trace_headers(scan_id, trace_id)
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as client:
        response = await client.get(
            f"{SCAN_SERVICE_BASE}/api/scan/{module_name}",
            params={"url": url},
        )
        response.raise_for_status()
        return {
            "status_code": response.status_code,
            "data": response.json(),
        }


async def call_scan_batch(
    url: str,
    modules: list[str],
    scan_options: dict | None = None,
    *,
    scan_id: str | None = None,
    trace_id: str | None = None,
) -> dict:
    """Call batch scan on the Scan Service."""
    requested = list(dict.fromkeys(modules))
    headers = _build_trace_headers(scan_id, trace_id)

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as client:
        available_modules = set(requested)

        try:
            modules_resp = await client.get(f"{SCAN_SERVICE_BASE}/api/scan/modules")
            modules_resp.raise_for_status()
            available_modules = set(modules_resp.json().get("modules", []))
        except httpx.HTTPError:
            # If registry lookup fails, fallback to direct batch call using requested modules.
            pass

        runnable = [m for m in requested if m in available_modules]
        missing = [m for m in requested if m not in available_modules]

        results: dict[str, dict] = {}

        if runnable:
            response = await client.post(
                f"{SCAN_SERVICE_BASE}/api/scan/batch",
                json={
                    "url": url,
                    "modules": runnable,
                    "scanOptions": scan_options or {},
                },
            )
            response.raise_for_status()
            payload = response.json()
            results.update(payload.get("results", {}))

        for module_name in missing:
            results[module_name] = _build_missing_module_result(module_name)

        success_count = sum(1 for item in results.values() if item.get("success"))
        total_modules = len(requested)

        return {
            "url": url,
            "totalModules": total_modules,
            "successCount": success_count,
            "failedCount": total_modules - success_count,
            "results": results,
        }


def call_scan_module_sync(
    module_name: str,
    url: str,
    scan_options: dict | None = None,
    *,
    scan_id: str | None = None,
    trace_id: str | None = None,
    timeout_s: float | None = None,
) -> dict:
    """Synchronous single-module scan call (S-10 per-module retry path).

    Returns the same envelope shape ``{success, statusCode, data, durationMs}``
    that ``call_scan_batch_sync`` produces for each module. Network/HTTP errors
    are caught and surfaced as a failure envelope so callers (Celery task) can
    update DB rows without try/except boilerplate.
    """
    headers = _build_trace_headers(scan_id, trace_id)
    if timeout_s is not None:
        client_timeout = httpx.Timeout(timeout_s, connect=10.0)
    else:
        client_timeout = TIMEOUT
    try:
        with httpx.Client(timeout=client_timeout, headers=headers) as client:
            params: dict[str, str] = {"url": url}
            if scan_options:
                # Forward the same scanOptions surface the batch endpoint
                # accepts. Each option becomes a query string param so the
                # scan-service middleware sees them under `req.query`.
                for key, value in scan_options.items():
                    if isinstance(value, (str, int, float, bool)):
                        params[str(key)] = str(value)
            response = client.get(
                f"{SCAN_SERVICE_BASE}/api/scan/{module_name}",
                params=params,
            )
            payload: dict
            try:
                payload = response.json() if response.content else {}
            except ValueError:
                payload = {}
            envelope = {
                "success": bool(payload.get("success", False)),
                "statusCode": int(payload.get("statusCode", response.status_code)),
                "data": payload.get("data"),
                "durationMs": int(payload.get("durationMs", 0) or 0),
            }
            err = payload.get("error")
            if err:
                envelope["error"] = str(err)
            return envelope
    except httpx.HTTPError as exc:
        return {
            "success": False,
            "statusCode": 599,
            "data": {"error": str(exc)[:300]},
            "durationMs": 0,
            "error": str(exc)[:300],
        }


def call_scan_batch_sync(
    url: str,
    modules: list[str],
    scan_options: dict | None = None,
    *,
    scan_id: str | None = None,
    trace_id: str | None = None,
) -> dict:
    """Synchronous version for Celery tasks."""
    requested = list(dict.fromkeys(modules))
    headers = _build_trace_headers(scan_id, trace_id)

    with httpx.Client(timeout=TIMEOUT, headers=headers) as client:
        available_modules = set(requested)

        try:
            modules_resp = client.get(f"{SCAN_SERVICE_BASE}/api/scan/modules")
            modules_resp.raise_for_status()
            available_modules = set(modules_resp.json().get("modules", []))
        except httpx.HTTPError:
            # If registry lookup fails, fallback to direct batch call using requested modules.
            pass

        runnable = [m for m in requested if m in available_modules]
        missing = [m for m in requested if m not in available_modules]

        results: dict[str, dict] = {}

        if runnable:
            response = client.post(
                f"{SCAN_SERVICE_BASE}/api/scan/batch",
                json={
                    "url": url,
                    "modules": runnable,
                    "scanOptions": scan_options or {},
                },
            )
            response.raise_for_status()
            payload = response.json()
            results.update(payload.get("results", {}))

        for module_name in missing:
            results[module_name] = _build_missing_module_result(module_name)

        success_count = sum(1 for item in results.values() if item.get("success"))
        total_modules = len(requested)

        return {
            "url": url,
            "totalModules": total_modules,
            "successCount": success_count,
            "failedCount": total_modules - success_count,
            "results": results,
        }
