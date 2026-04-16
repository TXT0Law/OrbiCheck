# Tool Authorization

## Purpose

Define sandbox levels for agent actions. Default posture is conservative:
deny destructive operations unless explicitly approved.

## Scope

All AI agents operating in this repository, regardless of directory scope.

## Allowed

### Tier 1 — Free (no approval needed)

1. Read any file in the repo.
2. Run `make lint`, `make test`, `pnpm build` (read-only verification).
3. Edit files within your owned directories.
4. Create new files following naming conventions.
5. Run `git status`, `git diff`, `git log` (read-only git).

### Tier 2 — Announce then proceed

1. Install dev dependencies (`pnpm add -D`, `uv add --dev`).
2. Run database migrations in dev (`make db-migrate`).
3. Create new directories within owned scope.

### Tier 3 — Ask user first

1. `git push`, `git push --force`, `git reset --hard`.
2. Delete files or directories (`rm -rf`, `git rm`).
3. Modify CI workflows (`.github/workflows/`).
4. Edit `AGENTS.md` or `docs/harness/*.md` (harness files).
5. Change production configs (`docker-compose.prod.yml`, `.do/app.yaml`).
6. Add runtime (non-dev) dependencies.
7. Run `make db-rollback` or drop/truncate tables.

## Forbidden

1. Run commands with `--no-verify` or `--force` flags.
2. Execute arbitrary shell commands outside of listed make/pnpm/uv targets.
3. Modify `.env` files with real credentials.
4. Push to `main` branch directly.
5. Disable security features (CORS, auth middleware, rate limiting).

## Commands

```bash
# Verify your tier before acting
cat docs/harness/tool-authorization.md
```

## Verification

1. Every PR must show which Tier 2+ actions were taken in the PR description.
2. Tier 3 actions must have explicit user approval in conversation history.
3. No `--force` or `--no-verify` appears in terminal history for the session.

## References

- [AGENTS.md](../../AGENTS.md) — global rules
- [SECURITY.md](../../SECURITY.md) — security policy
