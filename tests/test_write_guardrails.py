#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · UNIT TEST: PRODUCTION WRITE PROTECTION GUARDRAILS
Valida que el módulo tests/guardrails.py bloquee de forma inmediata y determinista
cualquier intento de escribir o mutar contra producción.
================================================================================
"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "tests"))

from guardrails import (
    verify_write_target,
    PRODUCTION_DEPLOYMENT_ID,
    PRODUCTION_MAIN_SHEET_ID,
    EXPECTED_STAGING_MAIN
)

def test_blocks_production_deployment_url():
    prod_url = f"https://script.google.com/macros/s/{PRODUCTION_DEPLOYMENT_ID}/exec"
    try:
        verify_write_target(prod_url)
        assert False, "Debería haber lanzado RuntimeError para la URL de producción."
    except RuntimeError as e:
        assert "WRITE TEST BLOCKED IN PRODUCTION" in str(e)
        print("✅ PASS: Bloqueo por URL oficial de producción verificado.")

def test_blocks_production_sheet_and_env():
    # Simulación de respuesta con environment == PRODUCTION
    import unittest.mock as mock
    import urllib.request
    import io
    import json

    fake_prod_response = json.dumps({
        "ok": True,
        "data": {
            "environment": "PRODUCTION",
            "mainSheetId": PRODUCTION_MAIN_SHEET_ID
        }
    }).encode("utf-8")

    with mock.patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = mock.MagicMock()
        mock_resp.read.return_value = fake_prod_response
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        try:
            verify_write_target("https://script.google.com/macros/s/SOME_FAKE_ID/exec")
            assert False, "Debería haber lanzado RuntimeError al reportar PRODUCTION."
        except RuntimeError as e:
            assert "WRITE TEST BLOCKED IN PRODUCTION" in str(e)
            print("✅ PASS: Bloqueo dinámico por environment == PRODUCTION verificado.")

def test_blocks_non_staging_environment():
    import unittest.mock as mock
    import json

    fake_custom_response = json.dumps({
        "ok": True,
        "data": {
            "environment": "LOCAL_DEV",
            "mainSheetId": "some_random_sheet"
        }
    }).encode("utf-8")

    with mock.patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = mock.MagicMock()
        mock_resp.read.return_value = fake_custom_response
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        try:
            verify_write_target("https://script.google.com/macros/s/SOME_FAKE_ID/exec")
            assert False, "Debería haber lanzado RuntimeError para entorno fuera de STAGING."
        except RuntimeError as e:
            assert "WRITE TEST BLOCKED" in str(e)
            print("✅ PASS: Bloqueo para entorno fuera de STAGING verificado.")

def test_allows_valid_staging():
    import unittest.mock as mock
    import json

    fake_staging_response = json.dumps({
        "ok": True,
        "data": {
            "environment": "STAGING",
            "mainSheetId": EXPECTED_STAGING_MAIN
        }
    }).encode("utf-8")

    with mock.patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = mock.MagicMock()
        mock_resp.read.return_value = fake_staging_response
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        data = verify_write_target("https://script.google.com/macros/s/STAGING_DEPLOYMENT_ID/exec")
        assert data.get("environment") == "STAGING"
        assert data.get("mainSheetId") == EXPECTED_STAGING_MAIN
        print("✅ PASS: Validación exitosa para STAGING legítimo verificado.")

if __name__ == "__main__":
    test_blocks_production_deployment_url()
    test_blocks_production_sheet_and_env()
    test_blocks_non_staging_environment()
    test_allows_valid_staging()
    print("\n🎉 TODOS LOS TESTS DE GUARDRAIL DE PRODUCCIÓN PASARON CON ÉXITO (4/4).")
