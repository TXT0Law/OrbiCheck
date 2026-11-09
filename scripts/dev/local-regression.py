#!/usr/bin/env python3
"""Run production browser regressions against disposable, loopback-only services."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ("pnpm", "node", "uv", "initdb", "pg_ctl", "redis-server", "ps")
START_TIMEOUT = 120
COMMAND_TIMEOUT = 900
STOP_TIMEOUT = 10
POLL_INTERVAL = 0.2
MIN_PORT = 1024
MAX_PORT = 65535


def clean_environment():
    """Do not inherit service destinations, credentials, or deployment switches."""
    allowed = ("PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "SSL_CERT_FILE",
               "PLAYWRIGHT_BROWSERS_PATH")
    return {key: os.environ[key] for key in allowed if key in os.environ}


def available_ports(count):
    # Hold every candidate until the complete set is selected, preventing duplicates.
    with contextlib.ExitStack() as stack:
        listeners = [stack.enter_context(socket.socket()) for _ in range(count)]
        for listener in listeners:
            listener.bind(("127.0.0.1", 0))
        return [listener.getsockname()[1] for listener in listeners]


def assert_free(ports):
    for port in ports:
        if not isinstance(port, int) or not MIN_PORT <= port <= MAX_PORT:
            raise RuntimeError(f"Invalid service port: {port}")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", port))


def reject_dotenv_files():
    names = (".env", ".env.local", ".env.production", ".env.production.local",
             ".env.test", ".env.test.local")
    found = [str(directory / name) for directory in (ROOT, ROOT / "backend", ROOT / "backend/scan")
             for name in names if (directory / name).exists()]
    if found:
        raise RuntimeError("Isolated regression refuses dotenv files: " + ", ".join(found) +
                           ". Use a clean checkout without these files; no files were changed.")


def assert_unreachable(port):
    """TIME_WAIT may prevent rebinding after shutdown; require connection refusal."""
    try:
        connection = socket.create_connection(("127.0.0.1", port), timeout=1)
    except ConnectionRefusedError:
        return
    except OSError as error:
        raise RuntimeError(f"Cannot prove stopped API on port {port}: {error}") from error
    else:
        connection.close()
        raise RuntimeError(f"Stopped API port {port} still accepts connections")


def preflight():
    reject_dotenv_files()
    resolved = {name: shutil.which(name) for name in TOOLS}
    missing = [name for name, path in resolved.items() if path is None]
    python = ROOT / "backend/.venv/bin/python"
    if not python.is_file():
        missing.append("backend/.venv/bin/python (run uv sync in backend)")
    if missing:
        raise RuntimeError("Missing prerequisites: " + ", ".join(missing))
    if not Path(resolved["pg_ctl"]).with_name("postgres").is_file():
        raise RuntimeError("postgres executable must accompany pg_ctl")
    env = clean_environment()
    checks = [
        ([str(python), "-c", "import asyncpg, uvicorn, alembic, sqlalchemy, psycopg2"], ROOT / "backend"),
        ([resolved["node"], "-e", "require.resolve('next');const fs=require('fs');const {chromium}=require('@playwright/test');if(!fs.existsSync(chromium.executablePath()))throw Error('Install Playwright Chromium first');(async()=>{const browser=await chromium.launch({headless:true});try{await browser.newPage()}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1})"], ROOT),
        ([resolved["node"], "-e", "require.resolve('express')"], ROOT / "backend/scan"),
    ]
    for command, cwd in checks:
        subprocess.run(command, cwd=cwd, env=env, check=True, timeout=START_TIMEOUT,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return resolved, python


class Supervisor:
    def __init__(self, logs):
        self.logs = logs
        self.processes = []

    def start(self, name, command, env, cwd=ROOT):
        log = (self.logs / f"{name}.log").open("wb")
        try:
            process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                       stderr=subprocess.STDOUT, start_new_session=True)
        finally:
            log.close()
        self.processes.append(process)
        return process

    def run(self, name, command, env, cwd=ROOT):
        process = self.start(name, command, env, cwd)
        try:
            result = process.wait(timeout=COMMAND_TIMEOUT)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(f"{name} timed out; see {self.logs}") from error
        if result:
            raise RuntimeError(f"{name} exited {result}; see {self.logs / (name + '.log')}")

    def group_alive(self, process):
        inventory = subprocess.run([shutil.which("ps"), "-axo", "pgid="],
                                   check=True, capture_output=True, text=True,
                                   timeout=STOP_TIMEOUT)
        return str(process.pid) in inventory.stdout.split()

    def stop(self, process):
        if process not in self.processes:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            process.wait(timeout=STOP_TIMEOUT)
            self.processes.remove(process)
            return
        deadline = time.monotonic() + STOP_TIMEOUT
        while time.monotonic() < deadline:
            process.poll()
            if not self.group_alive(process):
                process.wait(timeout=STOP_TIMEOUT)
                self.processes.remove(process)
                return
            time.sleep(POLL_INTERVAL)
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=STOP_TIMEOUT)
        deadline = time.monotonic() + STOP_TIMEOUT
        while self.group_alive(process):
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Owned process group {process.pid} did not stop")
            time.sleep(POLL_INTERVAL)
        self.processes.remove(process)

    def close(self):
        for process in list(reversed(self.processes)):
            self.stop(process)


def wait_ready(process, port, path=None):
    deadline = time.monotonic() + START_TIMEOUT
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Service on port {port} exited {process.returncode}")
        try:
            if path is None:
                with socket.create_connection(("127.0.0.1", port), timeout=1):
                    return
            else:
                with opener.open(f"http://127.0.0.1:{port}{path}", timeout=1) as response:
                    if response.status == 200:
                        return
        except (OSError, urllib.error.URLError):
            time.sleep(POLL_INTERVAL)
    raise RuntimeError(f"Service on port {port} did not become ready")


@contextlib.contextmanager
def isolated_data(supervisor):
    directory = tempfile.mkdtemp(prefix="ocreg-", dir="/tmp")
    try:
        yield directory
    finally:
        # Preserve data if cleanup cannot prove all owned processes have stopped.
        supervisor.close()
        shutil.rmtree(directory)


def execute(suite):
    tools, python = preflight()
    pg_port, redis_port, scan_port, api_port, frontend_port = available_ports(5)
    assert_free((pg_port, redis_port, scan_port, api_port, frontend_port))
    # Opening an existing directory locks the shared build without creating a lock artifact.
    with open(ROOT / "package.json") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another local regression owns this checkout's build") from error
        run_id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
        logs = ROOT / "quickstart/logs/local-regression" / run_id
        logs.mkdir(parents=True)
        receipt = {"suite": suite, "status": "failed", "scan": "fixed loopback fixture; linked API deterministic scan dispatcher",
                   "ports": dict(zip(("postgres", "redis", "scan", "api", "frontend"), (pg_port, redis_port, scan_port, api_port, frontend_port))),
                   "results": str(ROOT / "test-results/local-regression" / run_id)}
        print(f"Local regression evidence: {logs}", flush=True)
        supervisor = Supervisor(logs)
        finished = False
        try:
            with isolated_data(supervisor) as temporary:
                data = Path(temporary)
                env = clean_environment()
                env.update({"DATABASE_URL": f"postgresql+asyncpg://local_regression@127.0.0.1:{pg_port}/postgres",
                            "REDIS_URL": f"redis://127.0.0.1:{redis_port}/0",
                            "NEXT_PUBLIC_API_URL": f"http://localhost:{api_port}",
                            "INTERNAL_API_URL": f"http://127.0.0.1:{api_port}",
                            "CORS_ORIGINS": json.dumps([f"http://localhost:{frontend_port}"]),
                            "APP_ENV": "test-linked", "DEBUG": "false", "EMAIL_DISPATCH_ENABLED": "false",
                            "MONITOR_INLINE_DISPATCH": "false", "MONITOR_WEBHOOK_DISPATCH_ENABLED": "false",
                            "AUTH_DEV_BYPASS_ENABLED": "false",
                            "AUTH_LOGIN_EMAIL": "admin@orbicheck.local", "AUTH_LOGIN_PASSWORD": "linked-test-password",
                            "AUTH_SESSION_SECRET": "local-regression-disposable-session-secret", "AUTH_COOKIE_SECURE": "false",
                            "RATE_LIMIT_AUTH_REQUESTS": "100", "RATE_LIMIT_SCAN_CREATE_REQUESTS": "100",
                            "SCAN_SERVICE_URL": f"http://127.0.0.1:{scan_port}",
                            "LOCAL_SCAN_PORT": str(scan_port), "LINKED_BACKEND_HOST": "127.0.0.1",
                            "LINKED_BACKEND_PORT": str(api_port), "NEXT_TELEMETRY_DISABLED": "1"})
                supervisor.run("initdb", [tools["initdb"], "-D", str(data / "pg"), "-U", "local_regression", "--auth=trust", "--no-locale"], env)
                # Run postgres in foreground so every child belongs to our supervised group.
                postgres = str(Path(tools["pg_ctl"]).with_name("postgres"))
                if not Path(postgres).is_file():
                    raise RuntimeError("postgres executable must accompany pg_ctl")
                pg = supervisor.start("postgres", [postgres, "-D", str(data / "pg"), "-h", "127.0.0.1", "-p", str(pg_port), "-k", str(data)], env)
                wait_ready(pg, pg_port)
                redis = supervisor.start("redis", [tools["redis-server"], "--bind", "127.0.0.1", "--port", str(redis_port), "--dir", str(data), "--save", "", "--appendonly", "no"], env)
                wait_ready(redis, redis_port)
                scan = supervisor.start("scan", [tools["node"], str(ROOT / "scripts/dev/local-regression/scan-fixture.mjs")], env, ROOT / "backend/scan")
                wait_ready(scan, scan_port, "/health")
                api = supervisor.start("api", [str(python), str(ROOT / "scripts/dev/start-linked-backend.py")], env, ROOT / "backend")
                wait_ready(api, api_port, "/api/v1/health")
                supervisor.run("build", [tools["pnpm"], "build"], env)
                standalone = ROOT / ".next/standalone"
                shutil.copytree(ROOT / ".next/static", standalone / ".next/static", dirs_exist_ok=True)
                if (ROOT / "public").is_dir():
                    shutil.copytree(ROOT / "public", standalone / "public", dirs_exist_ok=True)
                frontend = supervisor.start("frontend", [tools["node"], str(standalone / "server.js")], {**env, "HOSTNAME": "127.0.0.1", "PORT": str(frontend_port)})
                wait_ready(frontend, frontend_port, "/login")
                for selected in (("linked", "backend-down") if suite == "all" else (suite,)):
                    if selected == "backend-down":
                        supervisor.stop(api)
                        assert_unreachable(api_port)
                    browser_env = {**env, "LOCAL_REGRESSION_SUITE": selected,
                                   "LOCAL_REGRESSION_BASE_URL": f"http://localhost:{frontend_port}",
                                   "LOCAL_REGRESSION_OUTPUT": str(Path(receipt["results"]) / selected)}
                    supervisor.run(selected, [tools["pnpm"], "exec", "playwright", "test", "--config=playwright.local-regression.config.ts"], browser_env)
            finished = True
        except (OSError, RuntimeError, subprocess.SubprocessError, KeyboardInterrupt) as error:
            receipt["error"] = str(error)
            raise
        finally:
            try:
                supervisor.close()
                if finished:
                    receipt["status"] = "passed"
            except (OSError, RuntimeError, subprocess.SubprocessError, KeyboardInterrupt) as error:
                receipt["status"] = "failed"
                receipt["error"] = str(error)
                raise
            finally:
                (logs / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="Print the plan without probing or changing anything")
    parser.add_argument("--suite", choices=("all", "linked", "backend-down"), default="all")
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({"suite": args.suite, "prerequisites": list(TOOLS) + ["backend/.venv", "node_modules", "backend/scan/node_modules", "Playwright Chromium"],
                          "actions": ["preflight dependencies and fresh loopback ports", "lock checkout build", "create fresh PostgreSQL and Redis", "start fixed scan fixture and linked API", "build production once for explicit localhost API origin", "run selected existing browser suites; stop API for backend-down", "stop owned process groups; retain logs and receipt"],
                          "evidence": "quickstart/logs/local-regression/<unique-run>/", "results": "test-results/local-regression/<unique-run>/"}, indent=2))
        return 0
    def interrupted(signum, _frame):
        raise KeyboardInterrupt(f"Signal {signum}")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        execute(args.suite)
    except (OSError, RuntimeError, subprocess.SubprocessError, KeyboardInterrupt) as error:
        print(f"Local regression failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
