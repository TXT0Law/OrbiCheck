#!/usr/bin/env bash
set -euo pipefail

# First-time development environment setup.
# Usage: bash scripts/dev/setup.sh

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== OrbiCheck Development Setup ==="
echo ""

# ── Check prerequisites ──────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: $1 is required but not installed."
    echo "  $2"
    exit 1
  fi
}

check_cmd node     "Install Node.js >= 20: https://nodejs.org/"
check_cmd pnpm     "Install pnpm >= 9: npm install -g pnpm"
check_cmd python3  "Install Python >= 3.11: https://www.python.org/"
check_cmd uv       "Install uv: https://docs.astral.sh/uv/getting-started/installation/"

echo "[OK] Prerequisites found: node $(node -v), pnpm $(pnpm -v), python $(python3 --version | awk '{print $2}'), uv $(uv --version 2>/dev/null | head -1)"
echo ""

# ── Frontend dependencies ────────────────────────────────────────

echo "[1/6] Installing frontend dependencies..."
cd "$ROOT"
pnpm install
echo ""

# ── Backend Python environment ───────────────────────────────────

echo "[2/6] Setting up backend Python environment..."
cd "$ROOT/backend"
uv venv
UV_LINK_MODE=copy uv pip install -e ".[dev]"
echo ""

# ── Backend .env ─────────────────────────────────────────────────

if [ ! -f "$ROOT/backend/.env" ]; then
  echo "[3/6] Creating backend/.env from .env.example..."
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "  -> Edit backend/.env to set DATABASE_URL and AUTH_SESSION_SECRET"
else
  echo "[3/6] backend/.env already exists, skipping."
fi
echo ""

# ── Frontend .env.local ──────────────────────────────────────────

if [ ! -f "$ROOT/.env.local" ]; then
  echo "[4/6] Creating .env.local from .env.example..."
  cp "$ROOT/.env.example" "$ROOT/.env.local"
  echo "  -> Edit .env.local to configure frontend environment variables if needed"
else
  echo "[4/6] .env.local already exists, skipping."
fi
echo ""

# ── Scan Service dependencies ────────────────────────────────────

echo "[5/6] Installing scan service dependencies..."
cd "$ROOT/backend/scan"
npm install
echo "  Installing Playwright Chromium for screenshot module..."
npx playwright install chromium
if [ ! -f "$ROOT/backend/scan/.env" ]; then
  cp "$ROOT/backend/scan/.env.example" "$ROOT/backend/scan/.env"
fi
echo ""

# ── Database migration ───────────────────────────────────────────

echo "[6/6] Running database migrations..."
cd "$ROOT/backend"
if uv run alembic upgrade head 2>/dev/null; then
  echo "  -> Migrations applied successfully."
else
  echo "  -> Migration failed. Make sure PostgreSQL is running on localhost:5432."
  echo "  -> You can run this later: cd backend && uv run alembic upgrade head"
fi
echo ""

# ── Done ─────────────────────────────────────────────────────────

echo "=== Setup Complete ==="
echo ""
echo "Start the services:"
echo "  Terminal 1: cd backend/scan && node server.js"
echo "  Terminal 2: cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo "  Terminal 3: pnpm dev"
echo ""
echo "Or use the quickstart script: bash quickstart/start.sh"
