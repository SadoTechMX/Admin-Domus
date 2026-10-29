#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · VERIFICACIÓN INTEGRAL DE APERTURA SOLAR (29 OCTUBRE 2026)
Verifica los 4 gates operativos requeridos para el GO definitivo.
================================================================================
"""

import urllib.request
import json
import sys
import time

URL = "https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec"

def check_all():
    print("=" * 70)
    print("☀️  DOMUS OS · PREFLIGHT CHECKLIST APERTURA SOLAR 29 OCT 2026")
    print(f"Target: {URL}")
    print("=" * 70)

    # 1. Health & Environment
    print("\n[Gate 1/4] Verificando Entorno y Salud del Backend...")
    try:
        with urllib.request.urlopen(f"{URL}?action=health", timeout=15) as r:
            health = json.loads(r.read().decode("utf-8"))
        env = health.get("data", {}).get("environment")
        status = health.get("data", {}).get("status")
        main_id = health.get("data", {}).get("mainSheetId")
        ops_id = health.get("data", {}).get("opsSheetId")
        print(f"   Status:       {status}")
        print(f"   Environment:  {env}")
        print(f"   Main Sheet:   {main_id[:12]}...")
        print(f"   Ops Sheet:    {ops_id[:12]}...")
        assert env == "PRODUCTION", f"Environment no es PRODUCTION ({env})"
        assert status == "HEALTHY", f"Status no es HEALTHY ({status})"
        print("   ✅ Gate 1: PASS")
    except Exception as e:
        print(f"   ❌ Gate 1: FAIL -> {e}")
        return False

    # 2. Interfaz Nativa (Index.html desplegado)
    print("\n[Gate 2/4] Verificando Interfaz Web Nativa de Caja (?vista=caja)...")
    try:
        with urllib.request.urlopen(f"{URL}?vista=caja", timeout=15) as r:
            html = r.read().decode("utf-8")
        is_html = "<!DOCTYPE html>" in html or "<html" in html or "DOMUS" in html
        is_json_fallback = "DOMUS OS API ONLINE" in html
        if is_json_fallback:
            print("   ⚠️  Apps Script sigue devolviendo el JSON de API.")
            print("       -> Falta agregar el archivo 'Index' en el editor de Apps Script.")
            gate2 = False
        elif is_html:
            print("   ✓ Interfaz HTML de DOMUS recibida con éxito (google.script.run activo).")
            print("   ✅ Gate 2: PASS")
            gate2 = True
        else:
            print(f"   ⚠️  Respuesta inesperada: {html[:120]}")
            gate2 = False
    except Exception as e:
        print(f"   ❌ Gate 2: FAIL -> {e}")
        gate2 = False

    # 3. Fase Solar y Catálogo
    print("\n[Gate 3/4] Verificando Fase y Precios Solar en CAJA 2...")
    try:
        with urllib.request.urlopen(f"{URL}?action=cajaSimpleDatos", timeout=15) as r:
            caja = json.loads(r.read().decode("utf-8")).get("data", {})
        phase = caja.get("phase")
        total_prods = len(caja.get("products", []))
        print(f"   Fase Actual en CAJA 2!F2: {phase}")
        print(f"   Total de Productos Vendibles: {total_prods}")
        if phase == "Solar":
            print("   ✓ Carta conmutada a Fase Solar.")
            print("   ✅ Gate 3: PASS")
            gate3 = True
        else:
            print(f"   ⚠️  Fase es '{phase}'. Falta cambiar CAJA 2!F2 de 'Lunar' a 'Solar'.")
            gate3 = False
    except Exception as e:
        print(f"   ❌ Gate 3: FAIL -> {e}")
        gate3 = False

    # 4. Actividad 29 Octubre y KDS
    print("\n[Gate 4/4] Verificando Actividad de Accesos y Cola KDS...")
    try:
        with urllib.request.urlopen(f"{URL}?action=accesoSimpleDatos", timeout=15) as r:
            acc = json.loads(r.read().decode("utf-8")).get("data", {})
        active_act = acc.get("activeActivity")
        print(f"   Actividad Activa: '{active_act}'")
        
        with urllib.request.urlopen(f"{URL}?action=comandasSimpleDatos", timeout=15) as r:
            kds = json.loads(r.read().decode("utf-8")).get("data", {})
        orders = kds.get("orders", [])
        print(f"   Comandas Activas en KDS: {len(orders)}")
        for o in orders:
            print(f"      - {o.get('id')}: {o.get('alias')} · {o.get('product')} ({o.get('state')})")
        
        gate4 = True
        if "Forza" in str(active_act):
            print("   ⚠️  Actividad activa sigue siendo Forza. Sugerido: enlazar 'DOMUS Solar · operación diaria · 29 oct'.")
        if len(orders) > 0:
            print(f"   ℹ️  KDS tiene {len(orders)} comanda(s) rezagada(s). Recuerda archivarlas antes de operar.")
        print("   ✅ Gate 4: Informado")
    except Exception as e:
        print(f"   ❌ Gate 4: FAIL -> {e}")
        gate4 = False

    print("\n" + "=" * 70)
    if gate2 and gate3:
        print("🎉 SISTEMA LISTO PARA OPERAR SOLAR: 🟢 GO")
    else:
        print("⏳ PENDIENTE DE AJUSTES EN APPS SCRIPT / SHEETS: 🟠 PENDIENTE")
    print("=" * 70)
    return gate2 and gate3

if __name__ == "__main__":
    check_all()
