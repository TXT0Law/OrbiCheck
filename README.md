# OrbiCheck

[![CI](https://github.com/TXT0Law/OrbiCheck/actions/workflows/ci.yml/badge.svg)](https://github.com/TXT0Law/OrbiCheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)]()

An external-perspective website security assessment platform. Provide a URL, get a full reconnaissance report — covering IP, DNS, SSL/TLS, HTTP headers, tech stack, threat intelligence, and 30+ more modules — all from an outsider's point of view.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
  - [Scan](#scan)
  - [Monitoring](#monitoring)
  - [Alerts](#alerts)
  - [Reports](#reports)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone the Repository](#clone-the-repository)
  - [Frontend Setup](#frontend-setup)
  - [Backend Setup](#backend-setup)
  - [Scan Service Setup](#scan-service-setup)
  - [Database Migration](#database-migration)
  - [Start All Services](#start-all-services)
- [Docker Deployment](#docker-deployment)
  - [One-Command Start](#one-command-start)
  - [Production Mode](#production-mode)
  - [Docker Services](#docker-services)
  - [DigitalOcean App Platform](#digitalocean-app-platform)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Acknowledgments](#acknowledgments)
- [Contributing](#contributing)
- [License](#license)

---

## Features

**OSINT Reconnaissance** — 30+ automated modules that probe a target URL from the outside:

| Category | Modules |
|----------|---------|
| Network | IP geolocation, DNS records, DNS server, TXT records, WHOIS, traceroute, open ports |
| SSL / TLS | Certificate chain analysis, cipher suites, protocol versions |
| Security | HTTP security headers, HSTS, DNSSEC, WAF detection, security.txt |
| Content | HTTP headers, cookies, robots.txt, sitemap, linked pages |
| Threat Intel | Malware/phishing detection, blocklist lookups |
| Site Profile | Tech stack (Wappalyzer + header fingerprint), social tags, quality metrics, screenshots |
| Other | Wayback Machine archives, email config (SPF/DKIM/DMARC), global ranking, carbon footprint |

**Real-time Progress** — SSE-powered live updates as each module completes.

**Risk Analysis** — Automated severity scoring and category summaries derived from raw scan data.

**Continuous Monitoring** — Track uptime, content changes, SSL expiry, and visual diffs over time.

**URL Groups** — Organize targets and run batch scans across multiple URLs.

---

## Screenshots

UI walkthrough grouped by area (static assets live in [`docs/assets`](docs/assets)).

### Scan

![New scan — URL input](docs/assets/scan_page.png)

![Scan dashboard — module grid and progress](docs/assets/scan_dashboard.png)

![Scan module — screenshot capture](docs/assets/scan_screenshot.png)

### Monitoring

![Add monitor — new target setup](docs/assets/adding_monitor.png)

![Monitor settings — thresholds and capabilities](docs/assets/monitor_setting.png)

![Content change timeline and diff](docs/assets/Monitor_Content_Changes.png)

![Visual change detection](docs/assets/Monitor_Visual_Changes.png)

![Monitor management overview](docs/assets/management_system.png)

### Alerts

![Alerts list and events](docs/assets/alert_page.png)

![Alert delivery and channel settings](docs/assets/alert_setting.png)

![Alert email notification](docs/assets/alert_email.png)

### Reports

![Generated report](docs/assets/report.png)

---

## Architecture

```
Frontend (Next.js :3000)          ← Project root (monorepo)
    |  REST + SSE
    v
Backend (FastAPI :8000)
    |-- HTTP --> Scan Service (Node.js Express :4000)
    |-- --> Redis (:6379)          Cache + task broker
    |-- --> PostgreSQL (:5432)     Data persistence
    |
    |-- Celery worker              Async scan tasks + scheduled monitoring
    '-- Celery beat                Periodic task scheduler
```

The frontend communicates only with the backend. The Scan Service is an internal service that wraps 30+ OSINT modules and is called exclusively by the backend via HTTP.

All seven services (frontend, backend, scan-service, celery-worker, celery-beat, postgres, redis) can be started with a single command using Docker Compose — see [Docker Deployment](#docker-deployment).

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20 LTS | Frontend + Scan Service |
| pnpm | >= 9 | Frontend package manager |
| npm | (bundled with Node) | Scan Service package manager |
| Python | >= 3.11 | Backend |
| uv | latest | Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/)) |
| PostgreSQL | >= 16 | Database |
| Redis | >= 7 | Cache and task queue |

### Clone the Repository

```bash
git clone https://github.com/TXT0Law/OrbiCheck.git
cd OrbiCheck
```

### Automated Setup

Run the setup script to install all dependencies at once:

```bash
bash scripts/dev/setup.sh
```

This installs frontend, backend, and scan service dependencies, copies `.env.example` files, and runs database migrations. You can also set things up manually as described below.

### Frontend Setup

The frontend lives at the project root (no separate `frontend/` directory).

```bash
pnpm install
```

### Backend Setup

```bash
cd backend
uv venv
uv pip install -e ".[dev]"
```

Copy the environment file and edit it with your local settings:

```bash
cp .env.example .env
# Edit backend/.env — at minimum set DATABASE_URL, REDIS_URL, and AUTH_SESSION_SECRET
```

### Scan Service Setup

```bash
cd backend/scan
npm install
npx playwright install chromium   # Required for the screenshot module
```

Optionally copy and configure the Scan Service env:

```bash
cp .env.example .env
# Optional: set IPINFO_TOKEN, BUILT_WITH_API_KEY, etc.
```

### Database Migration

Make sure PostgreSQL is running, then:

```bash
cd backend
uv run alembic upgrade head
```

### Start All Services

You need **three services** running simultaneously. Start them in order:

**Terminal 1 — Scan Service (port 4000)**

```bash
cd backend/scan
node server.js
```

**Terminal 2 — Backend API (port 8000)**

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Terminal 3 — Frontend (port 3000)**

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. Default login credentials:
- Email: `admin@orbicheck.local`
- Password: `change-me`

> **Security Warning**: These are development-only defaults. For any non-local deployment, you **must** change `AUTH_LOGIN_EMAIL`, `AUTH_LOGIN_PASSWORD`, and set a strong random value for `AUTH_SESSION_SECRET` in `backend/.env`. Never use the default credentials in production.

> **Quickstart script**: If PostgreSQL and Redis are already running locally, you can use `bash quickstart/start.sh` to start all three services in one command. See `quickstart/quickStart.md` for details.

> **Docker**: Prefer `bash deploy/deploy.sh` for a fully containerised stack (includes PostgreSQL, Redis, Celery). No local dependencies required beyond Docker. See [Docker Deployment](#docker-deployment).

---

## Docker Deployment

The full stack is containerised via Docker Compose. All seven services (postgres, redis, scan-service, backend, celery-worker, celery-beat, frontend) are orchestrated with health checks and dependency ordering.

### One-Command Start

```bash
bash deploy/deploy.sh
```

This will:
1. Copy `.env.example` files if missing
2. Build all Docker images (multi-stage)
3. Start the full stack (`docker compose up -d`)
4. Wait for every service to report healthy

Once complete, open http://localhost:3000 (frontend) and http://localhost:8000 (backend).

To stop:

```bash
bash deploy/deploy.sh --down
```

To reset all data (removes volumes):

```bash
docker compose down --remove-orphans -v
```

### Production Mode

Production mode uses external PostgreSQL and Redis instead of the local containers:

```bash
DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db" \
REDIS_URL="redis://host:6379/0" \
bash deploy/deploy.sh --prod
```

This starts the app services only (postgres and redis containers are scaled to 0). The `docker-compose.prod.yml` override injects the external connection strings.

### Docker Services

| Service | Image / Dockerfile | Port | Notes |
|---------|-------------------|------|-------|
| **postgres** | `postgres:16-alpine` | 5432 (internal) | Data persisted via named volume |
| **redis** | `redis:7-alpine` | 6379 (internal) | AOF persistence |
| **scan-service** | `docker/scan/Dockerfile` | 4000 (internal) | Alpine + system Chromium (no Playwright download) |
| **backend** | `docker/backend/Dockerfile` | 8000 (published) | Auto-runs Alembic migration on startup |
| **celery-worker** | same as backend | — | `CELERY_MODE=worker` |
| **celery-beat** | same as backend | — | `CELERY_MODE=beat` |
| **frontend** | `docker/frontend/Dockerfile` | 3000 (published) | Next.js standalone output |

Key design decisions:
- **scan-service** uses `node:20-alpine` + system `chromium` package instead of the Playwright base image, avoiding flaky browser downloads during build
- **backend** entrypoint handles fresh databases (creates tables + `alembic stamp head`) and existing databases (`alembic upgrade head`) automatically
- **celery-worker** and **celery-beat** share the backend image and are routed by the `CELERY_MODE` env var
- **frontend** uses multi-stage build with `output: "standalone"` and rewrites `/api/v1/*` to the internal backend hostname

### DigitalOcean App Platform

A `.do/app.yaml` spec is included for DigitalOcean App Platform deployment. It defines all services, workers, managed databases (Postgres + Redis), and ingress routing rules. Adjust secrets (`AUTH_SESSION_SECRET`, `AUTH_LOGIN_PASSWORD`) before deploying.

### Useful Docker Commands

```bash
docker compose ps                          # Service status
docker compose logs --no-color backend     # View backend logs
docker compose logs --no-color -f frontend # Follow frontend logs
docker compose exec backend bash           # Shell into backend container
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `SCAN_SERVICE_URL` | `http://localhost:4000` | Internal Scan Service URL |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `AUTH_LOGIN_EMAIL` | `admin@orbicheck.local` | Login email |
| `AUTH_LOGIN_PASSWORD` | `change-me` | Login password |
| `AUTH_SESSION_SECRET` | — | Secret for session signing (required — use a long random string; do not use the default in production) |
| `AUTH_COOKIE_SECURE` | `false` | Set `true` in production (HTTPS) |

See `backend/.env.example` for the full list including SMTP settings.

### Frontend (`.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API URL |

Copy the root example file:

```bash
cp .env.example .env.local
```

### Scan Service (`backend/scan/.env`)

All variables are optional. See `backend/scan/.env.example` for available options like `IPINFO_TOKEN` and `BUILT_WITH_API_KEY`.

---

## API Documentation

When the backend is running, interactive API docs are available at:

- **Swagger UI**: http://localhost:8000/api/docs
- **OpenAPI JSON**: http://localhost:8000/api/openapi.json

### Key Endpoints

```
POST   /api/v1/scans              Create a new scan
GET    /api/v1/scans              List scans
GET    /api/v1/scans/{id}         Get scan status
GET    /api/v1/scans/{id}/detail  Get full scan results (with risk analysis)
POST   /api/v1/scans/{id}/cancel  Cancel a running scan
GET    /api/v1/scans/{id}/progress  SSE — real-time scan progress

CRUD   /api/v1/url-groups         URL group management
CRUD   /api/v1/monitors           Continuous monitoring ⚠
GET    /api/v1/monitors/live      SSE — monitor live updates ⚠
GET    /api/v1/alerts             Alert events ⚠
POST   /api/v1/reports            Generate reports ⚠
GET    /api/v1/health             Health check
```

> Scan and URL Group endpoints are stable. Monitor, Alert, and Report endpoints (marked ⚠) are functional but under active development — their API surface may evolve.

All responses follow a unified format:

```json
{
  "status": "success",
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}
```

For complete documentation, see:
- [API Reference](docs/api/README.md) — all endpoints with request/response details
- [Scan Modules](docs/scan-modules.md) — 30+ OSINT module catalog
- [Integration Guide](docs/integration-guide.md) — how to use the API from external applications
- [Static OpenAPI Schema](docs/openapi.json) — machine-readable API specification

---

## Testing

```bash
# Run all tests
make test

# Frontend unit tests (Vitest)
make test-frontend

# Backend tests (pytest — all marks)
make test-backend

# Backend unit / integration / e2e separately
make test-backend-unit
make test-backend-integration
make test-backend-e2e

# Scan Service tests (Jest)
make test-osint

# Watch mode
make test-watch

# Coverage report
make test-cov

# Connected frontend-backend tests (Playwright)
# Requires all services running
pnpm test:linked
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Recharts |
| State | Zustand (client), TanStack Query (server) |
| Backend API | Python FastAPI, SQLAlchemy (async), Pydantic |
| Task Queue | Celery + Redis |
| Scan Service | Node.js, Express |
| Database | PostgreSQL + Alembic migrations |
| Cache | Redis |
| Testing | Vitest, Playwright, pytest, Jest |

---

## Project Structure

```
OrbiCheck/
├── app/                    # Next.js App Router pages
├── components/             # React components (ui/, scan/, dashboard/, monitor/, etc.)
├── lib/                    # API clients, hooks, stores, utilities
├── types/                  # TypeScript type definitions
├── shared/                 # Cross-service shared types, constants, schemas
├── tests/                  # Frontend tests (Vitest + Playwright)
├── public/                 # Static assets
│
├── backend/
│   ├── app/                # FastAPI application
│   │   ├── api/v1/         # REST endpoints
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── services/       # Business logic + data transformers
│   │   ├── tasks/          # Celery async tasks
│   │   ├── core/           # Auth, middleware, exceptions
│   │   └── db/             # Database session + Alembic migrations
│   ├── scan/               # Node.js Scan Service (30+ OSINT modules)
│   └── tests/              # Backend tests (unit, integration, e2e)
│
├── docker/                 # Docker configurations
│   ├── frontend/Dockerfile #   Next.js multi-stage standalone build
│   ├── backend/Dockerfile  #   FastAPI + Alembic + Celery
│   ├── backend/entrypoint.sh # Bootstrap-friendly DB init
│   ├── celery/entrypoint.sh  # Worker / beat mode router
│   ├── scan/Dockerfile     #   Node.js + system Chromium
│   └── init/init-db.sql    #   PostgreSQL extensions
├── docker-compose.yml      # Full local stack (7 services)
├── docker-compose.prod.yml # Production override (external DB/Redis)
├── deploy/deploy.sh        # One-command build + up + healthcheck
├── .do/app.yaml            # DigitalOcean App Platform spec
├── .dockerignore
│
├── quickstart/             # Native local startup scripts (no Docker)
├── scripts/                # Dev / CI scripts
├── Makefile                # Common dev commands
└── package.json
```


## Acknowledgments

The OSINT scan modules and overall reconnaissance approach are **inspired by** [web-check](https://github.com/Lissy93/web-check) by Alicia Sykes ([@Lissy93](https://github.com/Lissy93)) — an open-source all-in-one OSINT tool for website intelligence. OrbiCheck builds a distinct product on top of its own stack (Next.js, FastAPI, PostgreSQL, etc.) with extended features such as monitoring and reporting, but the breadth of checks owes a conceptual debt to that project.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

---

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for our responsible disclosure policy.

---

## License

This project is licensed under the [MIT License](LICENSE).
