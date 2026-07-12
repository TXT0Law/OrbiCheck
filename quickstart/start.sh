#!/usr/bin/env bash
# Quick start: Scan (4000) + Backend (8000) + Frontend (production build)
# Run from project root or quickstart folder.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$SCRIPT_DIR/.dev-pids"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"
cd "$PROJECT_ROOT"

# Celery worker + beat dispatch monitor checks on a schedule. Default on; set CELERY_START=0 to skip
# (backend then uses MONITOR_INLINE_DISPATCH=1 so uvicorn runs checks in-process).
CELERY_START="${CELERY_START:-1}"
# Local auth defaults keep dashboard APIs usable even when backend/.env only contains DB/SMTP settings.
AUTH_LOGIN_EMAIL="${AUTH_LOGIN_EMAIL:-admin@orbicheck.local}"
AUTH_LOGIN_PASSWORD="${AUTH_LOGIN_PASSWORD:-change-me}"
AUTH_SESSION_SECRET="${AUTH_SESSION_SECRET:-dev-only-change-me-session-secret}"
AUTH_COOKIE_SECURE="${AUTH_COOKIE_SECURE:-false}"
AUTH_DEV_BYPASS_ENABLED="${AUTH_DEV_BYPASS_ENABLED:-true}"
NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED="${NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED:-true}"
export AUTH_LOGIN_EMAIL AUTH_LOGIN_PASSWORD AUTH_SESSION_SECRET AUTH_COOKIE_SECURE
export AUTH_DEV_BYPASS_ENABLED NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED
# Max concurrent Celery tasks per worker process pool (prefork = this many child processes).
# Each active scan or monitor check may hold a DB connection for the whole task; cap this on small Postgres
# max_connections. Default 10; raise for heavier hardware or raise Postgres max_connections instead.
CELERY_WORKER_CONCURRENCY="${CELERY_WORKER_CONCURRENCY:-10}"

# Clean up any existing PIDs from previous run
: > "$PID_FILE"

echo "Project root: $PROJECT_ROOT"
echo "[AUTH] Development bypass: $AUTH_DEV_BYPASS_ENABLED"
echo "[AUTH] AUTH_COOKIE_SECURE=$AUTH_COOKIE_SECURE"
echo ""

# Check if Scan service (4000) already running
if lsof -ti :4000 >/dev/null 2>&1; then
  echo "[SKIP] Scan service already running on port 4000"
else
  echo "[START] Scan service (Node.js :4000)..."
  # Ensure deps installed (Playwright Chromium via postinstall)
  if [ ! -d "backend/scan/node_modules" ]; then
    echo "  -> Installing scan deps (playwright chromium)..."
    (cd backend/scan && npm install) >> "$LOG_DIR/scan.log" 2>&1
  fi
  (cd backend/scan && node server.js) >> "$LOG_DIR/scan.log" 2>&1 &
  echo $! >> "$PID_FILE"
  sleep 4
  echo "  -> Scan service started (log: $LOG_DIR/scan.log)"
fi

# Check if backend (8000) already running
if lsof -ti :8000 >/dev/null 2>&1; then
  echo "[SKIP] Backend already running on port 8000"
