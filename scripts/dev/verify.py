#!/usr/bin/env python3
"""Explicit, uncached local validation stages with durable execution evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time
import uuid

SCOPES = ('frontend', 'backend', 'scan', 'harness', 'all')
STAGES = ('iterate', 'pr', 'main')
TEST_ROOTS = {'frontend': 'tests', 'backend': 'backend/tests', 'scan': 'backend/scan/__tests__'}
LINT = {'frontend': 'lint-frontend', 'backend': 'lint-backend', 'scan': 'lint-osint'}
VERSION_TIMEOUT = 15
ERROR_EXIT = 2
INTERRUPTED_EXIT = 130


def build_plan(stage, scope, tests, root):
    """Return ordered argv/cwd records; paths are parsed before reaching tools."""
    if stage not in STAGES or scope not in SCOPES:
        raise ValueError('Unknown stage or scope')
    affected = list(TEST_ROOTS) if scope == 'all' else ([scope] if scope in TEST_ROOTS else [])
    focused = {name: [] for name in affected}
    root = root.resolve()
    for value in tests:
        path = (root / value).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f'Test must be an existing repository file: {value}')
        relative = path.relative_to(root)
        owner = next((name for name in affected if relative.is_relative_to(TEST_ROOTS[name])), None)
        if owner is None:
            raise ValueError(f'Test is outside the selected test scope: {value}')
        focused[owner].append(relative.as_posix())
    if stage != 'iterate' and tests:
        raise ValueError('--test is only valid for iterate')
    if stage == 'iterate' and any(not focused[name] for name in affected):
        raise ValueError('iterate requires --test for every selected code subsystem')
    plan = []
    def add(argv, cwd='.'):
        record = {'argv': argv, 'cwd': cwd}
        if record not in plan:
            plan.append(record)
    if stage == 'main':
        add([sys.executable, 'scripts/dev/local-regression.py'])
        if scope in ('backend', 'all'):
            add(['make', 'test-weekly-report-recovery'])
        return plan
    for name in affected:
        add(['make', LINT[name]])
    if stage == 'iterate':
        for name in affected:
            paths = list(dict.fromkeys(focused[name]))
            if name == 'frontend':
                add(['pnpm', 'exec', 'vitest', 'run', '--', *paths])
            elif name == 'backend':
                add(['uv', 'run', 'pytest', '--', *[str(Path(p).relative_to('backend')) for p in paths]], 'backend')
            else:
                add(['npm', 'test', '--', '--runTestsByPath', *[str(Path(p).relative_to('backend/scan')) for p in paths]], 'backend/scan')
    else:
        if affected:
            target = 'all' if scope == 'all' else ('osint' if scope == 'scan' else scope)
            add(['bash', 'scripts/ci/test.sh', target])
        if 'frontend' in affected:
            add(['pnpm', 'build'])
            add(['make', 'check-bundle'])
        add(['make', 'check-harness'])
    if stage == 'iterate' and scope in ('harness', 'all'):
        add(['make', 'test-harness-tools'])
    return plan


def capture(argv, root):
    result = subprocess.run(argv, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=VERSION_TIMEOUT, check=True)
    return result.stdout


def evidence(root):
    sha = capture(['git', 'rev-parse', 'HEAD'], root).decode().strip()
    tree = capture(['git', 'rev-parse', 'HEAD^{tree}'], root).decode().strip()
    diff = capture(['git', 'diff', '--binary', 'HEAD', '--'], root)
    untracked = capture(['git', 'ls-files', '--others', '--exclude-standard', '-z'], root)
    digest = hashlib.sha256(diff)
    for raw in sorted(filter(None, untracked.split(b'\0'))):
        path = root / raw.decode()
        digest.update(raw)
        digest.update(path.read_bytes() if path.is_file() else b'<non-file>')
    versions = {}
    for tool in ('git', 'make', 'python3', 'node', 'pnpm', 'npm', 'uv'):
        try:
            versions[tool] = capture([tool, '--version'], root).decode().strip()
        except (OSError, subprocess.SubprocessError) as error:
            versions[tool] = f'unavailable: {type(error).__name__}'
    return {'sha': sha, 'tree': tree, 'dirty_diff_sha256': digest.hexdigest(), 'tool_versions': versions}


def execute(plan, root, stage, scope):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    directory = root / 'quickstart/logs/validation' / f'{stamp}-{uuid.uuid4().hex}'
    directory.mkdir(parents=True)
    receipt_path = directory / 'receipt.json'
    receipt = {'stage': stage, 'scope': scope, 'success': False, 'commands': [], 'evidence_start': evidence(root)}
    def save():
        receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    save()
    code = 0
    for index, command in enumerate(plan):
        log_name = f'{index + 1:02d}.log'
        record = {**command, 'log': log_name, 'started_at': datetime.now(timezone.utc).isoformat()}
        started = time.monotonic()
        print(f"[{stage}/{scope}] {shlex.join(command['argv'])}", flush=True)
        with (directory / log_name).open('w') as log:
            try:
                result = subprocess.run(command['argv'], cwd=root / command['cwd'], stdout=log, stderr=subprocess.STDOUT, check=False)
                code = result.returncode
            except OSError as error:
                log.write(f'{type(error).__name__}: {error}\n')
                code = ERROR_EXIT
            except KeyboardInterrupt:
                log.write('Interrupted by user\n')
                code = INTERRUPTED_EXIT
        record.update(exit_code=code, duration_seconds=time.monotonic() - started, finished_at=datetime.now(timezone.utc).isoformat())
        receipt['commands'].append(record)
        save()
        if code:
            break
    receipt['evidence_end'] = evidence(root)
    receipt['success'] = code == 0 and receipt['evidence_start'] == receipt['evidence_end']
    if code == 0 and not receipt['success']:
        code = ERROR_EXIT
        receipt['error'] = 'Repository evidence changed during validation; run again on the final tree.'
    save()
    return code if code >= 0 else ERROR_EXIT, receipt_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True, choices=STAGES)
    parser.add_argument('--scope', choices=SCOPES, default='all')
    parser.add_argument('--test', action='append', default=[], help='Focused repository test file (repeatable; iterate only)')
    parser.add_argument('--base', default='origin/main', help='PR comparison base revision (must exist locally)')
    parser.add_argument('--head', default='HEAD', help='PR comparison head revision')
    parser.add_argument('--plan', action='store_true', help='Print commands without running or creating evidence')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        plan = build_plan(args.stage, args.scope, args.test, root)
    except ValueError as error:
        parser.error(str(error))
    if args.stage == 'pr':
        try:
            base = capture(['git', 'rev-parse', '--verify', args.base + '^{commit}'], root).decode().strip()
            head = capture(['git', 'rev-parse', '--verify', args.head + '^{commit}'], root).decode().strip()
        except (OSError, subprocess.SubprocessError) as error:
            parser.error(f'PR revisions must exist locally; pass --base and --head explicitly: {error}')
        for command in plan:
            if command['argv'] == ['make', 'check-harness']:
                command['argv'] += [f'BASE_SHA={base}', f'HEAD_SHA={head}']
    print({'iterate': 'Iteration feedback only; does not establish PR readiness.', 'pr': 'Final PR checks for the explicitly selected scope only.', 'main': 'Supplementary post-merge checks; final PR evidence remains required.'}[args.stage])
    if args.plan:
        for command in plan:
            print(f"(cwd={command['cwd']}) {shlex.join(command['argv'])}")
        return 0
    code, path = execute(plan, root, args.stage, args.scope)
    print(f'Receipt: {path}')
    return code


if __name__ == '__main__':
    sys.exit(main())
