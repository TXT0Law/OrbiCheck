# Layered validation and local regression

This change implements the approved harness-efficiency work without reducing
the existing CI test coverage, migration checks, worker recovery drill, or final
quality gate. It does not start an automation or a GitHub Actions run.

## Design and acceptance criteria

1. A feature-branch update with an open PR has one automatic CI entry point.
   Mutation tests must reject the previous duplicate triggers and missing core
   quality checks. Main and develop pushes retain the complete baseline.
2. Local validation separates focused feedback, final PR checks, and post-merge
   flow checks. Each command appears once per plan; coverage replaces a duplicate
   ordinary full-suite invocation, and harness includes docs checking once.
   Failed commands must produce failed receipts and stop dependent work.
3. One local regression entry starts an isolated production frontend and test
   services, runs the existing linked and backend-unavailable browser cases,
   and cleans up its own services. It must refuse unsafe environment/port setup
   and preserve evidence from other runs.

## Local entry points

Use `--plan` to inspect a stage without running its commands:

```bash
make verify-iterate ARGS="--scope frontend --test tests/lib/url-input-sanitizer.test.ts --plan"
make verify-pr ARGS="--scope frontend --base origin/main --plan"
make verify-main ARGS="--scope frontend --plan"
make test-local-regression ARGS="--plan"
```

Remove `--plan` to execute. Supported scopes are `frontend`, `backend`, `scan`,
`harness`, and `all`; default scope is `all`. Scope is explicit, not an automatic
claim that files outside that scope are safe. Use `all` for unknown or cross-cutting
product changes; include affected API/contract paths in the review decision.

| Stage | Purpose | Evidence it does not replace |
|---|---|---|
| `verify-iterate` | Affected lint and explicitly selected regression test files; tool fixtures for harness work | Final full affected-subsystem checks |
| `verify-pr` | Full affected coverage suite once, relevant lint/build/bundle, and harness once | Browser or recovery checks required by the change's integration risks |
| `verify-main` | Post-merge local browser flows and applicable worker recovery | The final PR's static/unit/coverage evidence |

An iterate code scope requires an explicit `--test` path. Passing a small scope
or a plan-only invocation must not be reported as a fully validated project.
Use the standalone local-regression entry for changes affecting user journeys
or the regression harness itself, even when the PR scope is `harness`.

### Receipts and repetition

Each executed validation gets a unique evidence directory under
`quickstart/logs/validation/`. Receipts identify the tested commit, source tree,
dirty worktree evidence, selected scope, command, exit code, elapsed time, and log
location. They do not dump credentials or the ambient environment.

There is no automatic result cache. Do not infer success from an old log or a
matching command name. A reviewer may reuse prior evidence only after checking
the exact source tree, working-tree changes, toolchain/dependencies and relevant
environment. A different merge tree or changed dependencies require affected
checks again. Post-merge flows are freshly executed. Record reused evidence as
reused, separately from new executions.

Do not run `make test` and then equivalent `make test-cov` as two release gates.
Do not run `make check-docs` again when the same successful `make check-harness`
already included it. Keep the existing direct commands available for diagnosis.
After a failure, rerun the corrected failing check and any affected dependents;
preserve the original failure receipt.

## One isolated browser-regression entry

```bash
make test-local-regression
# Optional narrower diagnosis; explicitly report the selected suite:
make test-local-regression ARGS="--suite linked"
make test-local-regression ARGS="--suite backend-down"
```

The default runs both existing suites. It requires the repository's locked
dependencies, Playwright Chromium, PostgreSQL tools, Redis and Node tooling to
already be installed; it does not silently install packages or use an existing
application database. Preflight and owned-service cleanup are part of the test.

Run this entry from a clean checkout or worktree without runtime `.env` files
in the repository root, `backend/`, or `backend/scan/`. It rejects those files
before starting services so Next.js and backend settings cannot load deployment
credentials. It leaves the files untouched and explains how to use a clean
checkout. Committed `.env.example` templates are allowed.

The runner uses an isolated PostgreSQL cluster, explicit synthetic test settings,
loopback services, a fixed Node scan fixture, and the existing deterministic
linked API. These browser tests verify user flows, auth/CSRF, persistence and
failure handling. They do not certify live external scan providers or replace
real-worker recovery, scanner safety, migration, or backend contract tests.

It builds one standalone production frontend. Both browser suites use the same
host for cookies; the backend-unavailable phase closes the owned API so the
browser observes a real network failure. Output/report directories are separate
children of their existing runner artifact roots. Durable logs and receipts stay
under `quickstart/logs/local-regression/`, outside Playwright cleanup targets.

## CI ownership and retained coverage

`.github/workflows/ci.yml` is the automatic PR check entry. It also runs on pushes
to `main` and `develop`. The former frontend/backend workflows remain manual
diagnostic entries; they no longer duplicate PR and feature-branch push checks.

All existing core job bodies, required result checks, coverage floors, migration
checks, scanner tests, linked E2E, and the real weekly-report recovery drill remain
in place. The workflow-policy fixtures guard this contract. Main protection or
required-check names must be reviewed before any future job removal/renaming.

No path-based omission of these CI gates is introduced. Recovery-job scoping and
shared CI dependency provisioning can be evaluated separately with measured
benefit and coverage-preservation tests.

## Verification of this implementation

The tool fixtures cover command/stage selection, deduplication, failure
propagation, workflow-trigger mutations, local preflight and service cleanup.
Run `make check-harness` once to exercise them and the existing static/document
checks. Run the default local regression entry to prove the real production
browser startup and both suites. A changed frontend test/configuration also
needs the affected frontend lint, tests and build checks.
