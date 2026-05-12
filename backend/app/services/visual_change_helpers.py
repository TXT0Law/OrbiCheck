"""visual_change thresholds, perceptual hash (dHash/pHash/aHash/wHash), and similarity helpers.

Decoding and hashing run in a thread pool from async code (Pillow + ImageHash).

V-10: the hash algorithm is now configurable per monitor via
``capabilities.visual_change.thresholds.hashAlgorithm``. dHash remains the
default (cheap, robust). pHash is more accurate against compression
artefacts; aHash is the cheapest but noisiest; wHash uses wavelet
decomposition and is the most expensive but most resilient against minor
re-flow.
V-11: an optional list of percentage-based ``ignoreRegions`` is filled
with black before hashing so dynamic widgets (timers, ads, chat
notifications) don't constantly trip the threshold.
"""

from __future__ import annotations

import base64
import binascii
import io
from dataclasses import dataclass, field
from typing import Any

import imagehash
import structlog
from PIL import Image, ImageDraw, UnidentifiedImageError

from app.core.config import settings

logger = structlog.get_logger(__name__)

DHASH_BIT_LENGTH = 64

# V-10: supported perceptual hash algorithms. Each maps to an ImageHash
# function; all four produce a 64-bit hash so similarity math (Hamming /
# DHASH_BIT_LENGTH) stays correct.
SUPPORTED_HASH_ALGORITHMS: tuple[str, ...] = ("dhash", "phash", "ahash", "whash")
DEFAULT_HASH_ALGORITHM = "dhash"

_HASH_FUNCTIONS = {
    "dhash": imagehash.dhash,
    "phash": imagehash.phash,
    "ahash": imagehash.average_hash,
    "whash": imagehash.whash,
}

# V-11: maximum number of ignore regions and per-region geometry caps. Bound
# the iteration cost (PIL draw rect is cheap but 100s of overlapping regions
# would be a denial-of-config vector).
MAX_IGNORE_REGIONS = 8


@dataclass(frozen=True)
class IgnoreRegion:
    """V-11: percentage-based rectangle to mask before hashing.

    All coordinates are 0-100 floats so they survive viewport changes (the
    operator draws once at 1280×720 and the mask still applies at 1024×768).
    """

    x_percent: float
    y_percent: float
    width_percent: float
    height_percent: float


@dataclass(frozen=True)
class VisualThresholds:
    similarity_threshold_percent: float
    viewport_width: int
    viewport_height: int
    full_page: bool
    # V-1: store a screenshot even when the probe failed (bot wall, 5xx,
    # TLS error). Diagnostic captures are persisted with is_diagnostic=True
    # so they never participate in dHash similarity comparison.
    capture_on_failure: bool
    # V-10: which perceptual hash algorithm to use for this monitor's
    # similarity comparison. Stored alongside the hash on each capture so
    # we never compare a phash to a dhash and produce nonsense.
    hash_algorithm: str = DEFAULT_HASH_ALGORITHM
    # V-11: ordered list of ignore regions. Empty list = no masking.
    ignore_regions: tuple[IgnoreRegion, ...] = field(default_factory=tuple)


