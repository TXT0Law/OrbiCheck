"""Unit tests for transform_whois."""

from app.services.transformers import transform_whois


class TestTransformWhois:
    def test_transforms_new_format(self):
        raw = {
            "data": {
                "domain": "example.com",
                "registrar": "GoDaddy LLC",
                "creationDate": "2020-01-15",
                "updatedDate": "2024-01-10",
                "expiryDate": "2026-01-15",
                "nameServers": ["ns1.example.com", "ns2.example.com"],
                "domainStatus": ["clientTransferProhibited"],
            },
        }
        result = transform_whois(raw)
        assert result["registrar"] == "GoDaddy LLC"
        assert result["createdAt"] == "2020-01-15"
        assert result["updatedAt"] == "2024-01-10"
        assert result["expiresAt"] == "2026-01-15"
        assert result["nameservers"] == ["ns1.example.com", "ns2.example.com"]
        assert result["domainStatus"] == ["clientTransferProhibited"]

    def test_transforms_old_format(self):
        raw = {
            "whoisData": {
                "Registrar": "Namecheap",
                "Creation_Date": "2019-05-20",
                "Updated_Date": "2023-05-19",
                "Expiry_Date": "2025-05-20",
                "Name_Servers": "ns1.namecheap.com",
                "Domain_Status": "clientTransferProhibited",
            },
        }
        result = transform_whois(raw)
        assert result["registrar"] == "Namecheap"
        assert result["createdAt"] == "2019-05-20"
        assert result["updatedAt"] == "2023-05-19"
        assert result["expiresAt"] == "2025-05-20"

    def test_handles_empty_data(self):
        raw = {}
        result = transform_whois(raw)
        assert result["registrar"] == ""
        assert result["createdAt"] == ""
        assert result["updatedAt"] == ""
        assert result["expiresAt"] == ""
        assert result["nameservers"] == []
        assert result["domainStatus"] == []

    def test_name_servers_is_list(self):
        raw = {
            "data": {
                "nameServers": ["ns1.example.com", "ns2.example.com"],
            },
        }
        result = transform_whois(raw)
        assert isinstance(result["nameservers"], list)
        assert len(result["nameservers"]) == 2

    def test_transforms_flat_format_from_scan_tasks(self):
        """Raw is the data directly (as stored by scan_tasks from module_result['data'])."""
        raw = {
            "domain": "example.com",
            "registrar": "GoDaddy LLC",
            "creationDate": "2020-01-15",
            "updatedDate": "2024-01-10",
            "expiryDate": "2026-01-15",
            "nameServers": ["ns1.example.com", "ns2.example.com"],
            "domainStatus": ["clientTransferProhibited"],
        }
        result = transform_whois(raw)
        assert result["registrar"] == "GoDaddy LLC"
        assert result["createdAt"] == "2020-01-15"
        assert result["updatedAt"] == "2024-01-10"
        assert result["expiresAt"] == "2026-01-15"
        assert result["nameservers"] == ["ns1.example.com", "ns2.example.com"]
        assert result["domainStatus"] == ["clientTransferProhibited"]

    def test_uses_internic_fallback_keys(self):
        raw = {
            "internicData": {
                "Registrar": "eNom",
                "Creation_Date": "2018-01-01",
                "Updated_Date": "2022-12-01",
                "Expiry_Date": "2024-01-01",
                "nameservers": ["dns1.eNom.com"],
            },
        }
        result = transform_whois(raw)
        assert result["registrar"] == "eNom"
        assert result["createdAt"] == "2018-01-01"
        assert result["nameservers"] == ["dns1.eNom.com"]
