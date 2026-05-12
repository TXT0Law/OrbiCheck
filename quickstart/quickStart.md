### Quick Start / Stop (Backend + Frontend)

**Prerequisites**: PostgreSQL (:5432) and Redis (:6379) must be running. If this is a first-time setup, run `cd backend && uv run alembic upgrade head` first.

**Linux / macOS:**
```bash
./quickstart/start.sh   # Start Scan (:4000) + Backend (:8000) + Frontend (:3000)
./quickstart/stop.sh    # Stop all three
```

`start.sh` automatically checks and installs Scan Service dependencies (including Playwright Chromium). The first run may take a bit longer.

> **Note**: `start.sh` uses `pkill -9` to stop old uvicorn / celery / node processes before starting. If you have other projects on the same machine using these processes, they may be accidentally terminated. On shared development machines, consider starting each service manually instead.

**Windows:**
```powershell
.\quickstart\start.bat   # Or double-click start.bat
.\quickstart\stop.bat    # Or double-click stop.bat
```
Equivalent to running the PowerShell scripts directly: `.\quickstart\start.ps1` / `.\quickstart\stop.ps1`

`start.sh` runs `pnpm build` followed by `pnpm start` to avoid chunk 404 issues that can occur with dev mode on external drives.

Local auth defaults: If `AUTH_LOGIN_EMAIL`, `AUTH_LOGIN_PASSWORD`, `AUTH_SESSION_SECRET`, and `AUTH_COOKIE_SECURE` are not set in `backend/.env`, `start.sh` automatically uses development defaults to prevent the dashboard from returning `401` due to missing session configuration. The default login email is `admin@orbicheck.local`, the default password is `change-me`, and `AUTH_COOKIE_SECURE=false` to support local `http://localhost`.

**Monitor scheduled checks**: By default, a **Celery worker + beat** is also started (`CELERY_START` defaults to `1`), which automatically runs probes at the interval you configure (e.g. every 10 seconds). If you disable Celery (`CELERY_START=0`), the script sets `MONITOR_INLINE_DISPATCH=1` for the backend, making the **uvicorn process** dispatch due checks approximately every 10 seconds instead (use one or the other — do not enable both Celery and inline dispatch on the same backend to avoid duplicate checks). If you **manually** run only `uvicorn` without `start.sh`, add `MONITOR_INLINE_DISPATCH=true` to `backend/.env`, or start the Celery worker and beat separately.

---

If services are not running, start them manually. **All three services must be running** for scans to succeed. If the Scan Service is not running, all modules will show `[Errno 61] Connection refused` (the backend cannot reach :4000).

Terminal 1 — Scan Service (port 4000, must start first):

```bash
cd backend/scan && node server.js
```

Terminal 2 — Backend (Python FastAPI):

