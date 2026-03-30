"""Unit tests for transform_tls and TLS helper functions."""

import json
from pathlib import Path

import pytest

from app.services.transformers import (
    transform_tls,
    _classify_protocol_security,
    _classify_cipher_strength,
    _parse_cipher_components,
    _compute_cipher_stats,
    _empty_tls_result,
)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.fixture
def mozilla_raw_full() -> dict:
    """Complete Mozilla TLS Observatory response fixture."""
    path = FIXTURES_DIR / "mozilla_tls_full.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {
        "grade": "A+",
        "score": 90,
        "forward_secrecy": True,
        "secure_renegotiation": True,
        "tls_compression": False,
        "connection": {
            "serverside": True,
            "protocols": [
                {"name": "TLSv1.3", "supported": True},
                {"name": "TLSv1.2", "supported": True},
            ],
            "ciphers": [
                {"name": "TLS_AES_256_GCM_SHA384", "protocol": "TLSv1.3"},
                {"name": "ECDHE-RSA-AES256-GCM-SHA384", "protocol": "TLSv1.2"},
            ],
            "curves": ["prime256v1", "secp384r1"],
        },
        "protocols": ["TLSv1.3", "TLSv1.2"],
    }


@pytest.fixture
def mozilla_raw_weak_ciphers() -> dict:
    """Response with weak/insecure cipher suites."""
    return {
        "connection": {
            "protocols": [{"name": "TLSv1.2", "supported": True}],
            "ciphers": [
                {"name": "TLS_RSA_WITH_RC4_128_SHA", "protocol": "TLSv1.2"},
                {"name": "TLS_RSA_WITH_AES_128_CBC_SHA", "protocol": "TLSv1.2"},
                {"name": "TLS_RSA_WITH_NULL_SHA", "protocol": "TLSv1.2"},
            ],
        },
        "protocols": ["TLSv1.2"],
    }


@pytest.mark.unit
class TestTransformTls:
    """Tests for transform_tls overall."""

    def test_returns_empty_result_for_none(self):
        result = transform_tls(None)
        assert result["protocols"] == []
        assert result["cipherSuites"] == []
        assert "cipherStats" in result

    def test_returns_empty_result_for_empty_dict(self):
        result = transform_tls({})
        assert result["protocols"] == []
        assert result["cipherSuites"] == []

    def test_returns_empty_on_error(self):
        result = transform_tls({"success": False, "error": "timeout"})
        assert result["protocols"] == []
        assert result["cipherSuites"] == []

    def test_full_result_structure(self, mozilla_raw_full):
        result = transform_tls(mozilla_raw_full)
        assert "grade" in result
        assert "score" in result
        assert "protocols" in result
        assert "cipherSuites" in result
        assert "cipherStats" in result
        assert "preferredProtocol" in result
        assert "sessionResumption" in result

    def test_grade_extraction(self, mozilla_raw_full):
        result = transform_tls(mozilla_raw_full)
        assert result["grade"] in ("A+", "A", "A-", "B", "C", "D", "F") or result["grade"] is None

    def test_unwraps_data_wrapper(self, mozilla_raw_full):
        wrapped = {"success": True, "data": mozilla_raw_full}
        result = transform_tls(wrapped)
        assert len(result["protocols"]) >= 1
        assert len(result["cipherSuites"]) >= 1


@pytest.mark.unit
class TestProtocolClassification:
    """Tests for _classify_protocol_security."""

    @pytest.mark.parametrize(
        ("protocol", "expected"),
        [
            ("TLSv1.3", "good"),
            ("TLSv1.2", "good"),
            ("TLSv1.1", "warning"),
            ("TLSv1.0", "warning"),
            ("TLSv1", "warning"),
            ("SSLv3", "danger"),
            ("SSLv2", "danger"),
        ],
    )
    def test_protocol_security_levels(self, protocol: str, expected: str):
        assert _classify_protocol_security(protocol) == expected


@pytest.mark.unit
class TestCipherParsing:
    """Tests for _parse_cipher_components."""

    def test_parse_tls13_cipher(self):
        result = _parse_cipher_components("TLS_AES_256_GCM_SHA384")
        assert result.get("encryption") or "AES" in str(result)
        assert result.get("mac") or "SHA" in str(result)
        assert result.get("forwardSecrecy") is True

    def test_parse_tls12_cipher_with_ecdhe(self):
        result = _parse_cipher_components("TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384")
        assert result.get("keyExchange") == "ECDHE"
        assert result.get("auth") == "RSA"
        assert "AES" in str(result.get("encryption", ""))
        assert result.get("forwardSecrecy") is True

    def test_parse_chacha_cipher(self):
        result = _parse_cipher_components("TLS_CHACHA20_POLY1305_SHA256")
        assert result.get("forwardSecrecy") is True


@pytest.mark.unit
class TestCipherStrength:
    """Tests for _classify_cipher_strength."""

    @pytest.mark.parametrize(
        ("cipher", "expected"),
        [
            ("TLS_AES_256_GCM_SHA384", "strong"),
            ("TLS_AES_128_GCM_SHA256", "acceptable"),
            ("TLS_RSA_WITH_AES_128_CBC_SHA", "weak"),
            ("TLS_RSA_WITH_RC4_128_SHA", "insecure"),
            ("TLS_RSA_WITH_NULL_SHA", "insecure"),
            ("TLS_RSA_WITH_3DES_EDE_CBC_SHA", "insecure"),
        ],
    )
    def test_cipher_strength_classification(self, cipher: str, expected: str):
        assert _classify_cipher_strength(cipher) == expected


@pytest.mark.unit
class TestCipherStats:
    """Tests for _compute_cipher_stats."""

    def test_stats_all_strong(self):
        ciphers = [
            {"forwardSecrecy": True, "encryption": "AES-256-GCM", "strength": "strong"},
            {"forwardSecrecy": True, "encryption": "CHACHA20-POLY1305", "strength": "strong"},
        ]
        stats = _compute_cipher_stats(ciphers)
        assert stats["total"] == 2
        assert stats["weakCount"] == 0
        assert stats["forwardSecrecyPercent"] == 100.0
        assert stats["aeadPercent"] == 100.0

    def test_stats_with_weak_ciphers(self):
        ciphers = [
            {"forwardSecrecy": True, "encryption": "AES-256-GCM", "strength": "strong"},
            {"forwardSecrecy": False, "encryption": "AES-128-CBC", "strength": "weak"},
        ]
        stats = _compute_cipher_stats(ciphers)
        assert stats["total"] == 2
        assert stats["weakCount"] == 1
        assert stats["forwardSecrecyPercent"] == 50.0

    def test_stats_empty(self):
        stats = _compute_cipher_stats([])
        assert stats["total"] == 0
        assert stats["weakCount"] == 0


@pytest.mark.unit
class TestEmptyTlsResult:
    """Tests for _empty_tls_result."""

    def test_has_required_keys(self):
        result = _empty_tls_result()
        assert "protocols" in result
        assert "cipherSuites" in result
        assert result["protocols"] == []
        assert result["cipherSuites"] == []
