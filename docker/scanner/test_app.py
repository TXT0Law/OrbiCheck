import hashlib
import hmac
import importlib.util
import os
import socket
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

MODULE_NAME = "orbicheck_scanner_app"
MODULE_SPEC = importlib.util.spec_from_file_location(
    MODULE_NAME,
    Path(__file__).with_name("app.py"),
)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError("Cannot load scanner app module")
scanner_app = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_NAME] = scanner_app
MODULE_SPEC.loader.exec_module(scanner_app)

PortScanRequest = scanner_app.PortScanRequest
app = scanner_app.app
resolve_public_target = scanner_app.resolve_public_target
build_nmap_command = scanner_app.build_nmap_command

TEST_SECRET = "test-internal-service-secret-that-is-long"


def _auth_headers(method: str, target: str, body: bytes) -> dict[str, str]:
    timestamp = str(int(time.time()))
    digest = hashlib.sha256(body).hexdigest()
    payload = f"v1\n{timestamp}\n{method}\n{target}\n{digest}".encode()
    signature = hmac.new(TEST_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return {
        "X-Orbi-Timestamp": timestamp,
        "X-Orbi-Signature": f"v1={signature}",
    }


class ScannerSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["INTERNAL_SERVICE_AUTH_REQUIRED"] = "true"
        os.environ["INTERNAL_SERVICE_SECRET"] = TEST_SECRET
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        os.environ.pop("INTERNAL_SERVICE_AUTH_REQUIRED", None)
        os.environ.pop("INTERNAL_SERVICE_SECRET", None)

    def test_requires_explicit_scan_authorization(self) -> None:
        with self.assertRaises(ValidationError):
            PortScanRequest(target="example.com", profile="quick")

    def test_rejects_mixed_public_private_dns(self) -> None:
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 0)),
        ]
        with patch(f"{MODULE_NAME}.socket.getaddrinfo", return_value=answers):
            with self.assertRaisesRegex(ValueError, "blocked network"):
                resolve_public_target("mixed.example")

    def test_returns_public_ip_for_command_pinning(self) -> None:
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
        ]
        with patch(f"{MODULE_NAME}.socket.getaddrinfo", return_value=answers):
            resolved = resolve_public_target("example.com")

        self.assertEqual(resolved.hostname, "example.com")
        self.assertEqual(resolved.address, "93.184.216.34")

    def test_rejects_unsigned_scanner_request(self) -> None:
        response = self.client.post(
            "/scan/ports",
            json={
                "target": "example.com",
                "authorization_acknowledged": True,
            },
        )

        self.assertEqual(response.status_code, 401)

    def test_accepts_signature_then_applies_target_policy(self) -> None:
        body = (
            b'{"target":"127.0.0.1",'
            b'"authorization_acknowledged":true}'
        )
        response = self.client.post(
            "/scan/ports",
            content=body,
            headers={
                "Content-Type": "application/json",
                **_auth_headers("POST", "/scan/ports", body),
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_readiness_requires_nmap(self) -> None:
        with patch(f"{MODULE_NAME}.shutil.which", return_value=None):
            response = self.client.get("/ready")

        self.assertEqual(response.status_code, 503)

    def test_readiness_succeeds_when_nmap_is_available(self) -> None:
        with patch(f"{MODULE_NAME}.shutil.which", return_value="/usr/bin/nmap"):
            response = self.client.get("/ready")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})

    def test_profiles_do_not_require_root_capabilities(self) -> None:
        privileged_options = {"-O", "-A", "-sS", "--traceroute"}

        for profile in ("quick", "standard", "deep"):
            command = build_nmap_command("93.184.216.34", profile)
            self.assertTrue(privileged_options.isdisjoint(command))
            self.assertIn("-sT", command)


if __name__ == "__main__":
    unittest.main()
