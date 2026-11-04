#!/usr/bin/env python3
"""Exercise weekly report recovery using temporary PostgreSQL, Redis, Celery and SMTP."""

from __future__ import annotations

import json
import os
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[2] / "backend"
LOOPBACK = "127.0.0.1"
DB_NAME = "weekly_drill"
RECIPIENT = "weekly@example.invalid"
TIMEOUT = 60
POLL = 0.1
VISIBILITY_SECONDS = 2
SHUTDOWN_SECONDS = 5
LOG_TAIL_BYTES = 1800
CRLF = b"\r\n"


def emit(stage, **details):
    print(json.dumps({"stage": stage, **details}, sort_keys=True), flush=True)


class MailHandler(socketserver.StreamRequestHandler):
    """Store the first DATA before acknowledging it, as a real MTA can do."""

    def handle(self):
        self.connection.settimeout(TIMEOUT)
        self.wfile.write(b"220 drill.invalid ESMTP\r\n")
        while line := self.rfile.readline():
            verb = line.split(maxsplit=1)[0].upper()
            if verb == b"DATA":
                self.wfile.write(b"354 End with dot\r\n")
                contents = bytearray()
                while data := self.rfile.readline():
                    if data == b"." + CRLF:
                        break
                    contents.extend(
                        data.removeprefix(b".") if data.startswith(b"..") else data
                    )
                else:
                    return
                message = BytesParser(policy=policy.default).parsebytes(contents)
                self.server.messages.append(message)
                self.server.accepted.set()
                if not self.server.release.wait(TIMEOUT):
                    return
            elif verb == b"QUIT":
                self.wfile.write(b"221 Bye\r\n")
                return
            elif verb not in (b"HELO", b"EHLO", b"MAIL", b"RCPT", b"RSET", b"NOOP"):
                self.wfile.write(b"502 Unsupported\r\n")
                continue
            try:
                self.wfile.write(b"250 OK\r\n")
            except (BrokenPipeError, ConnectionResetError):
                return


class MailSink(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def __init__(self):
        super().__init__((LOOPBACK, 0), MailHandler)
        self.messages = []
        self.accepted = threading.Event()
        self.release = threading.Event()


def available_socket():
    sock = socket.socket()
    sock.bind((LOOPBACK, 0))
    return sock


def stop(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=SHUTDOWN_SECONDS)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=TIMEOUT)


def spawn(stack, name, command):
    log = stack.enter_context(open(f"{name}.log", "wb"))
    proc = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
    stack.callback(stop, proc)
    return proc


def wait_listening(proc, port):
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline and proc.poll() is None:
        try:
            with socket.create_connection((LOOPBACK, port), timeout=POLL):
                return
        except OSError:
            time.sleep(POLL)
    raise RuntimeError(
        f"Local server on port {port} did not start (exit {proc.poll()})"
    )


def postgres_bin(name):
    binary = shutil.which(name)
    if binary:
        return binary
    pg_config = subprocess.check_output(
        ["pg_config", "--bindir"], text=True, timeout=TIMEOUT
    )
    return str(Path(pg_config.strip()) / name)


def configure_celery():
    from app.core.celery_app import celery_app

    # Expedite a genuine refusal and natural Redis visibility redelivery in this drill.
    celery_app.conf.update(
        broker_transport_options={
            "visibility_timeout": VISIBILITY_SECONDS,
            "max_retries": 0,
            "socket_connect_timeout": 1,
        },
        result_backend_transport_options={"retry_policy": {"max_retries": 0}},
        task_publish_retry=False,
    )
    return celery_app


def start_worker(stack, name):
    return spawn(
        stack,
        name,
        [
            sys.executable,
            "-m",
            "celery",
            "-A",
            "drill_celery:celery_app",
            "worker",
            "--pool=solo",
            "--concurrency=1",
            "--loglevel=INFO",
            "--without-mingle",
            "--without-gossip",
            "--without-heartbeat",
        ],
    )


def seed_schedule():
    from app.models import (
        ReportFormat,
        ReportSchedule,
        ReportScheduleCadence,
        Scan,
        ScanStatus,
    )
    from app.tasks.scan_tasks import _get_sync_session

    now = datetime.now(timezone.utc)
    with _get_sync_session() as db:
        scan = Scan(
            url="https://scan.invalid",
            domain="scan.invalid",
            status=ScanStatus.COMPLETED,
            completed_at=now,
        )
        db.add(scan)
        db.flush()
        schedule = ReportSchedule(
            user_id=scan.user_id,
            name="Weekly drill",
            scan_id=scan.id,
            format=ReportFormat.MARKDOWN,
            cadence=ReportScheduleCadence.WEEKLY,
            timezone="UTC",
            day_of_week=now.weekday(),
            hour=now.hour,
            minute=now.minute,
            next_run_at=now - timedelta(minutes=1),
            delivery_channels=["email"],
            email_recipients=[RECIPIENT],
        )
        db.add(schedule)
        db.commit()


