"""Unit tests for transform_ssl_check."""

import json
from pathlib import Path

import pytest

from app.services.transformers import transform_ssl, transform_ssl_check

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.fixture
def mozilla_tls_fixture():
    """Load Mozilla TLS Observatory fixture."""
    path = FIXTURES_DIR / "mozilla_tls_github.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {
        "grade": "A+",
        "chain_complete": True,
        "forward_secrecy": True,
        "protocols": ["TLSv1.3", "TLSv1.2"],
        "ciphers": ["TLS_AES_256_GCM_SHA384", "ECDHE-RSA-AES256-GCM-SHA384"],
        "certificates": [
            {"subject": {"CN": "github.com"}, "issuer": {"CN": "CA"}, "trusted": True}
        ],
        "heartbleed": False,
        "poodle": False,
    }


@pytest.fixture
def ssl_raw_fixture():
    """SSL module raw result."""
    return {
        "subject": {"CN": "github.com"},
        "issuer": {"CN": "DigiCert SHA2 Extended Validation Server CA", "O": "DigiCert Inc"},
        "valid_from": "2024-03-07T00:00:00.000Z",
        "valid_to": "2025-03-12T23:59:59.000Z",
        "subjectaltname": "DNS:github.com, DNS:www.github.com",
        "bits": 2048,
        "asn1Curve": None,
        "sigalg": "sha256WithRSAEncryption",
    }


@pytest.fixture
def ssl_raw_with_ec_cert():
    """SSL raw with EC cert (arena.ai-style: prime256v1, fingerprint, serial)."""
    return {
        "subject": {"CN": "arena.ai"},
        "issuer": {"CN": "Google Trust Services"},
        "valid_from": "2026-02-14T00:00:00.000Z",
        "valid_to": "2026-05-15T23:59:59.000Z",
        "subjectaltname": "DNS:arena.ai, DNS:www.arena.ai",
        "bits": 256,
        "asn1Curve": "prime256v1",
        "sigalg": "ecdsa-with-SHA256",
        "serialNumber": "2EAB512383C9F7CE13656FA7D6738A48",
        "fingerprint": "17:F6:A1:29:FD:A3:C3:0B:62:00:10:07:43:89:24:B1:1A:5C:01:23",
        "extendedKeyUsage": ["TLS Web Server Authentication"],
    }


