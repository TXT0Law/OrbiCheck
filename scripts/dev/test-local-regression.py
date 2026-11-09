#!/usr/bin/env python3
"""Fast fail-closed fixtures; no browser, database, build, or external network."""
import importlib.util
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("local_regression", Path(__file__).with_name("local-regression.py"))
REGRESSION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REGRESSION)


class LocalRegressionTests(unittest.TestCase):
    def test_plan_has_no_preflight_or_mutation(self):
        with patch.object(REGRESSION, "preflight", side_effect=AssertionError("probe")), patch.object(REGRESSION, "execute", side_effect=AssertionError("execute")), patch("sys.argv", ["local-regression.py", "--plan"]):
            self.assertEqual(REGRESSION.main(), 0)

    def test_dotenv_files_fail_before_dependency_probes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".env.production.local").write_text("DATABASE_URL=do-not-use")
            with patch.object(REGRESSION, "ROOT", root), patch.object(REGRESSION.shutil, "which", side_effect=AssertionError("probed")):
                with self.assertRaisesRegex(RuntimeError, "refuses dotenv files"):
                    REGRESSION.preflight()
            self.assertEqual((root / ".env.production.local").read_text(), "DATABASE_URL=do-not-use")

    def test_cleanup_exception_records_failed_receipt(self):
        import contextlib
        import json
        @contextlib.contextmanager
        def failing_data(_supervisor):
            yield "/tmp/fake-only"
            raise RuntimeError("cleanup failed")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "package.json").write_text("{}")
            supervisor = unittest.mock.Mock()
            tools = {name: "/bin/true" for name in REGRESSION.TOOLS}
            with patch.object(REGRESSION, "ROOT", root), patch.object(REGRESSION, "preflight", return_value=(tools, "/bin/true")), patch.object(REGRESSION, "available_ports", return_value=[12341, 12342, 12343, 12344, 12345]), patch.object(REGRESSION, "assert_free"), patch.object(REGRESSION, "Supervisor", return_value=supervisor), patch.object(REGRESSION, "isolated_data", failing_data), patch.object(REGRESSION, "wait_ready"), patch.object(REGRESSION.shutil, "copytree"), patch.object(Path, "is_file", return_value=True):
                with self.assertRaisesRegex(RuntimeError, "cleanup failed"):
                    REGRESSION.execute("linked")
            receipts = list(root.glob("quickstart/logs/local-regression/*/receipt.json"))
            self.assertEqual(len(receipts), 1)
            self.assertEqual(json.loads(receipts[0].read_text())["status"], "failed")
            self.assertEqual(json.loads(receipts[0].read_text())["error"], "cleanup failed")

    def test_missing_tools_fail_before_services(self):
        with patch.object(REGRESSION.shutil, "which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Missing prerequisites"):
                REGRESSION.preflight()

    def test_stopped_api_requires_connection_refusal(self):
        with patch.object(REGRESSION.socket, "create_connection", side_effect=ConnectionRefusedError):
            REGRESSION.assert_unreachable(12345)
        connection = unittest.mock.Mock()
        with patch.object(REGRESSION.socket, "create_connection", return_value=connection):
            with self.assertRaisesRegex(RuntimeError, "still accepts"):
                REGRESSION.assert_unreachable(12345)
        connection.close.assert_called_once()
        for error in (TimeoutError("timeout"), OSError("unexpected")):
            with patch.object(REGRESSION.socket, "create_connection", side_effect=error):
                with self.assertRaisesRegex(RuntimeError, "Cannot prove"):
                    REGRESSION.assert_unreachable(12345)

    def test_closed_listener_with_recent_connection_is_unreachable(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with socket.create_connection(("127.0.0.1", port)) as client:
                accepted, _address = listener.accept()
                accepted.close()
                self.assertEqual(client.recv(1), b"")
        REGRESSION.assert_unreachable(port)

    def test_service_environment_discards_inherited_destinations(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://do-not-touch", "REDIS_URL": "redis://remote", "AUTH_LOGIN_PASSWORD": "private", "NEXT_PUBLIC_API_URL": "https://remote", "NODE_OPTIONS": "--require=bad"}):
            env = REGRESSION.clean_environment()
        for name in ("DATABASE_URL", "REDIS_URL", "AUTH_LOGIN_PASSWORD", "NEXT_PUBLIC_API_URL", "NODE_OPTIONS"):
            self.assertNotIn(name, env)

    def test_ports_are_unique_and_occupied_port_fails(self):
        ports = REGRESSION.available_ports(5)
        self.assertEqual(len(set(ports)), 5)
        REGRESSION.assert_free(ports)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            with self.assertRaises(OSError):
                REGRESSION.assert_free([listener.getsockname()[1]])
        with self.assertRaises(RuntimeError):
            REGRESSION.assert_free([0])

    def test_failed_subprocess_is_reported_and_logs_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            supervisor = REGRESSION.Supervisor(Path(temporary))
            try:
                with self.assertRaisesRegex(RuntimeError, "exited 7"):
                    supervisor.run("failure", [os.sys.executable, "-c", "print('evidence');raise SystemExit(7)"], REGRESSION.clean_environment())
                self.assertIn("evidence", (Path(temporary) / "failure.log").read_text())
            finally:
                supervisor.close()

    def test_cleanup_stops_only_owned_process(self):
        with tempfile.TemporaryDirectory() as temporary:
            supervisor = REGRESSION.Supervisor(Path(temporary))
            unrelated = subprocess.Popen([os.sys.executable, "-c", "import time;time.sleep(60)"], start_new_session=True)
            owned = supervisor.start("owned", [os.sys.executable, "-c", "import time;time.sleep(60)"], REGRESSION.clean_environment())
            try:
                supervisor.close()
                self.assertIsNotNone(owned.poll())
                self.assertIsNone(unrelated.poll())
                supervisor.close()
            finally:
                os.killpg(unrelated.pid, signal.SIGTERM)
                unrelated.wait(timeout=REGRESSION.STOP_TIMEOUT)

    def test_data_is_preserved_if_cleanup_cannot_stop_processes(self):
        supervisor = unittest.mock.Mock()
        supervisor.close.side_effect = RuntimeError("still alive")
        with tempfile.TemporaryDirectory() as parent:
            directory = Path(parent) / "owned-data"
            directory.mkdir()
            with patch.object(REGRESSION.tempfile, "mkdtemp", return_value=str(directory)):
                with self.assertRaisesRegex(RuntimeError, "still alive"):
                    with REGRESSION.isolated_data(supervisor):
                        pass
            self.assertTrue(directory.exists())

    def test_local_config_forbids_focused_tests(self):
        config = (REGRESSION.ROOT / "playwright.local-regression.config.ts").read_text()
        self.assertIn("forbidOnly: true", config)

    def test_cleanup_escalates_for_child_ignoring_term(self):
        with tempfile.TemporaryDirectory() as temporary:
            supervisor = REGRESSION.Supervisor(Path(temporary))
            program = "import os,signal,time; child=os.fork(); signal.signal(signal.SIGTERM,signal.SIG_IGN) if child == 0 else None; time.sleep(60)"
            process = supervisor.start("children", [os.sys.executable, "-c", program], REGRESSION.clean_environment())
            try:
                import time
                time.sleep(REGRESSION.POLL_INTERVAL)
                with patch.object(REGRESSION, "STOP_TIMEOUT", 2):
                    supervisor.close()
                self.assertIsNotNone(process.poll())
                self.assertFalse(supervisor.group_alive(process))
            finally:
                supervisor.close()

    def test_readiness_ignores_ambient_proxy(self):
        process = unittest.mock.Mock()
        process.poll.return_value = None
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.status = 200
        opener = unittest.mock.Mock()
        opener.open.return_value = response
        with patch.object(REGRESSION.urllib.request, "ProxyHandler") as proxy, patch.object(REGRESSION.urllib.request, "build_opener", return_value=opener):
            REGRESSION.wait_ready(process, 12345, "/login")
        proxy.assert_called_once_with({})
        opener.open.assert_called_once_with("http://127.0.0.1:12345/login", timeout=1)

    def test_frontend_readiness_uses_public_login_not_root_redirect(self):
        source = (REGRESSION.ROOT / "scripts/dev/local-regression.py").read_text()
        self.assertIn('wait_ready(frontend, frontend_port, "/login")', source)

    def test_readiness_rejects_failed_process(self):
        process = unittest.mock.Mock()
        process.poll.return_value = 1
        process.returncode = 1
        with self.assertRaisesRegex(RuntimeError, "exited 1"):
            REGRESSION.wait_ready(process, 12345)


if __name__ == "__main__":
    unittest.main()
