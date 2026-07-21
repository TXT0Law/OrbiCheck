# Dependency Direction

## Purpose

Enforce a strict, one-way import DAG across all subsystems.
Reverse imports are the #1 source of circular dependencies and build failures.

## Scope

All TypeScript/JavaScript files in `app/`, `components/`, `lib/`, `types/`,
`shared/`, and all Python files in `backend/app/`.

## Allowed

The dependency arrow points **downward only**. Each layer may import
from layers below it, never above.

```
Layer 0  shared/types/         (pure TS types, zero runtime deps)
  ↓
Layer 1  shared/schemas/        (Zod schemas, imports Layer 0)
  ↓
Layer 2  shared/constants/      (enums, config objects, imports Layer 0-1)
  ↓
Layer 3  lib/api/               (HTTP client, imports Layer 0-2)
  ↓
Layer 4  lib/hooks/             (React hooks, imports Layer 0-3)
  ↓
Layer 5  lib/stores/            (Zustand stores, imports Layer 0-4)
  ↓
Layer 6  components/ui/         (shadcn primitives, imports Layer 0)
  ↓
Layer 7  components/{feature}/  (business components, imports Layer 0-6)
  ↓
Layer 8  app/**/page.tsx        (pages, imports Layer 0-7)
```

### Backend direction

```
backend/app/models/       → backend/app/schemas/
  ↓                            ↓
backend/app/services/     (imports models + schemas)
  ↓
backend/app/tasks/        (imports services)
  ↓
backend/app/api/          (imports services + schemas, never models directly)
```

### Cross-boundary

```
Frontend ──HTTP──▶ Backend ──HTTP──▶ Scan Service
```

No direct import across these boundaries. Communication is REST/SSE only.

## Forbidden

1. `app/` importing from `components/{feature}/` internals (use public exports).
2. `lib/api/` importing from `lib/hooks/` or `lib/stores/`.
3. `shared/` importing from `lib/`, `components/`, or `app/`.
4. `backend/app/api/` importing from `backend/app/models/` directly — go through `services/`.
5. `components/ui/` importing from `components/{feature}/`.
6. Any TypeScript file importing from `backend/` (cross-boundary violation).
7. `backend/scan/` importing from `backend/app/` (separate Node.js service).

## Commands

```bash
# CI check (see scripts/ci/check-dependency-direction.sh)
bash scripts/ci/check-dependency-direction.sh

# Positive/negative fixture self-tests
python3 scripts/ci/test-harness-checks.py
```

## Verification

1. `bash scripts/ci/check-dependency-direction.sh` exits 0.
2. The Python AST/import checker covers Backend endpoint/model direction and
   frontend cross-layer imports.
3. No circular-dependency warnings from `pnpm build`.

## References

- [AGENTS.md](../../AGENTS.md) — global rules
- [Repository inventory](../inventory.json) — generated route/service/module layout