```bash
cd backend && UV_LINK_MODE=copy uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal 3 — Frontend:

```bash
pnpm dev
```

Prerequisites: PostgreSQL (localhost:5432) and Redis (localhost:6379) must be running.
For a first-time deployment, run the database migration first:

```bash
cd backend && uv run alembic upgrade head
```

If you see "Cannot reach API" with port 65500, run `unset NEXT_PUBLIC_API_URL` and restart the frontend (that variable is used for Playwright tests).

**Optional Monitor-related environment variables** (see `backend/app/core/config.py` for details): Setting `MONITOR_CHANGES_EXPORT_PDF_ENABLED=true` in the backend enables the content changes PDF export API. The frontend also needs `NEXT_PUBLIC_MONITOR_CHANGES_EXPORT_PDF=1` in the project root `.env.local` to show the PDF download button. The live list and detail pages use `GET /api/v1/monitors/live` (SSE). Settings → Notifications lets you configure **Webhooks** (stored in Redis, events are delivered synchronously via monitor Pub/Sub).

**C-5 (rendered DOM / browser fetch mode)**: When a monitor sets `content_change.thresholds.fetchMode = "browser"`, content probes are routed through the Scan Service's Playwright pool (`/api/scan/page-source-rendered`). This requires **Chromium** to be installed under the Scan Service (the same install that screenshot/cookies modules use; `quickstart/start.sh` runs `npx playwright install chromium` automatically on first start). Browser-mode monitors are also forced to a minimum check interval of 300 seconds to keep the Chromium pool from saturating — the API rejects shorter intervals with HTTP 422. Toggle the global feature flag with `MONITOR_RENDERED_DOM_PIPELINE_ENABLED=false` to disable browser mode entirely (per-monitor `fetchMode = "browser"` then silently falls back to the cheap HTTP path).

---

### Troubleshooting: `Failed to start scan... Request failed with status code 500`

This means the backend returned a 500 error when creating a scan. Check the following in order:

1. **Is PostgreSQL (port 5432) running?**  
   If not, `createScan` will fail and return 500.
   ```bash
   # Windows: check the postgres service
   # Linux/macOS: pg_isready -h localhost -p 5432
   ```

2. **Have you run the database migration?**
   ```bash
   cd backend && uv run alembic upgrade head
   ```

3. **Did the backend start successfully?**  
   Check `quickstart/logs/backend.log`. If you see `invalid value 'copy ' for '--link-mode'`, it means `UV_LINK_MODE` had a trailing space (this was fixed in start.ps1).

4. **Are the Scan Service dependencies installed?**
   ```bash
   cd backend/scan && npm install
   ```
   If you encounter peer dependency conflicts:
   ```bash
   cd backend/scan && npm install --legacy-peer-deps
   ```

---

### Troubleshooting: Progress stuck at "Phase: quick · Queuing scan..."

This means the scan task was queued but not executed. Check the following:

1. **Is the backend (port 8000) running?**  
   If not, `createScan` will fail. If it is running but other dependencies are missing, it will hang.

2. **Is Redis (port 6379) running?**  
   ```bash
   redis-cli ping   # Should reply PONG
   ```
   Scan progress depends on Redis. If Redis is not running, progress cannot be updated.

3. **Is PostgreSQL (port 5432) running?**  
   If not, creating a scan will fail.

4. **Is the Scan Service (port 4000) running?**  
   If the Scan Service is already running, you can skip this step. Otherwise, run `cd backend/scan && node server.js`.

Recommended startup order: PostgreSQL → Redis → Scan Service (4000) → Backend (8000) → Frontend

---

### Troubleshooting: `missing required error components, refreshing...`

This is usually caused by one of the following:

1. **Multiple Next.js dev instances running simultaneously**  
   Make sure only one `pnpm dev` is running (check if ports 3000, 3001, 3002 are occupied).

2. **Deleted `.next` while dev was running**  
   Restart `pnpm dev`.

3. **Ran `pnpm build` while dev was running**  
   Stop dev first, then run build.

If the issue persists, try: `rm -rf .next && pnpm dev`





---

### Docker Compose Deployment (Alternative to Native)

If you prefer containers over native processes, the full stack can be started via Docker Compose. This requires only Docker — no local PostgreSQL, Redis, or Node.js needed.

**Start all 7 services** (postgres, redis, scan-service, backend, celery-worker, celery-beat, frontend):

```bash
bash deploy/deploy.sh
```

The script builds images, starts containers, and waits until every service is healthy. Once done:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

**Stop the stack:**

```bash
bash deploy/deploy.sh --down
```

**Production mode** (uses external PostgreSQL and Redis):

```bash
DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db" \
REDIS_URL="redis://host:6379/0" \
bash deploy/deploy.sh --prod
```

**Reset all data and volumes:**

```bash
docker compose down --remove-orphans -v
```

**Useful commands:**

```bash
docker compose ps                              # Service status
docker compose logs --no-color backend         # View backend logs
docker compose logs --no-color -f scan-service # Follow scan-service logs
docker compose exec backend bash               # Shell into backend
```

> **Note**: The backend container automatically handles database migration on startup. For fresh databases it creates tables and stamps Alembic; for existing databases it runs `alembic upgrade head`.
