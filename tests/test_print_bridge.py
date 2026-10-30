#!/usr/bin/env python3
"""Canonical print-bridge regressions: temporary state and mocked CUPS, no physical device."""
import unittest
from bridge_recovery_regressions import BridgeRecovery

def run_tests():
    return unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(BridgeRecovery)).wasSuccessful()

if __name__ == '__main__':
    raise SystemExit(0 if run_tests() else 1)
