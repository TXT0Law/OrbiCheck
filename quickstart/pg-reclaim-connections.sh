#!/usr/bin/env bash
# Dev-only: disconnect other client sessions on the Web OSINT database so Alembic / API can connect.
# Use when Postgres reports "too many clients already" and you cannot restart the server.
#
# Requires: psql (PostgreSQL client), same DATABASE_URL as backend (see backend/.env).
# Does NOT terminate autovacuum or your current session; only other "client backend" rows.
#
# Usage (from repo root):
#   bash quickstart/pg-reclaim-connections.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$PROJECT_ROOT/backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/backend/.env"
  set +a
fi

RAW="${DATABASE_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/orbicheck}"
# psql does not accept the +asyncpg driver prefix
PSQL_URL="${RAW//postgresql+asyncpg:\/\//postgresql:\/\/}"
PSQL_URL="${PSQL_URL//postgres+asyncpg:\/\//postgresql:\/\/}"

if ! command -v psql >/dev/null 2>&1; then
  echo "[ERROR] psql not found. Install PostgreSQL client tools or use: brew services restart postgresql@XX"
  exit 1
fi

echo "[pg-reclaim] Terminating other client sessions on the target database (dev only)..."
echo "[pg-reclaim] If this command itself fails with \"too many clients\", restart Postgres or connect as superuser from sql."

psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) AS terminated, pid, usename, application_name, state
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND backend_type = 'client backend';
SQL

echo "[pg-reclaim] Done. Run: bash quickstart/start.sh"
