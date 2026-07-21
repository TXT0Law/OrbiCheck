# Report Schedules API

Base path: `/api/v1/report-schedules`

All routes require an authenticated single-admin session. Mutating requests
also require the CSRF cookie value in `X-CSRF-Token`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/report-schedules` | List report schedules |
| POST | `/report-schedules` | Create a schedule |
| GET | `/report-schedules/{scheduleId}` | Get a schedule |
| PUT | `/report-schedules/{scheduleId}` | Replace schedule configuration |
| DELETE | `/report-schedules/{scheduleId}` | Delete a schedule |
| POST | `/report-schedules/{scheduleId}/run-now` | Queue an immediate run |
| GET | `/report-schedules/{scheduleId}/runs` | List recent runs |

Request and response schemas are defined in the
[static OpenAPI document](../openapi.json).
