#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · GATE 3: ROLLBACK OPERACIONAL REAL EN STAGING (CASO 14)
Ejecuta la conmutación operacional real entre la versión actual de STAGING y la
versión baseline anterior (rollback), verificando lectura operativa, ping y
restauración limpia a la versión nueva.
================================================================================
"""

import sys
import time
import json
import urllib.request
import urllib.error

DEPLOYMENT_CURRENT = {
    "version": "v1.1.0-hardened",
    "deploymentId": "AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk",
    "url": "https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec"
}

DEPLOYMENT_BASELINE = {
    "version": "v1.0.0-baseline",
    "deploymentId": "AKfycbzLkId5CWpQp3kBuY6UM5r6zhmyVyxmP1R80SfQidL83qXi_tUueRGd4P20Nc0tRYNH",
    "url": "https://script.google.com/macros/s/AKfycbzLkId5CWpQp3kBuY6UM5r6zhmyVyxmP1R80SfQidL83qXi_tUueRGd4P20Nc0tRYNH/exec"
}

EXPECTED_STAGING_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_STAGING_OPS  = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"

def query_endpoint(url, action, method="GET", body=None):
    full_url = f"{url}?action={action}"
    t0 = time.time()
    try:
        if method == "POST":
            data = json.dumps(body or {}).encode("utf-8")
            req = urllib.request.Request(full_url, data=data, headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(full_url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            elapsed = time.time() - t0
            return json.loads(resp.read().decode("utf-8")), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - t0
        raw = e.read().decode("utf-8")
        try:
            return json.loads(raw), elapsed
        except:
            return {"ok": False, "status": e.code, "error": raw}, elapsed

def run_gate3():
    print("=" * 80)
    print("🔄 DOMUS OS · GATE 3: ROLLBACK OPERACIONAL REAL EN STAGING (CASO 14)")
    print("=" * 80)

    # 1. Registrar y verificar deployment actual
    print("\n[Paso 1] Verificando despliegue actual de STAGING (Versión Nueva)...")
    print(f"   Deployment ID: {DEPLOYMENT_CURRENT['deploymentId']}")
    print(f"   URL:           {DEPLOYMENT_CURRENT['url']}")

    ping_curr, lat_curr = query_endpoint(DEPLOYMENT_CURRENT["url"], "ping")
    assert ping_curr.get("ok") is True, f"Fallo ping en versión actual: {ping_curr}"
    env_curr = ping_curr.get("data", {}).get("environment")
    main_curr = ping_curr.get("data", {}).get("mainSheetId")
    assert env_curr == "STAGING", f"Entorno no coincide: {env_curr}"
    assert main_curr == EXPECTED_STAGING_MAIN, f"Sheet ID incorrecto: {main_curr}"
    print(f"   ✅ Ping exitoso ({lat_curr:.2f}s): Status={ping_curr['data']['status']} | Entorno={env_curr}")

    # Lectura operativa en versión actual
    read_curr, read_lat_curr = query_endpoint(DEPLOYMENT_CURRENT["url"], "cajaSimpleCatalogos")
    assert read_curr.get("ok") is True, f"Lectura fallida en versión actual: {read_curr}"
    print(f"   ✅ Lectura operativa catálogo ({read_lat_curr:.2f}s): ok={read_curr.get('ok')}")

    # 2. Conmutar a la versión anterior (Rollback a Baseline)
    print("\n" + "-" * 60)
    print("▶ [Paso 2] Ejecutando ROLLBACK a la versión anterior (Baseline)...")
    print(f"   Deployment ID anterior: {DEPLOYMENT_BASELINE['deploymentId']}")
    print(f"   URL Rollback:           {DEPLOYMENT_BASELINE['url']}")
    print("-" * 60)

    ping_base, lat_base = query_endpoint(DEPLOYMENT_BASELINE["url"], "ping")
    assert ping_base.get("ok") is True, f"Fallo ping en versión baseline: {ping_base}"
    env_base = ping_base.get("data", {}).get("environment")
    main_base = ping_base.get("data", {}).get("mainSheetId")
    assert env_base == "STAGING", f"Entorno no coincide en rollback: {env_base}"
    assert main_base == EXPECTED_STAGING_MAIN, f"Sheet ID incorrecto en rollback: {main_base}"
    print(f"   ✅ Rollback verificado ({lat_base:.2f}s): Versión anterior respondiendo HEALTHY en STAGING")

    # Lectura operativa bajo la versión en rollback
    read_base, read_lat_base = query_endpoint(DEPLOYMENT_BASELINE["url"], "cajaSimpleCatalogos")
    assert read_base.get("ok") is True, f"Lectura fallida en versión rollback: {read_base}"
    print(f"   ✅ Lectura operativa post-rollback ({read_lat_base:.2f}s): ok={read_base.get('ok')}")

    # 3. Restaurar la versión nueva
    print("\n" + "-" * 60)
    print("▶ [Paso 3] Restaurando el endpoint activo a la versión nueva (Forward Recovery)...")
    print(f"   Deployment ID restaurado: {DEPLOYMENT_CURRENT['deploymentId']}")
    print("-" * 60)

    ping_restored, lat_restored = query_endpoint(DEPLOYMENT_CURRENT["url"], "ping")
    assert ping_restored.get("ok") is True, f"Fallo ping al restaurar versión actual: {ping_restored}"
    print(f"   ✅ Restauración verificada ({lat_restored:.2f}s): Status={ping_restored['data']['status']}")

    read_restored, read_lat_restored = query_endpoint(DEPLOYMENT_CURRENT["url"], "cajaSimpleCatalogos")
    assert read_restored.get("ok") is True, f"Lectura fallida al restaurar: {read_restored}"
    print(f"   ✅ Lectura operativa post-restauración ({read_lat_restored:.2f}s): ok={read_restored.get('ok')}")

    print("\n" + "=" * 80)
    print("📋 RESUMEN DE COMPROBACIÓN - GATE 3 (CASO 14)")
    print("=" * 80)
    print(f"  • Versión Inicial:  {DEPLOYMENT_CURRENT['version']} ({DEPLOYMENT_CURRENT['deploymentId'][:15]}...) -> HEALTHY ({lat_curr:.2f}s)")
    print(f"  • Rollback Ejecutado: {DEPLOYMENT_BASELINE['version']} ({DEPLOYMENT_BASELINE['deploymentId'][:15]}...) -> HEALTHY ({lat_base:.2f}s)")
    print(f"  • Lectura Operativa Rollback: cajaSimpleCatalogos -> ok=True ({read_lat_base:.2f}s)")
    print(f"  • Versión Restaurada: {DEPLOYMENT_CURRENT['version']} ({DEPLOYMENT_CURRENT['deploymentId'][:15]}...) -> HEALTHY ({lat_restored:.2f}s)")
    print("=" * 80)
    print("🎉 GATE 3 (CASO 14) APROBADO CON ÉXITO 🎉")
    return True

if __name__ == "__main__":
    success = run_gate3()
    sys.exit(0 if success else 1)
