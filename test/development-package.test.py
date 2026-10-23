"""Regression checks for fail-closed development preparation.

The public-only Ed25519 fixture is RFC 8032 section 7.1 test vector 1,
wrapped as SubjectPublicKeyInfo. It is never used as the extension identity.
"""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('development', Path(__file__).parents[1] / 'scripts/prepare-development.py')
development = importlib.util.module_from_spec(spec)
spec.loader.exec_module(development)
PUBLIC_TEST_KEY = 'MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo='
TEST_ID = 'agodpnipnkcjllgaklfjffhnogbonlak'


class DevelopmentPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.key = self.root / 'public.txt'
        self.key.write_text(PUBLIC_TEST_KEY)
        self.package = self.root / 'runtime.zip'
        self.manifest = {'name': 'Azure DevOps Niceties', 'manifest_version': 3, 'version': '0.6.15', 'permissions': ['storage']}
        self.write_package()
        self.output = self.root / 'candidate'

    def write_package(self, extra=None):
        with zipfile.ZipFile(self.package, 'w') as archive:
            archive.writestr('manifest.json', json.dumps(self.manifest))
            if extra:
                archive.writestr(*extra)

    def test_rejects_non_public_key_inputs(self):
        for text in ('', 'not base64!', base64.b64encode(b'not DER').decode(), '-----BEGIN PUBLIC KEY-----'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                development.public_identity(text)

    def test_public_key_derives_expected_chrome_id(self):
        self.assertEqual(development.public_identity(PUBLIC_TEST_KEY), (PUBLIC_TEST_KEY, TEST_ID))

    def test_invalid_id_does_not_touch_output_or_read_key(self):
        with self.assertRaisesRegex(ValueError, 'exact 32-character'):
            development.prepare(Path('missing.zip'), Path('missing-key'), 'invalid', self.output)
        self.assertFalse(self.output.exists())

    def test_mismatched_public_identity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'does not match'):
            development.prepare(self.package, self.key, 'a' * 32, self.output)
        self.assertFalse(self.output.exists())

    def test_replacement_preparation_is_explicit(self):
        result = development.prepare(self.package, self.key, TEST_ID, self.output)
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertEqual(manifest['key'], PUBLIC_TEST_KEY)
        self.assertEqual(result['extension_id'], TEST_ID)
        self.assertEqual(result['mode'], 'replacement')
        self.assertFalse(result['production_modified'])

    def test_separate_mode_does_not_use_production_identity(self):
        result = development.prepare(self.package, None, None, self.output, 'separate')
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertNotIn('key', manifest)
        self.assertEqual(manifest['name'], 'Azure DevOps Niceties Development')
        self.assertIn('development candidate', manifest['version_name'])
        self.assertEqual(result['mode'], 'separate')
        with self.assertRaisesRegex(ValueError, 'never overwritten'):
            development.prepare(self.package, None, None, self.output, 'separate')

    def test_separate_mode_rejects_production_identity_inputs(self):
        with self.assertRaisesRegex(ValueError, 'cannot use production'):
            development.prepare(self.package, self.key, TEST_ID, self.output, 'separate')
        self.assertFalse(self.output.exists())

    def test_archive_traversal_is_rejected(self):
        self.write_package(('../escape', 'untrusted'))
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            development.prepare(self.package, None, None, self.output, 'separate')
        self.assertFalse((self.root / 'escape').exists())
        self.assertFalse(self.output.exists())

    def test_management_permission_is_rejected(self):
        self.manifest['permissions'].append('management')
        self.write_package()
        with self.assertRaisesRegex(ValueError, 'without management'):
            development.prepare(self.package, None, None, self.output, 'separate')
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