def snapshot():
    from sqlalchemy import select
    from app.models import Report, ReportScheduleRun
    from app.tasks.scan_tasks import _get_sync_session

    with _get_sync_session() as db:
        run = db.scalars(select(ReportScheduleRun)).one()
        reports = list(db.scalars(select(Report)))
        return (
            str(run.id),
            run.status.value,
            [str(row.id) for row in reports],
            str(run.report_id),
        )


def start_worker_with_contended_run(stack, run_id):
    """Hold the pending row until PostgreSQL shows the worker's first conflicting statement."""
    from sqlalchemy import text
    from app.tasks.scan_tasks import _get_sync_session

    with _get_sync_session() as holder, _get_sync_session() as observer:
        holder.execute(
            text("SELECT id FROM report_schedule_runs WHERE id = :run_id FOR UPDATE"),
            {"run_id": run_id},
        ).scalar_one()
        holder_pid = holder.scalar(text("SELECT pg_backend_pid()"))
        blocked_statement = text(
            "SELECT split_part(ltrim(query), ' ', 1) FROM pg_stat_activity "
            "WHERE datname = current_database() AND :holder = ANY(pg_blocking_pids(pid))"
        )
        worker = start_worker(stack, "worker-first")
        deadline = time.monotonic() + TIMEOUT
        while worker.poll() is None and time.monotonic() < deadline:
            operation = observer.scalar(blocked_statement, {"holder": holder_pid})
            observer.rollback()  # Read fresh activity on the next poll.
            if operation:
                # Without a claiming read, the worker proceeds to generate a report
                # and only blocks on its later UPDATE of this run.
                emit("pending_claim_contended", run_id=run_id, operation=operation)
                return worker, operation.upper() == "SELECT"
            time.sleep(POLL)
    raise RuntimeError("PostgreSQL did not observe the worker contending for the pending run")


def exercise(stack, redis_port, reservation, sink):
    from celery.result import denied_join_result
    from celery.signals import after_task_publish
    from redis import Redis
    from kombu.exceptions import OperationalError
    from app.tasks.report_schedule_tasks import (
        dispatch_due_report_schedules,
        generate_scheduled_report_run,
    )

    celery = configure_celery()
    seed_schedule()
    # Invoke the Beat-registered sweeper synchronously so the outage is deterministic.
    # A real worker does not subscribe to its own child task's result before publish.
    try:
        with denied_join_result():
            dispatch_due_report_schedules.run()
    except OperationalError as exc:
        emit("broker_unavailable", exception=type(exc).__name__)
    run_id, state, reports, _ = snapshot()
    assert state == "pending" and not reports, (run_id, state, reports)
    emit("committed_without_broker", run_id=run_id, state=state)

    reservation.close()
    redis = spawn(
        stack,
        "redis",
        [
            "redis-server",
            "--bind",
            LOOPBACK,
            "--port",
            str(redis_port),
            "--save",
            "",
            "--appendonly",
            "no",
        ],
    )
    wait_listening(redis, redis_port)
    with Redis(host=LOOPBACK, port=redis_port, socket_timeout=TIMEOUT) as client:
        assert client.info("server")["process_id"] == redis.pid, (
            "Unexpected Redis instance"
        )
    published = []

    @after_task_publish.connect(sender=generate_scheduled_report_run.name, weak=False)
    def observed(headers, **_kwargs):
        published.append(headers["id"])

    with denied_join_result():
        dispatch_due_report_schedules.run()
    recovered = len(published) == 1
    emit("next_beat", run_id=run_id, automatic_publications=len(published))
    if recovered:
        with denied_join_result():
            dispatch_due_report_schedules.run()
        emit(
            "repeat_tick_before_worker",
            run_id=run_id,
            total_publications=len(published),
        )
    if not published:
        # Keep the baseline red while independently testing its worker-replay behavior.
        emit("diagnostic_publish_after_failed_recovery", run_id=run_id)
        generate_scheduled_report_run.delay(run_id)
    assert len(published) == 1, published
    task_id = published[0]

    worker, claimed_before_write = start_worker_with_contended_run(stack, run_id)
    assert sink.accepted.wait(TIMEOUT), "Worker did not deliver to loopback SMTP"
    first_id, state, reports, report_id = snapshot()
    assert first_id == run_id and state == "delivering" and reports == [report_id], (
        first_id,
        state,
        reports,
        report_id,
    )
    worker.kill()
    worker.wait(timeout=TIMEOUT)
    sink.release.set()
    emit(
        "killed_before_smtp_reply",
        run_id=run_id,
        task_id=task_id,
        report_id=report_id,
        accepted=len(sink.messages),
        state=state,
    )

    # On startup Kombu restores expired unacknowledged deliveries on its own.
    time.sleep(VISIBILITY_SECONDS + POLL)
    start_worker(stack, "worker-restarted")
    result = celery.AsyncResult(task_id).get(timeout=TIMEOUT)
    final_id, final_state, final_reports, final_report_id = snapshot()
    emit(
        "redelivered",
        task_id=task_id,
        run_id=final_id,
        state=final_state,
        report_ids=final_reports,
        accepted=len(sink.messages),
        task_result=result,
    )
    body = sink.messages[0].get_body(preferencelist=("plain",)).get_content()
    assert sink.messages[0]["To"] == RECIPIENT and report_id in body, (
        "Wrong report or recipient"
    )
    assert (
        recovered
        and claimed_before_write
        and final_id == run_id
        and final_state == "delivering"
        and (
            final_reports == [report_id]
            and final_report_id == report_id
            and len(sink.messages) == 1
        )
    ), (
        "Expected automatic recovery, a locked claim, one report, one accepted mail and an ambiguous delivering run"
    )


