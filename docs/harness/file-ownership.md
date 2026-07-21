# File Ownership

## Purpose

Define which agent owns which directories to prevent merge conflicts
and enforce single-responsibility boundaries.

## Scope

All directories in the repository. Ownership determines who may
create, edit, or delete files in that subtree.

## Allowed

| Owner | Directories | May also read |
|-------|-------------|---------------|
| Frontend Agent A | `app/`, `components/ui/`, `components/layout/`, `components/common/`, `lib/`, `types/`, `shared/` | Everything |
| Frontend Agent B | `components/scan/`, `components/dashboard/`, `components/monitor/`, `components/settings/`, `components/report/`, `components/alerts/` | Everything |
| Backend Agent | `backend/app/`, `backend/tests/` | `shared/`, `docs/` |
| Scan Agent | `backend/scan/` | `shared/`, `docs/` |
| Infra Agent | `docker/`, `scripts/`, `quickstart/`, `deploy/`, `.github/`, `Makefile` | Everything |

## Forbidden

1. Editing files outside your owned directories without explicit approval.
2. Two agents editing the same file in the same session.
3. Moving files across ownership boundaries without coordination.
4. Adding dependencies that affect another agent's subsystem.

## Commands

```bash
# Check which files you changed (verify ownership before commit)
git diff --name-only
```

## Verification

1. `git diff --name-only` lists only files within your owned directories.
2. If cross-boundary edit is necessary, the PR description explains why.
3. Shared types/schemas changes are created by Frontend Agent A first.

## References

- [AGENTS.md](../../AGENTS.md) — ownership table
- [AGENTS.md](../../AGENTS.md) — agent responsibilities
