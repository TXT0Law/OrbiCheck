#!/usr/bin/env bash
# check-harness.sh
# Runs all harness CI checks in sequence.
# Maps to: docs/harness/*.md
#
# Usage: bash scripts/ci/check-harness.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILURES=0

echo "╔══════════════════════════════════╗"
echo "║   OrbiCheck Harness CI Checks    ║"
echo "╚══════════════════════════════════╝"
echo ""

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

# 3. Test requirement (existing script)
if [ -f "$SCRIPT_DIR/require-tests.sh" ]; then
  echo "=== Test Requirement Check ==="
  if bash "$SCRIPT_DIR/require-tests.sh"; then
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
