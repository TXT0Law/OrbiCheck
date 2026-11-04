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
| GET | `/report-schedules/{scheduleId}/runs/{runId}` | Get one run from this schedule, including a newly queued run |

Request and response schemas are defined in the
[static OpenAPI document](../openapi.json).

## Interpreting run history

Each entry in `GET /report-schedules/{scheduleId}/runs` and in a schedule's
`recentRuns` includes an `operations` object. Read `artifactState` and
`reportId` to identify the caller's report. Read `deliveryState`, `channels`
and `reviewReason` separately to decide whether delivery needs investigation.
A completed report can still have an unconfirmed delivery.

An accepted receipt means the sending service observed a successful handoff.
The per-channel counts retain positive receipts when other outcomes are
missing or uncertain. An explicit successful receipt with an empty channel
map represents a store-only run. Older empty summaries lack that evidence.
Use the summary recorded for the run; the schedule's current destination
settings may have changed since it ran.

The API exposes recognized channel outcomes and owner-scoped report IDs.
Recipient addresses, webhook URLs, provider diagnostics and arbitrary keys
from stored receipts are omitted from the run response. The legacy
`deliverySummary` field remains a nullable object with sanitized values.
Use `operations` for interpretation. An older negative receipt can also
represent a lost acknowledgement; verify uncertain results with the receiver
before deciding on a resend.

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

Use the single-run endpoint with the original schedule ID and run ID to
get its current state and `reportId`. It returns the same run object used
in the list. An absent run, a run under another schedule, and a schedule
owned by someone else all return `404 REPORT_SCHEDULE_RUN_NOT_FOUND`.
The history list returns up to 50 runs and sorts runs without a start
time last. The single-run lookup is independent of that list.
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