else
  # Orphan Celery/uvicorn holds DB connections but does not listen on :8000; stop.sh may have missed them.
  echo "[CLEAN] Stopping stray Celery/uvicorn for this app (frees Postgres connections before migrate)..."
  pkill -9 -f 'celery -A app.core.celery_app.celery_app worker' 2>/dev/null || true
  pkill -9 -f 'celery -A app.core.celery_app.celery_app beat' 2>/dev/null || true
  pkill -9 -f 'uvicorn app.main:app' 2>/dev/null || true
  sleep 1

  echo "[MIGRATE] Alembic upgrade head (required when ORM/schema changes)..."
  _alembic_tmp="$(mktemp "${TMPDIR:-/tmp}/orbicheck-alembic.XXXXXX")"
  _run_alembic_to_tmp() {
    (cd backend && UV_LINK_MODE=copy uv run alembic upgrade head) >> "$_alembic_tmp" 2>&1
  }
  if ! _run_alembic_to_tmp; then
    cat "$_alembic_tmp" >> "$LOG_DIR/backend.log"
    if grep -qiE 'too many clients|too many connections|TooManyConnectionsError' "$_alembic_tmp" 2>/dev/null; then
      rm -f "$_alembic_tmp"
      echo ""
      echo "[RETRY] Postgres connection limit hit — reclaiming other sessions (dev)..."
      if bash "$SCRIPT_DIR/pg-reclaim-connections.sh"; then
        _alembic_tmp="$(mktemp "${TMPDIR:-/tmp}/orbicheck-alembic.XXXXXX")"
        if _run_alembic_to_tmp; then
          cat "$_alembic_tmp" >> "$LOG_DIR/backend.log"
          rm -f "$_alembic_tmp"
          echo "[RETRY] Alembic succeeded after pg-reclaim."
        else
          cat "$_alembic_tmp" >> "$LOG_DIR/backend.log"
          rm -f "$_alembic_tmp"
          echo ""
          echo "[ERROR] Alembic still failed after reclaim (see $LOG_DIR/backend.log)."
          echo "  Try: $SCRIPT_DIR/stop.sh  then  brew services restart postgresql@XX"
          exit 1
        fi
      else
        echo ""
        echo "[ERROR] pg-reclaim-connections.sh failed — free connections manually or restart Postgres."
        exit 1
      fi
    else
      rm -f "$_alembic_tmp"
      echo ""
      echo "[ERROR] Alembic failed (output appended to $LOG_DIR/backend.log)."
      echo ""
      echo "If the log says \"Can't locate revision\", your DB still has an old revision id after migration renames."
      echo "Example (schema already applied, only fix the stamp):"
      echo "  psql \"\$DATABASE_URL\" -c \"UPDATE alembic_version SET version_num = 'ssl_snapshot_and_last_probe' WHERE version_num = '010_ssl_snap';\""
      exit 1
    fi
  else
    cat "$_alembic_tmp" >> "$LOG_DIR/backend.log"
    rm -f "$_alembic_tmp"
  fi
  echo "[START] Backend (uvicorn :8000)..."
  if [ "$CELERY_START" = "1" ]; then
    _MONITOR_INLINE_DISPATCH=0
  else
    _MONITOR_INLINE_DISPATCH=1
  fi
  (cd backend && MONITOR_INLINE_DISPATCH="$_MONITOR_INLINE_DISPATCH" UV_LINK_MODE=copy uv run uvicorn app.main:app --host 0.0.0.0 --port 8000) >> "$LOG_DIR/backend.log" 2>&1 &
  echo $! >> "$PID_FILE"
  sleep 2
  echo "  -> Backend started (log: $LOG_DIR/backend.log)"
fi

# Check if frontend (3000) already running
if lsof -ti :3000 >/dev/null 2>&1; then
  echo "[SKIP] Frontend already running on port 3000"
else
  echo "[CLEAN] Removing stale .next..."
  rm -rf "$PROJECT_ROOT/.next"
  echo "[BUILD] Building frontend (avoids dev-server chunk 404 on external drives)..."
  (cd "$PROJECT_ROOT" && pnpm build) >> "$LOG_DIR/frontend.log" 2>&1
  echo "[START] Frontend (pnpm start :3000)..."
  (cd "$PROJECT_ROOT" && pnpm start) >> "$LOG_DIR/frontend.log" 2>&1 &
  echo $! >> "$PID_FILE"
  sleep 3
  echo "  -> Frontend started (log: $LOG_DIR/frontend.log)"
fi

# Celery worker + Beat (monitor check dispatcher, matches beat_schedule every 10s).
if [ "$CELERY_START" = "1" ]; then
  echo "[START] Celery worker (scan + monitor tasks)..."
  (cd backend && UV_LINK_MODE=copy uv run celery -A app.core.celery_app.celery_app worker --loglevel=info --concurrency="$CELERY_WORKER_CONCURRENCY") >> "$LOG_DIR/celery-worker.log" 2>&1 &
  echo $! >> "$PID_FILE"
  echo "[START] Celery beat (dispatch monitor checks every 10s)..."
  (cd backend && UV_LINK_MODE=copy uv run celery -A app.core.celery_app.celery_app beat --loglevel=info) >> "$LOG_DIR/celery-beat.log" 2>&1 &
  echo $! >> "$PID_FILE"
  echo "  -> Celery logs: $LOG_DIR/celery-worker.log , $LOG_DIR/celery-beat.log"
fi

echo ""
echo "Done. Scan: http://localhost:4000  |  Backend: http://localhost:8000  |  Frontend: http://localhost:3000"
if [ "$CELERY_START" = "1" ]; then
  echo "Celery worker+beat started (monitor intervals are enforced). Logs: $LOG_DIR/celery-worker.log , $LOG_DIR/celery-beat.log"
else
  echo "Celery skipped: backend uses in-process monitor dispatch (MONITOR_INLINE_DISPATCH=1). Set CELERY_START=1 for Celery instead."
fi
echo "To stop: $SCRIPT_DIR/stop.sh (or ./quickstart/stop.sh from project root)"
