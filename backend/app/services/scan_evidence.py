"""Canonical selection of observed scan payloads, independent of UI defaults."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

HTTP_SUCCESS_MIN = 200
HTTP_SUCCESS_MAX = 399
DNSSEC_RECORD_TYPES = ("DNSKEY", "DS", "RRSIG")
DNSSEC_RECORD_CODES = {"DNSKEY": 48, "DS": 43, "RRSIG": 46}
MAX_ENVELOPE_LAYERS = 4
HEADER_ANCHOR_NAMES = frozenset({"server", "date", "connection", "location", "vary"})

SKIP_NOTE_INDICATORS = ("not configured", "not found at the configured", "disabled")


def _skipped_at_this_layer(data: dict) -> bool:
    if data.get("skipped"):
        return True
    # A negative measurement can legitimately have "disabled" in its note.
    if any(isinstance(data.get(key), bool) for key in ("enabled", "isFound")):
        return False
    return any(indicator in str(data.get("note", "")).lower() for indicator in SKIP_NOTE_INDICATORS)


def is_skipped_payload(raw: object) -> bool:
    """Recognize current and legacy successful skip envelopes."""
    if not isinstance(raw, dict):
        return False
    nested = raw.get("data")
    return _skipped_at_this_layer(raw) or (
        isinstance(nested, dict) and _skipped_at_this_layer(nested)
    )


def _header_map(raw: dict) -> dict | None:
    """A response header value is text or a repeated list of text values."""
    for key, value in raw.items():
        if not isinstance(key, str):
            return None
        if isinstance(value, str):
            continue
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            return None
    return {key.lower(): value for key, value in raw.items()}


def _observed_payload(name: str, raw: object) -> dict | None:
    for _ in range(MAX_ENVELOPE_LAYERS):
        if not isinstance(raw, dict) or not raw:
            return None
        # A direct header map may legitimately contain fields named "error" or "note".
        # A wrapper contains a structured payload and must pass its own metadata checks.
        headers = _header_map(raw) if name == "headers" else None
        if headers and any("-" in key or key in HEADER_ANCHOR_NAMES for key in headers):
            return headers
        if _skipped_at_this_layer(raw) or raw.get("error") or ("success" in raw and raw["success"] is not True):
            return None
        status_code = raw.get("statusCode")
        if status_code is not None and (
            type(status_code) is not int or not HTTP_SUCCESS_MIN <= status_code <= HTTP_SUCCESS_MAX
        ):
            return None
        if "success" in raw and "data" in raw:
            raw = raw["data"]
        elif name == "headers" and "responseHeaders" in raw:
            raw = raw["responseHeaders"]
        elif isinstance(raw.get("data"), dict) and _skipped_at_this_layer(raw["data"]):
            return None
        else:
            return headers if name == "headers" else raw
    return None


def normalize_raw_results(raw_results: Mapping[str, object]) -> dict[str, dict]:
    """Select observed data from batch payloads, retry envelopes and legacy wrappers."""
    observed = {}
    for name, raw in raw_results.items():
        payload = _observed_payload(name, raw)
        if payload is not None:
            observed[name] = payload
    return observed


def collect_scan_evidence(module_results: Iterable[Any]) -> dict[str, dict]:
    """Use only successful rows; stale retry/failure payloads are unavailable."""
    raw_results: dict[str, object] = {}
    for row in module_results:
        status = getattr(row, "status", None)
        status = getattr(status, "value", status)
        if status == "success":
            raw_results[row.module_name] = row.raw_result
    return normalize_raw_results(raw_results)


def observed_hsts(raw_results: Mapping[str, object]) -> dict | None:
    """Return HSTS observation, using actual response headers as fallback."""
    raw_results = normalize_raw_results(raw_results)
    raw = raw_results.get("hsts")
    if isinstance(raw, dict) and not is_skipped_payload(raw) and not raw.get("error"):
        if isinstance(raw.get("enabled"), bool):
            return raw
        if isinstance(raw.get("hstsHeader"), str):
            return raw
        if isinstance(raw.get("maxAge"), int) and not isinstance(raw.get("maxAge"), bool) and raw["maxAge"] >= 0:
            return raw
        # The legacy probe reports preload compatibility, not header presence.
        # A positive compatible result proves HSTS; negative alone is unknown.
        if raw.get("compatible") is True:
            return {**raw, "enabled": True}
    headers = raw_results.get("headers")
    if isinstance(headers, dict):
        headers = headers.get("responseHeaders", headers)
        if isinstance(headers, dict) and headers:
            values = {str(key).lower(): value for key, value in headers.items()}
            header = values.get("strict-transport-security", "")
            if isinstance(header, str):
                return {"hstsHeader": header}
    return None


def observed_dnssec(raw: object) -> bool | None:
    """Distinguish DNSSEC presence/absence from incomplete resolver evidence."""
    raw = normalize_raw_results({"dnssec": raw}).get("dnssec")
    if not isinstance(raw, dict):
        return None
    for name in ("enabled", "isFound"):
        if isinstance(raw.get(name), bool):
            return raw[name]
    observations: list[bool] = []
    for name in DNSSEC_RECORD_TYPES:
        record = raw.get(name)
        if not isinstance(record, dict) or record.get("error"):
            continue
        response = record.get("response")
        if isinstance(response, dict) and response.get("Status", 0) != 0:
            continue
        if isinstance(record.get("isFound"), bool):
            found = record["isFound"]
            answers = record.get("answer")
            if answers is None and isinstance(response, dict):
                answers = response.get("Answer")
            if found and isinstance(answers, list) and not any(
                isinstance(answer, dict) and answer.get("type") in (name, DNSSEC_RECORD_CODES[name])
                for answer in answers
            ):
                continue
            observations.append(found)
    if any(observations):
        return True
    # All three current lookups must complete before absence is established.
    if len(observations) == len(DNSSEC_RECORD_TYPES):
        return False
    return None
