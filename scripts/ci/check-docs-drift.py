#!/usr/bin/env python3
"""Check generated documentation artifacts and local Markdown links."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
OPENAPI_PATH = PROJECT_ROOT / "docs" / "openapi.json"
INVENTORY_PATH = PROJECT_ROOT / "docs" / "inventory.json"
CORE_DOCS = (
    PROJECT_ROOT / "README.md",
    PROJECT_ROOT / "quickstart" / "quickStart.md",
)
AUTHORITATIVE_DOCS = tuple(
    path
    for path in (
        *CORE_DOCS,
        *sorted((PROJECT_ROOT / "docs").rglob("*.md")),
        *sorted(PROJECT_ROOT.rglob("AGENTS.md")),
    )
    if path.exists()
)
MARKDOWN_LINK_PATTERN = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")
MARKDOWN_HEADING_PATTERN = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")
SCAN_MODULE_PATTERN = re.compile(r'^\s+"([^"]+)",\s*$')
ROUTER_IMPORT_PATTERN = re.compile(r"^\s{4}([a-z_]+),\s*$")
INVENTORY_SCHEMA_VERSION = 1


def frontend_route(page_path: Path) -> str:
    relative = page_path.relative_to(PROJECT_ROOT / "app")
    parts = list(relative.parts[:-1])
    route = "/" + "/".join(parts)
    return route or "/"


def parse_compose_services() -> list[str]:
    compose_lines = (PROJECT_ROOT / "docker-compose.yml").read_text().splitlines()
    services: list[str] = []
    in_services = False
    for line in compose_lines:
        if line == "services:":
            in_services = True
            continue
        if in_services and line and not line.startswith(" "):
            break
        match = re.match(r"^  ([a-z0-9-]+):\s*$", line)
        if in_services and match:
            services.append(match.group(1))
    return sorted(services)


def parse_scan_modules() -> list[str]:
    source = (
        PROJECT_ROOT / "shared" / "constants" / "modules.ts"
    ).read_text().splitlines()
    modules: list[str] = []
    inside_modules = False
    for line in source:
        if line.startswith("export const SCAN_MODULES = ["):
            inside_modules = True
            continue
        if inside_modules and line.strip() == "] as const;":
            break
        if inside_modules and (match := SCAN_MODULE_PATTERN.match(line)):
            modules.append(match.group(1))
    return modules


def parse_api_routers() -> list[str]:
    source = (
        PROJECT_ROOT / "backend" / "app" / "api" / "v1" / "router.py"
    ).read_text().splitlines()
    routers: list[str] = []
    inside_import = False
    for line in source:
        if line == "from app.api.v1.endpoints import (":
            inside_import = True
            continue
        if inside_import and line == ")":
            break
        if inside_import and (match := ROUTER_IMPORT_PATTERN.match(line)):
            routers.append(match.group(1))
    return sorted(routers)


def build_inventory() -> dict[str, object]:
    frontend_pages = sorted(
        frontend_route(path)
        for path in (PROJECT_ROOT / "app").glob("**/page.tsx")
    )
    model_names = sorted(
        path.stem
        for path in (PROJECT_ROOT / "backend" / "app" / "models").glob("*.py")
        if path.name != "__init__.py"
    )
    task_names = sorted(
        path.stem
        for path in (PROJECT_ROOT / "backend" / "app" / "tasks").glob("*.py")
        if path.name != "__init__.py"
    )
    scan_modules = parse_scan_modules()
    compose_services = parse_compose_services()
    api_routers = parse_api_routers()
    return {
        "schemaVersion": INVENTORY_SCHEMA_VERSION,
        "composeServices": compose_services,
        "frontendRoutes": frontend_pages,
        "backendApiRouters": api_routers,
        "backendModels": model_names,
        "backendTasks": task_names,
        "scanModules": scan_modules,
        "counts": {
            "composeServices": len(compose_services),
            "frontendRoutes": len(frontend_pages),
            "backendApiRouters": len(api_routers),
            "backendModels": len(model_names),
            "backendTasks": len(task_names),
            "scanModules": len(scan_modules),
        },
    }


def build_openapi() -> dict[str, object]:
    sys.path.insert(0, str(BACKEND_ROOT))
    from app.main import app  # noqa: PLC0415

    return app.openapi()


def rendered_json(value: dict[str, object]) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def markdown_content_without_fences(contents: str) -> str:
    visible_lines: list[str] = []
    fence_marker: str | None = None
    for line in contents.splitlines():
        stripped = line.lstrip()
        marker = stripped[:3]
        if marker in {"```", "~~~"}:
            if fence_marker is None:
                fence_marker = marker
            elif fence_marker == marker:
                fence_marker = None
            continue
        if fence_marker is None:
            visible_lines.append(line)
    return "\n".join(visible_lines)


def markdown_anchors(contents: str) -> set[str]:
    anchors: set[str] = set()
    for line in markdown_content_without_fences(contents).splitlines():
        match = MARKDOWN_HEADING_PATTERN.match(line)
        if not match:
            continue
        heading = re.sub(r"<[^>]+>", "", match.group(1)).strip().lower()
        slug = re.sub(r"[^\w\-\s]", "", heading, flags=re.UNICODE)
        slug = re.sub(r"\s+", "-", slug).strip("-")
        if slug:
            anchors.add(slug)
    return anchors


def check_local_links() -> list[str]:
    failures: list[str] = []
    for document in AUTHORITATIVE_DOCS:
        contents = document.read_text()
        visible_contents = markdown_content_without_fences(contents)
        for raw_target in MARKDOWN_LINK_PATTERN.findall(visible_contents):
            target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            path_part, _, anchor = target.partition("#")
            decoded_path = unquote(path_part)
            resolved = (
                document
                if not decoded_path
                else (document.parent / decoded_path).resolve()
            )
            if not resolved.exists():
                failures.append(
                    f"{document.relative_to(PROJECT_ROOT)} -> {target}"
                )
                continue
            if anchor and resolved.suffix.lower() == ".md":
                normalized_anchor = unquote(anchor).lower()
                if normalized_anchor not in markdown_anchors(resolved.read_text()):
                    failures.append(
                        f"{document.relative_to(PROJECT_ROOT)} -> {target} "
                        "(missing anchor)"
                    )
    return failures


def write_artifacts() -> None:
    INVENTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_PATH.write_text(rendered_json(build_inventory()))
    OPENAPI_PATH.write_text(rendered_json(build_openapi()))


def check_artifacts() -> list[str]:
    failures: list[str] = []
    expected = {
        INVENTORY_PATH: rendered_json(build_inventory()),
        OPENAPI_PATH: rendered_json(build_openapi()),
    }
    for path, generated in expected.items():
        if not path.exists() or path.read_text() != generated:
            failures.append(
                f"{path.relative_to(PROJECT_ROOT)} is stale; "
                "run `make docs-generate`"
            )
    failures.extend(check_local_links())
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="Regenerate inventory and OpenAPI artifacts.",
    )
    args = parser.parse_args()
    if args.write:
        write_artifacts()
        print("Generated docs/inventory.json and docs/openapi.json")
        return 0

    failures = check_artifacts()
    if failures:
        print("Documentation drift detected:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("Documentation inventory, OpenAPI, and local links are current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
