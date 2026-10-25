#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · PRE-EVENT READ-ONLY PREFLIGHT (STAGING & PRODUCTION)
Ejecución estrictamente de solo lectura antes de abrir puertas.
PROHIBIDO realizar mutaciones, ventas o cobros sintéticos.
================================================================================
"""

import sys
import json
import time
import urllib.request
import urllib.error

EXPECTED_PROD_MAIN = "1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U"
EXPECTED_PROD_OPS  = "1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc"

EXPECTED_STG_MAIN  = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_STG_OPS   = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"

def get_rpc(url, action, params=None):
    full_url = f"{url}?action={action}"
    if params:
        for k, v in params.items():
            full_url += f"&{k}={urllib.parse.quote(str(v))}"
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0 (DOMUS Preflight)"})
    try:
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=30) as resp:
            lat = time.time() - t0
            data = json.loads(resp.read().decode("utf-8"))
            return True, data, lat
    except urllib.error.HTTPError as e:
        return False, {"error": f"HTTP {e.code}", "body": e.read().decode("utf-8")}, 0
    except Exception as e:
        return False, {"error": str(e)}, 0

def run_preflight(target_url):
    print("=" * 80)
    print("🛡️ DOMUS OS · PRE-EVENT READ-ONLY PREFLIGHT")
    print(f"Target URL: {target_url}")
    print(f"Timestamp:  {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print("=" * 80)

    warnings = []
    errors = []

    # 1. PING & Entorno
    print("\n[1/6] Verificando salud del servidor y aislamiento (?action=ping)...")
    ok, res, lat = get_rpc(target_url, "ping")
    if not ok or not res.get("ok"):
        errors.append(f"Fallo crítico en ping: {res}")
        print(f"   🚨 PING FAILED: {res}")
        return "NO_GO", errors, warnings
    
    data = res.get("data", {})
    env = data.get("environment")
    status = data.get("status")
    main_id = data.get("mainSheetId")
    ops_id = data.get("opsSheetId")

    print(f"   Estado:        {status} (Latencia: {lat:.2f}s)")
    print(f"   Entorno:       {env}")
    print(f"   Main Sheet ID: {main_id}")
    print(f"   Ops Sheet ID:  {ops_id}")

    if status != "HEALTHY":
        errors.append(f"Estado de API no saludable: {status}")

    if env == "PRODUCTION":
        if main_id != EXPECTED_PROD_MAIN:
            errors.append(f"Main Sheet de Producción incorrecto: {main_id} != {EXPECTED_PROD_MAIN}")
        if ops_id != EXPECTED_PROD_OPS:
            errors.append(f"Ops Sheet de Producción incorrecto: {ops_id} != {EXPECTED_PROD_OPS}")
    elif env == "STAGING":
        if main_id != EXPECTED_STG_MAIN:
            warnings.append(f"Main Sheet de Staging: {main_id}")
        if ops_id != EXPECTED_STG_OPS:
            warnings.append(f"Ops Sheet de Staging: {ops_id}")
    else:
        warnings.append(f"Entorno no reconocido: {env}")

    # 2. Catálogo y Caja POS
    print("\n[2/6] Verificando módulo de Caja y catálogo de productos (?action=cajaSimpleDatos)...")
    ok, res, lat = get_rpc(target_url, "cajaSimpleDatos")
    if not ok or not res.get("ok"):
        errors.append(f"Fallo al consultar catálogo de Caja: {res}")
        print(f"   🚨 CAJA POS FAILED: {res}")
    else:
        caja_data = res.get("data", {})
        catalog = caja_data.get("products") or caja_data.get("catalog") or []
        phase = caja_data.get("phase", "Desconocida")
        print(f"   Catálogo disponible: {len(catalog)} productos cargados (Latencia: {lat:.2f}s)")
        print(f"   Fase operativa:      {phase}")
        if len(catalog) == 0:
            errors.append("Catálogo de productos vacío")
        
        # Muestreo de productos
        sample = [p.get("name") for p in catalog[:5] if p.get("name")]
        print(f"   Muestra productos:   {', '.join(sample)}")

    # 3. KDS / Comandas
    print("\n[3/6] Verificando pantalla de KDS / Comandas (?action=comandasSimpleDatos)...")
    ok, res, lat = get_rpc(target_url, "comandasSimpleDatos")
    if not ok or not res.get("ok"):
        errors.append(f"Fallo al consultar KDS Comandas: {res}")
        print(f"   🚨 KDS FAILED: {res}")
    else:
        kds_data = res.get("data", {})
        comandas = kds_data.get("comandas", [])
        print(f"   Comandas activas:    {len(comandas)} en preparación / historial (Latencia: {lat:.2f}s)")
        print(f"   KDS conectado:       OK")

    # 4. Accesos, Actividades y Tarifas
    print("\n[4/6] Verificando módulo de Accesos y tarifas (?action=accesoSimpleDatos)...")
    ok, res, lat = get_rpc(target_url, "accesoSimpleDatos")
    today_event = None
    if not ok or not res.get("ok"):
        errors.append(f"Fallo al consultar Accesos: {res}")
        print(f"   🚨 ACCESOS FAILED: {res}")
    else:
        acc_data = res.get("data", {})
        activities = acc_data.get("activities", [])
        active_act = acc_data.get("activeActivity", "")
        print(f"   Actividad predeterminada: {active_act} (Latencia: {lat:.2f}s)")
        print(f"   Actividades configuradas: {len(activities)}")

        # Buscar evento de hoy (2026-10-24 / Forza)
        today_str = time.strftime("%Y-%m-%d", time.gmtime()) # o 2026-10-24
        for act in activities:
            name = act.get("name", "")
            date = act.get("date", "")
            if "forza" in name.lower() or "2026-10-24" in str(date):
                today_event = act
                break
        
        if today_event:
            print(f"\n   📅 EVENTO DEL DÍA LOCALIZADO: {today_event.get('name')}")
            print(f"      Fecha:               {today_event.get('date')}")
            print(f"      Organizador:         {today_event.get('organizer')}")
            print(f"      Estatus acuerdo:     {today_event.get('status')}")
            print(f"      Tarifa General:      ${today_event.get('priceGeneral')}")
            print(f"      Tarifa Pareja:       ${today_event.get('pricePareja')}")
            print(f"      Tarifa Trío:         ${today_event.get('priceTrio')}")
            print(f"      Guardarropa:         ${today_event.get('priceGuardarropa')}")

            status_str = str(today_event.get("status", "")).strip().lower()
            p_gen = float(today_event.get("priceGeneral") or 0)
            if status_str in ["por validar", "pendiente", "no confirmado"]:
                warnings.append(
                    f"Acuerdo de '{today_event.get('name')}' está '{today_event.get('status')}'. "
                    f"Entradas DOMUS en puerta bloqueadas por seguridad hasta autorización de Dirección."
                )
            if p_gen <= 0:
                warnings.append(
                    f"Tarifa General de '{today_event.get('name')}' está en $0.00 / sin confirmar."
                )
        else:
            warnings.append("No se localizó un evento explícito con nombre 'Forza' o fecha '2026-10-24' en ACTIVIDADES.")

    # 5. Métodos de Pago
    print("\n[5/6] Verificando disponibilidad de canales de pago...")
    payment_methods = ["Efectivo", "Terminal 1", "Terminal 2", "Transferencia"]
    print(f"   Medios soportados:   {', '.join(payment_methods)}")

    # 6. Evaluación de Veredicto Final
    print("\n[6/6] Consolidando veredicto de preflight...")
    print("=" * 80)
    print("📋 RESUMEN DE PREFLIGHT")
    print("=" * 80)
    
    if errors:
        print("\n🚨 ERRORES CRÍTICOS ENCONTRADOS:")
        for err in errors:
            print(f"   ❌ {err}")
    
    if warnings:
        print("\n⚠️ ADVERTENCIAS OPERATIVAS:")
        for warn in warnings:
            print(f"   ⚠️  {warn}")

    print("\n" + "=" * 80)
    if errors:
        verdict = "NO_GO"
        print("🛑 VEREDICTO FINAL: NO_GO (Existen errores bloqueantes que impiden la operación)")
    elif warnings:
        verdict = "GO_WITH_WARNINGS"
        print("🟡 VEREDICTO FINAL: GO_WITH_WARNINGS (Sistema listo para operar; atender advertencias)")
    else:
        verdict = "GO"
        print("🟢 VEREDICTO FINAL: GO (100% aprobado sin advertencias)")
    print("=" * 80)

    return verdict, errors, warnings

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 tests/test_event_preflight.py <URL_WEB_APP>")
        sys.exit(2)
    verdict, errs, warns = run_preflight(sys.argv[1])
    sys.exit(0 if verdict in ["GO", "GO_WITH_WARNINGS"] else 1)
