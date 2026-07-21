import hashlib
import hmac
import logging
import os
import re
import shlex
import shutil
import socket
import subprocess
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

APP_TITLE = "OrbiCheck nmap scanner"
logger = logging.getLogger(__name__)
SIGNATURE_VERSION = "v1"
INTERNAL_TIMESTAMP_HEADER = "x-orbi-timestamp"
INTERNAL_SIGNATURE_HEADER = "x-orbi-signature"
DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS = 60
MIN_INTERNAL_SECRET_LENGTH = 32
KNOWN_SECRET_PLACEHOLDERS = ("change-me", "replace-with", "dev-only")
HTTP_UNAUTHORIZED = 401
HTTP_SERVICE_UNAVAILABLE = 503
PORT_SCAN_TIMEOUTS = {
    "quick": 60,
    "standard": 180,
    "deep": 600,
}
PROFILE_ARGS = {
    "quick": ["-sT", "-T4", "--top-ports", "100"],
    "standard": ["-sT", "-sV", "-T3", "--top-ports", "1000"],
    "deep": ["-sT", "-sV", "-sC", "-v", "-T3", "-p-"],
}
PRIVATE_HOST_PATTERNS = (
    re.compile(r"^localhost$", re.IGNORECASE),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^0\.0\.0\.0$"),
    re.compile(r"^::1$"),
    re.compile(r"\.local$", re.IGNORECASE),
    re.compile(r"\.internal$", re.IGNORECASE),
)

app = FastAPI(title=APP_TITLE)


@dataclass(frozen=True)
class ResolvedTarget:
    hostname: str
    address: str


def _is_internal_auth_required() -> bool:
    return (
        os.getenv("INTERNAL_SERVICE_AUTH_REQUIRED", "").lower() == "true"
        or os.getenv("APP_ENV", "").lower() in {"production", "prod"}
        or bool(os.getenv("INTERNAL_SERVICE_SECRET", "").strip())
    )


@app.on_event("startup")
def validate_runtime_configuration() -> None:
    if os.getenv("APP_ENV", "").lower() not in {"production", "prod"}:
        return
    secret = os.getenv("INTERNAL_SERVICE_SECRET", "").strip()
    if len(secret) < MIN_INTERNAL_SECRET_LENGTH:
        raise RuntimeError(
            f"INTERNAL_SERVICE_SECRET must be at least "
            f"{MIN_INTERNAL_SECRET_LENGTH} characters"
        )
    lowered = secret.lower()
    if any(fragment in lowered for fragment in KNOWN_SECRET_PLACEHOLDERS):
        raise RuntimeError("INTERNAL_SERVICE_SECRET contains a known placeholder")


def _signature_payload(
    timestamp: str,
    method: str,
    target: str,
    body: bytes,
) -> bytes:
    body_digest = hashlib.sha256(body).hexdigest()
    return (
        f"{SIGNATURE_VERSION}\n{timestamp}\n{method.upper()}\n"
        f"{target}\n{body_digest}"
    ).encode()


@app.middleware("http")
async def verify_internal_auth(request: Request, call_next):
    if request.url.path in {"/health", "/ready"} or not _is_internal_auth_required():
        return await call_next(request)

    secret = os.getenv("INTERNAL_SERVICE_SECRET", "").strip()
    if not secret:
        return JSONResponse(
            status_code=HTTP_UNAUTHORIZED,
            content={"error": "Internal authentication is not configured"},
        )
    timestamp_text = request.headers.get(INTERNAL_TIMESTAMP_HEADER, "")
    signature = request.headers.get(INTERNAL_SIGNATURE_HEADER, "")
    try:
        timestamp = int(timestamp_text)
    except ValueError:
        timestamp = 0
    max_skew = int(
        os.getenv(
            "INTERNAL_SERVICE_AUTH_MAX_SKEW_SECONDS",
            str(DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS),
        )
    )
    if abs(int(time.time()) - timestamp) > max_skew:
        return JSONResponse(
            status_code=HTTP_UNAUTHORIZED,
            content={"error": "Internal authentication timestamp is invalid"},
        )

    body = await request.body()
    target = request.url.path
    if request.url.query:
        target = f"{target}?{request.url.query}"
    expected_digest = hmac.new(
        secret.encode(),
        _signature_payload(timestamp_text, request.method, target, body),
        hashlib.sha256,
    ).hexdigest()
    expected = f"{SIGNATURE_VERSION}={expected_digest}"
    if not hmac.compare_digest(signature, expected):
        return JSONResponse(
            status_code=HTTP_UNAUTHORIZED,
            content={"error": "Internal authentication signature is invalid"},
        )
    return await call_next(request)


