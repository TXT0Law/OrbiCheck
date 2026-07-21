"""Regression tests for generated documentation inventory."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

pytestmark = pytest.mark.unit

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CHECKER_PATH = PROJECT_ROOT / "scripts" / "ci" / "check-docs-drift.py"
EXPECTED_COMPOSE_SERVICES = 8
EXPECTED_SCAN_MODULES = 34


def load_checker() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_docs_drift", CHECKER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_generated_inventory_tracks_runtime_sources() -> None:
    checker = load_checker()

    inventory = checker.build_inventory()

    assert inventory["counts"]["composeServices"] == EXPECTED_COMPOSE_SERVICES
    assert inventory["counts"]["scanModules"] == EXPECTED_SCAN_MODULES
    assert "scanner" in inventory["composeServices"]
    assert "reports" in inventory["backendApiRouters"]
    assert "/dashboard/alerts" in inventory["frontendRoutes"]


def test_authoritative_document_links_resolve() -> None:
    checker = load_checker()

    assert checker.check_local_links() == []


def test_checker_does_not_depend_on_ignored_prompt_documents() -> None:
    checker = load_checker()

    relative_paths = {
        path.relative_to(PROJECT_ROOT).as_posix()
        for path in checker.AUTHORITATIVE_DOCS
    }
    assert not any(path.startswith("prompt_dev/") for path in relative_paths)
    assert "AGENTS.md" in relative_paths


def test_markdown_parser_ignores_fenced_examples_and_builds_anchors() -> None:
    checker = load_checker()
    contents = """
# Real Heading

```markdown
[example](missing.md)
# Not A Real Heading
```
"""

    visible = checker.markdown_content_without_fences(contents)

    assert "missing.md" not in visible
    assert checker.markdown_anchors(contents) == {"real-heading"}
