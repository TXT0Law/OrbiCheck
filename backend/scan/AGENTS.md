# Scan Service — Agent Rules

## Purpose

Rules for the Node.js Express OSINT scan service at `backend/scan/`.

## Scope

`backend/scan/**/*.js`, `backend/scan/__tests__/**/*.test.js`.

## Allowed

1. Each OSINT module is a standalone `.js` file at `backend/scan/` root (flat layout).
2. Modules return `{ success, data, error?, durationMs }` — standard result format.
3. Shared utilities go in `backend/scan/_common/`.
4. Use ESM (`import`/`export`), not CommonJS.
5. One module failure must never crash the batch runner — isolate errors.

## Forbidden

1. Importing from `backend/app/` (Python backend — separate service).
2. Adding routes outside `server.js` — all routes defined inline.
3. Using `require()` — ESM only.
4. Bare `catch(e) {}` — log or rethrow with context.
5. Accessing filesystem outside `backend/scan/` without explicit justification.

## Commands

```bash
make lint-osint    # cd backend/scan && npm run lint
make test-osint    # cd backend/scan && npm test (Jest)
```

## Verification

1. `make test-osint` exits 0.
2. New modules have corresponding test files in `__tests__/`.
3. Module output matches `{ success, data, error?, durationMs }` shape.
4. `grep -rn "require(" backend/scan/*.js` returns empty (ESM only).
