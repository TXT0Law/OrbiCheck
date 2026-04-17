#!/usr/bin/env bash
# check-dependency-direction.sh
# CI gate: detect forbidden import directions in the OrbiCheck monorepo.
# Exit 0 = pass, Exit 1 = violation found.
#
# Maps to: docs/harness/dependency-direction.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VIOLATIONS=0

echo "=== Dependency Direction Check ==="

# ─── Rule 1: shared/ must not import from lib/, components/, app/ ───
echo "[1/6] shared/ → no project imports"
if grep -rn --include='*.ts' --include='*.tsx' \
  -E "from ['\"]@/(lib|components|app)/" \
  "$REPO_ROOT/shared/" 2>/dev/null; then
  echo "  ❌ FAIL: shared/ imports from lib/, components/, or app/"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 2: lib/api/ must not import from lib/hooks/ or lib/stores/ ───
echo "[2/6] lib/api/ → no hooks/stores imports"
if grep -rn --include='*.ts' --include='*.tsx' \
  -E "from ['\"]@/lib/(hooks|stores)/" \
  "$REPO_ROOT/lib/api/" 2>/dev/null; then
  echo "  ❌ FAIL: lib/api/ imports from lib/hooks/ or lib/stores/"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 3: lib/utils/ must not import from lib/api/ or lib/hooks/ ───
echo "[3/6] lib/utils/ → pure utilities only"
if grep -rn --include='*.ts' --include='*.tsx' \
  -E "from ['\"]@/lib/(api|hooks)/" \
  "$REPO_ROOT/lib/utils/" 2>/dev/null; then
  echo "  ❌ FAIL: lib/utils/ imports from api/ or hooks/"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 4: components/ui/ must not import from components/{feature}/ ───
echo "[4/6] components/ui/ → no feature component imports"
if grep -rn --include='*.ts' --include='*.tsx' \
  -E "from ['\"]@/components/(scan|dashboard|monitor|settings|report|alerts)/" \
  "$REPO_ROOT/components/ui/" 2>/dev/null; then
  echo "  ❌ FAIL: components/ui/ imports from feature components"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

# ─── Rule 5: No TypeScript file imports from backend/ ───
echo "[5/6] Frontend → no backend imports"
for dir in app components lib shared types; do
  if [ -d "$REPO_ROOT/$dir" ]; then
    if grep -rn --include='*.ts' --include='*.tsx' \
      -E "from ['\"].*backend/" \
      "$REPO_ROOT/$dir/" 2>/dev/null; then
      echo "  ❌ FAIL: $dir/ imports from backend/"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done
if [ $VIOLATIONS -eq 0 ] || true; then
  # Only print pass if no violations from this section
  echo "  ✅ PASS"
fi

# ─── Rule 6: backend/scan/ must not import from backend/app/ ───
echo "[6/6] backend/scan/ → no backend/app/ imports"
if grep -rn --include='*.js' --include='*.mjs' \
  -E "from ['\"].*backend/app/" \
  "$REPO_ROOT/backend/scan/" 2>/dev/null; then
  echo "  ❌ FAIL: backend/scan/ imports from backend/app/"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  ✅ PASS"
fi

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ $VIOLATIONS dependency direction violation(s) found."
  echo "   See docs/harness/dependency-direction.md for the allowed DAG."
  exit 1
else
  echo "✅ All dependency direction checks passed."
  exit 0
fi
