#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema to a static JSON file.

Usage:
    cd backend && uv run python ../scripts/dev/export-openapi.py

The output is written to docs/openapi.json at the project root.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.main import app  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT = PROJECT_ROOT / "docs" / "openapi.json"

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
schema = app.openapi()
OUTPUT.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
print(f"OpenAPI schema written to {OUTPUT.relative_to(PROJECT_ROOT)}")
