# API Reference

Base URL: `http://localhost:8000/api/v1`

Interactive docs (when backend is running):
- Swagger UI: http://localhost:8000/api/docs
- OpenAPI JSON: http://localhost:8000/api/openapi.json
- Static OpenAPI: [`docs/openapi.json`](../openapi.json)

## Authentication

All endpoints (except `/health` and `/auth/login`) require cookie-based authentication.

```bash
# Login to get session cookie
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@orbicheck.local", "password": "change-me"}' \
  -c cookies.txt

# Use cookie in subsequent requests
curl http://localhost:8000/api/v1/scans -b cookies.txt
```

The server sets two cookies:
- `orbicheck_auth` — session token
- `orbicheck_csrf` — CSRF token (must be sent as `X-CSRF-Token` header for mutating requests)

## Unified Response Format

All endpoints return the same envelope:

```jsonc
{
  "status": "success",
  "data": { /* resource-specific payload */ },
  "meta": { "page": 1, "total": 100 }
}
```

Error responses:

```json
{
  "status": "error",
  "error": {
    "code": "SCAN_NOT_FOUND",
    "message": "Scan with id xxx not found"
  }
}
```

## Endpoint Groups

All paths below are relative to the Base URL (`/api/v1`).

- [Authentication](./auth.md)
- [Scans](./scans.md)
- [URL Groups](./url-groups.md)
- [Monitors](./monitors.md)
- [Monitor Changes](./monitor-changes.md)
- [User Settings](./user-settings.md)
- [Alerts](./alerts.md)
- [Reports](./reports.md)
- [Health](./health.md)

## HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 204 | Deleted (no body) |
| 400 | Bad request / invalid params |
| 401 | Unauthenticated |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (e.g. scan not in terminal state) |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Service unavailable (auth not configured) |
