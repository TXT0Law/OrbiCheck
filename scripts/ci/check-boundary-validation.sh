#!/usr/bin/env bash
# check-boundary-validation.sh
# CI gate: detect missing boundary validation patterns.
# Exit 0 = pass, Exit 1 = violation found.
#
# Maps to: docs/harness/boundary-validation.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VIOLATIONS=0

echo "=== Boundary Validation Check ==="

# ─── Rule 1: No "as any" in lib/api/ ───
echo "[1/4] lib/api/ → no 'as any' casts"
if grep -rn --include='*.ts' --include='*.tsx' \
  "as any" \
  "$REPO_ROOT/lib/api/" 2>/dev/null; then
  echo "  ❌ FAIL: 'as any' found in lib/api/ — parse responses with Zod instead"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 2: No "as any" in lib/hooks/ ───
echo "[2/4] lib/hooks/ → no 'as any' casts"
if grep -rn --include='*.ts' --include='*.tsx' \
  "as any" \
  "$REPO_ROOT/lib/hooks/" 2>/dev/null; then
  echo "  ❌ FAIL: 'as any' found in lib/hooks/"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 3: No bare "except:" in backend/app/ ───
echo "[3/4] backend/app/ → no bare 'except:'"
if grep -rn --include='*.py' \
  -E "^\s*except\s*:" \
  "$REPO_ROOT/backend/app/" 2>/dev/null; then
  echo "  ❌ FAIL: bare 'except:' in backend/app/ — catch specific exceptions"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 4: No "# type: ignore" without justification ───
echo "[4/4] backend/app/ → no unjustified '# type: ignore'"
if grep -rn --include='*.py' \
  "# type: ignore$" \
  "$REPO_ROOT/backend/app/" 2>/dev/null; then
  echo "  ❌ FAIL: '# type: ignore' without reason — add [code] suffix if needed"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ $VIOLATIONS boundary validation violation(s) found."
  echo "   See docs/harness/boundary-validation.md for rules."
  exit 1
else
  echo "✅ All boundary validation checks passed."
  exit 0
fi
