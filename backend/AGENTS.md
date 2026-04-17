# Backend — Agent Rules

## Purpose

Rules for the FastAPI backend service under `backend/app/`.

## Scope

`backend/app/**/*.py`, `backend/tests/**/*.py`, `backend/alembic.ini`.

## Allowed

1. Endpoints in `api/v1/endpoints/` — thin routing, delegates to `services/`.
2. Business logic in `services/` — imports `models/` and `schemas/`.
3. All functions must have type hints (args + return).
4. Pydantic `BaseModel` for all request/response schemas.
5. Async-first: use `async def` for I/O-bound operations.
6. Logging via `structlog` with context fields (`scan_id`, etc.).

## Forbidden

1. `api/` importing from `models/` directly — always go through `services/`.
2. Bare `except:` — catch specific exceptions.
3. Raw SQL outside of Alembic migrations — use SQLAlchemy ORM.
4. `print()` for logging — use `structlog`.
5. Importing from `backend/scan/` (separate Node.js service).

## Commands

```bash
make lint-backend              # ruff check
make test-backend-unit         # pytest -m unit
make test-backend-integration  # pytest -m integration
make test-backend-e2e          # pytest -m e2e
```

## Verification

1. `make lint-backend` exits 0.
2. `make test-backend-unit` exits 0.
3. New endpoints have integration tests in `backend/tests/integration/`.
4. New services have unit tests in `backend/tests/unit/`.
5. `grep -rn "except:" backend/app/` shows no bare except in the diff.
