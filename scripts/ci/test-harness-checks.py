#!/usr/bin/env python3
"""Fixture self-tests for structured Harness checks."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

CHECKER_PATH = Path(__file__).with_name("harness_checks.py")
SPEC = importlib.util.spec_from_file_location("harness_checks", CHECKER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Cannot load harness checker")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class HarnessChecksTests(unittest.TestCase):
    def fixture(self, files: dict[str, str]) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        root = Path(temp_dir.name)
        for relative_path, contents in files.items():
            path = root / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents, encoding="utf-8")
        return root

    def test_valid_dependency_graph_passes(self) -> None:
        root = self.fixture(
            {
                "shared/types/item.ts": "export interface Item { id: string }\n",
                "lib/api/items.ts": 'import type { Item } from "@/shared/types/item";\n',
                "backend/app/services/items.py": "from app.models.item import Item\n",
                "backend/app/models/item.py": "class Item: ...\n",
            }
        )
        self.assertEqual(CHECKER.check_dependency_direction(root), [])

    def test_backend_reverse_import_fails(self) -> None:
        root = self.fixture(
            {
                "backend/app/api/v1/endpoints/items.py": (
                    "from app.models.item import Item\n"
                ),
            }
        )
        self.assertTrue(CHECKER.check_dependency_direction(root))

    def test_side_effect_utility_fails(self) -> None:
        root = self.fixture(
            {
                "lib/utils/download.ts": (
                    'export async function download() { return fetch("/api"); }\n'
                ),
            }
        )
        self.assertTrue(CHECKER.check_dependency_direction(root))

    def test_unparsed_api_response_fails(self) -> None:
        root = self.fixture(
            {
                "lib/api/items.ts": (
                    'import { apiClient } from "./client";\n'
                    'export async function list() { return apiClient.get("/items"); }\n'
                ),
            }
        )
        self.assertTrue(CHECKER.check_boundary_validation(root))

    def test_parsed_api_response_passes(self) -> None:
        root = self.fixture(
            {
                "lib/api/items.ts": (
                    'import { apiClient } from "./client";\n'
                    "export async function list() {\n"
                    '  const { data } = await apiClient.get("/items");\n'
                    '  return itemSchema.parse(data);\n'
                    "}\n"
                ),
            }
        )
        self.assertEqual(CHECKER.check_boundary_validation(root), [])

    def test_untyped_route_fails(self) -> None:
        root = self.fixture(
            {
                "backend/app/api/v1/endpoints/items.py": (
                    '@router.get("/items")\n'
                    "async def list_items():\n"
                    "    return []\n"
                ),
            }
        )
        self.assertTrue(CHECKER.check_boundary_validation(root))


if __name__ == "__main__":
    unittest.main()
