# Contributing to OrbiCheck

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

Follow the [Getting Started](README.md#getting-started) section in the README to set up your local environment. You'll need Node.js 20+, Python 3.11+, PostgreSQL 16+, and Redis 7+.

## Branch Strategy

```
main              ← production (protected)
├── develop       ← development integration
├── feat/xxx      ← feature branches (from develop)
├── fix/xxx       ← fix branches
└── hotfix/xxx    ← emergency fixes (from main)
```

Create your branch from `develop` for features and fixes.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons, etc. |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, CI |

Scopes: `frontend`, `backend`, `scan`, `docker`, `shared`

Examples:

```
feat(frontend): add OSINT results grid component
fix(backend): handle timeout in nuclei scanner
docs(shared): update API contract schema
```

## Pull Requests

- **One PR = one concern** — keep changes focused.
- PRs must pass lint checks (`make lint`). Type checking is handled by your IDE or CI pipeline.
- New features **must include tests** — PRs without tests will be rejected.
- Do not commit `.env` files, API keys, or any other secrets.

## Testing

Every code change must include corresponding tests:

```bash
# Run all tests
make test

# Subsystem tests
make test-frontend           # Frontend (Vitest)
make test-backend            # Backend (pytest)
make test-osint              # Scan Service (Jest)
```

See the [Testing section](README.md#testing) in the README for more commands.

## Code Style

- **TypeScript** (frontend): strict mode, `camelCase` vars, `PascalCase` components
- **Python** (backend): type hints required, `snake_case` vars, `PascalCase` classes
- **JavaScript** (scan service): ESM imports, flat module layout

Run `make lint` before submitting a PR to catch style issues.

## Project Structure

- Frontend lives at the **project root** (no `frontend/` directory)
- Backend is in `backend/` (Python FastAPI)
- Scan Service is in `backend/scan/` (Node.js Express)
- Shared types/constants are in `shared/`

## Questions?

Open an [issue](https://github.com/TXT0Law/OrbiCheck/issues) if you have questions or need guidance.
