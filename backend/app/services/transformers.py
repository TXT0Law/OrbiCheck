"""Transform raw scan module output into frontend-compatible format.

Each transformer function takes the raw JSON from a scan handler
and returns a dict matching the corresponding frontend TypeScript interface.
If the raw data already matches (or close enough), the transformer
can do minimal reshaping.
"""

MODULE_BATCHES = {
    "quick": [
        "status",
        "get-ip",
        "headers",
        "dns",
        "txt-records",
        "hsts",
        "robots-txt",
        "security-txt",
        "sitemap",
        "social-tags",
        "page-source",
    ],
    "medium": [
        "ssl",
        "tls",
        "whois",
        "associated-hosts",
        "dnssec",
        "firewall",
        "cookies",
        "redirects",
        "mail-config",
        "http-security",
        "rank",
        "carbon",
        "linked-pages",
        "archives",
        "block-lists",
        "legacy-rank",
    ],
    "heavy": [
        "ports",
        "tech-stack",
        "threats",
        "trace-route",
        "screenshot",
        "features",
        "quality",
        "dns-server",
    ],
}

ALL_MODULES = []
for batch in MODULE_BATCHES.values():
    ALL_MODULES.extend(batch)

MODULE_TO_FRONTEND_KEY = {
    "ssl": "ssl",
    "headers": "headers",
    "http-security": "headers",
    "hsts": "hsts",
    "cookies": "cookies",
    "dnssec": "dnssec",
    "firewall": "firewall",
    "security-txt": "securityTxt",
    "threats": "threats",
    "block-lists": "threats",
    "tls": "tls",
    "get-ip": "ip",
    "whois": "whois",
    "dns": "dns",
    "dns-server": "dns",
    "txt-records": "dns",
    "ports": "ports",
    "trace-route": "traceroute",
    "redirects": "redirects",
    "status": "statusCheck",
    "mail-config": "emailConfig",
    "screenshot": "screenshot",
    "tech-stack": "techStack",
    "features": "features",
    "robots-txt": "robotsTxt",
    "sitemap": "sitemap",
    "linked-pages": "linkedPages",
    "social-tags": "socialTags",
    "archives": "archives",
    "rank": "rankingAndCarbon",
    "carbon": "rankingAndCarbon",
    "legacy-rank": "rankingAndCarbon",
    "quality": "quality",
    "associated-hosts": "associatedHosts",
    "page-source": "pageSource",
}


SKIPPED_INDICATORS = [
    "not configured",
    "API key not configured",
    "not found at the configured",
    "disabled",
]

STATUS_SORT_ORDER = {
    "failed": 0,
    "timed-out": 1,
    "skipped": 2,
    "success": 3,
}


def _is_skipped(module_result) -> bool:
    """Check if a 'successful' module was actually skipped due to missing config."""
    raw = getattr(module_result, "raw_result", None)
    if not isinstance(raw, dict):
        return False
    if raw.get("skipped"):
        return True
    data = raw.get("data", raw)
    note = data.get("note", "") if isinstance(data, dict) else ""
    if any(indicator in str(note).lower() for indicator in SKIPPED_INDICATORS):
        return True
    return False


def _determine_job_status(module_result) -> str | None:
    """
    Map ScanModuleResult to display status.
    Returns None for PENDING/RUNNING (excluded from moduleJobs).
    """
    status_value = getattr(getattr(module_result, "status", None), "value", None)
    status = str(status_value or "")
    if status == "pending" or status == "running":
        return None
    if status == "failed":
        return "failed"
    if status == "timeout":
        return "timed-out"
    if status == "success":
        return "skipped" if _is_skipped(module_result) else "success"
    return None


def _compute_total_duration_ms(scan) -> int:
    """Compute total scan wall-clock time in milliseconds."""
    started = getattr(scan, "started_at", None)
    completed = getattr(scan, "completed_at", None)
    if started and completed:
        delta = completed - started
        return int(delta.total_seconds() * 1000)
    return 0


def build_module_jobs(module_results: list, scan) -> tuple[list[dict], int]:
    """
    Build moduleJobs array and total duration from scan module results.

    Returns:
        (module_jobs, total_duration_ms)
    """
    jobs = []
    for result in module_results or []:
        status = _determine_job_status(result)
        if status is None:
            continue
        module_name = str(getattr(result, "module_name", "") or "")
        if not module_name:
            continue
        duration_ms = getattr(result, "duration_ms", None)
        duration_ms = int(duration_ms) if duration_ms is not None else 0
        error_message = getattr(result, "error_message", None)
        raw_result = getattr(result, "raw_result", None)
        if not error_message and isinstance(raw_result, dict):
            error_message = raw_result.get("error") or raw_result.get("message")
        if status == "skipped" and isinstance(raw_result, dict):
            data = raw_result.get("data", raw_result)
            note = data.get("note", "") if isinstance(data, dict) else ""
            if note and not error_message:
                error_message = str(note)
        job = {
            "module": module_name,
            "status": status,
            "durationMs": duration_ms,
            "error": str(error_message) if error_message else None,
        }
        if job["error"] is None:
            del job["error"]
        jobs.append(job)
    jobs.sort(key=lambda j: (STATUS_SORT_ORDER.get(j["status"], 99), j["module"]))
    total_ms = _compute_total_duration_ms(scan)
    return jobs, total_ms


def build_module_errors(module_results: list) -> dict[str, dict]:
    """Build a per-module failure summary for partial scan failures."""
    module_errors: dict[str, dict] = {}

    for result in module_results or []:
        module_name = str(getattr(result, "module_name", "") or "")
        if not module_name:
            continue

        status_value = getattr(getattr(result, "status", None), "value", None)
        status = str(status_value or "")
        if status not in ("failed", "timeout"):
            continue

        error_message = getattr(result, "error_message", None)
        raw_result = getattr(result, "raw_result", None)
        if not error_message and isinstance(raw_result, dict):
            error_message = raw_result.get("error") or raw_result.get("message")

        module_errors[module_name] = {
            "module": module_name,
            "frontendKey": MODULE_TO_FRONTEND_KEY.get(module_name, module_name),
            "status": status,
            "message": str(error_message or "Module execution failed"),
        }

    return module_errors


def _asn1_to_nist_curve(asn1_curve: str | None) -> str | None:
    """Map ASN.1 OID curve name to NIST curve name."""
    if not asn1_curve:
        return None
    curve_map = {
        "prime256v1": "P-256",
        "secp256r1": "P-256",
        "secp384r1": "P-384",
        "secp521r1": "P-521",
        "brainpoolP256r1": "brainpoolP256r1",
        "brainpoolP384r1": "brainpoolP384r1",
        "brainpoolP512r1": "brainpoolP512r1",
    }
    return curve_map.get(str(asn1_curve).lower(), asn1_curve)


def _extract_cert_extensions(ssl_raw: dict) -> dict | None:
    """Extract certificate extensions (extendedKeyUsage, keyUsage, etc.) from raw cert."""
    try:
        extensions = {}
        # Node.js cert / Mozilla may use different key names
        for src in [ssl_raw]:
            if not isinstance(src, dict):
                continue
            # extendedKeyUsage - TLS Web Server Authentication, etc.
            eku = src.get("ext_key_usage") or src.get("extendedKeyUsage") or src.get("extkeyusage")
            if eku:
                if isinstance(eku, list):
                    extensions["extendedKeyUsage"] = [str(x) for x in eku]
                else:
                    extensions["extendedKeyUsage"] = [str(eku)]
            # keyUsage
            ku = src.get("key_usage") or src.get("keyUsage")
            if ku:
                if isinstance(ku, list):
                    extensions["keyUsage"] = [str(x) for x in ku]
                else:
                    extensions["keyUsage"] = [str(ku)]
        if not extensions:
            return None
        return extensions
    except Exception:
        return None


def transform_ssl(raw: dict) -> dict:
    """Raw TLS cert object -> SslResult."""
    raw = _ensure_dict(raw)
    if raw.get("success") is False or (raw.get("error") and "valid_from" not in raw):
        return {
            "grade": "C",
            "issuer": "",
            "subject": "",
            "validFrom": "",
            "validTo": "",
            "daysRemaining": 0,
            "chainDepth": 1,
            "keySize": 0,
            "signatureAlgorithm": "",
            "sans": [],
            "chain": [],
            "asn1Curve": None,
            "nistCurve": None,
            "serialNumber": None,
            "fingerprint": None,
            "renewed": None,
            "extensions": None,
        }
    valid_from = raw.get("valid_from", "")
    valid_to = raw.get("valid_to", "")
    subject = raw.get("subject", {})
    issuer = raw.get("issuer", {})
    return {
        "grade": _compute_ssl_grade(raw),
        "issuer": _format_issuer(issuer),
        "subject": subject.get("CN", str(subject)),
        "validFrom": valid_from,
        "validTo": valid_to,
        "daysRemaining": _days_until(valid_to),
        "chainDepth": len(raw.get("ca", [])) + 1 if raw.get("ca") else 1,
        "keySize": raw.get("bits", 0),
        "signatureAlgorithm": raw.get("sigalg", "") or "",
        "sans": _extract_sans(raw),
        "chain": _extract_chain(raw),
        "asn1Curve": raw.get("asn1Curve") or None,
        "nistCurve": _asn1_to_nist_curve(raw.get("asn1Curve")),
        "serialNumber": raw.get("serialNumber") or raw.get("serial_number") or None,
        "fingerprint": raw.get("fingerprint") or raw.get("fingerprint256") or None,
        "renewed": raw.get("valid_from", "") or None,
        "extensions": _extract_cert_extensions(raw),
    }


def _safe_get(d: dict, key: str, default=None):
    """Safely get a key from dict, returning default on any error."""
    try:
        return d.get(key, default)
    except (AttributeError, TypeError):
        return default


_SSL_API_GRADES = frozenset({"A+", "A", "B", "C", "D", "F"})


def _normalize_grade(raw_grade: str) -> str:
    """Normalize Mozilla grade to our grade scale."""
    grade_map = {
        "A+": "A+",
        "A": "A",
        "A-": "A",
        "B+": "B",
        "B": "B",
        "B-": "B",
        "C+": "C",
        "C": "C",
        "C-": "C",
        "D+": "D",
        "D": "D",
        "D-": "D",
        "F": "F",
    }
    return grade_map.get(str(raw_grade), "F")


def _coerce_ssl_output_grade(value) -> str:
    """Clamp any incoming grade string to the SslCheckResult API union."""
    if value is None or value == "":
        return "F"
    g = str(value).strip()
    if g in _SSL_API_GRADES:
        return g
    return _normalize_grade(g)


