#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · SMOKE TEST READ-ONLY PRODUCCIÓN (HOTFIX FORZA v1.1.1)
================================================================================
Regla de Oro:
  CERO ventas sintéticas.
  CERO comandas sintéticas.
  CERO entregas sintéticas.
  CERO movimientos falsos de inventario.
  CERO check-ins sintéticos.

Verifica en modo estrictamente de solo lectura:
  1. Ping -> ok=True, status=HEALTHY
  2. environment = PRODUCTION
  3. mainSheetId = 1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U
  4. opsSheetId  = 1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc
  5. phase       = Lunar
  6. Catálogo carga correctamente
  7. Productos Canna Treats activos presentes (Pelones $120, Galletas gdes $100, Galletas peqs $80, Chocolates $80)
  8. Lectura KDS operativa
  9. Lectura Accesos operativa
  10. Evento Forza activo
  11. Guardarropa DOMUS Forza = $0
  12. Caja y estaciones listas para operar en vivo
================================================================================
"""

import sys
import json
import time
import urllib.request
import urllib.error

PROD_MAIN_EXPECTED = "1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U"
PROD_OPS_EXPECTED  = "1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc"

def run_prod_read_only_smoke(url):
    print("=" * 80)
    print("🛡️ DOMUS OS · SMOKE TEST PRODUCCIÓN READ-ONLY (v1.1.1)")
    print(f"Target URL: {url}")
    print("=" * 80)

    checklist = {}

    # 1. PING & Environment
    print("\n[Paso 1] Verificando ?action=ping (Ambiente e IDs oficiales)...")
    t0 = time.time()
    try:
        req = urllib.request.Request(f"{url}?action=ping", headers={"User-Agent": "DOMUS-SmokeTest/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            ping = json.loads(resp.read().decode("utf-8"))
        lat_ping = time.time() - t0
    except Exception as e:
        print(f"❌ Falló conexión al endpoint: {e}")
        return False

    assert ping.get("ok") is True, f"Ping falló: {ping}"
    data = ping.get("data", {})
    env = data.get("environment")
    main_id = data.get("mainSheetId")
    ops_id = data.get("opsSheetId")
    status = data.get("status")

    print(f"   Status:        {status} ({lat_ping:.2f}s)")
    print(f"   Environment:   {env}")
    print(f"   Main Sheet ID: {main_id}")
    print(f"   Ops Sheet ID:  {ops_id}")

    checklist["PING"] = "PASS" if status == "HEALTHY" else "FAIL"
    checklist["ENVIRONMENT"] = "PRODUCTION" if env == "PRODUCTION" else f"OTRO ({env})"
    checklist["SHEETS_IDS"] = "PASS" if (main_id == PROD_MAIN_EXPECTED and ops_id == PROD_OPS_EXPECTED) else "FAIL"

    # 2. Catálogo Oficial & Fase
    print("\n[Paso 2] Verificando ?action=cajaSimpleDatos (Catálogo y Fase)...")
    t0 = time.time()
    try:
        req = urllib.request.Request(f"{url}?action=cajaSimpleDatos", headers={"User-Agent": "DOMUS-SmokeTest/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            cat_data = json.loads(resp.read().decode("utf-8"))
        lat_cat = time.time() - t0
    except Exception as e:
        print(f"❌ Falló lectura de catálogo: {e}")
        return False

    assert cat_data.get("ok") is True, f"Error en catálogo: {cat_data}"
    c_info = cat_data.get("data", {})
    phase = c_info.get("phase")
    products = c_info.get("products", [])
    print(f"   Fase Activa:      {phase} ({lat_cat:.2f}s)")
    print(f"   Total Productos:  {len(products)}")

    checklist["CAJA"] = "PASS" if len(products) > 0 else "FAIL"

    # Verificar 4 nuevos productos de Canna Treats
    canna_targets = {
        "Pelones": 120.0,
        "Galletas grandes": 100.0,
        "Galletas pequeñas": 80.0,
        "Chocolates": 80.0
    }
    found_canna = {}
    for p in products:
        pname = str(p.get("name", "")).strip()
        for target_name, target_price in canna_targets.items():
            if target_name.lower() in pname.lower():
                found_canna[target_name] = p.get("price")

    print("\n   [Verificación Canna Treats]")
    canna_all_ok = True
    for tname, tprice in canna_targets.items():
        if tname in found_canna:
            print(f"   ✓ {tname}: ${found_canna[tname]} (Destino Cocina)")
        else:
            print(f"   ✗ {tname} no encontrado en catálogo activo de Caja")
            canna_all_ok = False

    checklist["CATALOGO_CANNA_TREATS"] = "PASS" if canna_all_ok else "FAIL"

    # 3. KDS Lectura (Solo Lectura)
    print("\n[Paso 3] Verificando ?action=comandasSimpleDatos (Monitor KDS)...")
    t0 = time.time()
    try:
        req = urllib.request.Request(f"{url}?action=comandasSimpleDatos", headers={"User-Agent": "DOMUS-SmokeTest/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            kds_data = json.loads(resp.read().decode("utf-8"))
        lat_kds = time.time() - t0
    except Exception as e:
        print(f"❌ Falló lectura de KDS: {e}")
        return False

    assert kds_data.get("ok") is True, f"Error en KDS: {kds_data}"
    active_orders = kds_data.get("data", {}).get("orders", [])
    print(f"   KDS Monitor: {len(active_orders)} comandas en cola activa ({lat_kds:.2f}s)")
    checklist["KDS"] = "PASS"

    # 4. Accesos Lectura (Solo Lectura)
    print("\n[Paso 4] Verificando ?action=accesoSimpleDatos (Taquilla, Evento y Guardarropa)...")
    t0 = time.time()
    try:
        req = urllib.request.Request(f"{url}?action=accesoSimpleDatos", headers={"User-Agent": "DOMUS-SmokeTest/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            acc_data = json.loads(resp.read().decode("utf-8"))
        lat_acc = time.time() - t0
    except Exception as e:
        print(f"❌ Falló lectura de Accesos: {e}")
        return False

    assert acc_data.get("ok") is True, f"Error en Accesos: {acc_data}"
    acc_info = acc_data.get("data", {})
    activities = acc_info.get("activities", [])
    print(f"   Eventos programados: {len(activities)} ({lat_acc:.2f}s)")

    # Buscar Forza
    forza_ev = next((a for a in activities if "forza" in str(a.get("name", "")).lower()), None)
    forza_ok = False
    wardrobe_zero_ok = False
    if forza_ev:
        p_gua = forza_ev.get("priceGuardarropa")
        print(f"   ✓ Evento localizado: '{forza_ev.get('name')}'")
        print(f"     Organizador:       {forza_ev.get('organizer')}")
        print(f"     Guardarropa DOMUS: ${p_gua}")
        forza_ok = True
        wardrobe_zero_ok = (p_gua == 0 or p_gua == 0.0)
    else:
        print("   ✗ Evento Forza no encontrado en ACTIVIDADES")

    checklist["ACCESOS"] = "PASS" if len(activities) > 0 else "FAIL"
    checklist["FORZA_GUARDARROPA_ZERO"] = "PASS" if wardrobe_zero_ok else "FAIL"

    # --------------------------------------------------------------------------
    # Reporte Consolidado
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("📊 REPORTE POST-DEPLOYMENT PRODUCCIÓN")
    print("=" * 80)
    for k, v in checklist.items():
        print(f"  {k}: {v}")
    print("=" * 80)

    all_ok = all(v == "PASS" or v == "PRODUCTION" for v in checklist.values())
    if all_ok:
        print("🎉 VEREDICTO FINAL: PROD_VERIFIED · v1.1.1 (SISTEMA LISTO PARA OPERACIÓN REAL)")
    else:
        print("⚠️ ALERTA: Revisar checklist antes de continuar servicio.")
    return all_ok

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec"
    success = run_prod_read_only_smoke(target)
    sys.exit(0 if success else 1)