def resolve_public_target(hostname: str) -> ResolvedTarget:
    try:
        literal = ip_address(hostname)
    except ValueError:
        try:
            records = socket.getaddrinfo(
                hostname,
                None,
                socket.AF_UNSPEC,
                socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise ValueError(f"Cannot resolve target hostname: {hostname}") from exc
        addresses = list(
            dict.fromkeys(
                record[4][0]
                for record in records
                if record[4]
            )
        )
    else:
        addresses = [str(literal)]

    if not addresses:
        raise ValueError(f"Cannot resolve target hostname: {hostname}")
    for address in addresses:
        parsed_address = ip_address(address)
        if not parsed_address.is_global or parsed_address.is_multicast:
            raise ValueError(f"Target resolves to blocked network: {address}")
    return ResolvedTarget(hostname=hostname, address=addresses[0])


class PortScanRequest(BaseModel):
    target: str
    profile: Literal["quick", "standard", "deep"] = "quick"
    authorization_acknowledged: bool = False

    @field_validator("target")
    @classmethod
    def validate_target(cls, value: str) -> str:
        raw = value.strip()
        if not raw:
            raise ValueError("Target is required")

        parsed = urlparse(raw if "://" in raw else f"https://{raw}")
        hostname = parsed.hostname or raw
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("Target credentials are not allowed")

        if any(pattern.search(hostname) for pattern in PRIVATE_HOST_PATTERNS):
            raise ValueError("Cannot scan private/internal addresses")

        if "." not in hostname and ":" not in hostname:
            raise ValueError("Target must be a valid hostname")

        return hostname

    @model_validator(mode="after")
    def validate_authorization_acknowledged(self) -> "PortScanRequest":
        if self.authorization_acknowledged is not True:
            raise ValueError("Explicit scan authorization is required")
        return self


class PortEntry(BaseModel):
    port: int
    protocol: str
    state: str
    service: str
    version: str | None = None
    banner: str = ""
    product: str | None = None
    extra_info: str | None = None
    scripts: dict[str, str] = Field(default_factory=dict)


class OsClass(BaseModel):
    vendor: str = ""
    os_family: str = ""
    os_gen: str = ""
    type: str = ""
    accuracy: int = 0


class OsMatch(BaseModel):
    name: str
    accuracy: int = 0
    os_classes: list[OsClass] = Field(default_factory=list)


class OsDetection(BaseModel):
    os_matches: list[OsMatch] = Field(default_factory=list)
    device_type: str | None = None
    uptime_seconds: int | None = None
    uptime_last_boot: str | None = None
    tcp_sequence_difficulty: int | None = None
    tcp_sequence_description: str | None = None
    tcp_sequence_values: str | None = None
    ip_id_sequence: str | None = None
    tcp_ts_sequence: str | None = None
    network_distance: int | None = None
    fingerprint: str | None = None


class TracerouteHop(BaseModel):
    hop: int
    rtt_ms: float | None = None
    address: str = ""
    hostname: str | None = None


class ScanStats(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    elapsed_seconds: float | None = None
    hosts_up: int = 0
    hosts_total: int = 0
    raw_packets_sent: str | None = None
    raw_packets_received: str | None = None


class PortScanResponse(BaseModel):
    engine: str = "nmap"
    profile: Literal["quick", "standard", "deep"]
    method: str
    duration_ms: int
    ports: list[PortEntry]
    open_ports: list[dict]
    closed_ports: list[int]
    filtered_ports: list[int]
    detected_technologies: list[str]
    os_fingerprint: str | None = None
    os_detection: OsDetection | None = None
    traceroute: list[TracerouteHop] = Field(default_factory=list)
    scan_stats: ScanStats | None = None
    original_target: str
    resolved_ip: str
    authorization_acknowledged: bool


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def readiness() -> dict[str, str]:
    if shutil.which("nmap") is None:
        raise HTTPException(
            status_code=HTTP_SERVICE_UNAVAILABLE,
            detail="nmap executable is unavailable",
        )
    return {"status": "ready"}


@app.post("/scan/ports", response_model=PortScanResponse)
def scan_ports(request: PortScanRequest) -> PortScanResponse:
    try:
        resolved = resolve_public_target(request.target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    command = build_nmap_command(resolved.address, request.profile)
    logger.info(
        "authorized_nmap_scan target=%s resolved_ip=%s profile=%s",
        resolved.hostname,
        resolved.address,
        request.profile,
    )
    started_at = time.perf_counter()

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=PORT_SCAN_TIMEOUTS[request.profile],
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="nmap scan timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"failed to execute nmap: {exc}") from exc

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip() or "nmap returned non-zero exit status"
        raise HTTPException(status_code=500, detail=stderr)

    try:
        parsed = parse_nmap_xml(completed.stdout)
    except ET.ParseError as exc:
        raise HTTPException(status_code=500, detail="failed to parse nmap XML output") from exc

    return PortScanResponse(
        profile=request.profile,
        method=" ".join(shlex.quote(arg) for arg in command[1:-2]),
        duration_ms=duration_ms,
        ports=parsed["ports"],
        open_ports=parsed["open_ports"],
        closed_ports=parsed["closed_ports"],
        filtered_ports=parsed["filtered_ports"],
        detected_technologies=parsed["detected_technologies"],
        os_fingerprint=parsed["os_fingerprint"],
        os_detection=parsed.get("os_detection"),
        traceroute=parsed.get("traceroute", []),
        scan_stats=parsed.get("scan_stats"),
        original_target=resolved.hostname,
        resolved_ip=resolved.address,
        authorization_acknowledged=request.authorization_acknowledged,
    )


def build_nmap_command(target: str, profile: str) -> list[str]:
    if profile not in PROFILE_ARGS:
        raise HTTPException(status_code=400, detail="unknown nmap profile")
    return ["nmap", *PROFILE_ARGS[profile], "-oX", "-", target]


def _safe_int(value: str | None, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def _safe_float(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def parse_nmap_xml(xml_output: str) -> dict:
    root = ET.fromstring(xml_output)
    host = root.find("host")

    empty_result = {
        "ports": [],
        "open_ports": [],
        "closed_ports": [],
        "filtered_ports": [],
        "detected_technologies": [],
        "os_fingerprint": None,
        "os_detection": None,
        "traceroute": [],
        "scan_stats": None,
    }

    if host is None:
        return empty_result

    ports: list[PortEntry] = []
    open_ports: list[dict] = []
    closed_ports: list[int] = []
    filtered_ports: list[int] = []
    detected_technologies: set[str] = set()

    for port_el in host.findall("./ports/port"):
        port_id = int(port_el.attrib.get("portid", "0"))
        protocol = port_el.attrib.get("protocol", "tcp")
        state_el = port_el.find("state")
        service_el = port_el.find("service")
        state = state_el.attrib.get("state", "unknown") if state_el is not None else "unknown"
        service_name = service_el.attrib.get("name", "unknown") if service_el is not None else "unknown"
        product = service_el.attrib.get("product", "").strip() if service_el is not None else ""
        version = service_el.attrib.get("version", "").strip() if service_el is not None else ""
        extra = service_el.attrib.get("extrainfo", "").strip() if service_el is not None else ""
        scripts = {
            script.attrib.get("id", "script"): script.attrib.get("output", "").strip()
            for script in port_el.findall("script")
            if script.attrib.get("output", "").strip()
        }
        version_parts = [part for part in (product, version, extra) if part]
        version_text = " ".join(version_parts).strip() or None
        banner = version_text or next(iter(scripts.values()), "")

        entry = PortEntry(
            port=port_id,
            protocol=protocol,
            state=state,
            service=service_name,
            version=version_text,
            banner=banner[:512],
            product=product or None,
            extra_info=extra or None,
            scripts=scripts,
        )
        ports.append(entry)

        if state == "open":
            open_ports.append(
                {
                    "port": port_id,
                    "protocol": protocol,
                    "service": service_name,
                    "version": version_text,
                    "banner": banner[:512],
                    "product": product or None,
                    "extraInfo": extra or None,
                    "scripts": scripts,
                }
            )
            if product:
                detected_technologies.add(product)
            continue

        if state == "filtered":
            filtered_ports.append(port_id)
            continue

        if state == "closed":
            closed_ports.append(port_id)

    # --- OS Detection ---
    os_detection = _parse_os_detection(host)
    os_fingerprint = None
    if os_detection and os_detection.os_matches:
        os_fingerprint = os_detection.os_matches[0].name

    # --- Traceroute ---
    traceroute = _parse_traceroute(host)

    # --- Scan Stats ---
    scan_stats = _parse_scan_stats(root)

    return {
        "ports": ports,
        "open_ports": sorted(open_ports, key=lambda item: item["port"]),
        "closed_ports": sorted(closed_ports),
        "filtered_ports": sorted(filtered_ports),
        "detected_technologies": sorted(detected_technologies),
        "os_fingerprint": os_fingerprint,
        "os_detection": os_detection,
        "traceroute": traceroute,
        "scan_stats": scan_stats,
    }


def _parse_os_detection(host: ET.Element) -> OsDetection | None:
    os_el = host.find("os")
    uptime_el = host.find("./uptime")
    tcpseq_el = host.find("./tcpsequence")
    ipid_el = host.find("./ipidsequence")
    tcpts_el = host.find("./tcptssequence")
    distance_el = host.find("./distance")

    has_data = any(el is not None for el in [os_el, uptime_el, tcpseq_el, ipid_el, tcpts_el, distance_el])
    if not has_data:
        return None

    os_matches: list[OsMatch] = []
    device_type = None
    fingerprint = None

    if os_el is not None:
        for match_el in os_el.findall("osmatch"):
            os_classes: list[OsClass] = []
            for cls_el in match_el.findall("osclass"):
                os_cls = OsClass(
                    vendor=cls_el.attrib.get("vendor", ""),
                    os_family=cls_el.attrib.get("osfamily", ""),
                    os_gen=cls_el.attrib.get("osgen", ""),
                    type=cls_el.attrib.get("type", ""),
                    accuracy=_safe_int(cls_el.attrib.get("accuracy")),
                )
                os_classes.append(os_cls)
                if not device_type and os_cls.type:
                    device_type = os_cls.type

            os_matches.append(OsMatch(
                name=match_el.attrib.get("name", ""),
                accuracy=_safe_int(match_el.attrib.get("accuracy")),
                os_classes=os_classes,
            ))

        fp_el = os_el.find("osfingerprint")
        if fp_el is not None:
            fingerprint = fp_el.attrib.get("fingerprint")

    uptime_seconds = None
    uptime_last_boot = None
    if uptime_el is not None:
        uptime_seconds = _safe_int(uptime_el.attrib.get("seconds"))
        uptime_last_boot = uptime_el.attrib.get("lastboot")

    tcp_seq_difficulty = None
    tcp_seq_desc = None
    tcp_seq_values = None
    if tcpseq_el is not None:
        tcp_seq_difficulty = _safe_int(tcpseq_el.attrib.get("difficulty"))
        tcp_seq_desc = tcpseq_el.attrib.get("difficulty") and tcpseq_el.attrib.get("values")
        idx = tcpseq_el.attrib.get("index")
        difficulty_val = tcpseq_el.attrib.get("difficulty")
        if idx:
            tcp_seq_difficulty = _safe_int(idx)
        elif difficulty_val:
            tcp_seq_difficulty = _safe_int(difficulty_val)
        tcp_seq_desc = tcpseq_el.attrib.get("class", "")
        tcp_seq_values = tcpseq_el.attrib.get("values", "")

    ip_id_sequence = None
    if ipid_el is not None:
        ip_id_sequence = ipid_el.attrib.get("class", "")

    tcp_ts_sequence = None
    if tcpts_el is not None:
        tcp_ts_sequence = tcpts_el.attrib.get("class", "")

    network_distance = None
    if distance_el is not None:
        network_distance = _safe_int(distance_el.attrib.get("value"))

    return OsDetection(
        os_matches=os_matches,
        device_type=device_type,
        uptime_seconds=uptime_seconds,
        uptime_last_boot=uptime_last_boot,
        tcp_sequence_difficulty=tcp_seq_difficulty,
        tcp_sequence_description=tcp_seq_desc,
        tcp_sequence_values=tcp_seq_values,
        ip_id_sequence=ip_id_sequence,
        tcp_ts_sequence=tcp_ts_sequence,
        network_distance=network_distance,
        fingerprint=fingerprint,
    )


def _parse_traceroute(host: ET.Element) -> list[TracerouteHop]:
    trace_el = host.find("trace")
    if trace_el is None:
        return []

    hops: list[TracerouteHop] = []
    for hop_el in trace_el.findall("hop"):
        rtt_raw = hop_el.attrib.get("rtt")
        hops.append(TracerouteHop(
            hop=_safe_int(hop_el.attrib.get("ttl")),
            rtt_ms=_safe_float(rtt_raw) if rtt_raw else None,
            address=hop_el.attrib.get("ipaddr", ""),
            hostname=hop_el.attrib.get("host") or None,
        ))

    return sorted(hops, key=lambda h: h.hop)


def _parse_scan_stats(root: ET.Element) -> ScanStats | None:
    runstats = root.find("runstats")
    if runstats is None:
        return None

    finished_el = runstats.find("finished")
    hosts_el = runstats.find("hosts")

    start_time = root.attrib.get("startstr")
    end_time = None
    elapsed_seconds = None
    raw_sent = None
    raw_recv = None

    if finished_el is not None:
        end_time = finished_el.attrib.get("timestr")
        elapsed_seconds = _safe_float(finished_el.attrib.get("elapsed"))
        raw_sent = finished_el.attrib.get("rawpackets_sent")
        raw_recv = finished_el.attrib.get("rawpackets_recv")

    hosts_up = 0
    hosts_total = 0
    if hosts_el is not None:
        hosts_up = _safe_int(hosts_el.attrib.get("up"))
        hosts_total = _safe_int(hosts_el.attrib.get("total"))

    return ScanStats(
        start_time=start_time,
        end_time=end_time,
        elapsed_seconds=elapsed_seconds,
        hosts_up=hosts_up,
        hosts_total=hosts_total,
        raw_packets_sent=raw_sent,
        raw_packets_received=raw_recv,
    )
