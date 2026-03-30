# Reports

> **Status: Experimental** — This feature is under active development. Endpoints are functional but report generation capabilities are limited. The API surface may change in future releases.

Generate and download scan reports in PDF or Markdown format.

Requires `REPORT_GENERATION_ENABLED=true` (default).

## POST /reports

Create a new report.

**Request body:** `ReportCreateRequest`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `scanId` | uuid | Yes | — | ID of the scan to generate a report for |
| `monitorId` | uuid | No | `null` | Optional monitor ID to include monitoring data |
| `monitorPeriod` | string | No | `"30d"` | Monitor data period: `24h`, `7d`, `30d`, `90d` |
| `format` | string | No | `"pdf"` | Report format: `pdf`, `markdown`, `both` |
| `title` | string | No | `null` | Custom report title (max 512 chars) |

**Response:** `201 SuccessResponse[ReportResponse]`

```json
{
  "status": "success",
  "data": {
    "id": "r1b2c3d4-0000-0000-0000-000000000001",
    "title": "Security Report — example.com",
    "format": "pdf",
    "status": "pending",
    "scanId": "s1b2c3d4-0000-0000-0000-000000000001",
    "monitorId": null,
    "monitorPeriod": null,
    "fileSizeBytes": null,
    "errorMessage": null,
    "reportMeta": null,
    "createdAt": "2026-03-28T14:30:00Z",
    "completedAt": null
  },
  "meta": {}
}
```

---

## GET /reports

List reports with pagination and status filtering.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Per page |
| `status` | string | — | `pending`, `generating`, `completed`, `failed` |

**Response:** `SuccessResponse[ReportListResponse]`

---

## GET /reports/{report_id}

Get report metadata and status.

**Response:** `SuccessResponse[ReportResponse]`

```json
{
  "status": "success",
  "data": {
    "id": "r1b2c3d4-0000-0000-0000-000000000001",
    "title": "Security Report — example.com",
    "format": "pdf",
    "status": "completed",
    "scanId": "s1b2c3d4-0000-0000-0000-000000000001",
    "monitorId": null,
    "monitorPeriod": null,
    "fileSizeBytes": 245760,
    "errorMessage": null,
    "reportMeta": { "moduleCount": 28, "riskScore": 72 },
    "createdAt": "2026-03-28T14:30:00Z",
    "completedAt": "2026-03-28T14:31:15Z"
  },
  "meta": {}
}
```

> See OpenAPI schema for full field details.

---

## GET /reports/{report_id}/preview

Get report content preview (rendered HTML/Markdown).

**Response:** `SuccessResponse[ReportPreviewResponse]`

---

## GET /reports/{report_id}/download

Download the generated report file.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | string | `pdf` | `pdf` or `markdown` |

**Response:** File download (Content-Disposition: attachment).

---

## DELETE /reports/{report_id}

Delete a report.

**Response:** `SuccessResponse`
