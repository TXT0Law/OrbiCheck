#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUIRE_TESTS_SCRIPT="${ROOT_DIR}/scripts/ci/require-tests.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

commit_all() {
  local message="$1"

  git add .
  GIT_AUTHOR_NAME="CI Test" \
  GIT_AUTHOR_EMAIL="ci@example.com" \
  GIT_COMMITTER_NAME="CI Test" \
  GIT_COMMITTER_EMAIL="ci@example.com" \
    git commit -q -m "${message}"
}

assert_pass() {
  local repo_dir="$1"
  local base_sha="$2"
  local head_sha="$3"

  if ! (
    cd "${repo_dir}"
    bash "${REQUIRE_TESTS_SCRIPT}" "${base_sha}" "${head_sha}"
  ); then
    echo "[require-tests-self-test] Expected pass but failed in ${repo_dir}"
    exit 1
  fi
}

assert_fail() {
  local repo_dir="$1"
  local base_sha="$2"
  local head_sha="$3"

  if (
    cd "${repo_dir}"
    bash "${REQUIRE_TESTS_SCRIPT}" "${base_sha}" "${head_sha}"
  ); then
    echo "[require-tests-self-test] Expected failure but passed in ${repo_dir}"
    exit 1
  fi
}

create_repo() {
  local repo_dir="$1"

  mkdir -p "${repo_dir}"
  (
    cd "${repo_dir}"
    git init -q
  )
}

scenario_lint_only_backend_change_passes() {
  local repo_dir="${TMP_DIR}/lint-only"
  create_repo "${repo_dir}"

  mkdir -p "${repo_dir}/backend/app/tasks"
  cat > "${repo_dir}/backend/app/tasks/scan_tasks.py" <<'EOF'
def run_scan() -> None:
    try:
        do_work()
    except Exception as exc:
        logger.exception("failed")
EOF

  (
    cd "${repo_dir}"
    commit_all "base"
    local base_sha
    base_sha="$(git rev-parse HEAD)"

    python3 - <<'PY'
from pathlib import Path

path = Path("backend/app/tasks/scan_tasks.py")
path.write_text(
    path.read_text().replace("except Exception as exc:", "except Exception:"),
    encoding="utf-8",
)
PY

    commit_all "lint-only"
    local head_sha
    head_sha="$(git rev-parse HEAD)"

    assert_pass "${repo_dir}" "${base_sha}" "${head_sha}"
  )
}

scenario_backend_code_without_tests_fails() {
  local repo_dir="${TMP_DIR}/backend-no-tests"
  create_repo "${repo_dir}"

  mkdir -p "${repo_dir}/backend/app/services"
  cat > "${repo_dir}/backend/app/services/example.py" <<'EOF'
def meaning() -> int:
    return 41
EOF

  (
    cd "${repo_dir}"
    commit_all "base"
    local base_sha
    base_sha="$(git rev-parse HEAD)"

    python3 - <<'PY'
from pathlib import Path

Path("backend/app/services/example.py").write_text(
    "def meaning() -> int:\n    return 42\n",
    encoding="utf-8",
)
PY

    commit_all "feature"
    local head_sha
    head_sha="$(git rev-parse HEAD)"

    assert_fail "${repo_dir}" "${base_sha}" "${head_sha}"
  )
}

scenario_backend_code_with_tests_passes() {
  local repo_dir="${TMP_DIR}/backend-with-tests"
  create_repo "${repo_dir}"

  mkdir -p "${repo_dir}/backend/app/services" "${repo_dir}/backend/tests/unit"
  cat > "${repo_dir}/backend/app/services/example.py" <<'EOF'
def meaning() -> int:
    return 41
EOF
  cat > "${repo_dir}/backend/tests/unit/test_example.py" <<'EOF'
def test_meaning() -> None:
    assert 41 == 41
EOF

  (
    cd "${repo_dir}"
    commit_all "base"
    local base_sha
    base_sha="$(git rev-parse HEAD)"

    python3 - <<'PY'
from pathlib import Path

Path("backend/app/services/example.py").write_text(
    "def meaning() -> int:\n    return 42\n",
    encoding="utf-8",
)
Path("backend/tests/unit/test_example.py").write_text(
    "def test_meaning() -> None:\n    assert 42 == 42\n",
    encoding="utf-8",
)
PY

    commit_all "feature-with-tests"
    local head_sha
    head_sha="$(git rev-parse HEAD)"

    assert_pass "${repo_dir}" "${base_sha}" "${head_sha}"
  )
}

scenario_invalid_base_fails_in_ci() {
  local repo_dir="${TMP_DIR}/invalid-base"
  create_repo "${repo_dir}"
  (
    cd "${repo_dir}"
    printf 'base\n' > README.md
    commit_all "base"
    if CI=true bash "${REQUIRE_TESTS_SCRIPT}" "" "HEAD"; then
      echo "[require-tests-self-test] Invalid CI base unexpectedly passed"
      exit 1
    fi
  )
}

scenario_scanner_change_without_scanner_test_fails() {
  local repo_dir="${TMP_DIR}/scanner-no-test"
  create_repo "${repo_dir}"
  mkdir -p "${repo_dir}/docker/scanner"
  printf 'print("old")\n' > "${repo_dir}/docker/scanner/app.py"
  (
    cd "${repo_dir}"
    commit_all "base"
    local base_sha
    base_sha="$(git rev-parse HEAD)"
    printf 'print("new")\n' > docker/scanner/app.py
    commit_all "scanner change"
    local head_sha
    head_sha="$(git rev-parse HEAD)"
    assert_fail "${repo_dir}" "${base_sha}" "${head_sha}"
  )
}

scenario_lint_only_backend_change_passes
scenario_backend_code_without_tests_fails
scenario_backend_code_with_tests_passes
scenario_invalid_base_fails_in_ci
scenario_scanner_change_without_scanner_test_fails

echo "[require-tests-self-test] All scenarios passed."
