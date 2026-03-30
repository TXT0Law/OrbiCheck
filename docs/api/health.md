# Health Check

## GET /health

Returns service health status. Internally verifies database and Redis connectivity before responding.

No authentication required.

**Response:**

```json
{
  "status": "ok"
}
```

If either dependency (database or Redis) is unreachable, the endpoint raises an unhandled exception resulting in a `500 Internal Server Error` rather than a structured degradation response.