def _classify_protocol_security(protocol_name: str) -> str:
    """
    Classify protocol version security.
    Returns: "good" | "warning" | "danger"
    """
    upper = str(protocol_name).upper().replace(" ", "")
    PROTOCOL_SECURITY: dict[str, str] = {
        "TLSV1.3": "good",
        "TLSV1.2": "good",
        "TLSV1.1": "warning",
        "TLSV1.0": "warning",
        "TLSV1": "warning",
        "SSLV3": "danger",
        "SSLV3.0": "danger",
        "SSLV2": "danger",
    }
    return PROTOCOL_SECURITY.get(upper, "warning")


def extract_tls_protocols(tls_raw: dict) -> list[dict]:
    """Extract protocol support info from Mozilla TLS Observatory result."""
    try:
        protocols_raw = tls_raw.get("connection", {}).get("protocols", [])
        if not protocols_raw:
            protocols_raw = tls_raw.get("protocols", [])

        result = []
        for p in protocols_raw or []:
            if isinstance(p, str):
                name = p
                supported = True
            elif isinstance(p, dict):
                name = p.get("name", str(p))
                supported = p.get("supported", True)
            else:
                continue
            secure = _classify_protocol_security(name)
            result.append({"name": name, "supported": supported, "secure": secure})
        return result
    except Exception:
        return []


# Cipher classification constants (no magic strings)
INSECURE_CIPHERS = frozenset(
    {"RC4", "DES", "3DES", "NULL", "EXPORT", "ANON", "RC2", "IDEA", "SEED"}
)
WEAK_PATTERNS = frozenset({"CBC"})
STRONG_ENCRYPTIONS = frozenset(
    {"AES_256_GCM", "AES_256_CCM", "CHACHA20_POLY1305", "CHACHA20"}
)
ACCEPTABLE_ENCRYPTIONS = frozenset({"AES_128_GCM", "AES_128_CCM"})
FORWARD_SECRECY_EXCHANGES = frozenset({"ECDHE", "DHE", "ECDH"})
AEAD_PATTERNS = frozenset({"GCM", "CCM", "POLY1305", "CHACHA20"})


def _classify_cipher_strength(cipher_name: str) -> str:
    """
    Classify cipher strength into four levels.
    Returns: "strong" | "acceptable" | "weak" | "insecure"
    """
    upper = str(cipher_name).upper().replace("-", "_")
    for bad in INSECURE_CIPHERS:
        if bad in upper:
            return "insecure"
    for weak in WEAK_PATTERNS:
        if weak in upper and not any(p in upper for p in AEAD_PATTERNS):
            return "weak"
    for strong in STRONG_ENCRYPTIONS:
        if strong in upper:
            return "strong"
    for acc in ACCEPTABLE_ENCRYPTIONS:
        if acc in upper:
            return "acceptable"
    if "GCM" in upper or "CCM" in upper or "POLY1305" in upper:
        return "acceptable"
    return "weak"


def _parse_cipher_components(cipher_name: str) -> dict:
    """
    Parse IANA cipher suite name into components.
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 -> keyExchange, auth, encryption, mac, fs
    TLS_AES_256_GCM_SHA384 (TLS1.3) -> encryption, mac, fs=True
    """
    upper = str(cipher_name).upper().replace("-", "_")
    out: dict = {}

    if "WITH" in upper:
        before, after = upper.split("WITH", 1)
        kex_auth = [p for p in before.replace("TLS_", "").strip("_").split("_") if p]
        enc_mac = [p for p in after.strip("_").split("_") if p]
        for kex in FORWARD_SECRECY_EXCHANGES:
            if kex in kex_auth:
                out["keyExchange"] = kex.replace("_", "-")
                out["forwardSecrecy"] = True
                break
        if "keyExchange" not in out and kex_auth:
            out["keyExchange"] = kex_auth[0].replace("_", "-")
        if len(kex_auth) >= 2:
            out["auth"] = kex_auth[-1].replace("_", "-")
        if enc_mac:
            if enc_mac[-1].startswith("SHA"):
                out["mac"] = enc_mac[-1].replace("_", "-")
                out["encryption"] = "_".join(enc_mac[:-1]).replace("_", "-")
            else:
                out["encryption"] = "_".join(enc_mac).replace("_", "-")
    else:
        parts = upper.replace("TLS_", "").split("_")
        if parts:
            if parts[-1].startswith("SHA"):
                out["mac"] = parts[-1].replace("_", "-")
                out["encryption"] = "_".join(parts[:-1]).replace("_", "-")
            else:
                out["encryption"] = "_".join(parts).replace("_", "-")
        out["forwardSecrecy"] = True  # TLS 1.3 mandates FS

    return out


def _compute_cipher_stats(ciphers: list[dict]) -> dict:
    """Compute aggregate cipher statistics."""
    if not ciphers:
        return {"total": 0, "weakCount": 0, "forwardSecrecyPercent": 0.0, "aeadPercent": 0.0}
    total = len(ciphers)
    weak_count = sum(
        1 for c in ciphers if c.get("strength") in ("weak", "insecure")
    )
    fs_count = sum(1 for c in ciphers if c.get("forwardSecrecy"))
    aead_count = sum(
        1
        for c in ciphers
        if any(
            p in str(c.get("encryption", "")).upper()
            for p in ("GCM", "CCM", "POLY1305", "CHACHA20")
        )
    )
    return {
        "total": total,
        "weakCount": weak_count,
        "forwardSecrecyPercent": round(100.0 * fs_count / total, 1),
        "aeadPercent": round(100.0 * aead_count / total, 1),
    }


def extract_tls_ciphers(tls_raw: dict) -> list[dict]:
    """Extract cipher suite info from Mozilla TLS Observatory result."""
    try:
        ciphers_raw = tls_raw.get("connection", {}).get("ciphers", [])
        if not ciphers_raw:
            ciphers_raw = tls_raw.get("ciphers", [])

        result = []
        for c in ciphers_raw or []:
            if isinstance(c, str):
                name, protocol = c, ""
            elif isinstance(c, dict):
                name = c.get("name", str(c))
                protocol = c.get("protocol", "")
            else:
                continue
            components = _parse_cipher_components(name)
            strength = _classify_cipher_strength(name)
            fs = components.get("forwardSecrecy", False)
            if fs is False and ("ECDHE" in name.upper() or "DHE" in name.upper()):
                fs = True
            entry = {
                "name": name,
                "protocol": protocol or "TLSv1.2",
                "strength": strength,
                "forwardSecrecy": fs,
                "keyExchange": components.get("keyExchange"),
                "auth": components.get("auth"),
                "encryption": components.get("encryption"),
                "mac": components.get("mac"),
            }
            entry = {k: v for k, v in entry.items() if v is not None}
            result.append(entry)
        return result
    except Exception:
        return []


def _extract_forward_secrecy(tls_raw: dict) -> bool:
    """Check if forward secrecy is supported."""
    try:
        if "forward_secrecy" in tls_raw:
            return bool(tls_raw["forward_secrecy"])
        ciphers = (
            tls_raw.get("connection", {}).get("ciphers", [])
            or tls_raw.get("ciphers", [])
        )
        fs_keywords = ["ECDHE", "DHE"]
        for c in ciphers:
            name = c if isinstance(c, str) else c.get("name", "")
            if any(k in name for k in fs_keywords):
                return True
        return False
    except Exception:
        return False


def _extract_vulnerabilities(tls_raw: dict) -> list[dict]:
    """Extract known vulnerability checks from Mozilla result."""
    try:
        if not tls_raw or tls_raw.get("error"):
            return []
        vuln_checks = [
            ("heartbleed", "CVE-2014-0160", "Heartbleed"),
            ("poodle", "CVE-2014-3566", "POODLE"),
            ("beast", "CVE-2011-3389", "BEAST"),
            ("crime", "CVE-2012-4929", "CRIME"),
            ("freak", "CVE-2015-0204", "FREAK"),
            ("logjam", "CVE-2015-4000", "Logjam"),
            ("drown", "CVE-2016-0800", "DROWN"),
            ("robot", "CVE-2017-13099", "ROBOT"),
        ]

        result = []
        for key, cve_id, display_name in vuln_checks:
            raw_val = tls_raw.get(key)
            if raw_val is None:
                status = "unknown"
            elif raw_val in (True, "vulnerable", "true"):
                status = "vulnerable"
            else:
                status = "not-vulnerable"

            result.append({"id": cve_id, "name": display_name, "status": status})
        return result
    except Exception:
        return []


def _extract_chain_details(tls_raw: dict) -> list[dict] | None:
    """Extract certificate chain details from Mozilla result."""
    try:
        certs = tls_raw.get("certificates", [])
        if not certs:
            return None

        result = []
        for i, cert in enumerate(certs):
            if not isinstance(cert, dict):
                continue
            subj = cert.get("subject", {})
            iss = cert.get("issuer", {})
            subject_cn = subj.get("CN", str(subj)) if isinstance(subj, dict) else str(subj)
            issuer_cn = iss.get("CN", "Unknown") if isinstance(iss, dict) else "Unknown"
            result.append({
                "subject": subject_cn,
                "issuer": issuer_cn,
                "order": i,
                "isTrusted": cert.get("trusted"),
            })
        return result if result else None
    except Exception:
        return None


def _parse_max_age_from_header(header_val: str) -> int | None:
    """Parse max-age from Strict-Transport-Security header value."""
    import re

    if not header_val:
        return None
    match = re.search(r"max-age=(\d+)", str(header_val), re.IGNORECASE)
    return int(match.group(1)) if match else None


def _extract_hsts(hsts_raw: dict, headers_raw: dict) -> dict:
    """Extract HSTS info from hsts module or headers."""
    try:
        hsts_raw = _ensure_dict(hsts_raw)
        header_str = str(hsts_raw.get("hstsHeader") or "")
        lower_header = header_str.lower()

        if hsts_raw.get("enabled") or hsts_raw.get("compatible") or hsts_raw.get("hstsEnabled"):
            max_age = (
                hsts_raw.get("maxAge")
                or hsts_raw.get("max_age")
                or _parse_max_age_from_header(header_str)
            )
            enabled = (max_age or 0) > 0
            return {
                "enabled": enabled,
                "preloadReady": bool(hsts_raw.get("preloadReady", hsts_raw.get("compatible", False))),
                "maxAge": max_age,
                "preload": "preload" in lower_header,
                "includeSubDomains": "includesubdomains" in lower_header,
            }

        headers_raw = _ensure_dict(headers_raw)
        sts_header = headers_raw.get("strict-transport-security", "")
        if not sts_header:
            return {"enabled": False, "preloadReady": False}

        parsed_max_age = _parse_max_age_from_header(sts_header)
        sts_lower = sts_header.lower()
        has_preload = "preload" in sts_lower
        has_sub = "includesubdomains" in sts_lower
        return {
            "enabled": (parsed_max_age or 0) > 0,
            "preloadReady": (parsed_max_age or 0) > 0 and has_preload and has_sub,
            "maxAge": parsed_max_age,
            "preload": has_preload,
            "includeSubDomains": has_sub,
        }
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"enabled": False, "preloadReady": False}


