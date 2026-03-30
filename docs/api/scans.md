# Scans

OSINT scan lifecycle — create, track progress, view results, retry modules, cancel, delete.

## POST /scans

Create a new scan and start async execution.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Target URL to scan |
| `modules` | string[] | No | Specific modules to run (default: all) |

**Response:** `201 SuccessResponse[ScanResponse]`

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "url": "https://example.com",
    "domain": "example.com",
    "status": "pending",
    "progress": 0,
    "created_at": "2026-03-30T00:00:00Z",
    "security_score": null
  }
}
```

---

## GET /scans

List scans with pagination and filtering.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 20 | Results per page (1–100) |
| `offset` | int | 0 | Pagination offset |
| `search` | string | — | Filter by URL or domain |
| `sort_by` | string | `created_at_desc` | Sort order |
| `status_group` | string | `all` | Filter: `all`, `pending`, `running`, `completed`, `failed`, `cancelled` |

> **Note:** Scans use `offset`/`limit` pagination. Other resources (e.g. URL Groups) use `skip`/`limit`. This is a deliberate design choice reflecting each resource's access patterns.

**Response:** `SuccessResponse[ScanListResponse]`

---

## GET /scans/{scan_id}

Get scan with all module results.

**Response:** `SuccessResponse[ScanDetailResponse]`

---

## GET /scans/{scan_id}/detail

Get full scan detail with all modules transformed for frontend consumption. Includes risk analysis (`severity`, `categorySummary`, `keyFindings`).

**Response:** `SuccessResponse` with fields: `domain`, `severity`, `moduleJobs`, `categorySummary`, `keyFindings`, `security_score`, etc.

---

## GET /scans/{scan_id}/modules/{module_name}

Get a specific module result, transformed for frontend display.

**Response:**

```jsonc
{
  "status": "success",
  "data": {
    "module": "ssl",
    "status": "completed",
    "data": { /* module-specific transformed payload */ },
    "durationMs": 1234
  }
}
```

Returns `data: null` if the module has not yet completed.

---

## POST /scans/{scan_id}/modules/{module_name}/retry

Retry a single failed or timed-out module for an existing scan.

**Response:** `SuccessResponse` with the retry result.

---

## POST /scans/{scan_id}/rescan

Re-run the same scan (same URL). Only available when the scan is in a terminal state. Resets module results and re-queues execution.

**Response:** `SuccessResponse[ScanResponse]`

---

## POST /scans/{scan_id}/cancel

Cancel a running or pending scan. Partial results are preserved.

**Response:** `SuccessResponse[ScanResponse]`

---

## DELETE /scans/{scan_id}

Delete a scan. Only terminal-state scans (completed, failed, cancelled) can be deleted.

**Response:** `204 No Content`

---

## DELETE /scans

Bulk delete scans with optional filters.

**Query parameters:** Same as `GET /scans` (`search`, `status_group`).

**Response:**

```json
{
  "status": "success",
  "data": { "deleted": 5 }
}
```

---

## GET /scans/{scan_id}/progress

Server-Sent Events endpoint for real-time scan progress.

**Content-Type:** `text/event-stream`

Each event is a JSON object with current scan status, progress percentage, and per-module status updates.

**Example usage:**

```javascript
const source = new EventSource("/api/v1/scans/{id}/progress", {
  withCredentials: true
});
source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.progress, data.status);
};
```