def get_visual_thresholds(capabilities: dict[str, Any] | None) -> VisualThresholds:
    """Parse visual_change.thresholds from capabilities JSONB (camelCase keys)."""
    caps = capabilities or {}
    raw = caps.get("visual_change")
    if not isinstance(raw, dict):
        raw = {}
    th = raw.get("thresholds")
    if not isinstance(th, dict):
        th = {}

    sim = th.get("similarityThresholdPercent")
    if sim is None:
        similarity = 92.0
    else:
        try:
            similarity = float(sim)
        except (TypeError, ValueError):
            similarity = 92.0
    similarity = max(50.0, min(100.0, similarity))

    vw = th.get("viewportWidth", 1280)
    vh = th.get("viewportHeight", 720)
    try:
        viewport_width = int(vw)
        viewport_height = int(vh)
    except (TypeError, ValueError):
        viewport_width, viewport_height = 1280, 720
    viewport_width = max(320, min(3840, viewport_width))
    viewport_height = max(240, min(2160, viewport_height))

    fp = th.get("fullPage", False)
    full_page = bool(fp)

    # Default True for new monitors (see DEFAULT_CAPABILITIES); legacy rows
    # that omit the field also opt in so existing users immediately benefit
    # from the diagnostic screenshots.
    capture_on_failure = bool(th.get("captureOnFailure", True))

    # V-10: hash algorithm. Unknown / mistyped values silently fall back to
    # the default rather than 422-ing — the schema layer is responsible for
    # validating user input; this helper must always produce a usable
    # threshold object so live probes never crash on a dirty JSONB row.
    raw_algo = th.get("hashAlgorithm", DEFAULT_HASH_ALGORITHM)
    if isinstance(raw_algo, str) and raw_algo.lower() in SUPPORTED_HASH_ALGORITHMS:
        hash_algorithm = raw_algo.lower()
    else:
        hash_algorithm = DEFAULT_HASH_ALGORITHM

    # V-11: ignore regions. Coordinates are clamped to [0, 100] so a malformed
    # JSONB blob can never overflow the screenshot canvas.
    raw_regions = th.get("ignoreRegions") or []
    regions: list[IgnoreRegion] = []
    if isinstance(raw_regions, list):
        for entry in raw_regions[:MAX_IGNORE_REGIONS]:
            if not isinstance(entry, dict):
                continue
            try:
                x = float(entry.get("x", 0.0))
                y = float(entry.get("y", 0.0))
                w = float(entry.get("width", 0.0))
                h = float(entry.get("height", 0.0))
            except (TypeError, ValueError):
                continue
            x = max(0.0, min(100.0, x))
            y = max(0.0, min(100.0, y))
            w = max(0.0, min(100.0, w))
            h = max(0.0, min(100.0, h))
            if w <= 0.0 or h <= 0.0:
                continue
            regions.append(
                IgnoreRegion(
                    x_percent=x,
                    y_percent=y,
                    width_percent=w,
                    height_percent=h,
                )
            )

    return VisualThresholds(
        similarity_threshold_percent=similarity,
        viewport_width=viewport_width,
        viewport_height=viewport_height,
        full_page=full_page,
        capture_on_failure=capture_on_failure,
        hash_algorithm=hash_algorithm,
        ignore_regions=tuple(regions),
    )


def decode_screenshot_payload(payload: dict[str, Any]) -> tuple[bytes, int, int] | None:
    """
    Extract PNG bytes and dimensions from Scan Service screenshot JSON.

    Returns None on failure (logs reason).

    VC-1: the scan-service standardises every module envelope as
    ``{success, data: {...module-specific fields...}, statusCode, durationMs}``
    after wave-1 P3 (see ``backend/scan/_common/result.js``). This helper
    historically read ``payload["image"]`` at the root, which silently
    matched ZERO times in production and made V-2 ``Capture now`` always
    return "0 captures yet". We now check ``data.image`` first (the real
    shape) and fall back to ``payload["image"]`` so existing unit tests
    that stub the legacy / flat shape keep working.
    """
    if not payload.get("success"):
        err = payload.get("error") or "screenshot_unsuccessful"
        logger.warning("visual_screenshot_service_failed", error=str(err)[:300])
        return None

    # Prefer the canonical envelope shape; the flat shape is kept only for
    # historical unit-test stubs.
    data_block = payload.get("data") if isinstance(payload.get("data"), dict) else None
    candidate: object | None = None
    if data_block is not None:
        candidate = data_block.get("image")
    if not isinstance(candidate, str) or not candidate:
        candidate = payload.get("image")
    if not isinstance(candidate, str) or not candidate:
        logger.warning(
            "visual_screenshot_missing_image",
            envelope_keys=sorted(payload.keys()),
            data_keys=sorted(data_block.keys()) if data_block else None,
        )
        return None

    b64 = candidate
    # Some clients prefix data URLs (`data:image/png;base64,...`); strip the
    # prefix so b64decode does not blow up.
    if b64.startswith("data:"):
        comma_idx = b64.find(",")
        if comma_idx > 0:
            b64 = b64[comma_idx + 1 :]
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        logger.warning("visual_screenshot_invalid_base64")
        return None
    if len(raw) > settings.MONITOR_VISUAL_MAX_IMAGE_BYTES:
        logger.warning(
            "visual_screenshot_too_large",
            bytes=len(raw),
            cap=settings.MONITOR_VISUAL_MAX_IMAGE_BYTES,
        )
        return None
    try:
        img = Image.open(io.BytesIO(raw))
        w, h = img.size
    except (UnidentifiedImageError, OSError) as exc:
        logger.warning("visual_screenshot_decode_failed", error=str(exc)[:200])
        return None
    return raw, int(w), int(h)