def _check_cn_san_match(base: dict) -> bool:
    """Check if CN appears in SAN list."""
    try:
        subject = base.get("subject", "")
        sans = base.get("sans", [])
        if not subject or not sans:
            return False
        return str(subject) in [str(s) for s in sans]
    except Exception:
        return False


def _extract_wildcard_scope(sans: list) -> str | None:
    """Find wildcard entry in SANs."""
    for san in sans or []:
        if str(san).startswith("*."):
            return str(san)
    return None


def _detect_cert_type(ssl_raw: dict) -> str | None:
    """Detect certificate validation type (DV/OV/EV)."""
    try:
        subject = ssl_raw.get("subject", {})
        if isinstance(subject, dict):
            if subject.get("businessCategory") or subject.get("serialNumber"):
                return "EV"
            if subject.get("O"):
                return "OV"
        return "DV"
    except Exception:
        return None


def _ssl_info_access_text(ssl_raw: dict) -> str:
    """Flatten Node.js peerCertificate.infoAccess (string or dict) to searchable text."""
    ia = ssl_raw.get("infoAccess") or ssl_raw.get("infoaccess")
    if isinstance(ia, str):
        return ia
    if isinstance(ia, dict):
        lines: list[str] = []
        for k, v in ia.items():
            if isinstance(v, (list, tuple)):
                for item in v:
                    lines.append(f"{k}: {item}")
            else:
                lines.append(f"{k}: {v}")
        return "\n".join(lines)
    return ""


def _ocsp_responder_listed_from_text(text: str) -> bool | None:
    """True if text clearly contains an OCSP URI; False if AIA-like text has no OCSP; None if unknown."""
    t = (text or "").strip()
    if not t:
        return None
    upper = t.upper()
    if "OCSP" in upper and ("URI:" in upper or "HTTP://" in upper or "HTTPS://" in upper):
        return True
    if "CA ISSUERS" in upper or "URI:" in upper:
        return False
    return None


def _first_tls_certificate(tls_raw: dict) -> dict | None:
    certs = tls_raw.get("certificates")
    if isinstance(certs, list) and certs and isinstance(certs[0], dict):
        return certs[0]
    return None


def _ocsp_responder_listed_from_tls_cert(tls_raw: dict) -> bool | None:
    cert = _first_tls_certificate(tls_raw)
    if not cert:
        return None
    for key in ("authority_info_access", "authorityInfoAccess", "ainfoaccess"):
        block = cert.get(key)
        if isinstance(block, str) and block.strip():
            r = _ocsp_responder_listed_from_text(block)
            if r is not None:
                return r
        if isinstance(block, dict):
            nested = "\n".join(f"{k}:{v}" for k, v in block.items())
            r = _ocsp_responder_listed_from_text(nested)
            if r is not None:
                return r
    return None


def _crl_distribution_listed(ssl_raw: dict, tls_raw: dict) -> bool | None:
    cdp = ssl_raw.get("crlDistributionPoints") or ssl_raw.get("crl_distribution_points")
    if isinstance(cdp, str) and cdp.strip():
        return True
    if isinstance(cdp, list) and len(cdp) > 0:
        return True
    cert = _first_tls_certificate(tls_raw)
    if cert:
        for key in ("crl_distribution_points", "crlDistributionPoints"):
            v = cert.get(key)
            if isinstance(v, str) and v.strip():
                return True
            if isinstance(v, list) and len(v) > 0:
                return True
        return False
    return None


def _extract_revocation(tls_raw: dict, ssl_raw: dict) -> dict:
    """Extract revocation-related signals without conflating stapling with OCSP availability."""
    try:
        tls_raw = _ensure_dict(tls_raw)
        ssl_raw = _ensure_dict(ssl_raw)
        ocsp_out: dict = {}
        if "ocsp_stapling" in tls_raw:
            ocsp_out["stapled"] = bool(tls_raw["ocsp_stapling"])

        responder_listed: bool | None = None
        for key in ("ocsp_url", "ocsp_uri", "ocspResponder", "ocsp"):
            v = tls_raw.get(key)
            if isinstance(v, str) and v.strip().lower().startswith("http"):
                responder_listed = True
                break
        if responder_listed is None:
            responder_listed = _ocsp_responder_listed_from_tls_cert(tls_raw)
        if responder_listed is None:
            responder_listed = _ocsp_responder_listed_from_text(_ssl_info_access_text(ssl_raw))
        if responder_listed is not None:
            ocsp_out["responderUrlListed"] = responder_listed

        crl_out: dict = {}
        crl_listed = _crl_distribution_listed(ssl_raw, tls_raw)
        if crl_listed is True:
            crl_out["distributionPointListed"] = True
        elif crl_listed is False:
            crl_out["distributionPointListed"] = False

        return {"ocsp": ocsp_out, "crl": crl_out}
    except Exception:
        return {"ocsp": {}, "crl": {}}


def _extract_ct(tls_raw: dict, ssl_raw: dict) -> dict:
    """Extract Certificate Transparency info."""
    try:
        ct = _safe_get(tls_raw, "certificate_transparency")
        return {
            "hasSct": bool(ct),
            "logCount": None,
        }
    except Exception:
        return {"hasSct": False}


def _dns_records_root(dns_raw: dict) -> dict:
    """Unwrap Scan Service DNS payload: same pattern as transform_ip when nested under data."""
    dns_raw = _ensure_dict(dns_raw)
    data = dns_raw.get("data")
    if isinstance(data, dict) and any(
        k in data for k in ("A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA", "caa", "PTR", "SRV")
    ):
        return data
    return dns_raw


def _caa_record_to_str(record) -> str:
    """Match backend/scan/dns.js formatCaaRecords string shape for object records."""
    if isinstance(record, str):
        return record
    if not isinstance(record, dict):
        return str(record)
    critical = record.get("critical", record.get("flags", 0))
    parts = [str(critical)]
    if record.get("issue") is not None:
        parts.append(f'issue "{record["issue"]}"')
    if record.get("issuewild") is not None:
        parts.append(f'issuewild "{record["issuewild"]}"')
    if record.get("iodef") is not None:
        parts.append(f'iodef "{record["iodef"]}"')
    return " ".join(parts)


def _extract_caa(dns_raw: dict) -> list[str]:
    """Extract CAA records from DNS module result (flat or data-wrapped; object or string records)."""
    try:
        root = _dns_records_root(_ensure_dict(dns_raw))
        caa = root.get("CAA") or root.get("caa")
        if isinstance(caa, list):
            return [_caa_record_to_str(r) for r in caa]
        if caa:
            return [_caa_record_to_str(caa)]
        return []
    except Exception:
        return []


def transform_ssl_check(all_raw: dict) -> dict:
    """
    Merge ssl + tls + hsts + headers raw results into SslCheckResult.

    Args:
        all_raw: dict containing all module raw results, keyed by module name.
                 e.g. {"ssl": {...}, "tls": {...}, "hsts": {...}, "headers": {...}}

    Returns:
        dict matching SslCheckResult interface.
    """
    ssl_raw = _ensure_dict(all_raw.get("ssl") or {})
    tls_raw = _ensure_dict(all_raw.get("tls") or {})
    hsts_raw = _ensure_dict(all_raw.get("hsts") or {})
    headers_raw = _ensure_dict(all_raw.get("headers") or {})
    headers_inner = headers_raw.get("responseHeaders") or headers_raw

    # 1. Start with existing transform_ssl base
    base = transform_ssl(ssl_raw)

    # 2. Override grade from Mozilla if available (skip when tls has error)
    if not tls_raw.get("error") and tls_raw.get("grade"):
        base["grade"] = _normalize_grade(str(tls_raw["grade"]))

    # 3. Protocol support
    base["protocols"] = extract_tls_protocols(tls_raw)

    # 4. Cipher suites
    base["cipherSuites"] = extract_tls_ciphers(tls_raw)

    # 5. Forward secrecy
    base["forwardSecrecy"] = _extract_forward_secrecy(tls_raw)

    # 6. Vulnerabilities
    base["vulnerabilities"] = _extract_vulnerabilities(tls_raw)

    # 7. Chain details from Mozilla
    chain_details = _extract_chain_details(tls_raw)
    if chain_details:
        base["chainDetails"] = chain_details
        base["chain"] = [c["subject"] for c in chain_details]
        base["chainDepth"] = len(chain_details)
        base["chainComplete"] = tls_raw.get("chain_complete")
        base["chainOrderValid"] = tls_raw.get("chain_order_valid")

    # 8. HSTS
    base["hsts"] = _extract_hsts(hsts_raw, headers_inner)

    # 9. CN vs SAN matching
    base["cnMatchesSan"] = _check_cn_san_match(base)

    # 10. Wildcard scope
    base["wildcardScope"] = _extract_wildcard_scope(base.get("sans", []))

    # 11. Certificate type (DV/OV/EV)
    base["certType"] = _detect_cert_type(ssl_raw)

    # 12. Server config
    base["secureRenegotiation"] = tls_raw.get("secure_renegotiation")
    base["tlsCompression"] = tls_raw.get("tls_compression")

    # 13. Revocation
    base["revocation"] = _extract_revocation(tls_raw, ssl_raw)

    # 14. CT
    base["ct"] = _extract_ct(tls_raw, ssl_raw)

    # 15. CAA (from dns raw)
    dns_raw = _ensure_dict(all_raw.get("dns") or all_raw.get("get-ip") or {})
    base["caa"] = _extract_caa(dns_raw)

    # 16. Extensions from TLS first cert if SSL has none
    if not base.get("extensions") and tls_raw.get("certificates"):
        first_cert = tls_raw["certificates"][0] if isinstance(tls_raw["certificates"], list) else {}
        if isinstance(first_cert, dict):
            base["extensions"] = _extract_cert_extensions(first_cert)

    base["grade"] = _coerce_ssl_output_grade(base.get("grade"))

    return base


def transform_headers(raw: dict, http_security_raw: dict | None = None) -> dict:
    """Raw response headers -> HeadersResult."""
    security_checks = _evaluate_security_headers(raw)
    if http_security_raw and isinstance(http_security_raw, dict):
        pass
    return {
        "overallGrade": _compute_headers_grade(security_checks),
        "responseHeaders": raw,
        "securityChecks": security_checks,
    }


