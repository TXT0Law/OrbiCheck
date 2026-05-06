"""Regression guard for TASK-P0-7.

Ensures the backend module list (`transformers.ALL_MODULES`) stays aligned
with the cross-service single source of truth `shared/constants/modules.ts`.

If a new module is added to one of these locations without the other,
the ScanDetail contract drifts and the frontend type system can no longer
narrow `ScanModuleName`.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.transformers import ALL_MODULES, MODULE_TO_FRONTEND_KEY

REPO_ROOT = Path(__file__).resolve().parents[3]
SHARED_MODULES_TS = REPO_ROOT / "shared" / "constants" / "modules.ts"


def _read_shared_scan_modules() -> list[str]:
    text = SHARED_MODULES_TS.read_text(encoding="utf-8")
    match = re.search(
        r"export\s+const\s+SCAN_MODULES\s*=\s*\[(?P<body>.*?)\]\s*as\s*const",
        text,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError(
            f"Could not locate SCAN_MODULES export in {SHARED_MODULES_TS}"
        )
    body = match.group("body")
    body = re.sub(r"//.*", "", body)
    return [
        segment.strip().strip('"').strip("'")
        for segment in body.split(",")
        if segment.strip()
    ]


def _read_shared_frontend_key_mapping() -> set[str]:
    text = SHARED_MODULES_TS.read_text(encoding="utf-8")
    match = re.search(
        r"export\s+const\s+MODULE_TO_FRONTEND_KEY[^{]*\{(?P<body>.*?)\};",
        text,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError(
            f"Could not locate MODULE_TO_FRONTEND_KEY export in {SHARED_MODULES_TS}"
        )
    body = match.group("body")
    keys: set[str] = set()
    # Quoted hyphenated keys, e.g. "http-security": "headers".
    keys.update(re.findall(r'["\']([\w-]+)["\']\s*:', body))
    # Bare identifier keys, e.g. ssl: "ssl".
    keys.update(re.findall(r"(?:^|[\s,{])([A-Za-z_]\w*)\s*:", body, re.MULTILINE))
    return keys


@pytest.mark.unit
def test_backend_all_modules_matches_shared_scan_modules() -> None:
    shared = set(_read_shared_scan_modules())
    backend = set(ALL_MODULES)
    extra_in_backend = sorted(backend - shared)
    extra_in_shared = sorted(shared - backend)
    assert not extra_in_backend, (
        "Backend ALL_MODULES contains modules not registered in shared/constants/modules.ts: "
        f"{extra_in_backend}"
    )
    assert not extra_in_shared, (
        "shared/constants/modules.ts contains modules missing from backend ALL_MODULES: "
        f"{extra_in_shared}"
    )


@pytest.mark.unit
def test_backend_module_to_frontend_key_matches_shared() -> None:
    shared_keys = _read_shared_frontend_key_mapping()
    backend_keys = set(MODULE_TO_FRONTEND_KEY.keys())
    extra_in_backend = sorted(backend_keys - shared_keys)
    extra_in_shared = sorted(shared_keys - backend_keys)
    assert not extra_in_backend, (
        "Backend MODULE_TO_FRONTEND_KEY has keys not declared in shared: "
        f"{extra_in_backend}"
    )
    assert not extra_in_shared, (
        "shared MODULE_TO_FRONTEND_KEY has keys not declared in backend: "
        f"{extra_in_shared}"
    )
