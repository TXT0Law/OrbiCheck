"""Canonical selection of observed scan payloads, independent of UI defaults."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

HTTP_RESPONSE_MIN = 100
HTTP_RESPONSE_MAX = 599
FETCH_FAILURES = frozenset({"dns_error", "tls_error", "timeout", "circuit_open", "network_error"})
HTTP_SUCCESS_MIN = 200
HTTP_SUCCESS_MAX = 399
TRANSPORT_ERROR_MARKERS = ("timeout", "timed out", "enotfound", "eai_again", "econn", "tls", "certificate", "circuit", "dns")
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


def observed_status(
    raw: object, *, include_fetch_failures: bool = False, allow_legacy_http_success: bool = True
) -> dict | None:
    """Select target observations, never an envelope's service statusCode."""
    layers: list[dict] = []
    for _ in range(MAX_ENVELOPE_LAYERS):
        if not isinstance(raw, dict) or not raw or _skipped_at_this_layer(raw):
            return None
        if "success" in raw and type(raw["success"]) is not bool:
            return None
        if "statusCode" in raw and (type(raw["statusCode"]) is not int or not HTTP_RESPONSE_MIN <= raw["statusCode"] <= HTTP_RESPONSE_MAX):
            return None
        layers.append(raw)
        if isinstance(raw.get("data"), dict):
            raw = raw["data"]
            continue
        break
    if not layers or isinstance(layers[-1].get("data"), dict):
        return None
    payload = layers[-1]
    outcomes = [layer.get("fetchOutcome") for layer in layers if "fetchOutcome" in layer]
    if any(not isinstance(outcome, str) or outcome not in FETCH_FAILURES | {"http_response"} for outcome in outcomes):
        return None
    if len(set(outcomes)) > 1:
        return None
    if any(outcome in FETCH_FAILURES for outcome in outcomes):
        outcome = next(outcome for outcome in outcomes if outcome in FETCH_FAILURES)
        return {"fetchOutcome": outcome} if include_fetch_failures else None
    if any(outcome != "http_response" for outcome in outcomes):
        return None
    code = payload.get("responseCode")
    if code is None and "responseCode" not in payload and not outcomes and allow_legacy_http_success:
        # Historical successful probes supplied an explicit reachability boolean.
        # Keep that measured coverage without inventing an HTTP status/outcome.
        if isinstance(payload.get("isUp"), bool) and not any(
            layer.get("error") or layer.get("success") is False
            or not HTTP_SUCCESS_MIN <= layer.get("statusCode", HTTP_SUCCESS_MIN) <= HTTP_SUCCESS_MAX
            for layer in layers
        ):
            return {"isUp": payload["isUp"]}
    if type(code) is not int or not HTTP_RESPONSE_MIN <= code <= HTTP_RESPONSE_MAX:
        return None
    if any(layer.get("success") is False for layer in layers) and code <= HTTP_SUCCESS_MAX:
        return None
    if any(layer.get("statusCode", HTTP_SUCCESS_MIN) > HTTP_SUCCESS_MAX and layer["statusCode"] != code for layer in layers):
        return None
    if not outcomes and not allow_legacy_http_success and code <= HTTP_SUCCESS_MAX:
        return None
    # Legacy status errors with explicit HTTP codes are observations only when
    # their error does not also claim a transport failure.
    errors = " ".join(str(layer.get("error", "")) for layer in layers).lower()
    if any(marker in errors for marker in TRANSPORT_ERROR_MARKERS):
        return None
    return {**payload, "fetchOutcome": "http_response"}


def normalize_raw_results(
    raw_results: Mapping[str, object], *, include_fetch_failures: bool = False
) -> dict[str, dict]:
    """Select observed data from batch payloads, retry envelopes and legacy wrappers."""
    observed = {}
    for name, raw in raw_results.items():
        payload = (observed_status(raw, include_fetch_failures=include_fetch_failures)
                   if name == "status" else _observed_payload(name, raw))
        if payload is not None:
            observed[name] = payload
    return observed


def collect_scan_evidence(
    module_results: Iterable[Any], *, include_fetch_failures: bool = False
) -> dict[str, dict]:
    """Select measurements; failed status rows may retain real HTTP observations."""
    raw_results: dict[str, object] = {}
    for row in module_results:
        status = getattr(row, "status", None)
        status = getattr(status, "value", status)
        if row.module_name == "status":
            if status not in {"success", "failed", "timeout"}:
                continue
            payload = observed_status(
                row.raw_result, include_fetch_failures=include_fetch_failures,
                allow_legacy_http_success=status == "success",
            )
            if payload is None:
                continue
            if payload.get("fetchOutcome") == "http_response":
                error = str(getattr(row, "error_message", "") or "").lower()
                if status == "timeout" or any(marker in error for marker in TRANSPORT_ERROR_MARKERS):
                    continue
            raw_results[row.module_name] = payload
        elif status == "success":
            raw_results[row.module_name] = row.raw_result
    return normalize_raw_results(raw_results, include_fetch_failures=include_fetch_failures)


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
