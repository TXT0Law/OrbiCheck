"""visual_change thresholds, perceptual hash (dHash), and similarity helpers.

Decoding and hashing run in a thread pool from async code (Pillow + ImageHash).
"""

from __future__ import annotations

import base64
import binascii
import io
from dataclasses import dataclass
from typing import Any

import imagehash
import structlog
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

logger = structlog.get_logger(__name__)

DHASH_BIT_LENGTH = 64


@dataclass(frozen=True)
class VisualThresholds:
    similarity_threshold_percent: float
    viewport_width: int
    viewport_height: int
    full_page: bool


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

    return VisualThresholds(
        similarity_threshold_percent=similarity,
        viewport_width=viewport_width,
        viewport_height=viewport_height,
        full_page=full_page,
    )


def decode_screenshot_payload(payload: dict[str, Any]) -> tuple[bytes, int, int] | None:
    """
    Extract PNG bytes and dimensions from Scan Service screenshot JSON.

    Returns None on failure (logs reason).
    """
    if not payload.get("success"):
        err = payload.get("error") or "screenshot_unsuccessful"
        logger.warning("visual_screenshot_service_failed", error=str(err)[:300])
        return None
    b64 = payload.get("image")
    if not isinstance(b64, str) or not b64:
        logger.warning("visual_screenshot_missing_image")
        return None
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


def compute_dhash_hex(png_bytes: bytes) -> str:
    """Synchronous dHash (hex). Caller should run in a worker thread for large batches."""
    img = Image.open(io.BytesIO(png_bytes))
    return str(imagehash.dhash(img))


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
