"""Local, read-only version check plus append-only self-reported acknowledgments."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import uuid


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_manifest(root):
    root = root.resolve()
    manifest = json.loads((root / 'MANIFIESTO.json').read_text())
    for name, expected in manifest['files'].items():
        target = (root / name).resolve()
        if not target.is_relative_to(root):
            raise ValueError('MANIFEST_PATH_OUTSIDE_PACKAGE')
        if sha(target.read_bytes()) != expected:
            raise ValueError('CONTEXT_FILE_CHANGED: ' + name)
    context = root / 'CONTEXTO_COMUN_DOMUS_v2.txt'
    if sha(context.read_bytes()) != manifest['context_sha256']:
        raise ValueError('CONTEXT_HASH_MISMATCH')
    return manifest


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()


def snapshot(root, repo):
    manifest = read_manifest(root)
    repo = repo.resolve()
    changed = []
    for name, expected in manifest['source_files'].items():
        target = (repo / name).resolve()
        if not target.is_relative_to(repo):
            raise ValueError('SOURCE_PATH_OUTSIDE_REPOSITORY')
        if not target.is_file() or sha(target.read_bytes()) != expected:
            changed.append(name)
    return {'version': manifest['version'], 'context_sha256': manifest['context_sha256'],
            'code_head': git(repo, 'rev-parse', 'HEAD'),
            'reference_code_sha': manifest['reference_code_sha'],
            'source_files_match': not changed, 'changed_source_files': changed,
            'status': 'REFERENCE_MATCH' if not changed else 'BLOCKED_CODE_DRIFT',
            'all_platforms_connected': False}


def acknowledge(state, actor, task, context_sha, outdir):
    if context_sha != state['context_sha256']:
        raise ValueError('ACK_CONTEXT_MISMATCH')
    if not task or len(task) > 80:
        raise ValueError('ACK_TASK_REQUIRED')
    record = dict(state, actor=actor, task=task,
                  recorded_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  evidence_type='LOCAL_SELF_REPORT',
                  note='No network synchronization or identity attestation is implied.')
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / (actor + '-' + uuid.uuid4().hex + '.json')
    with path.open('x') as handle:
        json.dump(record, handle, indent=2, ensure_ascii=False)
        handle.write('\n')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'ack'])
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--actor', choices=['codex', 'codex-arquitectura', 'gemini', 'antigravity', 'antigravity-ide', 'dot'])
    parser.add_argument('--task')
    parser.add_argument('--context-sha')
    parser.add_argument('--outdir', type=Path)
    args = parser.parse_args()
    try:
        state = snapshot(Path(__file__).resolve().parents[1], args.repo)
        if args.command == 'ack':
            if not all([args.actor, args.task, args.context_sha, args.outdir]):
                parser.error('ack requires actor, task, context-sha and outdir')
            state['ack_file'] = str(acknowledge(state, args.actor, args.task, args.context_sha, args.outdir))
        print(json.dumps(state, indent=2, ensure_ascii=False))
        return 0 if state['source_files_match'] else 3
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print(json.dumps({'status': 'BLOCKED', 'error': str(error)}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
