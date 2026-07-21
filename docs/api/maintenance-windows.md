# Maintenance Windows API

Base path: `/api/v1/maintenance-windows`

Maintenance windows suppress configured monitor probes or alerts for a bounded
time range. They may be scoped to a monitor or tags and can include recurrence.
All routes require authentication; mutations require CSRF protection.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/maintenance-windows` | List windows, optionally filtered by monitor |
| POST | `/maintenance-windows` | Create a window |
| PATCH | `/maintenance-windows/{windowId}` | Update selected fields |
| DELETE | `/maintenance-windows/{windowId}` | Delete a window |

Request and response schemas are defined in the
[static OpenAPI document](../openapi.json).
