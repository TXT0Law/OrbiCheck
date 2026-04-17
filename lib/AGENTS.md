# Lib — Agent Rules

## Purpose

Rules for API clients, hooks, stores, and utilities under `lib/`.

## Scope

`lib/**/*.ts`, `lib/**/*.tsx`.

## Allowed

1. `lib/api/` — HTTP client functions; must parse responses with Zod schemas.
2. `lib/hooks/` — React hooks wrapping TanStack Query or SSE; import from `lib/api/`.
3. `lib/stores/` — Zustand stores for client-only state; import from `lib/api/` or `shared/`.
4. `lib/utils/` — Pure utility functions; zero React or API dependencies.
5. `lib/constants/` — Named constants and enums.

## Forbidden

1. `lib/api/` importing from `lib/hooks/` or `lib/stores/` (reverse dependency).
2. `lib/utils/` importing from `lib/api/` or `lib/hooks/` (must stay pure).
3. Any file in `lib/` importing from `components/` or `app/`.
4. Returning `any` from API client functions — always return typed data.
5. Skipping `.parse()` / `.safeParse()` on API responses.

## Commands

```bash
make lint-frontend
make test-frontend
pnpm build
```

## Verification

1. `pnpm build` exits 0 (catches type errors in strict mode).
2. Tests in `tests/lib/` cover new hooks and utilities.
3. `grep -rn "as any" lib/` shows no new matches in the diff.
