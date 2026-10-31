"""Pure SSL monitor configuration and response projection helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.api.v1.schemas.monitor import ChainEntrySummary, MonitorSslStatusResponse
from app.core.config import settings
from app.models.monitor import Monitor


@dataclass(frozen=True)
class SslThresholds:
    warn_days_remaining: int
    critical_days_remaining: int


def _ssl_thresholds_from_config(ssl_cfg: Any) -> SslThresholds:
    if isinstance(ssl_cfg, dict):
        th = ssl_cfg.get("thresholds")
        if isinstance(th, dict):
            return SslThresholds(
                warn_days_remaining=int(th.get("warnDaysRemaining", settings.SSL_DEFAULT_WARN_DAYS)),
                critical_days_remaining=int(
                    th.get("criticalDaysRemaining", settings.SSL_DEFAULT_CRITICAL_DAYS)
                ),
            )
    return SslThresholds(
        warn_days_remaining=settings.SSL_DEFAULT_WARN_DAYS,
        critical_days_remaining=settings.SSL_DEFAULT_CRITICAL_DAYS,
    )


def _is_ssl_enabled(monitor: Monitor) -> bool:
    if "ssl_expiry" not in (monitor.enabled_capabilities or []):
        return False
    caps = monitor.capabilities or {}
    ssl_cfg = caps.get("ssl_expiry", {})
    if isinstance(ssl_cfg, bool):
        return ssl_cfg
    if isinstance(ssl_cfg, dict):
        return bool(ssl_cfg.get("enabled", True))
    return False


def _is_https(url: str) -> bool:
    return str(url).lower().startswith("https://")


def _evaluate_ssl_severity(
    days_remaining: int | None,
    is_expired: bool,
    thresholds: SslThresholds,
) -> str:
    if days_remaining is None:
        return "unknown"
    if is_expired or days_remaining < 0:
        return "critical"
    if days_remaining <= thresholds.critical_days_remaining:
        return "critical"
    if days_remaining <= thresholds.warn_days_remaining:
        return "warning"
    return "ok"


def _is_expiring_soon_ssl(days_remaining: int | None, thresholds: SslThresholds) -> bool:
    if days_remaining is None or days_remaining < 0:
        return False
    return days_remaining <= thresholds.warn_days_remaining


def _snapshot_to_ssl_response(
    snapshot: dict[str, Any],
    checked_at: datetime,
    thresholds: SslThresholds,
) -> MonitorSslStatusResponse:
    if not snapshot.get("success", True):
        return MonitorSslStatusResponse(
            days_remaining=None,
            expiry_date=None,
            issuer=None,
            subject=None,
            is_valid=False,
            severity_level="unknown",
            is_expiring_soon=False,
            is_expired=False,
            subject_alternative_names=[],
            chain_summary=[],
            last_checked_at=checked_at,
            serial_number=None,
            signature_algorithm=None,
            sha256_fingerprint=None,
            error=snapshot.get("error_message"),
            valid_from="",
            valid_to="",
        )

    days_remaining = snapshot.get("days_remaining")
    dr_int = int(days_remaining) if days_remaining is not None else None
    is_expired = bool(snapshot.get("is_expired", False))
    severity = _evaluate_ssl_severity(dr_int, is_expired, thresholds)
    nb = snapshot.get("not_before") or ""
    na = snapshot.get("not_after") or ""

    chain_raw = snapshot.get("chain", [])
    chain_summary: list[ChainEntrySummary] = []
    if isinstance(chain_raw, list):
        for i, c in enumerate(chain_raw):
            if not isinstance(c, dict):
                continue
            chain_summary.append(
                ChainEntrySummary(
                    subject_dn=str(c.get("subject_dn", "")),
                    issuer_dn=str(c.get("issuer_dn", "")),
                    valid_from=str(c.get("not_before", "")),
                    valid_to=str(c.get("not_after", "")),
                    sha256_fingerprint=str(c.get("sha256_fingerprint", "")),
                    position=int(c.get("position", i)),
                    is_leaf=bool(c.get("is_leaf", i == 0)),
                )
            )

    return MonitorSslStatusResponse(
        days_remaining=dr_int,
        expiry_date=str(na) if na else None,
        issuer=snapshot.get("issuer_dn"),
        subject=snapshot.get("subject_dn"),
        is_valid=bool(snapshot.get("is_valid", False)),
        severity_level=severity,
        is_expiring_soon=_is_expiring_soon_ssl(dr_int, thresholds),
        is_expired=is_expired,
        subject_alternative_names=list(snapshot.get("subject_alternative_names") or []),
        chain_summary=chain_summary,
        last_checked_at=checked_at,
        serial_number=snapshot.get("serial_number"),
        signature_algorithm=snapshot.get("signature_algorithm"),
        sha256_fingerprint=snapshot.get("sha256_fingerprint"),
        error=None,
        valid_from=str(nb),
        valid_to=str(na),
    )
