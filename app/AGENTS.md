# Frontend Pages — Agent Rules

## Purpose

Rules for all files under `app/` (Next.js App Router pages).

## Scope

`app/**/*.tsx`, `app/**/*.ts`, `app/**/layout.tsx`, `app/**/page.tsx`.

## Allowed

1. Pages (`page.tsx`) handle layout composition only — no business logic.
2. Import from `@/components/`, `@/lib/`, `@/shared/`, `@/types/`.
3. Use `layout.tsx` for shared chrome (sidebar, header).
4. Data fetching via TanStack Query hooks from `@/lib/hooks/`.
5. Loading states via `loading.tsx` or Skeleton components.

## Forbidden

1. Direct API calls (`fetch`, `axios`) inside `page.tsx` — use `lib/api/`.
2. Importing from `backend/` or `backend/scan/`.
3. Business logic (filtering, scoring, transforming) in page files.
4. CSS modules or inline styles — Tailwind only.
5. Arrow-function default exports — use named function declarations.

## Commands

```bash
pnpm build        # typecheck + build
make lint-frontend
make test-frontend
```

## Verification

1. `pnpm build` exits 0.
2. Every new page has a corresponding test in `tests/pages/`.
3. No `fetch()` or `axios` calls appear in `page.tsx` files.