def apply_ignore_regions(image: Image.Image, regions: tuple[IgnoreRegion, ...]) -> Image.Image:
    """V-11: paint ignored regions black so they don't influence the hash.

    Returns the same image when ``regions`` is empty (zero-copy fast path).
    Otherwise returns a converted RGB copy with the rectangles filled — we
    fill on a copy so the caller's bytes / EXIF stay intact for storage.
    """
    if not regions:
        return image
    masked = image.convert("RGB").copy()
    width, height = masked.size
    if width <= 0 or height <= 0:
        return masked
    draw = ImageDraw.Draw(masked)
    for region in regions:
        x0 = int(round(region.x_percent / 100.0 * width))
        y0 = int(round(region.y_percent / 100.0 * height))
        x1 = int(round((region.x_percent + region.width_percent) / 100.0 * width))
        y1 = int(round((region.y_percent + region.height_percent) / 100.0 * height))
        x0 = max(0, min(width, x0))
        y0 = max(0, min(height, y0))
        x1 = max(0, min(width, x1))
        y1 = max(0, min(height, y1))
        if x1 <= x0 or y1 <= y0:
            continue
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
    return masked


def compute_perceptual_hash_hex(
    png_bytes: bytes,
    *,
    algorithm: str = DEFAULT_HASH_ALGORITHM,
    ignore_regions: tuple[IgnoreRegion, ...] = (),
) -> str:
    """V-10/V-11: compute a 64-bit perceptual hash with optional masking.

    Synchronous; caller should run in a worker thread for large batches. Falls
    back to dHash on unknown algorithm names so a corrupted threshold blob
    never blocks a live probe.
    """
    img = Image.open(io.BytesIO(png_bytes))
    if ignore_regions:
        img = apply_ignore_regions(img, ignore_regions)
    fn = _HASH_FUNCTIONS.get(algorithm.lower(), imagehash.dhash)
    return str(fn(img))


def compute_dhash_hex(png_bytes: bytes) -> str:
    """Backwards-compatible wrapper that always uses dHash.

    Existing call-sites that don't yet thread the algorithm choice through
    keep working unchanged. New code should prefer
    :func:`compute_perceptual_hash_hex` so the hash matches the threshold.
    """
    return compute_perceptual_hash_hex(png_bytes, algorithm="dhash")


def hamming_between_hex(a: str, b: str) -> int:
    ha = imagehash.hex_to_hash(a)
    hb = imagehash.hex_to_hash(b)
    return int(ha - hb)


def similarity_percent_from_hamming(hamming: int, bits: int = DHASH_BIT_LENGTH) -> float:
    if bits <= 0:
        return 100.0
    return round(100.0 * (1.0 - hamming / float(bits)), 2)


def is_visual_change_detected(
    similarity_percent: float, threshold: float
) -> bool:
    """True when similarity is strictly below the configured minimum (more different)."""
    return similarity_percent < threshold
