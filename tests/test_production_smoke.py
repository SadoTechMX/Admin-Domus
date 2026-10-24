#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · PRODUCTION READ-ONLY SMOKE TEST
Valida el despliegue del Web App de PRODUCCIÓN de forma estrictamente de solo lectura.
PROHIBIDO crear ventas, cobros, comandas, entregas o movimientos de inventario sintéticos.
================================================================================
"""

import sys
import time
import json
import urllib.request
import urllib.error

EXPECTED_PROD_MAIN = "1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U"
EXPECTED_PROD_OPS  = "1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc"

def run_smoke_test(prod_url):
    print("=" * 80)
    print("🛡️ DOMUS OS · PRODUCTION READ-ONLY SMOKE TEST")
    print(f"Target URL: {prod_url}")
    print("=" * 80)

    # 1. PING & Environment Verification
    print("\n[Paso 1] Verificando estado y aislamiento de entorno con ?action=ping...")
    ping_url = f"{prod_url}?action=ping"
    t0 = time.time()
    try:
        with urllib.request.urlopen(ping_url, timeout=30) as resp:
            lat_ping = time.time() - t0
            ping_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"🚨 ERROR HTTP en ping: {e.code}")
        print(e.read().decode("utf-8"))
        return False

    print(f"   Respuesta ping ({lat_ping:.2f}s): {json.dumps(ping_data, indent=2)}")
    assert ping_data.get("ok") is True, f"Ping falló: {ping_data}"

    data = ping_data.get("data", {})
    status = data.get("status")
    env = data.get("environment")
    main_id = data.get("mainSheetId")
    ops_id = data.get("opsSheetId")

    print(f"\n   Status:        {status}")
    print(f"   Environment:   {env}")
    print(f"   Main Sheet ID: {main_id}")
    print(f"   Ops Sheet ID:  {ops_id}")

    assert status == "HEALTHY", f"Estado esperado HEALTHY, recibido: {status}"
    assert env == "PRODUCTION", f"🚨 ALERTA: Entorno esperado PRODUCTION, recibido: {env}"
    assert main_id == EXPECTED_PROD_MAIN, f"🚨 ALERTA: Main Sheet ID incorrecto: {main_id} != {EXPECTED_PROD_MAIN}"
    assert ops_id == EXPECTED_PROD_OPS, f"🚨 ALERTA: Ops Sheet ID incorrecto: {ops_id} != {EXPECTED_PROD_OPS}"

    print("   ✅ [PASS] Entorno confirmado como PRODUCTION estricto con los IDs de hoja oficiales.")

    # 2. Lectura Operativa de Catálogo (Solo Lectura)
    print("\n[Paso 2] Ejecutando lectura de catálogo de productos (Solo Lectura)...")
    cat_url = f"{prod_url}?action=cajaSimpleCatalogos"
    t0 = time.time()
    try:
        with urllib.request.urlopen(cat_url, timeout=30) as resp:
            lat_cat = time.time() - t0
            cat_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"🚨 ERROR HTTP en lectura de catálogo: {e.code}")
        return False

    print(f"   Respuesta catálogo ({lat_cat:.2f}s): ok={cat_data.get('ok')}")
    assert cat_data.get("ok") is True, f"Lectura de catálogo falló: {cat_data}"
    prods = cat_data.get("data", {}).get("products", [])
    phase = cat_data.get("data", {}).get("phase")
    print(f"   Fase Activa: {phase} | Total productos cargados: {len(prods)}")
    print("   ✅ [PASS] Lectura de catálogo completada exitosamente sin escrituras.")

    # 3. Lectura Operativa de KDS / Comandas (Solo Lectura)
    print("\n[Paso 3] Ejecutando lectura de estado KDS (Solo Lectura)...")
    # Generar sesión temporal de lectura para KDS
    auth_body = json.dumps({
        "action": "authCrearSesion",
        "args": ["COCINA", "Supervisión"],
        "role": "COCINA",
        "deviceId": "SMOKE-TEST-RO",
        "requestId": f"REQ-SMOKE-AUTH-{int(time.time()*1000)}"
    }).encode("utf-8")

    auth_req = urllib.request.Request(f"{prod_url}?action=authCrearSesion", data=auth_body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(auth_req, timeout=30) as resp:
        auth_data = json.loads(resp.read().decode("utf-8"))

    assert auth_data.get("ok") is True, f"Fallo al autenticar sesión de solo lectura: {auth_data}"
    kds_token = auth_data["data"]["token"]

    kds_body = json.dumps({
        "action": "comandasSimpleDatos",
        "args": [kds_token],
        "role": "COCINA",
        "sessionToken": kds_token,
        "deviceId": "SMOKE-TEST-RO",
        "requestId": f"REQ-SMOKE-KDS-{int(time.time()*1000)}"
    }).encode("utf-8")

    kds_req = urllib.request.Request(f"{prod_url}?action=comandasSimpleDatos", data=kds_body, headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(kds_req, timeout=30) as resp:
        lat_kds = time.time() - t0
        kds_res = json.loads(resp.read().decode("utf-8"))

    assert kds_res.get("ok") is True, f"Lectura de KDS falló: {kds_res}"
    active_orders = kds_res.get("data", {}).get("orders", [])
    print(f"   Respuesta KDS ({lat_kds:.2f}s): Comandas activas en cocina/barra = {len(active_orders)}")
    print("   ✅ [PASS] Lectura de KDS exitosa. Cero operaciones sintéticas emitidas.")

    print("\n" + "=" * 80)
    print("📋 RESUMEN DE SMOKE TEST PRODUCCIÓN")
    print("=" * 80)
    print(f"  • Status del Sistema:      HEALTHY ({lat_ping:.2f}s)")
    print(f"  • Entorno Reportado:       {env} (Esperado: PRODUCTION)")
    print(f"  • Libro Principal (Main):  {main_id}")
    print(f"  • Libro Operativo (Ops):   {ops_id}")
    print(f"  • Catálogo Oficial:        {len(prods)} productos ({lat_cat:.2f}s)")
    print(f"  • Monitor KDS:             {len(active_orders)} órdenes activas ({lat_kds:.2f}s)")
    print("  • Transacciones Sintéticas: ESTRICTAMENTE 0 (PROHIBIDAS)")
    print("=" * 80)
    print("🎉 SMOKE TEST PRODUCCIÓN APROBADO EXITOSAMENTE 🎉")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 tests/test_production_smoke.py <PROD_WEB_APP_URL>")
        sys.exit(2)
    success = run_smoke_test(sys.argv[1])
    sys.exit(0 if success else 1)