def run_drill(root):
    os.chdir(root)  # Settings reads .env from cwd. Use only a fresh empty directory.
    clean = {
        k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG") if k in os.environ
    }
    os.environ.clear()
    os.environ.update(
        clean,
        PYTHONPATH=str(BACKEND),
        MPLCONFIGDIR=str(root / "mpl"),
        PYTHONDONTWRITEBYTECODE="1",
    )
    # Celery imports this tiny configuration only inside the isolated fixture.
    (root / "drill_celery.py").write_text(
        "from app.core.celery_app import celery_app\n"
        f"celery_app.conf.broker_transport_options = {{'visibility_timeout': {VISIBILITY_SECONDS}}}\n"
    )
    sys.path.insert(0, str(BACKEND))
    db_user = f"weekly_{uuid4().hex}"
    with ExitStack() as stack:
        sink = stack.enter_context(MailSink())
        threading.Thread(target=sink.serve_forever, daemon=True).start()
        stack.callback(sink.shutdown)
        stack.callback(sink.release.set)
        redis_socket = stack.enter_context(available_socket())
        redis_port = redis_socket.getsockname()[1]
        with available_socket() as pg_socket:
            pg_port = pg_socket.getsockname()[1]
        os.environ.update(
            APP_ENV="test",
            DATABASE_URL=f"postgresql+asyncpg://{db_user}@{LOOPBACK}:{pg_port}/{DB_NAME}",
            REDIS_URL=f"redis://{LOOPBACK}:{redis_port}/0",
            SMTP_HOST=LOOPBACK,
            SMTP_PORT=str(sink.server_address[1]),
            SMTP_USE_TLS="false",
            EMAIL_DISPATCH_ENABLED="true",
        )
        cluster = root / "pgdata"
        subprocess.run(
            [
                postgres_bin("initdb"),
                "-D",
                cluster,
                "-A",
                "trust",
                "-U",
                db_user,
                "--no-locale",
                "--encoding=UTF8",
            ],
            check=True,
            timeout=TIMEOUT,
            stdout=subprocess.DEVNULL,
        )
        pg = spawn(
            stack,
            "postgres",
            [
                postgres_bin("postgres"),
                "-D",
                cluster,
                "-h",
                LOOPBACK,
                "-p",
                str(pg_port),
                "-c",
                "unix_socket_directories=",
            ],
        )
        wait_listening(pg, pg_port)
        subprocess.run(
            [
                postgres_bin("createdb"),
                "-h",
                LOOPBACK,
                "-p",
                str(pg_port),
                "-U",
                db_user,
                DB_NAME,
            ],
            check=True,
            timeout=TIMEOUT,
        )
        from alembic import command
        from alembic.config import Config

        config = Config(str(BACKEND / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND / "app/db/migrations"))
        command.upgrade(config, "head")
        exercise(stack, redis_port, redis_socket, sink)


if __name__ == "__main__":
    if len(sys.argv) != 1 or not __debug__:
        raise SystemExit(
            "Usage: python scripts/ci/test-weekly-report-recovery.py (assertions required)"
        )
    with tempfile.TemporaryDirectory(prefix="weekly-report-drill-") as tmp:
        directory = Path(tmp).resolve()
        try:
            run_drill(directory)
        finally:
            if sys.exc_info()[0] is not None:
                for log in sorted(directory.glob("*.log")):
                    print(
                        f"[{log.name}]\n{log.read_text(errors='replace')[-LOG_TAIL_BYTES:]}",
                        file=sys.stderr,
                    )
