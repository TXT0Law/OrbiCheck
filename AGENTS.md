# OrbiCheck — Global Agent Rules

## Purpose

Single entry point for all AI agents working in this monorepo.
Every agent MUST read this file before making any change.

## Scope

All files in the repository. Subdirectory `AGENTS.md` files
override or extend these rules for their scope.

## Allowed

1. Edit files **only** within your assigned directory boundaries (see Ownership below).
2. Add new files that follow existing naming conventions in that directory.
3. Run tests, lint, and typecheck commands listed in Commands.
4. Read any file in the repo for context (read is always safe).
5. Create test files alongside or under the designated test directory.

## Forbidden

1. **Reverse imports** — dependency direction MUST follow the DAG in `docs/harness/dependency-direction.md`.
2. **Skip validation** — data crossing a boundary MUST be parsed/validated first (see `docs/harness/boundary-validation.md`).
3. **Bare `except` / `catch`** — always catch specific error types.
4. **Delete or skip tests** — never remove, `.skip`, or `xfail` a passing test.
5. **Commit secrets** — no `.env` values, API keys, or passwords in tracked files.
6. **Bypass CI gates** — never use `--no-verify`, `--force`, or equivalent flags.
7. **Magic numbers** — all constants must be named.

## Ownership

| Directory | Owner | Test Directory |
|-----------|-------|---------------|
| `app/`, `components/`, `lib/`, `types/`, `shared/` | Frontend agents | `tests/` (root) |
| `backend/app/`, `backend/tests/` | Backend agent | `backend/tests/` |
| `backend/scan/` | Scan agent | `backend/scan/__tests__/` |
| `docker/`, `scripts/`, `quickstart/`, `deploy/` | Infra agent | — |
| `docs/harness/` | Any agent (append-only) | — |

## Commands

```bash
# ── Lint (must pass before done) ──
make lint                    # All subsystems
make lint-frontend           # pnpm lint (ESLint)
make lint-backend            # ruff check
make lint-osint              # backend/scan eslint

# ── Test (must pass before done) ──
make test                    # All subsystems
make test-frontend           # Vitest
make test-backend-unit       # pytest -m unit
make test-backend-integration # pytest -m integration
make test-osint              # Jest (backend/scan)

# ── Typecheck ──
pnpm build                   # Next.js build (includes tsc)
```

## Verification

A task is **done** only when ALL of these are true:

1. `make lint` exits 0 for affected subsystems.
2. `make test` exits 0 for affected subsystems.
3. `pnpm build` exits 0 (if frontend files changed).
4. No new lint/type warnings introduced.
5. Corresponding test file created or updated for every feature/fix.

## References

- [docs/harness/dependency-direction.md](docs/harness/dependency-direction.md) — import DAG
- [docs/harness/boundary-validation.md](docs/harness/boundary-validation.md) — parse at edges
- [docs/harness/tool-authorization.md](docs/harness/tool-authorization.md) — sandbox levels
- [docs/harness/done-definition.md](docs/harness/done-definition.md) — full DoD checklist
- [docs/harness/file-ownership.md](docs/harness/file-ownership.md) — directory boundaries
- [prompt_dev/projectprompt.md](prompt_dev/projectprompt.md) — project standards
- [prompt_dev/structure.md](prompt_dev/structure.md) — full repo structure
