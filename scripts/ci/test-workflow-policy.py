#!/usr/bin/env python3
"""Guard CI event ownership and retained quality checks using stdlib fixtures."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE_COMMANDS = {
    "test-required": (
        "bash scripts/ci/test-require-tests.sh",
        "bash scripts/ci/require-tests.sh",
    ),
    "lint": ("pnpm lint", "uv run ruff check .", "npm run lint"),
    "harness": ("bash scripts/ci/check-harness.sh", "make test-weekly-report-recovery"),
    "frontend": ("pnpm build", "pnpm check:bundle", "bash scripts/ci/test.sh frontend"),
    "backend": ("bash ../scripts/ci/test.sh backend",),
    "migrations": ("uv run alembic heads", "uv run alembic upgrade head"),
    "osint-engine": ("bash ../../scripts/ci/test.sh osint",),
    "scanner": (
        "uv run python -m unittest discover",
        "-s ../docker/scanner -p 'test_*.py'",
    ),
    "connected-e2e": ("pnpm exec playwright test --config=playwright.config.ts",),
}
MAIN_EVENTS = 'on:\n  push:\n    branches: ["main", "develop"]\n  pull_request:'
MANUAL_EVENTS = "on:\n  workflow_dispatch:"


def section(text: str, key: str) -> str:
    """Read a block in the repository's block-style workflow format, fail closed."""
    match = re.search(rf"^{re.escape(key)}:\s*\n(.*?)(?=^\S|\Z)", text, re.M | re.S)
    if match is None:
        raise ValueError(f"Missing {key} block")
    return f"{key}:\n{match.group(1)}".strip()


def policy_errors(workflows: dict[str, str]) -> list[str]:
    errors = []
    for filename, expected in (
        ("ci.yml", MAIN_EVENTS),
        ("frontend.yml", MANUAL_EVENTS),
        ("backend.yml", MANUAL_EVENTS),
    ):
        if section(workflows[filename], "on") != expected:
            errors.append(f"{filename}: unexpected events or branch/path filters")
    jobs = dict(
        re.findall(
            r"^  ([\w-]+):\n(.*?)(?=^  [\w-]+:\n|\Z)",
            section(workflows["ci.yml"], "jobs"),
            re.M | re.S,
        )
    )
    for job, commands in CORE_COMMANDS.items():
        body = jobs.get(job, "")
        if not body:
            errors.append(f"Missing core job: {job}")
        if re.search(r"^    if:", body, re.M) or "continue-on-error:" in body:
            errors.append(f"{job}: core job must remain mandatory")
        for command in commands:
            steps = re.split(r"^      - ", body, flags=re.M)
            matching_steps = [step for step in steps if command in step]
            if not matching_steps:
                errors.append(f"{job}: missing command {command}")
            elif any(re.search(r"^        if:", step, re.M) for step in matching_steps):
                errors.append(
                    f"{job}: required command must remain unconditional: {command}"
                )
    gate = jobs.get("quality-gate", "")
    for job in CORE_COMMANDS:
        if f"needs.{job}.result }}" not in gate:
            errors.append(f"quality-gate: missing result check {job}")
    needs = re.search(r"^    needs: \[(.*?)\]$", gate, re.M)
    if needs is None or set(needs.group(1).split(", ")) != set(CORE_COMMANDS):
        errors.append("quality-gate: must depend on every core job")
    if "if: ${{ always() }}" not in gate:
        errors.append("quality-gate: must run after failed dependencies")
    for filename, command in (
        ("frontend.yml", "pnpm test"),
        ("backend.yml", "UV_LINK_MODE=copy uv run pytest"),
    ):
        if command not in section(workflows[filename], "jobs"):
            errors.append(f"{filename}: diagnostic tests missing")
    return errors


class WorkflowPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflows = {
            name: (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
            for name in ("ci.yml", "frontend.yml", "backend.yml")
        }

    def valid_fixture(self) -> dict[str, str]:
        fixture = self.workflows.copy()
        for name in fixture:
            expected = MAIN_EVENTS if name == "ci.yml" else MANUAL_EVENTS
            fixture[name] = fixture[name].replace(
                section(fixture[name], "on"), expected
            )
        return fixture

    def test_repository_workflows_follow_policy(self) -> None:
        self.assertEqual(policy_errors(self.workflows), [])

    def test_valid_fixture_passes(self) -> None:
        self.assertEqual(policy_errors(self.valid_fixture()), [])

    def test_duplicate_or_filtered_events_fail(self) -> None:
        for filename, trigger in (
            ("ci.yml", MAIN_EVENTS.replace('["main", "develop"]', '["**"]')),
            ("ci.yml", MAIN_EVENTS + '\n    paths: ["app/**"]'),
            ("frontend.yml", "on:\n  push:\n  workflow_dispatch:"),
            ("backend.yml", "on:\n  pull_request:\n  workflow_dispatch:"),
        ):
            with self.subTest(filename=filename, trigger=trigger):
                fixture = self.valid_fixture()
                fixture[filename] = fixture[filename].replace(
                    section(fixture[filename], "on"), trigger
                )
                self.assertTrue(policy_errors(fixture))

    def test_each_core_command_is_required(self) -> None:
        for job, commands in CORE_COMMANDS.items():
            for command in commands:
                with self.subTest(job=job, command=command):
                    fixture = self.valid_fixture()
                    fixture["ci.yml"] = fixture["ci.yml"].replace(
                        command, "removed-command"
                    )
                    self.assertTrue(policy_errors(fixture))

    def test_optional_core_job_fails(self) -> None:
        fixture = self.valid_fixture()
        fixture["ci.yml"] = fixture["ci.yml"].replace(
            "  connected-e2e:\n", "  connected-e2e:\n    if: false\n"
        )
        self.assertTrue(policy_errors(fixture))

    def test_conditional_required_step_fails(self) -> None:
        fixture = self.valid_fixture()
        fixture["ci.yml"] = fixture["ci.yml"].replace(
            "      - name: Run connected Playwright tests\n",
            "      - name: Run connected Playwright tests\n        if: false\n",
        )
        self.assertTrue(policy_errors(fixture))

    def test_missing_core_job_fails(self) -> None:
        fixture = self.valid_fixture()
        fixture["ci.yml"] = fixture["ci.yml"].replace(
            "  scanner:\n", "  renamed-scanner:\n"
        )
        self.assertTrue(policy_errors(fixture))

    def test_missing_gate_dependency_fails(self) -> None:
        fixture = self.valid_fixture()
        fixture["ci.yml"] = fixture["ci.yml"].replace(
            ", scanner, connected-e2e]", ", scanner]"
        )
        self.assertTrue(policy_errors(fixture))

    def test_diagnostic_test_removal_fails(self) -> None:
        for filename, command in (
            ("frontend.yml", "pnpm test"),
            ("backend.yml", "UV_LINK_MODE=copy uv run pytest"),
        ):
            with self.subTest(filename=filename):
                fixture = self.valid_fixture()
                fixture[filename] = fixture[filename].replace(command, "echo removed")
                self.assertTrue(policy_errors(fixture))


if __name__ == "__main__":
    unittest.main()
