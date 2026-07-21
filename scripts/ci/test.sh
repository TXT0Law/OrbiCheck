#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

run_frontend() {
  echo "[ci-test] Running frontend tests with coverage"
  (
    cd "${REPO_ROOT}"
    pnpm test:cov
  )
}

run_backend() {
  echo "[ci-test] Running backend tests with coverage"
  (
    cd "${REPO_ROOT}/backend"
    UV_LINK_MODE=copy uv run pytest \
      --cov=app \
      --cov-report=term-missing \
      --cov-report=xml:coverage.xml \
      --cov-fail-under=70
  )
}

run_osint() {
  echo "[ci-test] Running osint tests with coverage"
  (
    cd "${REPO_ROOT}/backend/scan"
    npm run test:cov
  )
}

case "${TARGET}" in
  frontend)
    run_frontend
    ;;
  backend)
    run_backend
    ;;
  osint)
    run_osint
    ;;
  all)
    run_frontend
    run_backend
    run_osint
    ;;
  *)
    echo "Usage: scripts/ci/test.sh [frontend|backend|osint|all]"
    exit 1
    ;;
esac
