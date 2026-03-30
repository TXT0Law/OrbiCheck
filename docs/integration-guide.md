# Integration Guide

How to integrate with the OrbiCheck API from external applications.

## Overview

OrbiCheck exposes a RESTful API that allows you to programmatically trigger scans, retrieve results, and manage monitors. All interactions go through the Backend API (port 8000). The Scan Service (port 4000) is internal and should not be called directly.

## Authentication

The API uses cookie-based session authentication.

### Step 1: Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@orbicheck.local", "password": "change-me"}' \
  -c cookies.txt -v
```

Save the cookies from the response — you'll need both `orbicheck_auth` and `orbicheck_csrf`.

### Step 2: Extract CSRF Token

For mutating requests (POST, PUT, PATCH, DELETE), include the CSRF token:

```bash
CSRF=$(grep orbicheck_csrf cookies.txt | awk '{print $NF}')
```

### Step 3: Make API Calls

```bash
# Read operations — just send cookies
curl http://localhost:8000/api/v1/scans -b cookies.txt

# Write operations — include CSRF header
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"url": "https://example.com"}'
```

## Common Workflows

### Run a Scan and Get Results

```bash
# 1. Create a scan
RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/scans \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"url": "https://example.com"}')

SCAN_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

# 2. Poll for completion
while true; do
  STATUS=$(curl -s http://localhost:8000/api/v1/scans/$SCAN_ID -b cookies.txt \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 5
done

# 3. Get full results
curl -s http://localhost:8000/api/v1/scans/$SCAN_ID/detail -b cookies.txt | python3 -m json.tool
```

### Stream Scan Progress (SSE)

```python
import requests

session = requests.Session()

# Login
session.post("http://localhost:8000/api/v1/auth/login", json={
    "email": "admin@orbicheck.local",
    "password": "change-me"
})

# Create scan
resp = session.post("http://localhost:8000/api/v1/scans", json={
    "url": "https://example.com"
}, headers={"X-CSRF-Token": session.cookies.get("orbicheck_csrf")})
scan_id = resp.json()["data"]["id"]

# Stream progress via SSE
with session.get(
    f"http://localhost:8000/api/v1/scans/{scan_id}/progress",
    stream=True
) as r:
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("data:"):
            print(line[5:])
```

### Get a Single Module Result

```bash
curl -s http://localhost:8000/api/v1/scans/$SCAN_ID/modules/ssl -b cookies.txt
```

### Batch Scan with URL Groups

```bash
# 1. Create a group
RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/url-groups \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"name": "My Websites"}')

GROUP_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

# 2. Add members
curl -X POST http://localhost:8000/api/v1/url-groups/$GROUP_ID/members \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"url": "https://example.com"}'
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 120 requests / 60s |
| Auth endpoints | 10 requests / 60s |
| Scan creation | 10 requests / 60s |

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait before retrying.

## Error Handling

All errors follow a consistent format:

```json
{
  "status": "error",
  "error": {
    "code": "SCAN_NOT_FOUND",
    "message": "Scan with id xxx not found"
  }
}
```

Common error codes:
- `INVALID_CREDENTIALS` — wrong login credentials
- `AUTH_NOT_CONFIGURED` — server missing `AUTH_SESSION_SECRET`
- `SCAN_NOT_FOUND` — scan ID doesn't exist
- `SCAN_NOT_TERMINAL` — trying to delete a running scan
- `MONITOR_NOT_FOUND` — monitor ID doesn't exist
- `RATE_LIMITED` — too many requests (429), check `Retry-After` header
- `SSL_PROBE_RATE_LIMITED` — SSL live probe called too frequently

## OpenAPI Schema

For complete request/response schemas, see the OpenAPI specification:
- Interactive: http://localhost:8000/api/docs
- JSON: http://localhost:8000/api/openapi.json
- Static export: [`docs/openapi.json`](./openapi.json)
