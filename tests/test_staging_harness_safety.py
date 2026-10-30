"""No live requests: ensure legacy harness cannot bypass write-target protection."""
import contextlib
import io
import unittest
from unittest.mock import patch

import test_staging_suite as harness
from guardrails import PRODUCTION_DEPLOYMENT_ID, UNSAFE_LEGACY_DEPLOYMENT


class HarnessSafety(unittest.TestCase):
    def test_production_and_legacy_urls_block_before_any_request(self):
        for deployment in [PRODUCTION_DEPLOYMENT_ID, UNSAFE_LEGACY_DEPLOYMENT]:
            url = f'https://script.google.com/macros/s/{deployment}/exec'
            with self.subTest(deployment=deployment), patch.object(harness.urllib.request, 'urlopen') as network:
                with self.assertRaisesRegex(RuntimeError, 'WRITE TEST BLOCKED'):
                    harness.DomusStagingClient(url).post('authCrearSesion')
                with self.assertRaisesRegex(RuntimeError, 'WRITE TEST BLOCKED'):
                    harness.run_tests(url)
                network.assert_not_called()

    def test_failed_book_verification_never_sends_post(self):
        url = 'https://script.google.com/macros/s/fixture/exec'
        with patch.object(harness, 'verify_write_target', side_effect=RuntimeError('Ops mismatch')) as verify, \
             patch.object(harness.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(RuntimeError, 'Ops mismatch'):
                harness.DomusStagingClient(url).post('cajaSimpleRegistrar', payload={'id': 'fixture'})
            verify.assert_called_once_with(url)
            network.assert_not_called()

    def test_full_suite_aborts_before_catalog_or_authentication_on_failed_preflight(self):
        with patch.object(harness, 'verify_write_target', side_effect=RuntimeError('No isolation')), \
             patch.object(harness.urllib.request, 'urlopen') as network, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, 'No isolation'):
                harness.run_tests('https://script.google.com/macros/s/fixture/exec')
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
