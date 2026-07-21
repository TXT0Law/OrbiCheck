# OrbiCheck Operations

## Runtime hardening

Application images run as non-root users. Docker Compose sets `no-new-privileges`,
drops all capabilities, uses read-only root filesystems with bounded `tmpfs`,
enables an init process, and defines CPU, memory, PID, and graceful-stop limits.
Scanner profiles use TCP connect scans and intentionally omit privileged nmap
OS-detection/raw-packet options.

Backend readiness checks PostgreSQL and Redis. Scan Service starts listening only
after its module registry loads. Scanner `/ready` verifies that nmap is installed;
`/health` remains a process liveness endpoint.

## Backup and restore drill

With the local Compose PostgreSQL service running:

```bash
BACKUP_ENCRYPTION_PASSWORD="$(openssl rand -base64 32)" make backup-restore-drill
```

The drill creates a mode-0600 custom-format `pg_dump` under a private temporary
path, encrypts the persisted artifact with AES-256-CBC/PBKDF2, decrypts it into
another private temporary file, validates and restores it into an isolated
database, verifies public tables and the Alembic revision, then removes all
plaintext temporary files. Backups are written under `backups/` by default; set
`BACKUP_DIRECTORY` or pass an explicit encrypted output path:

```bash
BACKUP_ENCRYPTION_PASSWORD="..." \
  bash scripts/ops/backup-restore-drill.sh /secure/path/orbicheck.dump.enc
```

Production backups must be encrypted, stored outside the application host, and
tested against a disposable database using the same PostgreSQL major version.
Record the artifact checksum, Alembic revision, start/end times, and operator.

## Trace correlation

Backend scan clients propagate `X-Scan-Id` and `X-Trace-Id` to Scan Service.
Scan Service echoes both headers and binds them to structured logs. Celery scan,
monitor, report, notification, and URL-group paths persist the relevant trace ID
in operational events. During incident response, begin with the user-visible
scan/report/monitor ID and follow the matching trace ID across services.

## Initial service objectives

These are starting objectives, not guarantees:

- API availability: 99.9% successful non-5xx responses over 30 days.
- API latency: 95% of non-streaming requests complete within 500 ms, excluding
  scan execution.
- Scan reliability: 99% of accepted scan jobs reach a terminal state within
  their configured timeout.
- Monitor freshness: 99% of enabled checks begin within one configured interval
  plus five minutes.
- Alert delivery: 99% of accepted deliveries reach a terminal state within five
  minutes.

Review objectives monthly against Prometheus metrics and operational events.
Alert on sustained error-budget burn rather than isolated provider failures.
