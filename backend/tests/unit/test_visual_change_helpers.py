"""visual_change helpers: similarity and payload decode guards."""

from __future__ import annotations

import base64

from app.services.visual_change_helpers import (
    decode_screenshot_payload,
    is_visual_change_detected,
    similarity_percent_from_hamming,
)


def test_similarity_from_hamming_identical() -> None:
    assert similarity_percent_from_hamming(0) == 100.0


def test_similarity_from_hamming_max_diff() -> None:
    assert similarity_percent_from_hamming(64) == 0.0


def test_is_visual_change_detected_strict_below() -> None:
    assert is_visual_change_detected(91.0, 92.0) is True
    assert is_visual_change_detected(92.0, 92.0) is False
    assert is_visual_change_detected(93.0, 92.0) is False


def test_decode_screenshot_payload_rejects_failed() -> None:
    assert decode_screenshot_payload({"success": False, "error": "timeout"}) is None


def test_decode_screenshot_payload_accepts_png() -> None:
    # 1x1 PNG
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    b64 = base64.b64encode(png).decode("ascii")
    out = decode_screenshot_payload({"success": True, "image": b64})
    assert out is not None
    raw, w, h = out
    assert raw == png
    assert w == 1 and h == 1
