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

Set `rescanBeforeReport: true` when creating or updating a schedule to run a
new scan before each report. The default is `false` for existing and new
schedules. Fresh scans preserve the source scan's module selection and scan
options; the source scan remains available for historical comparison. If the
new scan fails, the scheduled run fails without delivering a stale report.
Each run response includes `scanId` for the fresh scan when this option is on.

Request and response schemas are defined in the
[static OpenAPI document](../openapi.json).
