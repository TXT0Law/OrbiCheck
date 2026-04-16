# Components — Agent Rules

## Purpose

Rules for all React components under `components/`.

## Scope

`components/**/*.tsx`, `components/**/*.ts`.

## Allowed

1. One component per file, named export using function declaration.
2. Props interface named `{ComponentName}Props` defined above the component.
3. Import from `@/lib/`, `@/shared/`, `@/types/`, `@/components/ui/`.
4. `components/ui/` — shadcn/ui primitives only (auto-generated, minimal edits).
5. Feature components (`scan/`, `dashboard/`, `monitor/`) may import `ui/` and `common/`.

## Forbidden

1. `components/ui/` importing from `components/{feature}/`.
2. Cross-feature imports (e.g., `scan/` importing `monitor/` internals).
3. Direct API calls — delegate to hooks in `lib/hooks/`.
4. Inline styles or CSS modules — Tailwind only.
5. Default exports — use named exports.

## Commands

```bash
make lint-frontend
make test-frontend
pnpm build
```

## Verification

1. `make test-frontend` exits 0.
2. New components have tests in `tests/components/{feature}/`.
3. `grep -r "export default" components/` shows no new matches.
