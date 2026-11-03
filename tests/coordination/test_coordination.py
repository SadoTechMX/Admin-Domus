"""Synthetic fixtures; never import application code or contact its backend."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'docs/ecosistema'
SPEC = importlib.util.spec_from_file_location('domus_coord', PACKAGE / 'herramientas/coord.py')
coord = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(coord)


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'context'
        self.root.mkdir()
        original = json.loads((PACKAGE / 'MANIFIESTO.json').read_text())
        for name in ['MANIFIESTO.json', *original['files']]:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PACKAGE / name, target)

    def manifest(self, mutate):
        path = self.root / 'MANIFIESTO.json'
        data = json.loads(path.read_text())
        mutate(data)
        path.write_text(json.dumps(data))

    def synthetic_repo(self):
        repo = Path(self.temp.name) / 'repo'
        repo.mkdir()
        (repo / 'sample.js').write_text('/* synthetic */\n')
        digest = hashlib.sha256((repo / 'sample.js').read_bytes()).hexdigest()
        self.manifest(lambda m: m.update(source_files={'sample.js': digest}))
        return repo

    def test_original_package_verifies(self):
        self.assertEqual(coord.read_manifest(self.root)['version'], '2.0.0')

    def test_modified_context_blocks(self):
        (self.root / 'CONTEXTO_COMUN_DOMUS_v2.txt').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'CONTEXT_FILE_CHANGED'):
            coord.read_manifest(self.root)

    def test_missing_manifest_blocks(self):
        (self.root / 'MANIFIESTO.json').unlink()
        with self.assertRaises(FileNotFoundError):
            coord.read_manifest(self.root)

    def test_manifest_path_cannot_escape(self):
        self.manifest(lambda m: m['files'].update({'../outside': 'invalid'}))
        with self.assertRaisesRegex(ValueError, 'PATH_OUTSIDE_PACKAGE'):
            coord.read_manifest(self.root)

    def test_source_path_cannot_escape(self):
        repo = self.synthetic_repo()
        self.manifest(lambda m: m['source_files'].update({'../outside': 'invalid'}))
        with self.assertRaisesRegex(ValueError, 'SOURCE_PATH_OUTSIDE_REPOSITORY'):
            coord.snapshot(self.root, repo)

    def test_changed_source_requires_review(self):
        repo = self.synthetic_repo()
        (repo / 'sample.js').write_text('changed')
        with patch.object(coord, 'git', return_value='synthetic-head'):
            state = coord.snapshot(self.root, repo)
        self.assertEqual(state['status'], 'BLOCKED_CODE_DRIFT')
        self.assertEqual(state['changed_source_files'], ['sample.js'])

    def test_missing_source_requires_review(self):
        repo = self.synthetic_repo()
        (repo / 'sample.js').unlink()
        with patch.object(coord, 'git', return_value='synthetic-head'):
            state = coord.snapshot(self.root, repo)
        self.assertFalse(state['source_files_match'])

    def test_clean_snapshot_does_not_claim_connections(self):
        repo = self.synthetic_repo()
        with patch.object(coord, 'git', return_value='synthetic-head'):
            state = coord.snapshot(self.root, repo)
        self.assertEqual(state['status'], 'REFERENCE_MATCH')
        self.assertFalse(state['all_platforms_connected'])

    def test_wrong_hash_creates_no_ack(self):
        out = Path(self.temp.name) / 'acks'
        with self.assertRaisesRegex(ValueError, 'ACK_CONTEXT_MISMATCH'):
            coord.acknowledge({'context_sha256': 'expected'}, 'codex', 'U00', 'wrong', out)
        self.assertFalse(out.exists())

    def test_acks_are_append_only(self):
        out = Path(self.temp.name) / 'acks'
        first = coord.acknowledge({'context_sha256': 'hash'}, 'codex', 'U00', 'hash', out)
        original = first.read_bytes()
        second = coord.acknowledge({'context_sha256': 'hash'}, 'codex', 'U00', 'hash', out)
        self.assertNotEqual(first, second)
        self.assertEqual(first.read_bytes(), original)
        self.assertEqual(len(list(out.glob('*.json'))), 2)

    def test_empty_task_creates_no_ack(self):
        out = Path(self.temp.name) / 'acks'
        with self.assertRaisesRegex(ValueError, 'ACK_TASK_REQUIRED'):
            coord.acknowledge({'context_sha256': 'hash'}, 'codex', '', 'hash', out)
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
