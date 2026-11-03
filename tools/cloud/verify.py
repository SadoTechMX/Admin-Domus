"""Allowlisted local checks only. No backend, deployment or network requests."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]


def run(command, repo):
    result = subprocess.run(command, cwd=repo, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout, end="", flush=True)
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr, flush=True)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default='node', help='Node executable, version 18 or newer')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        print(json.dumps({'status': 'BLOCKED', 'reason': 'PYTHON_3_10_REQUIRED'}))
        return 2
    node = shutil.which(args.node)
    if not node:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'NODE_REQUIRED'}))
        return 2
    version = subprocess.run([node, '--version'], text=True, capture_output=True)
    try:
        major = int(version.stdout.strip().lstrip('v').split('.')[0])
    except ValueError:
        major = 0
    if version.returncode or major < 18:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'NODE_18_REQUIRED'}))
        return 2
    checks = {
        'context_and_sources': [sys.executable, 'docs/ecosistema/herramientas/coord.py', 'status', '--repo', '.'],
        'synthetic_coordination_tests': [sys.executable, '-B', 'tests/coordination/test_coordination.py', '-v'],
        'frontend_syntax_only': [node, '--check', 'js/app.js'],
    }
    results = {}
    for name, command in checks.items():
        print('CHECK: ' + name, flush=True)
        results[name] = run(command, ROOT)
        if not results[name]:
            break
    passed = len(results) == len(checks) and all(results.values())
    print(json.dumps({'status': 'PASS' if passed else 'BLOCKED', 'checks': results,
                      'scope': 'COORDINATION_AND_SYNTAX_ONLY', 'backend_tests_selected': False, 'backend_requests_measured': False,
                      'deployment_commands_selected': False, 'offline_certified': False}))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
