#!/usr/bin/env python3
"""Fixtures for the local validation stages (no application services required)."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('verify', Path(__file__).with_name('verify.py'))
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)


class VerifyTests(unittest.TestCase):
    def test_pr_has_one_coverage_pass_and_one_harness_pass(self):
        plan = verify.build_plan('pr', 'all', [], Path.cwd())
        commands = [item['argv'] for item in plan]
        self.assertEqual(commands.count(['bash', 'scripts/ci/test.sh', 'all']), 1)
        self.assertEqual(commands.count(['make', 'check-harness']), 1)
        self.assertEqual(len(commands), len({tuple(cmd) for cmd in commands}))
        self.assertNotIn(['make', 'test'], commands)

    def test_iteration_requires_focused_tests(self):
        with self.assertRaises(ValueError):
            verify.build_plan('iterate', 'backend', [], Path.cwd())

    def test_focused_test_must_stay_in_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'tests').mkdir()
            (root / 'tests/example.test.ts').touch()
            with self.assertRaises(ValueError):
                verify.build_plan('iterate', 'backend', ['tests/example.test.ts'], root)
            plan = verify.build_plan('iterate', 'frontend', ['tests/example.test.ts'], root)
            self.assertIn('tests/example.test.ts', plan[-1]['argv'])
            with self.assertRaises(ValueError):
                verify.build_plan('iterate', 'frontend', ['../outside.test.ts'], root)

    def test_main_is_supplementary_without_repeating_units(self):
        plan = verify.build_plan('main', 'backend', [], Path.cwd())
        self.assertEqual(plan[0]['argv'][-1], 'scripts/dev/local-regression.py')
        self.assertEqual(plan[-1]['argv'], ['make', 'test-weekly-report-recovery'])
        self.assertFalse(any('scripts/ci/test.sh' in item['argv'] for item in plan))

    def test_harness_iteration_is_cheap(self):
        self.assertEqual(verify.build_plan('iterate', 'harness', [], Path.cwd()),
                         [{'argv': ['make', 'test-harness-tools'], 'cwd': '.'}])

    def test_success_requires_unchanged_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = [{'argv': ['tool'], 'cwd': '.'}]
            with patch.object(verify, 'evidence', side_effect=[{'sha': 'old'}, {'sha': 'new'}]):
                with patch.object(verify.subprocess, 'run', return_value=subprocess.CompletedProcess(['tool'], 0)):
                    code, path = verify.execute(plan, root, 'pr', 'harness')
            self.assertNotEqual(code, 0)
            self.assertFalse(json.loads(path.read_text())['success'])

    def test_signal_cannot_create_success(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(verify, 'evidence', return_value={'sha': 'same'}):
                with patch.object(verify.subprocess, 'run', return_value=subprocess.CompletedProcess(['tool'], -15)):
                    code, path = verify.execute([{'argv': ['tool'], 'cwd': '.'}], Path(directory), 'pr', 'harness')
            self.assertGreater(code, 0)
            self.assertEqual(json.loads(path.read_text())['commands'][0]['exit_code'], -15)
            self.assertFalse(json.loads(path.read_text())['success'])

    def test_failure_stops_and_receipt_records_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = [{'argv': ['tool', 'first'], 'cwd': '.'}, {'argv': ['tool', 'second'], 'cwd': '.'}]
            def run(argv, **kwargs):
                kwargs['stdout'].write('original output\n')
                return subprocess.CompletedProcess(argv, 7)
            with patch.object(verify, 'evidence', return_value={'sha': 'abc', 'tree': 'def', 'dirty_diff_sha256': '123', 'tool_versions': {}}):
                with patch.object(verify.subprocess, 'run', side_effect=run) as mocked:
                    code, receipt_path = verify.execute(plan, root, 'pr', 'harness')
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(code, 7)
            self.assertEqual(mocked.call_count, 1)
            self.assertFalse(receipt['success'])
            self.assertEqual(receipt['commands'][0]['exit_code'], 7)
            self.assertEqual(receipt['evidence_start']['sha'], 'abc')
            self.assertTrue((receipt_path.parent / receipt['commands'][0]['log']).is_file())


if __name__ == '__main__':
    unittest.main()
