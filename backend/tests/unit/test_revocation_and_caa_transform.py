"""Unit tests for revocation semantics and CAA extraction in SSL check transform."""

import pytest

from app.services.transformers import (
    _extract_caa,
    _extract_revocation,
    transform_ssl_check,
)


@pytest.mark.unit
class TestExtractRevocation:
    def test_ocsp_stapling_maps_to_stapled_only_not_available_flag(self):
        """Stapling must not be labeled as generic OCSP availability."""
        tls = {"ocsp_stapling": True}
        ssl = {}
        r = _extract_revocation(tls, ssl)
        assert r["ocsp"] == {"stapled": True}
        assert "available" not in r["ocsp"]
        assert r["crl"] == {}

    def test_ocsp_stapling_false(self):
        r = _extract_revocation({"ocsp_stapling": False}, {})
        assert r["ocsp"] == {"stapled": False}

    def test_responder_url_listed_from_tls_field(self):
        r = _extract_revocation(
            {"ocsp_stapling": False, "ocsp_url": "http://ocsp.example.com"},
            {},
        )
        assert r["ocsp"]["stapled"] is False
        assert r["ocsp"]["responderUrlListed"] is True

    def test_responder_listed_from_ssl_infoaccess(self):
        ssl = {
            "infoAccess": "CA Issuers - URI:http://ca.example\nOCSP - URI:http://ocsp.example",
        }
        r = _extract_revocation({}, ssl)
        assert r["ocsp"]["responderUrlListed"] is True

    def test_crl_distribution_point_from_ssl(self):
        ssl = {"crlDistributionPoints": "http://crl.example.com/root.crl"}
        r = _extract_revocation({}, ssl)
        assert r["crl"] == {"distributionPointListed": True}

    def test_no_hardcoded_crl_false_when_unknown(self):
        r = _extract_revocation({"ocsp_stapling": True}, {})
        assert "distributionPointListed" not in r["crl"]

    def test_crl_false_when_tls_cert_inspected_without_cdp(self):
        tls = {"certificates": [{"subject": {"CN": "example.test"}}]}
        r = _extract_revocation(tls, {})
        assert r["crl"] == {"distributionPointListed": False}


@pytest.mark.unit
class TestExtractCaa:
    def test_flat_dns_caa_strings(self):
        assert _extract_caa({"CAA": ['0 issue "digicert.com"']}) == ['0 issue "digicert.com"']

    def test_wrapped_dns_data_object_records(self):
        raw = {
            "data": {
                "A": ["1.1.1.1"],
                "CAA": [{"critical": 0, "issue": "letsencrypt.org"}],
            }
        }
        assert _extract_caa(raw) == ['0 issue "letsencrypt.org"']

    def test_lowercase_caa_key(self):
        assert _extract_caa({"caa": ['0 issuewild "pki.goog"']}) == ['0 issuewild "pki.goog"']


@pytest.mark.unit
def test_transform_ssl_check_merges_dns_caa():
    result = transform_ssl_check(
        {
            "ssl": {
                "subject": {"CN": "example.com"},
                "issuer": {"CN": "CA"},
                "valid_from": "2024-01-01T00:00:00.000Z",
                "valid_to": "2025-01-01T00:00:00.000Z",
                "subjectaltname": "DNS:example.com",
                "bits": 2048,
                "sigalg": "sha256WithRSAEncryption",
            },
            "dns": {"data": {"CAA": [{"critical": 128, "issuewild": "comodoca.com"}]}},
        }
    )
    assert result["caa"] == ['128 issuewild "comodoca.com"']
