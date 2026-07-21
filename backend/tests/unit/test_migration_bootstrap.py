from __future__ import annotations

from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.unit
def test_backend_entrypoint_uses_alembic_without_stamp_or_create_all() -> None:
    entrypoint = (
        REPOSITORY_ROOT / "docker" / "backend" / "entrypoint.sh"
    ).read_text(encoding="utf-8")

    assert "alembic upgrade head" in entrypoint
    assert "alembic stamp" not in entrypoint
    assert "create_all" not in entrypoint


@pytest.mark.unit
def test_postgres_init_script_does_not_precreate_application_tables() -> None:
    init_sql = (
        REPOSITORY_ROOT / "docker" / "init" / "init-db.sql"
    ).read_text(encoding="utf-8")

    assert "CREATE TABLE" not in init_sql.upper()


@pytest.mark.unit
def test_api_startup_does_not_mutate_database_schema() -> None:
    main_source = (
        REPOSITORY_ROOT / "backend" / "app" / "main.py"
    ).read_text(encoding="utf-8")

    assert "create_all" not in main_source


@pytest.mark.unit
def test_linked_backend_rebuilds_database_through_alembic() -> None:
    linked_backend_source = (
        REPOSITORY_ROOT / "scripts" / "dev" / "start-linked-backend.py"
    ).read_text(encoding="utf-8")

    assert "alembic" in linked_backend_source
    assert "create_all" not in linked_backend_source
    assert '"stamp", "head"' not in linked_backend_source


@pytest.mark.unit
def test_migration_chain_starts_with_explicit_scan_schema() -> None:
    versions = (
        REPOSITORY_ROOT / "backend" / "app" / "db" / "migrations" / "versions"
    )
    initial_source = (versions / "initial_scan_schema.py").read_text(encoding="utf-8")
    first_increment_source = (versions / "celery_task_id_on_scans.py").read_text(
        encoding="utf-8"
    )

    assert 'revision: str = "initial_scan_schema"' in initial_source
    assert 'down_revision: Union[str, None] = None' in initial_source
    assert 'op.create_table(\n        "scans"' in initial_source
    assert 'op.create_table(\n        "scan_module_results"' in initial_source
    assert 'down_revision: Union[str, None] = "initial_scan_schema"' in (
        first_increment_source
    )


@pytest.mark.unit
def test_production_compose_requires_secrets_and_secure_cookies() -> None:
    compose_source = (
        REPOSITORY_ROOT / "docker-compose.prod.yml"
    ).read_text(encoding="utf-8")

    assert "${AUTH_SESSION_SECRET:?" in compose_source
    assert "${INTERNAL_SERVICE_SECRET:?" in compose_source
    assert "${MONITOR_SECRET_ENCRYPTION_KEY:?" in compose_source
    assert 'AUTH_COOKIE_SECURE: "true"' in compose_source


@pytest.mark.unit
def test_digitalocean_spec_contains_no_deployable_secret_placeholders() -> None:
    app_spec = (
        REPOSITORY_ROOT / ".do" / "app.yaml"
    ).read_text(encoding="utf-8")

    assert "change-me-before-production" not in app_spec
    assert "replace-with-a-long-random-secret" not in app_spec
