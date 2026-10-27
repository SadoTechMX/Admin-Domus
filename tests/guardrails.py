#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · PRODUCTION WRITE PROTECTION GUARDRAILS
================================================================================
Este módulo proporciona salvaguardas infranqueables para impedir que cualquier
prueba de integración o script automatizado ejecute operaciones de mutación o
escritura (POST, ventas, comanda, cobros, inventario) contra el entorno de
PRODUCCIÓN o contra las hojas de cálculo oficiales de producción.
================================================================================
"""

import json
import urllib.request
import urllib.error
import urllib.parse

# Identificadores Oficiales de Producción (ESTRICTAMENTE PROTEGIDOS)
PRODUCTION_DEPLOYMENT_ID = "AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk"
PRODUCTION_MAIN_SHEET_ID = "1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U"
PRODUCTION_OPS_SHEET_ID  = "1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc"

# Identificadores Oficiales de STAGING
STAGING_DEPLOYMENT_ID = "AKfycbwgLRDIvZ3rdl-dl3g_YtwexjYE7TBdGkxTfVdzBABb-58nKt-G7179bL163V5nTut2"
EXPECTED_STAGING_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_STAGING_OPS  = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"


def verify_write_target(url: str) -> dict:
    """
    Verifica de forma estricta y previa que el endpoint destino esté autorizado
    para pruebas de escritura (STAGING únicamente).

    Lanza RuntimeError si:
    1. La URL contiene el Deployment ID oficial de producción.
    2. El endpoint reporta environment == 'PRODUCTION'.
    3. El endpoint reporta mainSheetId == PRODUCTION_MAIN_SHEET_ID.
    4. El endpoint no es STAGING o usa hojas fuera del aislamiento.

    Retorna los datos de entorno reportados por el endpoint si es STAGING válido.
    """
    clean_url = str(url).strip()

    # 1. Verificación de URL estática
    if PRODUCTION_DEPLOYMENT_ID in clean_url:
        raise RuntimeError(
            f"WRITE TEST BLOCKED IN PRODUCTION: La URL objetivo contiene el Deployment ID "
            f"oficial de producción ({PRODUCTION_DEPLOYMENT_ID}). Los tests de mutación están estrictamente prohibidos."
        )

    # 2. Verificación de entorno dinámico mediante preflight (health/ping)
    data = None
    for action in ["health", "ping"]:
        try:
            req = urllib.request.Request(
                f"{clean_url}?action={action}",
                headers={"User-Agent": "DOMUS-Write-Guardrail/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if res.get("ok"):
                    data = res
                    break
        except Exception:
            continue

    if not data:
        raise RuntimeError(f"WRITE TEST BLOCKED: No fue posible verificar el entorno antes de escribir en {clean_url}")

    env_data = data.get("data", {})
    environment = env_data.get("environment")
    main_sheet_id = env_data.get("mainSheetId")

    # 3. Guardias explícitas de producción
    if environment == "PRODUCTION":
        raise RuntimeError("WRITE TEST BLOCKED IN PRODUCTION: El endpoint reporta entorno 'PRODUCTION'.")

    if main_sheet_id == PRODUCTION_MAIN_SHEET_ID:
        raise RuntimeError(
            f"WRITE TEST BLOCKED IN PRODUCTION: La hoja principal es PRODUCCIÓN ({PRODUCTION_MAIN_SHEET_ID})."
        )

    # 4. Validación afirmativa de STAGING
    if environment != "STAGING":
        raise RuntimeError(
            f"WRITE TEST BLOCKED: Entorno '{environment}' no autorizado para pruebas de escritura. Se requiere 'STAGING'."
        )

    if main_sheet_id != EXPECTED_STAGING_MAIN:
        raise RuntimeError(
            f"WRITE TEST BLOCKED: Hoja principal '{main_sheet_id}' no coincide con la esperada para STAGING ({EXPECTED_STAGING_MAIN})."
        )

    return env_data