def transform_status(raw: dict) -> dict:
    """Raw status -> StatusResult."""
    return {
        "httpStatusCode": raw.get("responseCode", 0),
        "responseTimeMs": round(raw.get("responseTime", 0), 1),
        "serverHeader": "",
        "contentType": "",
        "redirectCount": 0,
    }


def transform_dns(
    raw: dict,
    txt_records_raw: dict | None = None,
    dns_server_raw: dict | None = None,
) -> dict:
    """Raw DNS records -> DnsResult."""
    result = {
        "a": _to_string_list(raw.get("A", [])),
        "aaaa": _to_string_list(raw.get("AAAA", [])),
        "cname": _to_string_list(raw.get("CNAME", [])),
        "mx": _to_string_list(raw.get("MX", [])),
        "ns": _to_string_list(raw.get("NS", [])),
        "txt": _to_string_list(raw.get("TXT", [])),
        "soa": _to_string_list(raw.get("SOA", [])),
    }
    if txt_records_raw and isinstance(txt_records_raw, dict):
        extra_txt = txt_records_raw.get("TXT", txt_records_raw.get("txt", []))
        if extra_txt:
            result["txt"] = list(set(result["txt"] + _to_string_list(extra_txt)))
    if dns_server_raw and isinstance(dns_server_raw, dict):
        result["dnsServer"] = dns_server_raw
    return result


def transform_ip(raw: dict) -> dict:
    """Raw IP lookup -> IpInfoResult. Handles data wrapper and ip-api.com key variants."""
    raw = _ensure_dict(raw)
    # Unwrap if scan service returned { data: {...} }
    if "data" in raw and isinstance(raw.get("data"), dict) and "ip" in raw.get("data", {}):
        raw = raw["data"]
    ip_val = raw.get("address", raw.get("ip", raw.get("query", "")))
    # ip-api.com returns "as" for ASN (e.g. "AS15169"); get-ip normalizes to asn
    asn = raw.get("asn", "")
    if not asn and "as" in raw:
        asn = str(raw["as"]).replace("AS", "").strip()
    return {
        "ip": ip_val,
        "asn": asn,
        "isp": raw.get("isp", ""),
        "org": raw.get("org", ""),
        "country": raw.get("country", ""),
        "countryCode": raw.get("countryCode", ""),
        "city": raw.get("city", ""),
        "region": raw.get("region", raw.get("regionName", "")),
        "lat": raw.get("lat"),
        "lon": raw.get("lon"),
        "hostingProvider": raw.get("hostingProvider", ""),
        "isHosting": raw.get("isHosting", False),
        "ipType": "datacenter",
    }


def transform_quality(raw: dict) -> dict:
    """Transform quality module (PageSpeed/Lighthouse) result."""
    if raw.get("error") or raw.get("success") is False:
        return {
            "categories": [],
            "audits": [],
            "fetchTime": None,
            "requestedUrl": "",
            "finalUrl": "",
            "runtimeError": raw.get("error"),
        }
    data = raw.get("data", raw)
    if not isinstance(data, dict):
        data = {}
    lighthouse = data.get("lighthouseResult", data)
    if not isinstance(lighthouse, dict):
        lighthouse = {}
    categories_raw = lighthouse.get("categories", {})
    if not isinstance(categories_raw, dict):
        categories_raw = {}

    categories = []
    for cat_id in ("performance", "accessibility", "best-practices", "seo"):
        cat = categories_raw.get(cat_id)
        if cat and isinstance(cat, dict):
            score = cat.get("score")
            display = round((score or 0) * 100)
            categories.append({
                "id": cat_id,
                "title": cat.get("title", cat_id.replace("-", " ").title()),
                "score": score,
                "displayScore": display,
            })

    audits_raw = lighthouse.get("audits", {})
    key_audits = []
    for audit_key in (
        "first-contentful-paint",
        "largest-contentful-paint",
        "total-blocking-time",
        "cumulative-layout-shift",
        "speed-index",
        "interactive",
    ):
        audit = audits_raw.get(audit_key)
        if audit and isinstance(audit, dict):
            key_audits.append({
                "id": audit_key,
                "title": audit.get("title", ""),
                "displayValue": audit.get("displayValue", ""),
                "score": audit.get("score"),
                "numericValue": audit.get("numericValue"),
            })

    return {
        "categories": categories,
        "audits": key_audits,
        "fetchTime": lighthouse.get("fetchTime") or data.get("fetchTime"),
        "requestedUrl": lighthouse.get("requestedUrl") or data.get("requestedUrl", ""),
        "finalUrl": lighthouse.get("finalUrl") or data.get("finalUrl", ""),
        "runtimeError": data.get("runtimeError") or lighthouse.get("runtimeError"),
    }


def transform_associated_hosts(raw: dict) -> dict:
    """Transform associated-hosts module result."""
    data = raw.get("data", raw)
    hosts_raw = data.get("hosts", [])

    hosts = []
    for h in hosts_raw if isinstance(hosts_raw, list) else []:
        if not isinstance(h, dict):
            continue
        hostname = h.get("hostname", "")
        if not hostname:
            continue
        hosts.append({
            "hostname": hostname,
            "source": h.get("source", "certificate"),
            "ip": h.get("ip"),
        })

    return {
        "domain": data.get("domain", ""),
        "hosts": hosts,
        "totalFound": data.get("totalFound", len(hosts)),
    }


def transform_whois(raw: dict) -> dict:
    """Raw whois -> WhoisResult. Handles wrapped (data), flat (raw is data), and old format."""
    raw = _ensure_dict(raw)
    # Format 1: wrapped in "data" (e.g. full Scan Service response)
    data = _ensure_dict(raw.get("data"))
    # Format 2: raw IS the data (scan_tasks stores module_result["data"] directly in DB)
    if not data and (
        raw.get("registrar") is not None
        or raw.get("creationDate")
        or raw.get("domain")
        or raw.get("nameServers")
    ):
        data = raw
    if data:
        return {
            "registrar": data.get("registrar", ""),
            "createdAt": data.get("creationDate", data.get("created", "")),
            "updatedAt": data.get("updatedDate", data.get("updated", "")),
            "expiresAt": (
                data.get("expiryDate") or data.get("expires")
                or data.get("registry_expiry_date", "")
            ),
            "nameservers": _to_string_list(data.get("nameServers", data.get("name_servers", []))),
            "domainStatus": _to_string_list(
                data.get("domainStatus") or data.get("domain_status", [])
            ),
        }

    # Old format: whoisData / internicData
    whois_data = _ensure_dict(raw.get("whoisData"))
    internic_data = _ensure_dict(raw.get("internicData"))
    source = whois_data if whois_data else internic_data

    nameservers = source.get("nameServers", source.get("nameservers", source.get("Name_Servers", [])))
    domain_status = source.get("domainStatus", source.get("status", source.get("Domain_Status", [])))

    return {
        "registrar": source.get("registrar", source.get("Registrar", "")),
        "createdAt": source.get("creationDate", source.get("created", source.get("Creation_Date", ""))),
        "updatedAt": source.get("updatedDate", source.get("updated", source.get("Updated_Date", ""))),
        "expiresAt": source.get("expiryDate", source.get("expires", source.get("Expiry_Date", ""))),
        "nameservers": _to_string_list(nameservers),
        "domainStatus": _to_string_list(domain_status),
    }


def transform_ports(raw: dict) -> dict:
    """Raw ports -> PortsResult."""
    raw = _ensure_dict(raw)
    open_ports = raw.get("openPorts", raw.get("open_ports", []))
    closed_ports = raw.get("closedPorts", raw.get("failedPorts", raw.get("closed_ports", [])))
    filtered_ports = raw.get("filteredPorts", raw.get("filtered_ports", []))
    scan_stats_raw = raw.get("scanStats", raw.get("scan_stats"))
    start_time = raw.get("startTime", raw.get("start_time"))
    end_time = raw.get("endTime", raw.get("end_time"))

    if not isinstance(open_ports, list):
        open_ports = []
    if not isinstance(closed_ports, list):
        closed_ports = []
    if not isinstance(filtered_ports, list):
        filtered_ports = []

    results: list[dict] = []
    _append_port_results(results, open_ports, "open")
    _append_port_results(results, filtered_ports, "filtered")
    _append_port_results(results, closed_ports, "closed")

    result = {
        "engine": raw.get("engine"),
        "profile": raw.get("profile"),
        "method": raw.get("method"),
        "durationMs": _to_int(raw.get("durationMs", raw.get("duration_ms")), 0),
        "behindProxy": bool(raw.get("behindProxy", raw.get("behind_proxy", False))),
        "proxyProvider": raw.get("proxyProvider", raw.get("proxy_provider")),
        "note": raw.get("note"),
        "detectedTechnologies": _to_string_list(
            raw.get("detectedTechnologies", raw.get("detected_technologies", []))
        ),
        "osFingerprint": raw.get("osFingerprint", raw.get("os_fingerprint")),
        "entries": sorted(results, key=lambda result: result["port"]),
    }

    host_status_raw = raw.get("hostStatus", raw.get("host_status"))
    if isinstance(host_status_raw, dict):
        result["hostStatus"] = _transform_host_status(host_status_raw)

    scan_summary_raw = raw.get("scanSummary", raw.get("scan_summary"))
    transformed_summary = _transform_scan_summary(scan_summary_raw)
    if transformed_summary:
        result["scanSummary"] = transformed_summary

    # OS Detection
    os_det_raw = raw.get("osDetection", raw.get("os_detection"))
    if os_det_raw and isinstance(os_det_raw, dict):
        result["osDetection"] = _transform_os_detection(os_det_raw)

    # Traceroute
    traceroute_raw = raw.get("traceroute", [])
    if isinstance(traceroute_raw, list) and traceroute_raw:
        result["traceroute"] = _transform_traceroute(traceroute_raw)

    # Scan Stats
    if scan_stats_raw and isinstance(scan_stats_raw, dict):
        result["scanStats"] = _transform_scan_stats(scan_stats_raw)
        start_time = start_time or result["scanStats"].get("startTime")
        end_time = end_time or result["scanStats"].get("endTime")

    if start_time:
        result["startTime"] = start_time
    if end_time:
        result["endTime"] = end_time

    return result


