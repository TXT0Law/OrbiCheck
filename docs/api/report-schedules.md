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

## Recovery after a broker or worker interruption

Keep the `runId` returned by Run now. The scheduled dispatcher can publish the
same pending run after the broker recovers. Calling Run now again creates a
separate run and can produce another email.

The dispatcher checks every minute. When publication fails before a worker
claims the run, the next check can pick it up. If the publisher crashes with
an outstanding reservation, an unclaimed run becomes eligible again after
15 minutes. A manual run requested while the schedule is paused can still
execute. Pausing an enabled schedule stops a queued automatic run when the
worker next checks the schedule.

Use the schedule's runs endpoint to look up the original ID and its
`reportId`. It returns up to 50 runs and sorts runs without a start time
last. If an older or pending run is absent, an operator with database access
can look up `report_schedule_runs.id` using the original run ID.
If the worker stops in `delivering`, the receiver may already
have accepted the message. Redelivery of the task leaves the run in that
state. Check the receiving channel and the saved report before deciding on
any manual action. A run interrupted in `generating` also needs inspection.

When upgrading an installation, pause beat and run-now requests, drain or
stop workers running the previous version, apply the migration, then start
the updated workers and resume scheduling. Older workers can replay a run
that a current worker has already claimed.

Run `make test-weekly-report-recovery` as a non-root user with PostgreSQL
server tools and `redis-server` installed to exercise these failure points
against disposable services and a loopback SMTP receiver.