@pytest.mark.unit
class TestTransformSslCheck:
    """Tests for the merged SSL Check transformer."""

    def test_ssl_only_returns_base_fields(self, ssl_raw_fixture):
        """When only ssl raw is available, base fields populated, new fields empty."""
        result = transform_ssl_check({"ssl": ssl_raw_fixture})

        assert result["subject"] == "github.com"
        assert result["issuer"] is not None
        assert result["keySize"] == 2048
        assert result["signatureAlgorithm"] == "sha256WithRSAEncryption"
        assert result["protocols"] == []
        assert result["cipherSuites"] == []
        assert result["vulnerabilities"] == []
        assert result["forwardSecrecy"] is False
        assert result["hsts"] == {"enabled": False}

    def test_ssl_plus_tls_merges_correctly(
        self, ssl_raw_fixture, mozilla_tls_fixture
    ):
        """When both ssl and tls available, all fields populated."""
        result = transform_ssl_check({
            "ssl": ssl_raw_fixture,
            "tls": mozilla_tls_fixture,
        })

        assert result["grade"] in {"A+", "A", "B", "C", "D", "F"}
        assert isinstance(result["protocols"], list)
        assert len(result["protocols"]) >= 1
        assert isinstance(result["cipherSuites"], list)
        assert len(result["cipherSuites"]) >= 1
        assert isinstance(result["vulnerabilities"], list)
        for v in result["vulnerabilities"]:
            assert "id" in v
            assert "name" in v
            assert v["status"] in {"vulnerable", "not-vulnerable", "unknown"}

    def test_empty_input_returns_defaults(self):
        """Empty input should return all defaults, no crash."""
        result = transform_ssl_check({})

        assert result["grade"] in {"A+", "A", "B", "C", "D", "F"}
        assert result["protocols"] == []
        assert result["cipherSuites"] == []
        assert result["vulnerabilities"] == []
        assert result["hsts"] == {"enabled": False}

    def test_tls_failure_does_not_affect_ssl_base(self, ssl_raw_fixture):
        """If tls has error data, ssl base fields still work."""
        result = transform_ssl_check({
            "ssl": ssl_raw_fixture,
            "tls": {"error": "timeout", "success": False},
        })

        assert result["subject"] == "github.com"
        assert result["keySize"] == 2048
        assert result["protocols"] == []

    def test_unknown_tls_grade_coerced_to_api_scale(self, ssl_raw_fixture):
        """Non-contract TLS grade strings map into A+..F before API output."""
        result = transform_ssl_check({
            "ssl": ssl_raw_fixture,
            "tls": {"grade": "Z99-unknown"},
        })
        assert result["grade"] == "F"

    def test_hsts_from_hsts_module(self, ssl_raw_fixture):
        """HSTS info extracted from hsts module."""
        result = transform_ssl_check({
            "ssl": ssl_raw_fixture,
            "hsts": {
                "compatible": True,
                "hstsHeader": "max-age=31536000; includeSubDomains; preload",
            },
        })

        assert result["hsts"]["enabled"] is True
        assert result["hsts"]["maxAge"] == 31536000
        assert result["hsts"]["preload"] is True

    def test_hsts_fallback_to_headers(self, ssl_raw_fixture):
        """HSTS extracted from headers when hsts module unavailable."""
        result = transform_ssl_check({
            "ssl": ssl_raw_fixture,
            "headers": {
                "responseHeaders": {
                    "strict-transport-security": "max-age=31536000; includeSubDomains; preload"
                }
            },
        })

        assert result["hsts"]["enabled"] is True
        assert result["hsts"]["maxAge"] == 31536000

    def test_cn_san_match(self, ssl_raw_fixture):
        """CN should match SAN list."""
        result = transform_ssl_check({"ssl": ssl_raw_fixture})
        assert result["cnMatchesSan"] is True

    def test_wildcard_scope_detection(self):
        """Wildcard cert scope detected."""
        result = transform_ssl_check({
            "ssl": {
                "subject": {"CN": "*.example.com"},
                "subjectaltname": "DNS:*.example.com, DNS:example.com",
                "bits": 2048,
                "sigalg": "sha256WithRSAEncryption",
            }
        })

        assert result["wildcardScope"] == "*.example.com"

    def test_backward_compatible_with_old_transform_ssl(self, ssl_raw_fixture):
        """SslCheckResult should contain all fields from old SslResult."""
        old_result = transform_ssl(ssl_raw_fixture)
        new_result = transform_ssl_check({"ssl": ssl_raw_fixture})

        for key in old_result:
            assert key in new_result, f"Missing legacy key: {key}"

    def test_new_ssl_fields_from_ec_cert(self, ssl_raw_with_ec_cert):
        """ASN1 Curve, NIST Curve, Serial Num, Fingerprint, Renewed, Extended Key Usage."""
        result = transform_ssl_check({"ssl": ssl_raw_with_ec_cert})

        assert result["asn1Curve"] == "prime256v1"
        assert result["nistCurve"] == "P-256"
        assert result["serialNumber"] == "2EAB512383C9F7CE13656FA7D6738A48"
        assert result["fingerprint"] == "17:F6:A1:29:FD:A3:C3:0B:62:00:10:07:43:89:24:B1:1A:5C:01:23"
        assert result["renewed"] == "2026-02-14T00:00:00.000Z"
        assert result["extensions"] is not None
        assert result["extensions"]["extendedKeyUsage"] == ["TLS Web Server Authentication"]
        assert result["signatureAlgorithm"] == "ecdsa-with-SHA256"
