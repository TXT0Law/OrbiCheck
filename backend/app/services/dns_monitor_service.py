"""DNS change monitoring (Phase 2.2).

Performs an asynchronous DNS lookup for the configured record types using
``dnspython`` (run on a worker thread because dnspython's resolver API is
synchronous), diffs the result against the most recent snapshot persisted in
``osint_monitor_dns_records`` and, when a delta is detected, writes a row to
``osint_monitor_dns_changes`` and returns it so the caller can dispatch an
alert.

The probe is intentionally tolerant: NXDOMAIN / NoAnswer become an empty value
set so deletions are correctly recorded as "removed". Network or resolver
errors produce a structured log line and a *no-op* result — we do NOT zero out
the cache on transient failures, otherwise every blip would be reported as a
huge "removal" the next cycle.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlparse

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.monitor_defaults import DEFAULT_DNS_RECORD_TYPES, DNS_RECORD_TYPES
from app.models.monitor import Monitor, MonitorDnsChange, MonitorDnsRecord

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class DnsRecordDiff:
    record_type: str
    previous: list[str]
    current: list[str]
    added: list[str]
    removed: list[str]
    is_first_seen: bool


def _hostname_from_url(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.hostname or "").strip().lower()
    return host or None


def _normalize_values(values: Iterable[Any]) -> list[str]:
    """Sort + dedupe + lowercase a record set so diffs are deterministic."""
    seen: set[str] = set()
    for raw in values:
        text = str(raw).strip().rstrip(".").lower()
        if text:
            seen.add(text)
    return sorted(seen)


def _resolver_record_types(thresholds: dict[str, Any]) -> list[str]:
    raw = thresholds.get("recordTypes") or thresholds.get("record_types")
    if not isinstance(raw, list) or not raw:
        return list(DEFAULT_DNS_RECORD_TYPES)
    out: list[str] = []
    for item in raw:
        token = str(item).strip().upper()
        if token in DNS_RECORD_TYPES and token not in out:
            out.append(token)
    return out or list(DEFAULT_DNS_RECORD_TYPES)


def _resolver_nameservers(thresholds: dict[str, Any]) -> list[str]:
    raw = thresholds.get("nameservers")
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if isinstance(x, str) and x.strip()]


def _query_timeout(thresholds: dict[str, Any]) -> float:
    value = thresholds.get("queryTimeoutSeconds") or thresholds.get(
        "query_timeout_seconds"
    )
    try:
        return max(1.0, float(value or 5.0))
    except (TypeError, ValueError):
        return 5.0


def _resolve_sync(
    hostname: str,
    record_types: list[str],
    nameservers: list[str],
    timeout: float,
) -> dict[str, list[str]]:
    """Run a blocking dnspython resolution. Called via ``asyncio.to_thread``."""
    try:
        import dns.resolver  # local import keeps unit tests cheap
        from dns.exception import DNSException
    except ImportError:
        # dnspython not installed; behave like every record set is empty so a
        # missing dependency cannot brick monitor scheduling.
        logger.warning("dns_resolver_unavailable", hostname=hostname)
        return {rtype: [] for rtype in record_types}

    resolver = dns.resolver.Resolver(configure=True)
    if nameservers:
        resolver.nameservers = nameservers
    resolver.lifetime = timeout
    resolver.timeout = timeout

    out: dict[str, list[str]] = {}
    for rtype in record_types:
        try:
            answers = resolver.resolve(hostname, rtype, raise_on_no_answer=False)
            values: list[str] = []
            if answers.rrset is not None:
                for rdata in answers.rrset:
                    values.append(rdata.to_text())
            out[rtype] = values
        except dns.resolver.NXDOMAIN:
            out[rtype] = []
        except dns.resolver.NoAnswer:
            out[rtype] = []
        except DNSException as exc:
            # Transient: surface in logs but do NOT pretend the record set is
            # empty — caller will treat ``None`` as "skip diff".
            logger.warning(
                "dns_query_failed",
                hostname=hostname,
                record_type=rtype,
                error=str(exc),
            )
            out[rtype] = None  # type: ignore[assignment]
    return out


async def resolve_records(
    hostname: str,
    record_types: list[str],
    nameservers: list[str],
    timeout: float,
) -> dict[str, list[str] | None]:
    return await asyncio.to_thread(
        _resolve_sync, hostname, record_types, nameservers, timeout
    )


async def _load_current_snapshot(
    monitor_id: uuid.UUID, db: AsyncSession
) -> dict[str, MonitorDnsRecord]:
    rows = (
        await db.execute(
            select(MonitorDnsRecord).where(MonitorDnsRecord.monitor_id == monitor_id)
        )
    ).scalars().all()
    return {row.record_type: row for row in rows}


async def probe_dns_changes(
    monitor: Monitor,
    db: AsyncSession,
) -> list[DnsRecordDiff]:
    """Run a DNS probe and persist any deltas. Returns the list of diffs."""
    caps = monitor.capabilities or {}
    cap_cfg = caps.get("dns_change") or {}
    if not cap_cfg.get("enabled", False):
        return []
    thresholds = cap_cfg.get("thresholds") or {}

    hostname = _hostname_from_url(monitor.url)
    if not hostname:
        logger.warning("dns_probe_no_hostname", monitor_id=str(monitor.id))
        return []

    record_types = _resolver_record_types(thresholds)
    nameservers = _resolver_nameservers(thresholds)
    timeout = _query_timeout(thresholds)

    raw_results = await resolve_records(hostname, record_types, nameservers, timeout)
    snapshots = await _load_current_snapshot(monitor.id, db)
    now = datetime.now(timezone.utc)
    diffs: list[DnsRecordDiff] = []

    for rtype in record_types:
        raw_values = raw_results.get(rtype)
        if raw_values is None:
            # Transient resolver failure — do not touch the snapshot.
            continue
        current = _normalize_values(raw_values)
        existing = snapshots.get(rtype)
        previous = list(existing.values) if existing else []
        added = sorted(set(current) - set(previous))
        removed = sorted(set(previous) - set(current))
        changed = bool(added or removed)
        is_first = existing is None

        if existing is None:
            db.add(
                MonitorDnsRecord(
                    monitor_id=monitor.id,
                    record_type=rtype,
                    values=current,
                    observed_at=now,
                    last_change_at=None,
                )
            )
        else:
            existing.values = current
            existing.observed_at = now
            if changed:
                existing.last_change_at = now

        if changed and not is_first:
            db.add(
                MonitorDnsChange(
                    monitor_id=monitor.id,
                    record_type=rtype,
                    detected_at=now,
                    previous_values=previous,
                    current_values=current,
                    added_values=added,
                    removed_values=removed,
                )
            )
            diffs.append(
                DnsRecordDiff(
                    record_type=rtype,
                    previous=previous,
                    current=current,
                    added=added,
                    removed=removed,
                    is_first_seen=False,
                )
            )

    return diffs


async def list_dns_records(
    monitor_id: uuid.UUID, db: AsyncSession
) -> list[MonitorDnsRecord]:
    rows = await db.execute(
        select(MonitorDnsRecord)
        .where(MonitorDnsRecord.monitor_id == monitor_id)
        .order_by(MonitorDnsRecord.record_type.asc())
    )
    return list(rows.scalars().all())


async def list_dns_changes(
    monitor_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> list[MonitorDnsChange]:
    rows = await db.execute(
        select(MonitorDnsChange)
        .where(MonitorDnsChange.monitor_id == monitor_id)
        .order_by(MonitorDnsChange.detected_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars().all())
