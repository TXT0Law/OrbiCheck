#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-HEAD}"

if [[ -z "${BASE_SHA}" ]] || [[ "${BASE_SHA}" =~ ^0+$ ]]; then
  echo "[test-required] No valid base SHA available, skip strict changed-file gate."
  exit 0
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "[test-required] Base SHA ${BASE_SHA} is not available in local history, skip gate."
  exit 0
fi

if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
  echo "[test-required] Head SHA ${HEAD_SHA} is not available in local history."
  exit 1
fi

changed_files="$(git diff --name-only --diff-filter=ACMRT "${BASE_SHA}" "${HEAD_SHA}")"

if [[ -z "${changed_files}" ]]; then
  echo "[test-required] No changed files."
  exit 0
fi

has_frontend_src=0
has_frontend_tests=0
has_backend_src=0
has_backend_src_requiring_tests=0
has_backend_tests=0
has_osint_src=0
has_osint_tests=0
backend_exempt_files=""
osint_src_files=""
osint_test_files=""

backend_file_is_test_exempt() {
  local file="$1"

  python3 - "${BASE_SHA}" "${HEAD_SHA}" "${file}" <<'PY'
import re
import subprocess
import sys

base_sha, head_sha, path = sys.argv[1:4]
diff = subprocess.run(
    ["git", "diff", "--unified=0", "--no-color", base_sha, head_sha, "--", path],
    check=True,
    capture_output=True,
    text=True,
).stdout.splitlines()


def normalize(line: str) -> str:
    return line.strip()


def is_comment_or_blank(line: str) -> bool:
    stripped = line.strip()
    return not stripped or stripped.startswith("#")


def is_allowed_change(removed: list[str], added: list[str]) -> bool:
    removed_sig = [normalize(line) for line in removed if not is_comment_or_blank(line)]
    added_sig = [normalize(line) for line in added if not is_comment_or_blank(line)]

    if not removed_sig and not added_sig:
        return True

    if len(removed_sig) == 1 and len(added_sig) == 1:
        removed_line = removed_sig[0]
        added_line = added_sig[0]

        if re.sub(r"\s+", "", removed_line) == re.sub(r"\s+", "", added_line):
            return True

        match = re.match(
            r"^(?P<prefix>except\b.+?)\s+as\s+[A-Za-z_][A-Za-z0-9_]*:\s*$",
            removed_line,
        )
        if match and added_line == f"{match.group('prefix')}:":
            return True

    return False


pending_removed: list[str] = []
pending_added: list[str] = []


def flush_pending() -> None:
    if pending_removed or pending_added:
        if not is_allowed_change(pending_removed, pending_added):
            raise SystemExit(1)
        pending_removed.clear()
        pending_added.clear()


for line in diff:
    if line.startswith(("diff --git", "index ", "--- ", "+++ ", "@@ ")):
        flush_pending()
        continue

    if line.startswith("-"):
        pending_removed.append(line[1:])
        continue

    if line.startswith("+"):
        pending_added.append(line[1:])
        continue

flush_pending()
PY
}

while IFS= read -r file; do
  [[ -z "${file}" ]] && continue

  if [[ "${file}" =~ ^(app|components|lib)/.*\.(ts|tsx|js|jsx)$ ]]; then
    has_frontend_src=1
  fi

  if [[ "${file}" =~ ^tests/.*\.(test|spec)\.(ts|tsx|js|jsx)$ ]] || \
     [[ "${file}" =~ ^(app|components|lib)/.*\.(test|spec)\.(ts|tsx|js|jsx)$ ]]; then
    has_frontend_tests=1
  fi

  if [[ "${file}" =~ ^backend/app/.*\.py$ ]]; then
    has_backend_src=1
    if backend_file_is_test_exempt "${file}"; then
      backend_exempt_files+="${file}"$'\n'
    else
      has_backend_src_requiring_tests=1
    fi
  fi

  if [[ "${file}" =~ ^backend/tests/.*\.py$ ]]; then
    has_backend_tests=1
  fi

  # Exclude test/config/coverage artifacts - not scan module source
  if [[ "${file}" =~ ^backend/scan/.*\.js$ ]] && \
     [[ ! "${file}" =~ ^backend/scan/__tests__/ ]] && \
     [[ ! "${file}" =~ ^backend/scan/coverage/ ]] && \
     [[ ! "${file}" =~ ^backend/scan/node_modules/ ]] && \
     [[ "${file}" != "backend/scan/jest.config.js" ]]; then
    has_osint_src=1
    osint_src_files+="${file}"$'\n'
  fi

  if [[ "${file}" =~ ^backend/scan/__tests__/.*\.js$ ]] || \
     [[ "${file}" =~ ^backend/scan/.*\.(test|spec)\.js$ ]]; then
    has_osint_tests=1
    osint_test_files+="${file}"$'\n'
  fi
done <<< "${changed_files}"

failed=0

if [[ ${has_frontend_src} -eq 1 && ${has_frontend_tests} -eq 0 ]]; then
  echo "[test-required] Frontend source changed but no frontend test file was changed."
  failed=1
fi

if [[ ${has_backend_src_requiring_tests} -eq 1 && ${has_backend_tests} -eq 0 ]]; then
  echo "[test-required] Backend source changed but no backend test file was changed."
  failed=1
elif [[ ${has_backend_src} -eq 1 && ${has_backend_tests} -eq 0 ]]; then
  echo "[test-required] Backend source changed, but only test-exempt lint-only updates were detected."
  printf '%s' "${backend_exempt_files}" | sed 's/^/  - /'
fi

if [[ ${has_osint_src} -eq 1 && ${has_osint_tests} -eq 0 ]]; then
  echo "[test-required] OSINT source changed but no OSINT test file was changed."
  echo "[test-required] OSINT source files detected in this diff:"
  printf '%s' "${osint_src_files}" | sed 's/^/  - /'
  echo "[test-required] Expected at least one changed file matching:"
  echo "  - backend/scan/__tests__/*.js"
  echo "  - backend/scan/*.(test|spec).js"
  failed=1
fi

if [[ ${failed} -eq 1 ]]; then
  echo "[test-required] Please add/update matching test files in this PR."
  exit 1
fi

echo "[test-required] Test file requirement passed."
