# Monitors

Continuous website monitoring — uptime, content changes, SSL expiry, visual diffs.

## CRUD

### GET /monitors

List monitors with filtering and pagination.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status |
| `search` | string | — | Search by URL |
| `page` | int | 1 | Page number (>= 1) |
| `limit` | int | 20 | Results per page (1–100) |

**Response:** `SuccessResponse[list[MonitorResponse]]`

### POST /monitors

Create a new monitor.

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `displayName` | string | Yes | — | Monitor display name (1–100 chars) |
| `url` | string | Yes | — | Target URL to monitor |
| `enabledCapabilities` | string[] | No | `["uptime_only"]` | Capabilities to enable (e.g. `uptime_only`, `content_change`, `ssl_expiry`, `visual_change`) |
| `capabilities` | object | No | — | Per-capability configuration (thresholds, intervals) |
| `intervalSeconds` | int | No | 300 | Check interval in seconds (5–3600) |
| `httpMethod` | string | No | `GET` | HTTP method for checks |
| `expectedStatusCode` | int | No | — | Expected HTTP status code (null = any 2xx) |
| `tags` | string[] | No | `[]` | Tags for organizing monitors |

**Response:** `201 SuccessResponse[MonitorResponse]`

### GET /monitors/{monitor_id}

Get monitor details.

**Response:** `SuccessResponse[MonitorResponse]`

```json
{
  "status": "success",
  "data": {
    "id": "m1b2c3d4-0000-0000-0000-000000000001",
    "displayName": "Example.com Uptime",
    "url": "https://example.com",
    "enabledCapabilities": ["uptime_only", "ssl_expiry"],
    "capabilities": {},
    "capabilityStatuses": [
      {
        "capability": "uptime_only",
        "status": "healthy",
        "lastCheckAt": "2026-03-28T14:30:00Z",
        "lastValue": "200",
        "summary": "200 OK in 142ms"
      }
    ],
    "intervalSeconds": 300,
    "httpMethod": "GET",
    "expectedStatusCode": null,
    "isEnabled": true,
    "status": "healthy",
    "lastCheckAt": "2026-03-28T14:30:00Z",
    "lastStatusCode": 200,
    "lastResponseTimeMs": 142.5,
    "lastChangeDetectedAt": null,
    "sslExpiryDays": 87,
    "totalChecks": 1024,
    "consecutiveFailures": 0,
    "uptimePercentage": 99.95,
    "avgResponseTimeMs": 156.3,
    "lastSuccess": true,
    "tags": ["production"],
    "createdAt": "2026-03-01T10:00:00Z",
    "updatedAt": "2026-03-28T14:30:00Z"
  },
  "meta": {}
}
```

> See OpenAPI schema for full field details.

### PUT /monitors/{monitor_id}

Update monitor configuration.

**Request body:** Same fields as `POST /monitors`.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `displayName` | string | Yes | — | Monitor display name (1–100 chars) |
| `url` | string | Yes | — | Target URL to monitor |
| `enabledCapabilities` | string[] | No | `["uptime_only"]` | Capabilities to enable |
| `capabilities` | object | No | — | Per-capability configuration |
| `intervalSeconds` | int | No | 300 | Check interval in seconds (5–3600) |
| `httpMethod` | string | No | `GET` | HTTP method for checks |
| `expectedStatusCode` | int | No | — | Expected HTTP status code |
| `tags` | string[] | No | `[]` | Tags for organizing monitors |

**Response:** `SuccessResponse[MonitorResponse]`

### DELETE /monitors/{monitor_id}

Delete a monitor and all its data.

**Response:** `SuccessResponse`

```json
{
  "status": "success",
  "data": { "ok": true },
  "meta": {}
}
```

### PATCH /monitors/{monitor_id}/pause

Pause a running monitor.

### PATCH /monitors/{monitor_id}/resume

Resume a paused monitor.

---

## Checks & Uptime

### POST /monitors/{monitor_id}/check

Trigger an immediate check. Subject to cooldown (`MONITOR_MANUAL_CHECK_COOLDOWN_SECONDS`, default 10s).

**Response:** `SuccessResponse[MonitorCheckResponse]`

### GET /monitors/{monitor_id}/checks

List check history.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 50 | Results per page (1–200) |
| `period` | string | `24h` | Time range: `24h`, `7d`, `30d`, `90d` |
| `success` | bool | — | Filter by success/failure |
| `sort` | string | `desc` | `asc` or `desc` |

### GET /monitors/{monitor_id}/series

Time series data for charts.

**Query parameters:** `period` (default `24h`)

**Response:** `SuccessResponse[MonitorTimeSeriesData]`

### GET /monitors/{monitor_id}/uptime

Uptime percentage summary.

**Query parameters:** `period` (default `24h`)

**Response:** `SuccessResponse[MonitorUptimeSummaryResponse]`

---

## Content Changes

### GET /monitors/{monitor_id}/changes

List content changes.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Per page (1–100) |
| `period` | string | `24h` | Time range |
| `category` | string | — | `small`, `medium`, `large` |
| `sort` | string | `desc` | `asc` or `desc` |

### GET /monitors/{monitor_id}/changes/{change_id}/diff

Get unified HTML diff for a content change.

### GET /monitors/{monitor_id}/changes/export.csv

Export content changes as CSV.

### GET /monitors/{monitor_id}/changes/export.pdf

Export content changes as PDF audit report. Requires `MONITOR_CHANGES_EXPORT_PDF_ENABLED=true`.

### GET /monitors/{monitor_id}/content/baseline

Get the current content baseline snapshot.

### GET /monitors/{monitor_id}/snapshots/{snapshot_id}/raw

Download raw snapshot content.

---

## Visual Monitoring

### GET /monitors/{monitor_id}/visual/captures

List visual screenshots.

**Query parameters:** `page`, `limit`, `period`, `sort`

### GET /monitors/{monitor_id}/visual/captures/{capture_id}/png

Download capture as PNG image.

### GET /monitors/{monitor_id}/visual/changes

List visual change events detected via perceptual hashing (dHash).

**Query parameters:** `page`, `limit`, `period`, `sort`

---

## SSL Monitoring

### GET /monitors/{monitor_id}/ssl

Get SSL certificate status and expiry info.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `live` | bool | false | If true, probe the certificate in real-time (subject to rate limit) |

**Errors:** `429 SSL_PROBE_RATE_LIMITED` when `live=true` is called too frequently.

---

## Server-Sent Events (SSE)

### GET /monitors/{monitor_id}/stream

SSE stream for a single monitor's events via Redis Pub/Sub.

### GET /monitors/live

SSE stream for all monitor events for the current user.

**Usage:**

```javascript
const source = new EventSource("/api/v1/monitors/live", {
  withCredentials: true
});
source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: "check_completed", "change_detected", "ssl_warning", etc.
};
```