def _transform_os_detection(raw: dict) -> dict:
    """Transform raw OS detection data."""
    os_matches_raw = raw.get("osMatches", raw.get("os_matches", []))
    os_matches = []
    for m in (os_matches_raw if isinstance(os_matches_raw, list) else []):
        if not isinstance(m, dict):
            continue
        classes_raw = m.get("osClasses", m.get("os_classes", []))
        os_classes = []
        for c in (classes_raw if isinstance(classes_raw, list) else []):
            if not isinstance(c, dict):
                continue
            os_classes.append({
                "vendor": str(c.get("vendor", "")),
                "osFamily": str(c.get("osFamily", c.get("os_family", ""))),
                "osGen": str(c.get("osGen", c.get("os_gen", ""))),
                "type": str(c.get("type", "")),
                "accuracy": _to_int(c.get("accuracy"), 0),
            })
        os_matches.append({
            "name": str(m.get("name", "")),
            "accuracy": _to_int(m.get("accuracy"), 0),
            "osClasses": os_classes,
        })

    return {
        "osMatches": os_matches,
        "deviceType": raw.get("deviceType", raw.get("device_type")),
        "uptimeSeconds": _to_int(raw.get("uptimeSeconds", raw.get("uptime_seconds")), None),
        "uptimeLastBoot": raw.get("uptimeLastBoot", raw.get("uptime_last_boot")),
        "tcpSequenceDifficulty": _to_int(
            raw.get("tcpSequenceDifficulty", raw.get("tcp_sequence_difficulty")), None
        ),
        "tcpSequenceDescription": raw.get(
            "tcpSequenceDescription", raw.get("tcp_sequence_description")
        ),
        "tcpSequenceValues": raw.get("tcpSequenceValues", raw.get("tcp_sequence_values")),
        "ipIdSequence": raw.get("ipIdSequence", raw.get("ip_id_sequence")),
        "tcpTsSequence": raw.get("tcpTsSequence", raw.get("tcp_ts_sequence")),
        "networkDistance": _to_int(
            raw.get("networkDistance", raw.get("network_distance")), None
        ),
        "fingerprint": raw.get("fingerprint"),
    }


def _transform_traceroute(raw: list) -> list[dict]:
    """Transform raw traceroute hops."""
    hops = []
    for hop in raw:
        if not isinstance(hop, dict):
            continue
        rtt = hop.get("rttMs", hop.get("rtt_ms"))
        hops.append({
            "hop": _to_int(hop.get("hop", hop.get("ttl")), 0),
            "rttMs": round(float(rtt), 2) if rtt is not None else None,
            "address": str(hop.get("address", hop.get("ipaddr", ""))),
            "hostname": hop.get("hostname", hop.get("host")) or None,
        })
    return sorted(hops, key=lambda h: h["hop"])


def _transform_scan_stats(raw: dict) -> dict:
    """Transform raw scan statistics."""
    return {
        "startTime": raw.get("startTime", raw.get("start_time")),
        "endTime": raw.get("endTime", raw.get("end_time")),
        "elapsedSeconds": _to_float(
            raw.get("elapsedSeconds", raw.get("elapsed_seconds")), None
        ),
        "hostsUp": _to_int(raw.get("hostsUp", raw.get("hosts_up")), 0),
        "hostsTotal": _to_int(raw.get("hostsTotal", raw.get("hosts_total")), 0),
        "rawPacketsSent": raw.get("rawPacketsSent", raw.get("raw_packets_sent")),
        "rawPacketsReceived": raw.get("rawPacketsReceived", raw.get("raw_packets_received")),
    }


def _transform_host_status(raw: dict) -> dict:
    """Transform host reachability metadata."""
    return {
        "up": bool(raw.get("up")),
        "latency": _to_float(raw.get("latency"), None),
        "method": raw.get("method"),
    }


def _transform_scan_summary(raw) -> dict | None:
    """Transform scan summary metadata."""
    if isinstance(raw, str):
        text = raw.strip()
        return {"notShown": text} if text else None

    if not isinstance(raw, dict):
        return None

    return {
        "notShown": raw.get("notShown", raw.get("not_shown")),
        "closedCount": _to_int(raw.get("closedCount", raw.get("closed_count")), None),
        "filteredCount": _to_int(raw.get("filteredCount", raw.get("filtered_count")), None),
        "totalPortsScanned": _to_int(
            raw.get("totalPortsScanned", raw.get("total_ports_scanned")),
            None,
        ),
    }


def transform_screenshot(raw: dict) -> dict:
    """Transform raw screenshot data to ScreenshotResult.

    Handles multiple return structures from screenshot module:
    - { image: "base64..." } (success, top-level)
    - { data: { image: "base64..." } } (nested success)
    - { screenshot: "base64..." } (legacy field name)
    - { data: { screenshot: "base64..." } } (nested legacy)
    - { image: null } or { data: { screenshot: null } } (failure)
    """
    raw = _ensure_dict(raw)
    image = raw.get("image")
    if image is None and isinstance(raw.get("data"), dict):
        image = raw["data"].get("image")
    if image is None and isinstance(raw.get("data"), dict):
        image = raw["data"].get("screenshot")
    if image is None and isinstance(raw.get("screenshot"), str):
        image = raw["screenshot"]
    image = image or ""
    unavailable_reason = ""
    if not image:
        err = raw.get("error")
        if isinstance(err, str) and err:
            unavailable_reason = err
        elif isinstance(raw.get("data"), dict):
            note = raw["data"].get("note", "")
            if isinstance(note, str) and note:
                unavailable_reason = note
    return {
        "imageUrl": (
            f"data:image/png;base64,{image}" if image else ""
        ),
        "viewport": str(raw.get("viewport", "1280x720")),
        "capturedAt": str(raw.get("capturedAt", "")),
        "unavailableReason": unavailable_reason or None,
    }


def transform_page_source(raw: dict) -> dict:
    """Transform raw page-source data to PageSourceResult."""
    raw = _ensure_dict(raw)
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    html = raw.get("html")
    if html is None:
        html = data.get("html", "")
    html = str(html or "")
    status_code = raw.get("statusCode")
    if status_code is None:
        status_code = data.get("statusCode")
    unavailable_reason = ""
    if not html:
        err = raw.get("error") or data.get("error")
        if isinstance(err, str) and err:
            unavailable_reason = err
    return {
        "html": html,
        "statusCode": status_code,
        "contentType": str(raw.get("contentType") or data.get("contentType", "")),
        "contentLength": raw.get("contentLength", data.get("contentLength", len(html))),
        "truncated": bool(raw.get("truncated", data.get("truncated", False))),
        "unavailableReason": unavailable_reason or None,
    }


def transform_tech_stack(raw: dict) -> list[dict]:
    """Raw Wappalyzer -> TechStackItem[]."""
    raw = _ensure_dict(raw)
    techs = raw.get("technologies", [])
    if not isinstance(techs, list):
        techs = []
    return [
        {
            "name": t.get("name", ""),
            "category": (
                t.get("categories", [{}])[0].get("name", "")
                if t.get("categories")
                else ""
            ),
            "version": t.get("version", None),
            "confidence": t.get("confidence", 0),
        }
        for t in techs
    ]


def transform_hsts(raw: dict) -> dict:
    """Raw HSTS scanner payload -> HstsResult."""
    raw = _ensure_dict(raw)
    header = raw.get("hstsHeader") or ""
    parsed_max_age = _parse_max_age(header)
    max_age = raw.get("maxAge")
    if max_age is None:
        max_age = parsed_max_age

    if "enabled" in raw:
        enabled = bool(raw["enabled"])
    else:
        enabled = max_age > 0

    preload_ready = bool(raw.get("preloadReady", raw.get("compatible", False)))

    lower_header = header.lower() if header else ""
    return {
        "enabled": enabled,
        "preloadReady": preload_ready,
        "maxAge": max_age or 0,
        "includeSubDomains": bool(raw.get("includeSubDomains"))
            or ("includesubdomains" in lower_header),
        "preload": bool(raw.get("preload"))
            or ("preload" in lower_header),
        "rawHeader": header,
    }


def _parse_set_cookie_header(header_value: str) -> dict | None:
    """Parse a single Set-Cookie header string into CookieItem-like dict."""
    if not header_value or not isinstance(header_value, str):
        return None
    parts = [p.strip() for p in header_value.split(";")]
    if not parts:
        return None
    name_value = parts[0].split("=", 1)
    if len(name_value) != 2:
        return None
    name, _ = name_value[0].strip(), name_value[1].strip()
    if not name:
        return None
    attrs: dict[str, str | bool] = {}
    for part in parts[1:]:
        if "=" in part:
            k, v = part.split("=", 1)
            attrs[k.strip().lower()] = v.strip()
        else:
            attrs[part.strip().lower()] = True
    same_site = str(attrs.get("samesite", "lax")).lower()
    if same_site not in ("strict", "lax", "none"):
        same_site = "lax"
    expires_raw = attrs.get("expires")
    expires_str = "Session"
    if expires_raw and isinstance(expires_raw, str):
        from datetime import datetime
        try:
            dt = datetime.strptime(expires_raw, "%a, %d %b %Y %H:%M:%S GMT")
            expires_str = dt.strftime("%Y-%m-%d %H:%M UTC")
        except (ValueError, TypeError):
            expires_str = str(expires_raw)
    return {
        "name": name,
        "domain": str(attrs.get("domain", "")),
        "path": str(attrs.get("path", "/")),
        "secure": attrs.get("secure") is True,
        "httpOnly": attrs.get("httponly") is True,
        "sameSite": same_site,
        "expires": expires_str,
    }


