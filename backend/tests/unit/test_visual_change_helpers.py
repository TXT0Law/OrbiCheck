"""visual_change helpers: similarity and payload decode guards."""

from __future__ import annotations

import base64
import io

from PIL import Image

from app.services.visual_change_helpers import (
    DEFAULT_HASH_ALGORITHM,
    SUPPORTED_HASH_ALGORITHMS,
    apply_ignore_regions,
    compute_changed_blocks,
    compute_perceptual_hash_hex,
    decode_screenshot_payload,
    get_visual_thresholds,
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


_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_decode_screenshot_payload_accepts_legacy_flat_shape() -> None:
    """Backwards compat: helper still accepts the old `{success, image}` shape
    that older unit tests stub (kept so existing tests don't churn).
    """
    b64 = base64.b64encode(_TINY_PNG).decode("ascii")
    out = decode_screenshot_payload({"success": True, "image": b64})
    assert out is not None
    raw, w, h = out
    assert raw == _TINY_PNG
    assert w == 1 and h == 1


def test_decode_screenshot_payload_accepts_real_envelope_shape() -> None:
    """VC-1 (regression guard): the scan-service screenshot module returns
    ``{success, data: {image, viewport, fullPage, capturedAt}, statusCode,
    durationMs}``. The wave-1 implementation looked at ``payload["image"]``
    at the root, which silently matched ZERO times in production and made
    V-2 ``Capture now`` always show "0 captures yet". This contract test
    locks the helper against the real envelope shape.
    """
    b64 = base64.b64encode(_TINY_PNG).decode("ascii")
    out = decode_screenshot_payload(
        {
            "success": True,
            "statusCode": 200,
            "durationMs": 42,
            "data": {
                "image": b64,
                "viewport": "1280x720",
                "fullPage": False,
                "capturedAt": "2026-05-12T07:19:40.000Z",
            },
        }
    )
    assert out is not None
    raw, w, h = out
    assert raw == _TINY_PNG
    assert w == 1 and h == 1


def test_decode_screenshot_payload_strips_data_url_prefix() -> None:
    """Some upstream wrappers return a data-URL string; `b64decode(validate=True)`
    chokes on the `data:image/png;base64,` prefix unless we strip it.
    """
    b64 = base64.b64encode(_TINY_PNG).decode("ascii")
    out = decode_screenshot_payload(
        {"success": True, "data": {"image": f"data:image/png;base64,{b64}"}}
    )
    assert out is not None
    raw, _w, _h = out
    assert raw == _TINY_PNG


def test_decode_screenshot_payload_returns_none_when_image_missing_in_both_shapes(capsys) -> None:
    """VC-1: when neither shape provides the image, the helper returns None.

    Also smoke-tests that the structlog warning includes the envelope keys
    (we read stdout because structlog uses its own handler that pytest's
    caplog fixture does not intercept).
    """
    out = decode_screenshot_payload(
        {"success": True, "data": {"viewport": "1280x720"}}
    )
    assert out is None
    captured = capsys.readouterr()
    combined = captured.out + captured.err
    assert "visual_screenshot_missing_image" in combined
    # The diagnostic should mention which shape was searched so a future
    # envelope drift is easy to spot from the log line alone.
    assert "envelope_keys" in combined


# ── V-10: multi-algorithm perceptual hashing ─────────────────────────────


def _png_with_color(color: tuple[int, int, int], size: int = 32) -> bytes:
    img = Image.new("RGB", (size, size), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_get_visual_thresholds_default_hash_algorithm() -> None:
    # Empty capabilities → default algorithm + no ignore regions.
    th = get_visual_thresholds(None)
    assert th.hash_algorithm == DEFAULT_HASH_ALGORITHM
    assert th.ignore_regions == ()


def test_get_visual_thresholds_accepts_supported_algorithm() -> None:
    th = get_visual_thresholds(
        {"visual_change": {"thresholds": {"hashAlgorithm": "phash"}}}
    )
    assert th.hash_algorithm == "phash"


def test_get_visual_thresholds_falls_back_on_unknown_algorithm() -> None:
    # V-10: a mistyped algorithm must NOT raise; the live probe path can never
    # tolerate threshold parsing failures.
    th = get_visual_thresholds(
        {"visual_change": {"thresholds": {"hashAlgorithm": "doesnt-exist"}}}
    )
    assert th.hash_algorithm == DEFAULT_HASH_ALGORITHM


def test_compute_perceptual_hash_hex_supports_all_algorithms() -> None:
    png = _png_with_color((128, 64, 200))
    seen: set[str] = set()
    for algo in SUPPORTED_HASH_ALGORITHMS:
        result = compute_perceptual_hash_hex(png, algorithm=algo)
        assert isinstance(result, str) and result, f"empty hash for {algo}"
        seen.add(algo)
    assert seen == set(SUPPORTED_HASH_ALGORITHMS)


# ── V-11: ignore-region masking ──────────────────────────────────────────


def test_get_visual_thresholds_clamps_ignore_regions() -> None:
    th = get_visual_thresholds(
        {
            "visual_change": {
                "thresholds": {
                    "ignoreRegions": [
                        # Geometry within range stays untouched.
                        {"x": 10, "y": 20, "width": 30, "height": 40},
                        # Out-of-range geometry is clamped to [0,100] but kept.
                        {"x": -10, "y": 110, "width": 200, "height": 50},
                        # Zero-area region is dropped.
                        {"x": 5, "y": 5, "width": 0, "height": 10},
                    ]
                }
            }
        }
    )
    assert len(th.ignore_regions) == 2
    first, second = th.ignore_regions
    assert (first.x_percent, first.y_percent, first.width_percent, first.height_percent) == (
        10.0,
        20.0,
        30.0,
        40.0,
    )
    assert second.x_percent == 0.0
    assert second.y_percent == 100.0
    assert second.width_percent == 100.0


def test_apply_ignore_regions_changes_perceptual_hash() -> None:
    # Build a small image with a bright square in the top-left corner;
    # masking the corner should produce a different perceptual hash than
    # leaving it visible.
    img = Image.new("RGB", (32, 32), (0, 0, 0))
    for x in range(0, 8):
        for y in range(0, 8):
            img.putpixel((x, y), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png = buf.getvalue()

    th = get_visual_thresholds(
        {
            "visual_change": {
                "thresholds": {
                    "ignoreRegions": [
                        {"x": 0, "y": 0, "width": 25, "height": 25},
                    ]
                }
            }
        }
    )

    unmasked = compute_perceptual_hash_hex(png, algorithm="dhash")
    masked = compute_perceptual_hash_hex(
        png, algorithm="dhash", ignore_regions=th.ignore_regions
    )
    # Different square covered → likely different hash. (We assert string
    # inequality because exact bit-flip count depends on dHash internals.)
    assert masked != unmasked


def test_apply_ignore_regions_no_op_for_empty_tuple() -> None:
    img = Image.new("RGB", (8, 8), (255, 255, 255))
    out = apply_ignore_regions(img, ())
    assert out is img


def test_compute_changed_blocks_returns_row_major_cells() -> None:
    before = _png_with_color((0, 0, 0), size=64)
    img = Image.new("RGB", (64, 64), (0, 0, 0))
    for x in range(56, 64):
        for y in range(56, 64):
            img.putpixel((x, y), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    changed = compute_changed_blocks(before, buf.getvalue())

    assert 63 in changed
