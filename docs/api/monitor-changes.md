# Monitor content changes API (external reference)

Base URL: `{ORIGIN}/api/v1` (e.g. `http://localhost:8000/api/v1`).

All endpoints require an authenticated session: the OrbiCheck **auth cookie** (`AUTH_COOKIE_NAME`, default `orbicheck_auth`) must be sent on every request (`Cookie` header). The dashboard client uses `credentials: include` / `withCredentials: true`.

Responses use the unified envelope:

```jsonc
{ "status": "success", "data": [ /* change objects */ ], "meta": { "page": 1, "limit": 20, "total": 42 } }
```

Errors:

```json
{ "status": "error", "error": { "code": "MONITOR_NOT_FOUND", "message": "Monitor not found" } }
```

Machine-readable OpenAPI: `GET /api/openapi.json`, Swagger UI: `GET /api/docs`.

---

## GET `/monitors/{monitor_id}/changes`

Lists **content_change** records (`osint_monitor_changes`) for the monitor.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `page` | int | `1` | 1-based page |
| `limit` | int | `20` | Page size (1–100) |
| `period` | string | omit | `24h` \| `7d` \| `30d` \| `90d` — filter `detectedAt >= now - period` (UTC) |
| `category` | string | omit | `small` \| `medium` \| `large` — filter by `diffSummary.changeCategory` |
| `sort` | string | `desc` | `asc` \| `desc` — sort by `detectedAt` |

### Response `data`

Array of change objects (camelCase):

- `id`, `monitorId`, `detectedAt` (ISO 8601)
- `snapshotBeforeId`, `snapshotAfterId` — snapshot UUIDs (aliases for `previousSnapshotId` / `currentSnapshotId` in JSON)
- `diffSummary` — object with at least:
  - `linesAdded`, `linesRemoved`, `linesChanged`, `totalDiffLines`
  - `changeCategory`: `small` | `medium` | `large`
  - `diffFingerprint` (optional), `previewLine` (optional)
- `changeSizeBytes`, `previousHash`, `currentHash`
- Optional **when `visual_change` is enabled** on the monitor:
  - `linkedVisualCaptureId` — UUID of the PNG row to associate with this content change (same `check_id` as the current snapshot when possible).
  - `linkedVisualCorrelation` — `check_id` | `time_window` | omitted — how the link was chosen. If screenshot capture failed for that run, the server may fall back to the nearest capture within ±`contentCorrelationWindowSeconds` (default 120s, overridable under `visual_change.thresholds`).

### Category boundaries (single source in repo)

Default line-count rules (overridable via server env `CHANGE_CATEGORY_*`):

- **small**: `totalDiffLines <= 10`
- **medium**: `totalDiffLines <= 50`
- **large**: `totalDiffLines > 50`

Client defaults are defined in `shared/constants/monitor-change-categories.ts` and must stay aligned with `backend/app/core/change_category_defaults.py` when using defaults-only UIs.

### `meta`

```json
{ "page": 1, "limit": 20, "total": 42 }
```

### HTTP status

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Unauthenticated |
| 404 | `MONITOR_NOT_FOUND` |
| 422 | Invalid query (e.g. bad `period`) |

### Example

```bash
curl -sS -b "orbicheck_auth=YOUR_TOKEN" \
  "http://localhost:8000/api/v1/monitors/UUID/changes?page=1&limit=20&period=7d&category=large&sort=desc"
```

---

## GET `/monitors/{monitor_id}/changes/export.csv`

Exports up to **N** rows (default `limit=2000`, max `5000`, capped by server `MONITOR_CHANGES_EXPORT_MAX_ROWS`) as **CSV** with UTF-8 encoding.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `period` | string | omit | Same as list: `24h` \| `7d` \| `30d` \| `90d` |
| `category` | string | omit | `small` \| `medium` \| `large` |
| `sort` | string | `desc` | `asc` \| `desc` — sort by `detectedAt` |
| `limit` | int | `2000` | `1`–`5000` |

### Columns

`id`, `detectedAt`, `category` (`changeCategory`), `linesAdded`, `linesRemoved`, `linesChanged`, `diffFingerprint`, `diffUrl` (relative API path to the diff JSON endpoint, e.g. `/api/v1/monitors/{monitor_id}/changes/{change_id}/diff` — prepend your deployment origin).

### Example

```bash
curl -sS -b "orbicheck_auth=YOUR_TOKEN" -o changes.csv \
  "http://localhost:8000/api/v1/monitors/UUID/changes/export.csv?period=7d&sort=desc&limit=2000"
```

---

## GET `/monitors/{monitor_id}/changes/export.pdf`

Optional **audit PDF** (monitor display name, URL, filter summary, table of changes). **404** when `MONITOR_CHANGES_EXPORT_PDF_ENABLED` is `false` on the server. Same query parameters as CSV export.

---

## GET `/monitors/{monitor_id}/changes/{change_id}/diff`

Returns HTML/unified diff for one change.

### Response `data`

- `changeId`, `previousContent`, `currentContent`, `diffHtml`, `unifiedDiff`
- `truncated`, `maxDisplayLength`, lengths, `diffSummary`, capture timestamps when available
- Optional `linkedVisualCaptureId` / `linkedVisualCorrelation` (same semantics as the changes list; use `GET .../visual/captures/{id}/png` to display the image).

### HTTP status

| Code | `error.code` | When |
|------|----------------|------|
| 200 | — | Success |
| 401 | — | Unauthenticated |
| 404 | `MONITOR_NOT_FOUND` | Unknown monitor or not owned by user |
| 404 | `CHANGE_NOT_FOUND` | Unknown change / wrong monitor |
| 404 | `SNAPSHOT_NOT_FOUND` | Snapshots removed by retention |

### Example

```bash
curl -sS -b "orbicheck_auth=YOUR_TOKEN" \
  "http://localhost:8000/api/v1/monitors/MONITOR_UUID/changes/CHANGE_UUID/diff"
```

---

## Rate limiting

There is **no** dedicated rate limit on these list/diff endpoints in the app layer. Deployments may enforce limits at a reverse proxy. (Live SSL probes use a separate Redis cooldown — not applicable here.)

---

## Compatibility

Monitors without **content_change** enabled still return **200** with an empty list (or only historic rows if capability was toggled over time).

---

## Visual monitoring (`visual_change`)

Screenshots are produced by the internal Scan Service (`GET /api/scan/screenshot`) with optional `viewportWidth`, `viewportHeight`, `fullPage`. Stored as PNG bytea rows; comparison uses **dHash** (64-bit) Hamming distance → `similarityPercent` in change rows.

### GET `/monitors/{monitor_id}/visual/captures`

Query: `page`, `limit`, `period` (`24h` \| `7d` \| `30d` \| `90d`), `sort`.

### GET `/monitors/{monitor_id}/visual/captures/{capture_id}/png`

Returns `image/png` with the same cookie auth as other monitor routes.

### GET `/monitors/{monitor_id}/visual/changes`

Paginated **visual change** events (when similarity to the previous capture drops **strictly below** `similarityThresholdPercent`).

### Failure modes

Scan timeouts, Playwright errors, or targets that block headless Chrome may yield **no new captures** until a successful run. Oversized images are rejected server-side (`MONITOR_VISUAL_MAX_IMAGE_BYTES`).
