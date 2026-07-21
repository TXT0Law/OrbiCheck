#!/usr/bin/env bash
# check-harness.sh
# Runs all harness CI checks in sequence.
# Maps to: docs/harness/*.md
#
# Usage: bash scripts/ci/check-harness.sh [BASE_SHA] [HEAD_SHA]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_SHA="${1:-${BASE_SHA:-}}"
HEAD_SHA="${2:-${HEAD_SHA:-HEAD}}"
FAILURES=0

echo "╔══════════════════════════════════╗"
echo "║   OrbiCheck Harness CI Checks    ║"
echo "╚══════════════════════════════════╝"
echo ""

# 0. Checker fixture self-tests
echo "=== Harness Checker Self-tests ==="
if python3 "$SCRIPT_DIR/test-harness-checks.py"; then
  echo "  ✅ PASS"
  echo ""
else
  FAILURES=$((FAILURES + 1))
  echo ""
fi

# 1. Dependency direction
if bash "$SCRIPT_DIR/check-dependency-direction.sh"; then
  echo ""
else
  FAILURES=$((FAILURES + 1))
  echo ""
fi

# 2. Boundary validation
if bash "$SCRIPT_DIR/check-boundary-validation.sh"; then
  echo ""
else
  FAILURES=$((FAILURES + 1))
  echo ""
fi

# 3. Documentation inventory, OpenAPI drift, and local links
echo "=== Documentation Drift Check ==="
if (
  cd "$SCRIPT_DIR/../../backend"
  UV_LINK_MODE=copy uv run python ../scripts/ci/check-docs-drift.py
); then
  echo "  ✅ PASS"
  echo ""
else
  FAILURES=$((FAILURES + 1))
  echo ""
fi

# 4. Test requirement (existing script)
if [ -f "$SCRIPT_DIR/require-tests.sh" ]; then
  echo "=== Test Requirement Check ==="
  if bash "$SCRIPT_DIR/require-tests.sh" "$BASE_SHA" "$HEAD_SHA"; then
    echo "  ✅ PASS"
    echo ""
  else
    FAILURES=$((FAILURES + 1))
    echo ""
  fi
fi

echo "════════════════════════════════════"
if [ "$FAILURES" -gt 0 ]; then
  echo "❌ $FAILURES harness check(s) failed."
  exit 1
else
  echo "✅ All harness checks passed."
  exit 0
fi
