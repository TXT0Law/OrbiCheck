"""Static regression tests for container runtime hardening."""

from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
APPLICATION_DOCKERFILES = (
    REPOSITORY_ROOT / "docker" / "frontend" / "Dockerfile",
    REPOSITORY_ROOT / "docker" / "backend" / "Dockerfile",
    REPOSITORY_ROOT / "docker" / "scan" / "Dockerfile",
    REPOSITORY_ROOT / "docker" / "scanner" / "Dockerfile",
)


def test_application_images_run_as_non_root() -> None:
    for dockerfile in APPLICATION_DOCKERFILES:
        user_lines = [
            line
            for line in dockerfile.read_text(encoding="utf-8").splitlines()
            if line.startswith("USER ")
        ]
        assert user_lines, f"{dockerfile} must declare a runtime USER"
        assert user_lines[-1] != "USER root"


def test_non_root_images_use_writable_temporary_home() -> None:
    for relative_path in (
        "docker/backend/Dockerfile",
        "docker/frontend/Dockerfile",
        "docker/scan/Dockerfile",
        "docker/scanner/Dockerfile",
    ):
        source = (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
        assert "ENV HOME=/tmp" in source

    backend_entrypoint = (
        REPOSITORY_ROOT / "docker" / "backend" / "entrypoint.sh"
    ).read_text(encoding="utf-8")
    celery_entrypoint = (
        REPOSITORY_ROOT / "docker" / "celery" / "entrypoint.sh"
    ).read_text(encoding="utf-8")
    assert "uv run" not in backend_entrypoint
    assert "uv run" not in celery_entrypoint
    backend_dockerfile = (
        REPOSITORY_ROOT / "docker" / "backend" / "Dockerfile"
    ).read_text(encoding="utf-8")
    assert "backend/uv.lock" in backend_dockerfile
    assert "uv sync --frozen --no-dev" in backend_dockerfile


def test_compose_applies_runtime_limits_and_capability_policy() -> None:
    compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "pids_limit:" in compose
    assert "mem_limit:" in compose
    assert 'cpus: "1.0"' in compose
    assert "stop_grace_period:" in compose
    assert "read_only: true" in compose
    assert "no-new-privileges:true" in compose
    assert "cap_drop:" in compose
    assert "cap_add:" not in compose
    assert "/app/.next/cache:rw,noexec,nosuid,mode=1777,size=256m" in compose
    assert "/tmp:rw,noexec,nosuid,mode=1777" in compose
    assert "/proc/1/cmdline" not in compose
    assert "inspect ping" in compose


def test_scanner_healthcheck_uses_readiness_endpoint() -> None:
    compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    scanner_source = (
        REPOSITORY_ROOT / "docker" / "scanner" / "app.py"
    ).read_text(encoding="utf-8")

    assert "http://127.0.0.1:5000/ready" in compose
    assert '@app.get("/ready")' in scanner_source
    assert 'shutil.which("nmap")' in scanner_source


def test_digitalocean_services_define_health_checks() -> None:
    app_spec = (REPOSITORY_ROOT / ".do" / "app.yaml").read_text(encoding="utf-8")

    assert app_spec.count("health_check:") == 4
    assert "http_path: /api/v1/health" in app_spec
    assert "http_path: /health" in app_spec
    assert "http_path: /ready" in app_spec


def test_backup_drill_encrypts_private_artifacts() -> None:
    source = (
        REPOSITORY_ROOT / "scripts" / "ops" / "backup-restore-drill.sh"
    ).read_text(encoding="utf-8")

    assert "umask 077" in source
    assert "BACKUP_ENCRYPTION_PASSWORD" in source
    assert "openssl enc" in source
    assert "chmod 600" in source
