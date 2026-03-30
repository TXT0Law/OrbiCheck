"""Unit tests for transform_associated_hosts."""

from app.services.transformers import transform_associated_hosts


class TestTransformAssociatedHosts:
    def test_transforms_full_result(self):
        raw = {
            "data": {
                "domain": "example.com",
                "hosts": [
                    {"hostname": "www.example.com", "source": "certificate"},
                    {"hostname": "mail.example.com", "source": "reverse-dns", "ip": "1.2.3.4"},
                    {"hostname": "cdn.example.com", "source": "same-ip", "ip": "1.2.3.4"},
                ],
                "totalFound": 3,
            },
        }
        result = transform_associated_hosts(raw)
        assert result["domain"] == "example.com"
        assert len(result["hosts"]) == 3
        assert result["hosts"][0]["hostname"] == "www.example.com"
        assert result["hosts"][0]["source"] == "certificate"
        assert result["hosts"][1]["source"] == "reverse-dns"
        assert result["hosts"][1]["ip"] == "1.2.3.4"
        assert result["totalFound"] == 3

    def test_handles_empty_hosts(self):
        raw = {"data": {"domain": "example.com", "hosts": [], "totalFound": 0}}
        result = transform_associated_hosts(raw)
        assert result["hosts"] == []
        assert result["totalFound"] == 0
        assert result["domain"] == "example.com"

    def test_filters_invalid_entries(self):
        raw = {
            "data": {
                "domain": "example.com",
                "hosts": [
                    {"hostname": "valid.com", "source": "certificate"},
                    {"source": "certificate"},
                    {"hostname": "", "source": "certificate"},
                    {},
                    {"hostname": "another.com", "source": "reverse-dns"},
                ],
                "totalFound": 5,
            },
        }
        result = transform_associated_hosts(raw)
        assert len(result["hosts"]) == 2
        assert result["hosts"][0]["hostname"] == "valid.com"
        assert result["hosts"][1]["hostname"] == "another.com"

    def test_handles_missing_data(self):
        raw = {}
        result = transform_associated_hosts(raw)
        assert result["domain"] == ""
        assert result["hosts"] == []
        assert result["totalFound"] == 0

    def test_preserves_source_and_ip(self):
        raw = {
            "data": {
                "domain": "x.com",
                "hosts": [{"hostname": "rdns.x.com", "source": "reverse-dns", "ip": "1.2.3.4"}],
                "totalFound": 1,
            },
        }
        result = transform_associated_hosts(raw)
        assert result["hosts"][0]["source"] == "reverse-dns"
        assert result["hosts"][0]["ip"] == "1.2.3.4"

    def test_uses_len_hosts_when_total_found_missing(self):
        raw = {
            "data": {
                "domain": "example.com",
                "hosts": [{"hostname": "a.com", "source": "certificate"}],
            },
        }
        result = transform_associated_hosts(raw)
        assert result["totalFound"] == 1
