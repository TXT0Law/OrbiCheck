#!/usr/bin/env bash
# Quick stop: Kill Scan (4000), Backend (8000), Frontend (3000/3001/3002)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.dev-pids"

killed_any=0

# Celery worker/beat does not bind to HTTP ports. If start.sh fails during Alembic or
# .dev-pids was cleared, orphaned Celery processes keep DB pooled connections and exhaust
# Postgres max_connections. Kill by command line (project-specific celery app).
_orphan_patterns=(
  'celery -A app.core.celery_app.celery_app worker'
  'celery -A app.core.celery_app.celery_app beat'
  'uvicorn app.main:app'
)
for pattern in "${_orphan_patterns[@]}"; do
  if pkill -9 -f "$pattern" 2>/dev/null; then
    echo "[STOP] Killed processes matching: $pattern"
    killed_any=1
  fi
done

# Kill by port (most reliable; handles child processes)
for port in 4000 8000 3000 3001 3002; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[STOP] Killing process(es) on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    killed_any=1
  fi
done

# Also kill any PIDs we recorded (backup)
if [ -f "$PID_FILE" ]; then
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "[STOP] Killing recorded PID $pid"
      kill -9 "$pid" 2>/dev/null || true
      killed_any=1
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

if [ "$killed_any" -eq 0 ]; then
  echo "No Scan, backend, frontend, or matching Celery/uvicorn processes found."
else
  echo "Done. Scan, backend, and frontend stopped."
fi
