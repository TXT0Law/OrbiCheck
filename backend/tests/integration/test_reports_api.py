from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.endpoints import reports as reports_endpoints
from app.services import report_service


def _report_row(**overrides):
    now = datetime.now(timezone.utc)
    base = {
        "id": uuid4(),
        "title": "Security Report - example.com",
        "format": "both",
        "status": "completed",
        "scan_id": uuid4(),
        "monitor_id": None,
        "monitor_period": "30d",
        "file_size_bytes": 4096,
        "error_message": None,
        "report_meta": {"scanDomain": "example.com"},
        "created_at": now,
        "completed_at": now,
        "content_md": "# Heading",
        "content_pdf": b"%PDF-1.4 fake",
        "user_id": 1,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_report_endpoint(async_client, monkeypatch) -> None:
    row = _report_row(status="pending")

    async def fake_create(*_args, **_kwargs):
        return row

    monkeypatch.setattr(report_service, "create_report", fake_create)
    monkeypatch.setattr(reports_endpoints.generate_report, "run", lambda *_args, **_kwargs: None)
    response = await async_client.post(
        "/api/v1/reports",
        json={"scanId": str(uuid4()), "format": "pdf"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["title"] == "Security Report - example.com"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_reports_endpoint(async_client, monkeypatch) -> None:
    row = _report_row()

    async def fake_list(*_args, **_kwargs):
        return [
            {
                "id": row.id,
                "title": row.title,
                "format": row.format,
                "status": row.status,
                "scanDomain": "example.com",
                "fileSizeBytes": row.file_size_bytes,
                "createdAt": row.created_at,
                "completedAt": row.completed_at,
            }
        ], {"page": 1, "limit": 20, "total": 1}

    monkeypatch.setattr(report_service, "list_reports", fake_list)
    response = await async_client.get("/api/v1/reports")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["reports"][0]["scanDomain"] == "example.com"
    assert payload["meta"]["total"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_report_preview_and_download(async_client, monkeypatch) -> None:
    row = _report_row()

    async def fake_get(_db, report_id, user_id):
        _ = report_id, user_id
        return row

    async def fake_preview(*_args, **_kwargs):
        return {
            "id": str(row.id),
            "title": row.title,
            "status": row.status,
            "contentMd": "# Heading",
            "reportMeta": row.report_meta,
        }

    async def fake_download(*_args, **_kwargs):
        return b"# Heading", "example-report.md", "text/markdown; charset=utf-8"

    monkeypatch.setattr(report_service, "get_report", fake_get)
    monkeypatch.setattr(report_service, "get_report_preview", fake_preview)
    monkeypatch.setattr(report_service, "get_report_download", fake_download)

    preview_response = await async_client.get(f"/api/v1/reports/{row.id}/preview")
    download_response = await async_client.get(f"/api/v1/reports/{row.id}/download?format=markdown")

    assert preview_response.status_code == 200
    assert preview_response.json()["data"]["contentMd"] == "# Heading"
    assert download_response.status_code == 200
    assert download_response.headers["content-disposition"] == 'attachment; filename="example-report.md"'


@pytest.mark.asyncio
@pytest.mark.integration
async def test_report_download_html_format(async_client, monkeypatch) -> None:
    row = _report_row()

    async def fake_download(_db, report_id, user_id, fmt):
        assert fmt == "html"
        _ = report_id, user_id
        return (
            b"<!doctype html><title>x</title>",
            "example-report.html",
            "text/html; charset=utf-8",
        )

    monkeypatch.setattr(report_service, "get_report_download", fake_download)

    response = await async_client.get(f"/api/v1/reports/{row.id}/download?format=html")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["content-disposition"] == 'attachment; filename="example-report.html"'
    assert response.content.startswith(b"<!doctype html>")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_report_accepts_html_and_all_formats(async_client, monkeypatch) -> None:
    """T4.2: dialog should be able to request html or all formats."""
    for fmt in ("html", "all"):
        row = _report_row(format=fmt)

        async def fake_create(*_args, **_kwargs):
            return row

        monkeypatch.setattr(report_service, "create_report", fake_create)
        monkeypatch.setattr(reports_endpoints.generate_report, "run", lambda *_args, **_kwargs: None)

        response = await async_client.post(
            "/api/v1/reports",
            json={"scanId": str(uuid4()), "format": fmt},
        )

        assert response.status_code == 201, fmt
        assert response.json()["data"]["format"] == fmt
