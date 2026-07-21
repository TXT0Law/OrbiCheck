#!/usr/bin/env python3
"""Structured Harness checks for dependency and boundary policies."""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

IMPORT_PATTERN = re.compile(
    r"""(?:import\s+.*?\s+from|export\s+.*?\s+from|import)\s*["']([^"']+)["']"""
)
API_PARSER_PATTERN = re.compile(
    r"\b(?:parseSingle|parseList|parseOrThrow)\b|\.(?:parse|safeParse)\s*\("
)
SIDE_EFFECT_PATTERN = re.compile(
    r"\b(?:fetch|document\.|window\.|localStorage\.|sessionStorage\.)"
)
FRONTEND_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}
PYTHON_EXTENSIONS = {".py"}
API_EXEMPT_FILES = {
    "_validate.ts",
    "client.ts",
    "download.ts",
    "monitors-mock.ts",
}


def source_files(root: Path, directory: str, extensions: set[str]) -> list[Path]:
    base = root / directory
    if not base.exists():
        return []
    return sorted(
        path
        for path in base.rglob("*")
        if path.is_file()
        and path.suffix in extensions
        and "node_modules" not in path.parts
        and "__pycache__" not in path.parts
    )


def frontend_imports(path: Path) -> list[str]:
    return IMPORT_PATTERN.findall(path.read_text(encoding="utf-8"))


def python_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
    return imports


def check_dependency_direction(root: Path) -> list[str]:
    violations: list[str] = []
    frontend_rules = (
        ("shared", ("@/lib/", "@/components/", "@/app/", "@/backend/")),
        ("lib/api", ("@/lib/hooks/", "@/lib/stores/", "@/components/", "@/app/")),
        ("lib/utils", ("@/lib/api/", "@/lib/hooks/", "@/components/", "@/app/")),
        ("components/ui", ("@/components/scan/", "@/components/monitor/", "@/components/report/", "@/components/alerts/", "@/components/dashboard/", "@/components/settings/")),
    )
    for directory, forbidden_prefixes in frontend_rules:
        for path in source_files(root, directory, FRONTEND_EXTENSIONS):
            for imported in frontend_imports(path):
                if imported.startswith(forbidden_prefixes):
                    violations.append(
                        f"{path.relative_to(root)} imports forbidden {imported}"
                    )

    for directory in ("app", "components", "lib", "shared", "types"):
        for path in source_files(root, directory, FRONTEND_EXTENSIONS):
            for imported in frontend_imports(path):
                if "backend/" in imported:
                    violations.append(
                        f"{path.relative_to(root)} imports backend code: {imported}"
                    )

    for path in source_files(root, "backend/scan", {".js", ".mjs"}):
        for imported in frontend_imports(path):
            if "backend/app/" in imported:
                violations.append(
                    f"{path.relative_to(root)} imports backend app: {imported}"
                )

    backend_rules = (
        ("backend/app/api/v1/endpoints", ("app.models",)),
        ("backend/app/models", ("app.api", "app.services")),
    )
    for directory, forbidden_prefixes in backend_rules:
        for path in source_files(root, directory, PYTHON_EXTENSIONS):
            for imported in python_imports(path):
                if imported.startswith(forbidden_prefixes):
                    violations.append(
                        f"{path.relative_to(root)} imports forbidden {imported}"
                    )

    for path in source_files(root, "lib/utils", FRONTEND_EXTENSIONS):
        source = path.read_text(encoding="utf-8")
        if SIDE_EFFECT_PATTERN.search(source):
            violations.append(
                f"{path.relative_to(root)} contains browser/network side effects"
            )
    return violations


def route_boundary_violations(path: Path, root: Path) -> list[str]:
    violations: list[str] = []
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        route_decorators = [
            decorator
            for decorator in node.decorator_list
            if isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and decorator.func.attr in {"get", "post", "put", "patch", "delete"}
        ]
        if not route_decorators:
            continue
        has_response_model = any(
            any(keyword.arg == "response_model" for keyword in decorator.keywords)
            for decorator in route_decorators
        )
        if not has_response_model and node.returns is None:
            violations.append(
                f"{path.relative_to(root)}:{node.lineno} route {node.name} "
                "has neither response_model nor return annotation"
            )
    return violations


def check_boundary_validation(root: Path) -> list[str]:
    violations: list[str] = []
    for directory in ("lib/api", "lib/hooks"):
        for path in source_files(root, directory, {".ts", ".tsx"}):
            source = path.read_text(encoding="utf-8")
            if "as any" in source:
                violations.append(f"{path.relative_to(root)} contains 'as any'")

    for path in source_files(root, "lib/api", {".ts", ".tsx"}):
        if path.name in API_EXEMPT_FILES:
            continue
        source = path.read_text(encoding="utf-8")
        if "apiClient." in source and not API_PARSER_PATTERN.search(source):
            violations.append(
                f"{path.relative_to(root)} calls apiClient without runtime parsing"
            )

    for path in source_files(root, "backend/app", PYTHON_EXTENSIONS):
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                violations.append(
                    f"{path.relative_to(root)}:{node.lineno} contains bare except"
                )
        for line_number, line in enumerate(source.splitlines(), start=1):
            if "# type: ignore" in line and "# type: ignore[" not in line:
                violations.append(
                    f"{path.relative_to(root)}:{line_number} has unjustified type ignore"
                )

    for path in source_files(root, "backend/app/api/v1/endpoints", PYTHON_EXTENSIONS):
        violations.extend(route_boundary_violations(path, root))
    return violations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("check", choices=("dependency", "boundary"))
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    args = parser.parse_args()
    root = args.root.resolve()
    violations = (
        check_dependency_direction(root)
        if args.check == "dependency"
        else check_boundary_validation(root)
    )
    title = "Dependency direction" if args.check == "dependency" else "Boundary validation"
    if violations:
        print(f"{title} violations:", file=sys.stderr)
        for violation in violations:
            print(f"  - {violation}", file=sys.stderr)
        return 1
    print(f"{title} checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
