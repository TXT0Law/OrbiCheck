# Shared — Agent Rules

## Purpose

Rules for cross-service types, schemas, and constants in `shared/`.
This is the lowest layer — nothing in `shared/` may import project code.

## Scope

`shared/types/`, `shared/schemas/`, `shared/constants/`.

## Allowed

1. `shared/types/` — pure TypeScript interfaces/types, zero runtime imports.
2. `shared/schemas/` — Zod schemas that import only from `shared/types/`.
3. `shared/constants/` — named constants/enums, may import `shared/types/`.
4. All exports must be named (no default exports).
5. Frontend Agent A creates shared types first; other agents reference them.

## Forbidden

1. Importing from `lib/`, `components/`, `app/`, or `backend/`.
2. Runtime side effects (no `fetch`, no `console.log`, no DOM access).
3. React-specific code (no JSX, no hooks, no `useEffect`).
4. Backend-only types — those belong in `backend/app/schemas/`.
5. Modifying shared types without updating both frontend and backend consumers.

## Commands

```bash
pnpm build          # tsc will catch any broken imports across consumers
make test-frontend   # ensures frontend consumers still work
```

## Verification

1. `pnpm build` exits 0.
2. `grep -rn "import.*from.*lib/" shared/` returns empty.
3. Both frontend and backend tests pass after shared type changes.