def _normalize_puppeteer_cookie(c: dict) -> dict | None:
    """Convert Puppeteer cookie to CookieItem format."""
    if not isinstance(c, dict) or not c.get("name"):
        return None
    same_site = c.get("sameSite") or ""
    if isinstance(same_site, str):
        same_site = same_site.lower() if same_site else "lax"
    if same_site not in ("strict", "lax", "none"):
        same_site = "lax"
    expires = c.get("expires")
    if isinstance(expires, (int, float)) and expires > 0:
        from datetime import datetime, timezone
        try:
            expires_str = datetime.fromtimestamp(expires, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        except (ValueError, OSError):
            expires_str = str(expires)
    elif expires == -1:
        expires_str = "Session"
    else:
        expires_str = str(expires) if expires else "Session"
    return {
        "name": str(c.get("name", "")),
        "domain": str(c.get("domain", "")),
        "path": str(c.get("path", "/")),
        "secure": bool(c.get("secure", False)),
        "httpOnly": bool(c.get("httpOnly", False)),
        "sameSite": same_site,
        "expires": expires_str,
    }


def transform_cookies(raw: dict) -> dict:
    """
    Raw cookies -> CookiesResult.
    Supports: { clientCookies } (Puppeteer), { headerCookies } (Set-Cookie),
    { cookies }, or list. Prefers clientCookies; falls back to headerCookies.
    """
    raw = raw.get("data", raw) if isinstance(raw.get("data"), dict) else raw
    if raw.get("error") or raw.get("skipped"):
        return {"cookies": [], "issuesCount": 0}

    seen_names: set[str] = set()
    cookie_list: list[dict] = []

    def add_cookie(n: dict | None) -> None:
        if n and isinstance(n, dict) and n.get("name"):
            if n["name"] not in seen_names:
                seen_names.add(n["name"])
                cookie_list.append(n)

    if isinstance(raw, list):
        for c in raw:
            add_cookie(_normalize_puppeteer_cookie(c) if isinstance(c, dict) else None)
    else:
        if raw.get("cookies"):
            for c in raw["cookies"]:
                if isinstance(c, dict) and c.get("name"):
                    add_cookie(_normalize_puppeteer_cookie(c))
                elif isinstance(c, dict):
                    add_cookie(c)
        if raw.get("clientCookies"):
            for c in raw["clientCookies"]:
                add_cookie(_normalize_puppeteer_cookie(c))
        # Fallback: parse Set-Cookie headers (when Puppeteer fails or returns empty)
        header_cookies = raw.get("headerCookies")
        if header_cookies is not None:
            headers_list = (
                header_cookies if isinstance(header_cookies, list) else [header_cookies]
            )
            for hv in headers_list:
                if isinstance(hv, str):
                    parsed = _parse_set_cookie_header(hv)
                    add_cookie(parsed)

    return {"cookies": cookie_list, "issuesCount": 0}


def transform_firewall(raw: dict) -> dict:
    """Raw firewall -> FirewallResult."""
    has_waf = raw.get("hasWaf", False)
    return {
        "detected": has_waf,
        "provider": raw.get("waf", None),
        "confidence": 90 if has_waf else 0,
        "evidence": str(raw.get("evidence", "")),
    }


def transform_threats(raw: dict, block_lists_raw: dict | None = None) -> dict:
    """Raw threats -> ThreatsResult."""
    entries = []
    if isinstance(raw, dict):
        for key, val in raw.items():
            entries.append(
                {
                    "source": key,
                    "listed": bool(val) if isinstance(val, bool) else False,
                    "detail": str(val) if not isinstance(val, bool) else "",
                }
            )
    if isinstance(block_lists_raw, dict):
        for key, val in block_lists_raw.items():
            entries.append(
                {
                    "source": f"blocklist:{key}",
                    "listed": bool(val) if isinstance(val, bool) else False,
                    "detail": str(val) if not isinstance(val, bool) else "",
                }
            )
    listed_count = sum(1 for e in entries if e["listed"])
    return {
        "entries": entries,
        "listedCount": listed_count,
    }


def _empty_tls_result() -> dict:
    """Return a default empty TLS result."""
    return {
        "grade": None,
        "score": None,
        "protocols": [],
        "cipherSuites": [],
        "cipherStats": {"total": 0, "weakCount": 0, "forwardSecrecyPercent": 0.0, "aeadPercent": 0.0},
        "cipherPreference": None,
        "curves": None,
        "preferredProtocol": "",
        "sessionResumption": False,
        "config": None,
    }


def _extract_grade(raw: dict) -> str | None:
    """Extract TLS grade from Mozilla analysis/results."""
    grade = raw.get("grade") or raw.get("lettergrade")
    if grade is not None:
        return str(grade)
    analysis = raw.get("analysis") or []
    for a in analysis:
        if isinstance(a, dict) and a.get("analyzer") == "mozillaGradingWorker":
            res = a.get("result") or {}
            return res.get("grade") or res.get("lettergrade")
    return None


def _extract_score(raw: dict) -> int | None:
    """Extract numeric TLS score."""
    score = raw.get("score")
    if score is not None:
        return int(score)
    analysis = raw.get("analysis") or []
    for a in analysis:
        if isinstance(a, dict) and a.get("analyzer") == "mozillaGradingWorker":
            res = a.get("result") or {}
            s = res.get("score")
            return int(s) if s is not None else None
    return None


def _extract_cipher_preference(raw: dict) -> str | None:
    """Determine if server enforces cipher order (server-side preference)."""
    conn = raw.get("connection", raw.get("connection_info", {}))
    serverside = conn.get("serverside") if isinstance(conn, dict) else None
    if serverside is True:
        return "server"
    if serverside is False:
        return "client"
    return None


def _extract_curves(raw: dict) -> list[str] | None:
    """Extract supported elliptic curves from connection/cipher data."""
    conn = raw.get("connection", raw.get("connection_info", {}))
    if not isinstance(conn, dict):
        return None
    curves = conn.get("curves") or conn.get("supported_curves")
    if isinstance(curves, list):
        return [str(c) for c in curves if c]
    ciphers = conn.get("ciphers") or conn.get("ciphersuite") or []
    seen: set[str] = set()
    for c in ciphers:
        if isinstance(c, dict):
            for cur in c.get("curves", []) or []:
                if cur and cur not in seen:
                    seen.add(str(cur))
    return list(seen) if seen else None


def _extract_preferred_protocol(raw: dict) -> str:
    """Determine the highest supported protocol version."""
    protocols = raw.get("protocols", [])
    conn = raw.get("connection", raw.get("connection_info", {}))
    conn_protocols = conn.get("protocols", []) if isinstance(conn, dict) else []
    candidates = []
    for p in conn_protocols or []:
        if isinstance(p, dict) and p.get("supported"):
            candidates.append(p.get("name", ""))
        elif isinstance(p, str):
            candidates.append(p)
    for p in protocols:
        if isinstance(p, str) and p:
            candidates.append(p)
    order = ["TLSv1.3", "TLSv1.2", "TLSv1.1", "TLSv1.0", "TLSv1", "SSLv3", "SSLv2"]
    for proto in order:
        if proto in candidates:
            return proto
    return candidates[0] if candidates else ""


def _extract_session_resumption(raw: dict) -> bool | dict:
    """Extract session resumption details (id vs ticket)."""
    if raw.get("session_ticket") is not None or raw.get("session_id") is not None:
        return {
            "id": bool(raw.get("session_id", False)),
            "ticket": bool(raw.get("session_ticket", False)),
        }
    return bool(raw.get("forward_secrecy", False))


def _extract_tls_config(raw: dict) -> dict | None:
    """Extract TLS configuration parameters."""
    config = {}
    if "secure_renegotiation" in raw:
        config["secureRenegotiation"] = bool(raw["secure_renegotiation"])
    if "tls_compression" in raw:
        config["tlsCompression"] = bool(raw["tls_compression"])
    if raw.get("scsv") is not None:
        config["scsv"] = bool(raw["scsv"])
    if raw.get("alpn"):
        alpn = raw["alpn"]
        config["alpn"] = [str(a) for a in alpn] if isinstance(alpn, list) else [str(alpn)]
    if raw.get("sni") is not None:
        config["sni"] = bool(raw["sni"])
    return config if config else None


def transform_tls(raw: dict | None) -> dict:
    """
    Transform Mozilla TLS Observatory raw result to TlsResult.
    Extracts protocols, cipher suites with components, statistics,
    grade, and configuration details.
    """
    if not raw or not isinstance(raw, dict):
        return _empty_tls_result()
    if raw.get("success") is False and raw.get("error"):
        return _empty_tls_result()
    raw = raw.get("data", raw) if isinstance(raw.get("data"), dict) else raw

    ciphers = extract_tls_ciphers(raw)
    return {
        "grade": _extract_grade(raw),
        "score": _extract_score(raw),
        "protocols": extract_tls_protocols(raw),
        "cipherSuites": ciphers,
        "cipherStats": _compute_cipher_stats(ciphers),
        "cipherPreference": _extract_cipher_preference(raw),
        "curves": _extract_curves(raw),
        "preferredProtocol": _extract_preferred_protocol(raw),
        "sessionResumption": _extract_session_resumption(raw),
        "config": _extract_tls_config(raw),
    }


def transform_redirects(raw: dict) -> dict:
    """Raw redirects -> RedirectsResult."""
    raw = _ensure_dict(raw)
    raw_hops = raw.get("hops", raw.get("redirects", []))
    if not isinstance(raw_hops, list):
        raw_hops = []

    hops = []
    for hop in raw_hops:
        if isinstance(hop, str):
            hops.append({"url": hop, "statusCode": 0, "responseTimeMs": 0})
            continue
        hop_dict = _ensure_dict(hop)
        url = str(hop_dict.get("url", hop_dict.get("location", "")))
        status_code = _to_int(hop_dict.get("statusCode", hop_dict.get("status", 0)))
        response_time = _to_float(hop_dict.get("responseTimeMs", hop_dict.get("duration", 0)))
        hops.append({"url": url, "statusCode": status_code, "responseTimeMs": response_time})

    final_url = str(raw.get("finalUrl", "")) if raw.get("finalUrl") else (hops[-1]["url"] if hops else "")
    return {
        "hops": hops,
        "totalRedirects": len(hops) - 1 if len(hops) > 1 else 0,
        "finalUrl": final_url,
    }


def transform_email_config(raw: dict) -> dict:
    """Raw mail-config -> EmailConfigResult."""
    return {
        "mxRecords": raw.get("mxRecords", []),
        "spf": raw.get("spf", {"raw": "", "status": "fail"}),
        "dkim": raw.get("dkim", {"found": False}),
        "dmarc": raw.get("dmarc", {"raw": "", "policy": "", "status": "fail"}),
    }


def transform_robots_txt(raw: dict) -> dict:
    """Raw robots-txt -> RobotsTxtResult."""
    return {
        "exists": bool(raw.get("content", "")),
        "rawContent": raw.get("content", ""),
        "allowedPaths": raw.get("allowed", []),
        "disallowedPaths": raw.get("disallowed", []),
        "sitemapUrls": raw.get("sitemaps", []),
    }


def transform_sitemap(raw: dict) -> dict:
    """Raw sitemap -> SitemapResult."""
    urls = raw.get("urls", raw.get("entries", []))
    return {
        "exists": len(urls) > 0,
        "url": raw.get("url", ""),
        "urlCount": len(urls),
        "sampleUrls": urls[:10] if isinstance(urls, list) else [],
    }


def transform_dnssec(raw: dict) -> dict:
    """Raw DNSSEC -> DnssecResult."""
    return {
        "enabled": raw.get("enabled", raw.get("isFound", False)),
        "valid": raw.get("valid", False),
        "dsRecords": raw.get("ds", raw.get("dsRecords", [])),
        "dnskeyRecords": raw.get("dnskey", raw.get("dnskeyRecords", [])),
        "algorithm": raw.get("algorithm", ""),
        "keyTag": raw.get("keyTag", 0),
    }


def transform_security_txt(raw: dict) -> dict:
    """Raw security-txt -> SecurityTxtResult."""
    fields = raw.get("fields", {})
    return {
        "exists": raw.get("isPresent", False),
        "url": raw.get("foundIn", ""),
        "rawContent": raw.get("content", ""),
        "contact": fields.get("Contact", None),
        "expires": fields.get("Expires", None),
        "encryption": fields.get("Encryption", None),
        "acknowledgments": fields.get("Acknowledgments", None),
        "preferredLanguages": fields.get("Preferred-Languages", None),
        "policy": fields.get("Policy", None),
    }


def transform_traceroute(raw: dict) -> dict:
    """Raw trace-route -> TracerouteResult."""
    raw = _ensure_dict(raw)
    hops = _normalize_traceroute_hops(raw.get("hops", raw.get("result", [])))
    return {
        "hops": hops,
        "totalHops": len(hops),
        "destinationReached": bool(raw.get("destinationReached", len(hops) > 0)),
    }


def transform_linked_pages(raw: dict) -> dict:
    """Raw linked-pages -> LinkedPagesResult."""
    internal = raw.get("internal", [])
    external = raw.get("external", [])
    return {
        "internal": internal,
        "external": external,
        "totalInternal": len(internal),
        "totalExternal": len(external),
    }


def transform_social_tags(raw: dict) -> dict:
    """Raw social-tags -> SocialTagsResult."""
    return {
        "ogTitle": raw.get("title", raw.get("ogTitle", None)),
        "ogDescription": raw.get("description", raw.get("ogDescription", None)),
        "ogImage": raw.get("image", raw.get("ogImage", None)),
        "ogUrl": raw.get("ogUrl", None),
        "ogType": raw.get("ogType", None),
        "ogSiteName": raw.get("ogSiteName", None),
        "twitterCard": raw.get("twitterCard", None),
        "twitterSite": raw.get("twitterSite", None),
        "twitterTitle": raw.get("twitterTitle", None),
        "twitterDescription": raw.get("twitterDescription", None),
        "twitterImage": raw.get("twitterImage", None),
    }


def transform_archives(raw: dict) -> dict:
    """Raw archives -> ArchivesResult."""
    snapshots = raw.get("snapshots", raw.get("results", []))
    return {
        "totalSnapshots": len(snapshots),
        "oldestSnapshot": snapshots[-1].get("timestamp", "") if snapshots else "",
        "newestSnapshot": snapshots[0].get("timestamp", "") if snapshots else "",
        "snapshots": snapshots[:10],
    }


def transform_ranking_and_carbon(
    rank_raw: dict | None,
    carbon_raw: dict | None,
    legacy_rank_raw: dict | None,
) -> dict:
    """Merge rank + carbon + legacy-rank -> RankingAndCarbonResult."""
    if rank_raw:
        ranking = {
            "globalRank": rank_raw.get("rank", None),
            "countryRank": None,
            "country": None,
            "categoryRank": None,
            "category": None,
        }
    elif legacy_rank_raw:
        ranking = {
            "globalRank": legacy_rank_raw.get("rank", None),
            "countryRank": None,
            "country": None,
            "categoryRank": None,
            "category": None,
        }
    else:
        ranking = {
            "globalRank": None,
            "countryRank": None,
            "country": None,
            "categoryRank": None,
            "category": None,
        }

    if carbon_raw:
        carbon = {
            "isGreen": carbon_raw.get("isGreen", False),
            "co2PerPageview": carbon_raw.get("co2", {}).get("grid", {}).get("grams", 0),
            "cleanerThanPercent": carbon_raw.get("cleanerThan", 0),
            "energyPerVisit": carbon_raw.get("statistics", {}).get("energy", 0),
        }
    else:
        carbon = {
            "isGreen": False,
            "co2PerPageview": 0,
            "cleanerThanPercent": 0,
            "energyPerVisit": 0,
        }

    return {"ranking": ranking, "carbon": carbon}


def transform_features(
    raw: dict,
    all_raw: dict | None = None,
) -> dict:
    """
    Transform features module result.
    Falls back to tech-stack data when BuiltWith is unavailable.
    """
    raw = _coerce_json_object(raw)
    data = raw.get("data", raw)
    results = data.get("Results", [])
    features_list = _extract_builtwith_features(raw if results else data)
    if not features_list and raw.get("features"):
        features_list = raw.get("features", [])
    if not isinstance(features_list, list):
        features_list = []

    if not features_list and all_raw:
        tech_raw = all_raw.get("tech-stack", {})
        tech_data = tech_raw.get("data", tech_raw) if isinstance(tech_raw, dict) else {}
        technologies = tech_data.get("technologies", []) if isinstance(tech_data, dict) else []
        if technologies:
            features_list = _convert_tech_stack_to_features(technologies)

    note = data.get("note", "") if isinstance(data, dict) else ""
    source = "builtwith" if results else ("wappalyzer" if features_list else "none")

    return {
        "features": features_list,
        "totalDetected": len(features_list),
        "source": source,
        "note": note,
    }


def _convert_tech_stack_to_features(
    technologies: list[dict],
) -> list[dict]:
    """Convert Wappalyzer tech-stack results into features format."""
    features = []
    for tech in technologies:
        if not isinstance(tech, dict):
            continue
        name = tech.get("name", "")
        if not name:
            continue

        categories = tech.get("categories", [])
        category = (
            categories[0].get("name", "Other")
            if categories and isinstance(categories[0], dict)
            else (
                categories[0]
                if categories and isinstance(categories[0], str)
                else "Other"
            )
        )

        features.append({
            "name": name,
            "detected": True,
            "category": category,
            "confidence": tech.get("confidence", 100),
            "version": tech.get("version"),
            "icon": tech.get("icon"),
            "website": tech.get("website"),
        })
    return features


def _ensure_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _to_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_json_object(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        import json

        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _extract_builtwith_features(raw: dict) -> list[dict]:
    results = raw.get("Results", raw.get("results", []))
    if not isinstance(results, list):
        return []

    features: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for result in results:
        paths = _ensure_dict(result).get("Result", {}).get("Paths", [])
        if not isinstance(paths, list):
            continue
        for path_item in paths:
            technologies = _ensure_dict(path_item).get("Technologies", [])
            if not isinstance(technologies, list):
                continue
            for tech in technologies:
                tech_dict = _ensure_dict(tech)
                name = str(tech_dict.get("Name", "")).strip()
                if not name:
                    continue
                category = str(tech_dict.get("Tag", "Uncategorized"))
                key = (name, category)
                if key in seen:
                    continue
                seen.add(key)
                features.append({"name": name, "detected": True, "category": category})

    return features


def _normalize_traceroute_hops(raw_hops) -> list[dict]:
    normalized = []

    if isinstance(raw_hops, list):
        for index, hop in enumerate(raw_hops, start=1):
            hop_dict = _ensure_dict(hop)
            if hop_dict:
                normalized.append(
                    {
                        "hop": _to_int(hop_dict.get("hop", index), index),
                        "ip": str(hop_dict.get("ip", "")),
                        "hostname": hop_dict.get("hostname"),
                        "rttMs": _normalize_rtt_value(hop_dict.get("rttMs", hop_dict.get("rtt", 0))),
                    }
                )
            elif isinstance(hop, str):
                normalized.append({"hop": index, "ip": hop, "hostname": None, "rttMs": 0.0})

    if isinstance(raw_hops, dict):
        for hop_key, hop_val in raw_hops.items():
            hop_number = _to_int(hop_key, len(normalized) + 1)
            if isinstance(hop_val, list) and hop_val:
                ip = str(hop_val[0])
                normalized.append({"hop": hop_number, "ip": ip, "hostname": None, "rttMs": 0.0})
            elif isinstance(hop_val, str):
                normalized.append({"hop": hop_number, "ip": hop_val, "hostname": None, "rttMs": 0.0})
            elif isinstance(hop_val, dict):
                hop_dict = _ensure_dict(hop_val)
                normalized.append(
                    {
                        "hop": hop_number,
                        "ip": str(hop_dict.get("ip", "")),
                        "hostname": hop_dict.get("hostname"),
                        "rttMs": _normalize_rtt_value(hop_dict.get("rttMs", hop_dict.get("rtt", 0))),
                    }
                )

    return sorted(normalized, key=lambda h: h["hop"])


def _normalize_rtt_value(value) -> float:
    if isinstance(value, list):
        valid = [_to_float(v, 0.0) for v in value if isinstance(v, (int, float, str))]
        valid = [v for v in valid if v > 0]
        if not valid:
            return 0.0
        return round(sum(valid) / len(valid), 1)
    return round(_to_float(value, 0.0), 1)


def _compute_ssl_grade(raw: dict) -> str:
    bits = raw.get("bits", 0)
    if bits >= 256:
        return "A+"
    if bits >= 128:
        return "A"
    if bits >= 64:
        return "B"
    return "C"


def _format_issuer(issuer: dict) -> str:
    org = issuer.get("O", "")
    cn = issuer.get("CN", "")
    return f"{cn} / {org}" if org else cn


def _days_until(date_str: str) -> int:
    from datetime import datetime, timezone

    try:
        for fmt in ("%b %d %H:%M:%S %Y GMT", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
                delta = dt - datetime.now(timezone.utc)
                return max(delta.days, 0)
            except ValueError:
                continue
    except (TypeError, ValueError):
        pass
    return 0


def _extract_sans(raw: dict) -> list[str]:
    san = raw.get("subjectaltname", "")
    if not san:
        return []
    return [s.strip().replace("DNS:", "") for s in san.split(",")]


def _extract_chain(raw: dict) -> list[str]:
    chain = []
    subject = raw.get("subject", {})
    if subject.get("CN"):
        chain.append(subject["CN"])
    issuer = raw.get("issuer", {})
    if issuer.get("CN"):
        chain.append(issuer["CN"])
    return chain


BANNER_SERVICE_HINTS = (
    ("openssh", "ssh"),
    ("ssh-", "ssh"),
    ("smtp", "smtp"),
    ("esmtp", "smtp"),
    ("ftp", "ftp"),
    ("imap", "imap"),
    ("pop3", "pop3"),
    ("mysql", "mysql"),
    ("postgres", "postgresql"),
    ("rdp", "rdp"),
)

HTTP_BANNER_TOKENS = ("http/", "server:", "apache", "nginx", "iis")
HTTPS_PORTS = frozenset({443, 8443})

WELL_KNOWN_PORTS = {
    20: "ftp-data",
    21: "ftp",
    22: "ssh",
    23: "telnet",
    25: "smtp",
    53: "dns",
    67: "dhcp",
    68: "dhcp",
    69: "tftp",
    80: "http",
    110: "pop3",
    119: "nntp",
    123: "ntp",
    143: "imap",
    161: "snmp",
    162: "snmp-trap",
    179: "bgp",
    194: "irc",
    389: "ldap",
    443: "https",
    587: "smtp-tls",
    993: "imaps",
    995: "pop3s",
    3000: "dev-server",
    3306: "mysql",
    3389: "rdp",
    445: "microsoft-ds",
    5060: "sip",
    5432: "postgresql",
    5900: "vnc",
    6379: "redis",
    8000: "http-alt",
    8080: "http-proxy",
    8443: "https-alt",
    8888: "http-alt",
    9200: "elasticsearch",
    27017: "mongodb",
}


def _append_port_results(results: list[dict], entries: list, state: str) -> None:
    for entry in entries:
        port = _port_number(entry)
        if port <= 0:
            continue
        banner = _port_banner(entry) if state == "open" else ""
        version = _port_version(entry) if state == "open" else None
        product = _port_field(entry, "product") if state == "open" else None
        extra_info = _port_field(entry, "extraInfo", "extra_info") if state == "open" else None
        scripts = _port_scripts(entry) if state == "open" else None
        reason = _port_field(entry, "reason")
        results.append(
            {
                "port": port,
                "protocol": _port_field(entry, "protocol") or "tcp",
                "service": _port_service_name(port, banner),
                "state": state,
                "reason": reason,
                "banner": banner,
                "version": version,
                "product": product,
                "extraInfo": extra_info,
                "scripts": scripts,
            }
        )


def _port_number(entry) -> int:
    if isinstance(entry, dict):
        return _to_int(entry.get("port"), 0)
    return _to_int(entry, 0)


def _port_field(entry, *keys: str) -> str | None:
    if not isinstance(entry, dict):
        return None
    for key in keys:
        val = entry.get(key)
        if val is not None:
            s = str(val).strip()
            if s:
                return s[:512]
    return None


def _port_banner(entry) -> str:
    if not isinstance(entry, dict):
        return ""
    return str(entry.get("banner", "") or "").strip()[:512]


def _port_version(entry) -> str | None:
    if not isinstance(entry, dict):
        return None
    version = str(entry.get("version", "") or "").strip()
    return version[:512] if version else None


def _port_scripts(entry) -> dict[str, str] | None:
    if not isinstance(entry, dict):
        return None
    scripts = entry.get("scripts")
    if not isinstance(scripts, dict):
        return None
    normalized = {
        str(key): str(value)
        for key, value in scripts.items()
        if str(value).strip()
    }
    return normalized or None


def _service_from_banner(port: int, banner: str) -> str | None:
    if not banner:
        return None

    lowered = banner.lower()
    for token, service in BANNER_SERVICE_HINTS:
        if token in lowered:
            return service

    if any(token in lowered for token in HTTP_BANNER_TOKENS):
        return "https" if port in HTTPS_PORTS else "http"

    return None


def _port_service_name(port: int, banner: str = "") -> str:
    return _service_from_banner(port, banner) or WELL_KNOWN_PORTS.get(port, "unknown")


def _to_string_list(items) -> list[str]:
    if not items:
        return []
    if isinstance(items, list):
        return [str(i) if not isinstance(i, str) else i for i in items]
    return [str(items)]


def _parse_max_age(header: str) -> int:
    if not header:
        return 0
    import re

    match = re.search(r"max-age=(\d+)", header, re.IGNORECASE)
    return int(match.group(1)) if match else 0


SECURITY_HEADERS_TO_CHECK = [
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "strict-transport-security",
    "referrer-policy",
    "permissions-policy",
]


def _evaluate_security_headers(headers: dict) -> list[dict]:
    """Check presence of security-critical headers."""
    lower_headers = {k.lower(): v for k, v in headers.items()}
    checks = []
    for name in SECURITY_HEADERS_TO_CHECK:
        value = lower_headers.get(name)
        if value:
            checks.append({"name": name, "status": "pass", "value": value})
        else:
            checks.append(
                {
                    "name": name,
                    "status": "missing",
                    "recommendation": f"Add {name} header.",
                }
            )
    return checks


def _compute_headers_grade(checks: list[dict]) -> str:
    pass_count = sum(1 for c in checks if c["status"] == "pass")
    total = len(checks)
    ratio = pass_count / total if total > 0 else 0
    if ratio >= 0.9:
        return "A"
    if ratio >= 0.7:
        return "B"
    if ratio >= 0.5:
        return "C"
    if ratio >= 0.3:
        return "D"
    return "F"


TRANSFORMERS = {
    "ssl": lambda results: transform_ssl_check(results),
    "headers": lambda results: transform_headers(
        results.get("headers", {}),
        results.get("http-security"),
    ),
    "status": lambda results: transform_status(results.get("status", {})),
    "dns": lambda results: transform_dns(
        results.get("dns", {}),
        results.get("txt-records"),
        results.get("dns-server"),
    ),
    "get-ip": lambda results: transform_ip(results.get("get-ip", {})),
    "whois": lambda results: transform_whois(results.get("whois", {})),
    "quality": lambda results: transform_quality(results.get("quality", {})),
    "associated-hosts": lambda results: transform_associated_hosts(
        results.get("associated-hosts", {})
    ),
    "ports": lambda results: transform_ports(results.get("ports", {})),
    "screenshot": lambda results: transform_screenshot(results.get("screenshot", {})),
    "page-source": lambda results: transform_page_source(results.get("page-source", {})),
    "tech-stack": lambda results: transform_tech_stack(results.get("tech-stack", {})),
    "hsts": lambda results: transform_hsts(results.get("hsts", {})),
    "cookies": lambda results: transform_cookies(results.get("cookies", {})),
    "firewall": lambda results: transform_firewall(results.get("firewall", {})),
    "threats": lambda results: transform_threats(
        results.get("threats", {}),
        results.get("block-lists"),
    ),
    "tls": lambda results: transform_tls(results.get("tls", {})),
    "redirects": lambda results: transform_redirects(results.get("redirects", {})),
    "mail-config": lambda results: transform_email_config(results.get("mail-config", {})),
    "robots-txt": lambda results: transform_robots_txt(results.get("robots-txt", {})),
    "sitemap": lambda results: transform_sitemap(results.get("sitemap", {})),
    "dnssec": lambda results: transform_dnssec(results.get("dnssec", {})),
    "security-txt": lambda results: transform_security_txt(results.get("security-txt", {})),
    "trace-route": lambda results: transform_traceroute(results.get("trace-route", {})),
    "linked-pages": lambda results: transform_linked_pages(results.get("linked-pages", {})),
    "social-tags": lambda results: transform_social_tags(results.get("social-tags", {})),
    "archives": lambda results: transform_archives(results.get("archives", {})),
    "features": lambda results: transform_features(
        results.get("features", {}),
        all_raw=results,
    ),
    "ranking": lambda results: transform_ranking_and_carbon(
        results.get("rank"),
        results.get("carbon"),
        results.get("legacy-rank"),
    ),
}


TRANSFORMER_DEFAULTS = {
    "ssl": lambda: transform_ssl_check({}),
    "headers": lambda: transform_headers({}),
    "status": lambda: transform_status({}),
    "dns": lambda: transform_dns({}),
    "get-ip": lambda: transform_ip({}),
    "whois": lambda: transform_whois({}),
    "quality": lambda: transform_quality({}),
    "associated-hosts": lambda: transform_associated_hosts({}),
    "ports": lambda: transform_ports({}),
    "screenshot": lambda: transform_screenshot({}),
    "page-source": lambda: transform_page_source({}),
    "tech-stack": lambda: transform_tech_stack({}),
    "hsts": lambda: transform_hsts({}),
    "cookies": lambda: transform_cookies({}),
    "firewall": lambda: transform_firewall({}),
    "threats": lambda: transform_threats({}),
    "tls": lambda: transform_tls({}),
    "redirects": lambda: transform_redirects({}),
    "mail-config": lambda: transform_email_config({}),
    "robots-txt": lambda: transform_robots_txt({}),
    "sitemap": lambda: transform_sitemap({}),
    "dnssec": lambda: transform_dnssec({}),
    "security-txt": lambda: transform_security_txt({}),
    "trace-route": lambda: transform_traceroute({}),
    "linked-pages": lambda: transform_linked_pages({}),
    "social-tags": lambda: transform_social_tags({}),
    "archives": lambda: transform_archives({}),
    "features": lambda: transform_features({}, all_raw=None),
    "ranking": lambda: transform_ranking_and_carbon(None, None, None),
}


def build_scan_detail(scan_id: str, url: str, all_raw_results: dict) -> dict:
    """Aggregate all transformed results into a ScanDetail-like dict."""
    transformed = {}
    for key, transformer_fn in TRANSFORMERS.items():
        try:
            transformed[key] = transformer_fn(all_raw_results)
        except (KeyError, TypeError, AttributeError):
            fallback_factory = TRANSFORMER_DEFAULTS.get(key)
            transformed[key] = fallback_factory() if fallback_factory else None

    return {
        "id": scan_id,
        "url": url,
        "ssl": transformed.get("ssl"),
        "headers": transformed.get("headers"),
        "ip": transformed.get("get-ip"),
        "whois": transformed.get("whois"),
        "dns": transformed.get("dns"),
        "ports": transformed.get("ports"),
        "statusCheck": transformed.get("status"),
        "screenshot": transformed.get("screenshot"),
        "pageSource": transformed.get("page-source"),
        "techStack": transformed.get("tech-stack"),
        "tls": transformed.get("tls"),
        "hsts": transformed.get("hsts"),
        "cookies": transformed.get("cookies"),
        "firewall": transformed.get("firewall"),
        "threats": transformed.get("threats"),
        "redirects": transformed.get("redirects"),
        "emailConfig": transformed.get("mail-config"),
        "features": transformed.get("features"),
        "robotsTxt": transformed.get("robots-txt"),
        "sitemap": transformed.get("sitemap"),
        "dnssec": transformed.get("dnssec"),
        "securityTxt": transformed.get("security-txt"),
        "traceroute": transformed.get("trace-route"),
        "linkedPages": transformed.get("linked-pages"),
        "socialTags": transformed.get("social-tags"),
        "archives": transformed.get("archives"),
        "rankingAndCarbon": transformed.get("ranking"),
        "quality": transformed.get("quality"),
        "associatedHosts": transformed.get("associated-hosts"),
    }
