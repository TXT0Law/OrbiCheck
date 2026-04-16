# Definition of Done

## Purpose

Explicit checklist that determines when a task is complete.
An agent must not declare "done" until every item passes.

## Scope

Every code change in the repository, regardless of subsystem.

## Allowed

Declaring done when all verification steps pass for the affected subsystem(s).

## Forbidden

1. Declaring done without running tests.
2. Declaring done with failing lint or typecheck.
3. Declaring done with commented-out or skipped tests.
4. Declaring done without a corresponding test for new logic.
5. Declaring done when `git diff` shows unintended file changes.

## Commands

```bash
# Frontend changes
pnpm build && make lint-frontend && make test-frontend

# Backend changes
make lint-backend && make test-backend-unit

# Scan Service changes
make lint-osint && make test-osint

# Full repo (when unsure)
make lint && make test && pnpm build
```

## Verification

### Checklist (all must be true)

1. Feature code implemented and follows code standards.
2. Test file created or updated — covers happy path + at least one error path.
3. `make lint` exits 0 for affected subsystems.
4. `make test` exits 0 for affected subsystems.
5. `pnpm build` exits 0 (if any `.ts`/`.tsx` changed).
6. No new `as any`, bare `except`, or `# type: ignore` introduced.
7. No secrets, `.env` values, or hardcoded credentials in diff.

### When to stop

Run each command once. If it passes, move on.
If it fails, fix the code and re-run only the failing command.

## References

- [AGENTS.md](../../AGENTS.md) — global rules
- [prompt_dev/projectprompt.md](../../prompt_dev/projectprompt.md) — project standards
