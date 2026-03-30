# Authentication

Cookie-based session authentication.

## POST /auth/login

Create a new session. Sets `orbicheck_auth` and `orbicheck_csrf` cookies.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Login email |
| `password` | string | Yes | Login password |

**Response:** `SuccessResponse[SessionResponse]`

```json
{
  "status": "success",
  "data": {
    "authenticated": true,
    "email": "admin@orbicheck.local"
  }
}
```

**Errors:**
- `503 AUTH_NOT_CONFIGURED` — `AUTH_SESSION_SECRET` not set on the server
- `401 INVALID_CREDENTIALS` — wrong email or password

---

## POST /auth/logout

Clear session cookies.

**Response:** `SuccessResponse`

```json
{
  "status": "success",
  "data": { "ok": true }
}
```

---

## GET /auth/session

Check current session status. Requires authentication.

**Response:** `SuccessResponse[SessionResponse]`

```json
{
  "status": "success",
  "data": {
    "authenticated": true,
    "email": "admin@orbicheck.local"
  }
}
```
