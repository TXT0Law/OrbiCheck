"""Certificate Transparency log monitoring (Phase 2.3).

Polls https://crt.sh/?q=<hostname>&output=json for the monitor's hostname,
inserts new entries (deduplicated by ``(monitor_id, serial_number)``) and
flags pin violations when a configured ``pinnedSerials`` allow-list is set.

Pinning is on the X.509 ``serial_number`` (not SHA-256 fingerprint) because
crt.sh's JSON endpoint returns serials inline; pinning on a leaf-cert hash
would require a second HTTP request per entry.

We deliberately keep the polling logic side-effect free: the caller is
responsible for triggering this on a schedule (probe loop hooks). Network
errors do NOT raise — we log + return ``[]`` so a CT outage cannot cascade
into the main probe path.

Rate limiting: ``probe_ct_log`` short-circuits without hitting crt.sh when
the most recent observation is newer than the configured lookback window.
This caps outbound traffic to roughly one request per ``lookback_hours``
per monitor (after the first successful poll), which respects crt.sh's
informal rate-limiting guidance.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor import Monitor, MonitorCtEntry

logger = structlog.get_logger(__name__)

CRTSH_BASE_URL = "https://crt.sh/"
CRTSH_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class CtEntryRecord:
    """Normalized CT entry returned by ``fetch_ct_entries``."""

    serial_number: str
    issuer_name: str | None
    common_name: str | None
    not_before: datetime | None
    not_after: datetime | None
    crtsh_id: str | None


def _hostname_from_url(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.hostname or "").strip().lower()
    return host or None


def _normalize_serial(value: Any) -> str:
    text = str(value or "").strip().lower().replace(":", "")
    return text


def _parse_crtsh_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _normalize_pin_set(thresholds: dict[str, Any]) -> set[str]:
    raw = thresholds.get("pinnedSerials") or thresholds.get("pinned_serials") or []
    if not isinstance(raw, list):
        return set()
    return {
        str(item).strip().lower().replace(":", "")
        for item in raw
        if isinstance(item, str) and item.strip()
    }


def _ct_lookback_window(thresholds: dict[str, Any]) -> timedelta:
    raw = thresholds.get("lookbackHours") or thresholds.get("lookback_hours") or 24
    try:
        return timedelta(hours=max(1, min(720, int(raw))))
    except (TypeError, ValueError):
        return timedelta(hours=24)


async def fetch_ct_entries(
    hostname: str,
    *,
    client: httpx.AsyncClient | None = None,
    timeout: float = CRTSH_TIMEOUT_SECONDS,
) -> list[CtEntryRecord]:
    """Query crt.sh for ``hostname`` and return normalized entries.

    Network/JSON errors are swallowed (returns ``[]``) so a CT outage cannot
    crash the probe loop. The caller may inject a custom ``client`` for tests.
    """

    params = {"q": hostname, "output": "json"}
    own_client = client is None
    try:
        if client is None:
            client = httpx.AsyncClient(timeout=timeout)
        response = await client.get(CRTSH_BASE_URL, params=params)
        if response.status_code != 200:
            logger.warning(
                "ct_log_fetch_non_200",
                hostname=hostname,
                status_code=response.status_code,
            )
            return []
        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning(
                "ct_log_invalid_json", hostname=hostname, error=str(exc)
            )
            return []
    except httpx.HTTPError as exc:
        logger.warning("ct_log_http_error", hostname=hostname, error=str(exc))
        return []
    finally:
        if own_client and client is not None:
            await client.aclose()

    if not isinstance(payload, list):
        return []

    out: list[CtEntryRecord] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_serial(entry.get("serial_number"))
        if not serial:
            continue
        out.append(
            CtEntryRecord(
                serial_number=serial,
                issuer_name=str(entry.get("issuer_name") or "")[:255] or None,
                common_name=str(entry.get("common_name") or "")[:255] or None,
                not_before=_parse_crtsh_datetime(entry.get("not_before")),
                not_after=_parse_crtsh_datetime(entry.get("not_after")),
                crtsh_id=(
                    str(entry.get("id"))[:64] if entry.get("id") is not None else None
                ),
            )
        )
    return out


@dataclass
class CtLogProbeResult:
    new_entries: list[MonitorCtEntry]
    pin_violations: list[MonitorCtEntry]


async def probe_ct_log(
    monitor: Monitor,
    db: AsyncSession,
    *,
    client: httpx.AsyncClient | None = None,
) -> CtLogProbeResult:
    """Poll crt.sh and persist any newly observed CT entries.

    Rate limit: if the most recent observation for this monitor is younger
    than the configured lookback window we skip the network call entirely.
    The first poll for a monitor (no rows in DB) always runs.
    """

    caps = monitor.capabilities or {}
    cap_cfg = caps.get("ct_log") or {}
    if not cap_cfg.get("enabled", False):
        return CtLogProbeResult(new_entries=[], pin_violations=[])
    thresholds = cap_cfg.get("thresholds") or {}

    hostname = _hostname_from_url(monitor.url)
    if not hostname:
        return CtLogProbeResult(new_entries=[], pin_violations=[])

    now = datetime.now(timezone.utc)
    lookback = _ct_lookback_window(thresholds)

    last_observed = (
        await db.execute(
            select(func.max(MonitorCtEntry.observed_at)).where(
                MonitorCtEntry.monitor_id == monitor.id
            )
        )
    ).scalar_one_or_none()
    if last_observed is not None:
        if last_observed.tzinfo is None:
            last_observed = last_observed.replace(tzinfo=timezone.utc)
        if now - last_observed < lookback:
            logger.debug(
                "ct_log_poll_skipped_cooldown",
                monitor_id=str(monitor.id),
                hostname=hostname,
                last_observed_at=last_observed.isoformat(),
                lookback_seconds=int(lookback.total_seconds()),
            )
            return CtLogProbeResult(new_entries=[], pin_violations=[])

    fetched = await fetch_ct_entries(hostname, client=client)
    if not fetched:
        return CtLogProbeResult(new_entries=[], pin_violations=[])

    cutoff = now - lookback
    pin_set = _normalize_pin_set(thresholds)

    existing_rows = (
        await db.execute(
            select(MonitorCtEntry).where(MonitorCtEntry.monitor_id == monitor.id)
        )
    ).scalars().all()
    existing_serials = {row.serial_number for row in existing_rows}

    new_entries: list[MonitorCtEntry] = []
    pin_violations: list[MonitorCtEntry] = []

    for entry in fetched:
        if entry.serial_number in existing_serials:
            continue
        if entry.not_before and entry.not_before < cutoff:
            continue
        violation = bool(pin_set) and entry.serial_number not in pin_set
        row = MonitorCtEntry(
            monitor_id=monitor.id,
            hostname=hostname,
            serial_number=entry.serial_number,
            leaf_sha256=None,
            issuer_name=entry.issuer_name,
            common_name=entry.common_name,
            not_before=entry.not_before,
            not_after=entry.not_after,
            crtsh_id=entry.crtsh_id,
            pin_violation=violation,
        )
        db.add(row)
        existing_serials.add(entry.serial_number)
        new_entries.append(row)
        if violation:
            pin_violations.append(row)

    return CtLogProbeResult(new_entries=new_entries, pin_violations=pin_violations)


async def list_ct_entries(
    monitor_id: uuid.UUID,
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[MonitorCtEntry]:
    rows = await db.execute(
        select(MonitorCtEntry)
        .where(MonitorCtEntry.monitor_id == monitor_id)
        .order_by(MonitorCtEntry.observed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars().all())
