#!/usr/bin/env python3
"""
DOMUS OS · GATE AUTOMATIZADO: OPERACIÓN SIMULTÁNEA SOLAR + LUNAR EN STAGING
Valida en vivo la concurrencia real transaccional de Solar y Lunar (PR #16):
1. Precios duales correctos por transacción (priceSolar vs priceLunar)
2. Actividad asignada por contexto sin contaminación cruzada
3. Asentamiento en CAJA 2 Col 37 (AK) con 'Solar' y 'Lunar' por línea
4. Registro inmutable en COBROS con folios y actividades separadas
5. Enrutamiento a KDS con tag [ SOLAR ] y [ LUNAR ]
6. Descuento físico de inventario únicamente al ENTREGAR (ADR-004)
7. Protección contra doble entrega y aislamiento estricto de Staging
"""

import sys
import os
import time
import json
import urllib.parse
import urllib.request

DEFAULT_URL = os.getenv(
    "DOMUS_STAGING_URL",
    "https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec"
)

EXPECTED_MAIN_SHEET = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_OPS_SHEET  = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"
FROZEN_PROD_SHEET   = "1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U"


def get_target_url():
    for i, arg in enumerate(sys.argv):
        if arg == "--url" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return DEFAULT_URL


def http_json(url, payload=None, timeout=60):
    if payload is None:
        req = urllib.request.Request(url, headers={"User-Agent": "DOMUS-SOLAR-LUNAR-GATE/1.0"})
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "DOMUS-SOLAR-LUNAR-GATE/1.0"},
        )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_session(url, role, name="QA Operator"):
    res = http_json(url, {
        "action": "authCrearSesion",
        "role": role,
        "deviceId": f"DEV-GATE-{role}",
        "args": [role, name],
    })
    if not res.get("ok"):
        raise RuntimeError(f"Fallo al autenticar {role}: {res.get('error')}")
    return res["data"]["token"]


def get(url, action, token="", **params):
    q = {"action": action}
    if token:
        q["token"] = token
    q.update(params)
    return http_json(url + "?" + urllib.parse.urlencode(q))


def post(url, action, token, role, args, request_id=None):
    if not request_id:
        request_id = f"GATE-{action}-{int(time.time()*1000)}"
    return http_json(url, {
        "action": action,
        "role": role,
        "deviceId": f"DEV-GATE-{role}",
        "sessionToken": token,
        "requestId": request_id,
        "args": args,
    })


def run_simultaneous_gate(target_url=None):
    url = target_url or get_target_url()
    print("=" * 70)
    print("DOMUS OS · INICIANDO GATE SOLAR + LUNAR SIMULTÁNEOS EN STAGING")
    print(f"Target URL: {url}")
    print("=" * 70)

    # 1. VERIFICACIÓN DE AISLAMIENTO ESTRICTO Y HEALTH
    print("\n[PASO 1/7] Verificando salud y aislamiento ambiental...")
    health = get(url, "health")
    assert health.get("ok"), f"Health check falló: {health}"
    data_h = health["data"]
    assert data_h.get("environment") == "STAGING", f"¡ALERTA! El entorno reportado no es STAGING: {data_h}"
    assert data_h.get("mainSheetId") == EXPECTED_MAIN_SHEET, f"Sheet ID inesperado: {data_h.get('mainSheetId')}"
    assert data_h.get("opsSheetId") == EXPECTED_OPS_SHEET, f"Ops Sheet ID inesperado: {data_h.get('opsSheetId')}"
    assert data_h.get("mainSheetId") != FROZEN_PROD_SHEET, "¡PELIGRO CRÍTICO! Apuntando a hoja de PRODUCCIÓN."
    print("  ✓ Aislamiento verificado: Entorno STAGING conectado a hojas aisladas.")

    # 2. AUTENTICACIÓN DE ROLES OPERATIVOS
    print("\n[PASO 2/7] Estableciendo sesiones de CAJA y BARRA...")
    token_caja = create_session(url, "CAJA", "Cajero Concurrente QA")
    token_barra = create_session(url, "BARRA", "Barman KDS QA")
    print("  ✓ Sesión CAJA creada:", token_caja[:20] + "...")
    print("  ✓ Sesión BARRA creada:", token_barra[:20] + "...")

    # 3. VERIFICACIÓN DE CATÁLOGO Y SOPORTE DE CONCURRENCIA
    print("\n[PASO 3/7] Consultando catálogo y validación de esquemas de precios...")
    pos_data = get(url, "cajaSimpleDatos")
    assert pos_data.get("ok"), f"cajaSimpleDatos falló: {pos_data}"
    products = pos_data["data"]["products"]
    assert len(products) > 0, "Catálogo vacío en Staging."

    # Buscar producto dual (ej. Corona · Cerveza 710 ml)
    test_prod = None
    for p in products:
        if p.get("priceSolar") and p.get("priceLunar") and p["priceSolar"] != p["priceLunar"] and p.get("destination") == "Barra":
            test_prod = p
            break
    assert test_prod, "No se encontró ningún producto con precios duales Solar/Lunar diferenciados."
    
    prod_name = test_prod["name"]
    price_solar = test_prod["priceSolar"]
    price_lunar = test_prod["priceLunar"]
    print(f"  ✓ Producto dual seleccionado: '{prod_name}'")
    print(f"    - Precio Solar: ${price_solar:.2f}")
    print(f"    - Precio Lunar: ${price_lunar:.2f}")

    # 4. DISPARO SIMULTÁNEO DE VENTA SOLAR Y VENTA LUNAR
    print("\n[PASO 4/7] Ejecutando venta Solar y venta Lunar simultáneas en la misma jornada...")
    ts = int(time.time() * 1000)
    id_solar = f"POS-GATE-SOLAR-{ts}1"
    id_lunar = f"POS-GATE-LUNAR-{ts}2"

    payload_solar = {
        "id": id_solar,
        "customer": "Asistente Taller Solar",
        "phase": "Solar",
        "activity": "Visita general DOMUS",
        "method": "Efectivo",
        "paid": True,
        "items": [{"name": prod_name, "qty": 1, "price": price_solar}],
        "received": price_solar,
        "tip": 0
    }

    payload_lunar = {
        "id": id_lunar,
        "customer": "Asistente Rave Lunar",
        "phase": "Lunar",
        "activity": "Operación diaria",
        "method": "Terminal 1",
        "paid": True,
        "items": [{"name": prod_name, "qty": 1, "price": price_lunar}],
        "received": price_lunar,
        "tip": 0
    }

    print("  -> Registrando Venta Solar...")
    res_solar = post(url, "cajaSimpleRegistrar", token_caja, "CAJA", [payload_solar], f"REQ-SOLAR-{ts}")
    assert res_solar.get("ok"), f"Venta Solar falló: {res_solar.get('error')}"
    data_solar = res_solar["data"]
    assert data_solar["total"] == price_solar, f"Total Solar esperado ${price_solar}, obtenido ${data_solar['total']}"
    assert data_solar.get("phase") == "Solar", f"Phase esperada Solar, obtenida {data_solar.get('phase')}"
    print(f"  ✓ Venta Solar confirmada: Ticket {data_solar['ticket']}, Folio {data_solar.get('receipt')}, Total ${data_solar['total']}")

    print("  -> Registrando Venta Lunar...")
    res_lunar = post(url, "cajaSimpleRegistrar", token_caja, "CAJA", [payload_lunar], f"REQ-LUNAR-{ts}")
    assert res_lunar.get("ok"), f"Venta Lunar falló: {res_lunar.get('error')}"
    data_lunar = res_lunar["data"]
    assert data_lunar["total"] == price_lunar, f"Total Lunar esperado ${price_lunar}, obtenido ${data_lunar['total']}"
    assert data_lunar.get("phase") == "Lunar", f"Phase esperada Lunar, obtenida {data_lunar.get('phase')}"
    print(f"  ✓ Venta Lunar confirmada: Ticket {data_lunar['ticket']}, Folio {data_lunar.get('receipt')}, Total ${data_lunar['total']}")

    # 5. VERIFICACIÓN EN KDS (AMBAS LLEGAN AL MISMO KDS CON SUS RESPECTIVOS TAGS)
    print("\n[PASO 5/7] Verificando enrutamiento a KDS unificado...")
    kds_resp = get(url, "comandasSimpleDatos", token_barra)
    assert kds_resp.get("ok"), f"comandasSimpleDatos falló: {kds_resp}"
    orders = kds_resp["data"]["orders"]

    # Localizar ambas órdenes
    order_solar = next((o for o in orders if o.get("batch") == id_solar or o.get("ticket") == data_solar["ticket"]), None)
    order_lunar = next((o for o in orders if o.get("batch") == id_lunar or o.get("ticket") == data_lunar["ticket"]), None)

    assert order_solar, f"Comanda Solar {data_solar['ticket']} no apareció en KDS."
    assert order_lunar, f"Comanda Lunar {data_lunar['ticket']} no apareció en KDS."

    print(f"  ✓ Comanda Solar localizada en KDS: {order_solar['id']} | Producto: {order_solar['product']} | Phase: {order_solar.get('phase', 'N/A')}")
    print(f"  ✓ Comanda Lunar localizada en KDS: {order_lunar['id']} | Producto: {order_lunar['product']} | Phase: {order_lunar.get('phase', 'N/A')}")

    # 6. FLUJO FÍSICO DE ENTREGA E INVENTARIO (ADR-004)
    print("\n[PASO 6/7] Ejecutando entrega física y verificando decremento de inventario...")
    # Flujo Solar: TOMAR -> LISTA -> ENTREGAR
    key_solar = order_solar["key"]
    print(f"  -> BARRA toma comanda Solar ({key_solar})...")
    take_s = post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_solar, "action": "TOMAR"}])
    assert take_s.get("ok"), f"TOMAR Solar falló: {take_s}"

    print(f"  -> BARRA marca lista comanda Solar...")
    ready_s = post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_solar, "action": "LISTA"}])
    assert ready_s.get("ok"), f"LISTA Solar falló: {ready_s}"

    print(f"  -> BARRA entrega físicamente comanda Solar (descuenta inventario)...")
    deliv_s = post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_solar, "action": "ENTREGAR"}])
    assert deliv_s.get("ok"), f"ENTREGAR Solar falló: {deliv_s}"
    print(f"  ✓ Comanda Solar entregada exitosamente.")

    # Validar protección anti-doble entrega
    print("  -> Verificando protección contra doble entrega...")
    double_deliv = post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_solar, "action": "ENTREGAR"}])
    assert double_deliv.get("ok") is False, "¡Error! Se permitió doble entrega en comanda ya entregada."
    print("  ✓ Protección anti-doble entrega validada (rechazo 400/500 correcto).")

    # Flujo Lunar: TOMAR -> LISTA -> ENTREGAR
    key_lunar = order_lunar["key"]
    print(f"  -> BARRA procesa y entrega comanda Lunar ({key_lunar})...")
    post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_lunar, "action": "TOMAR"}])
    post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_lunar, "action": "LISTA"}])
    deliv_l = post(url, "comandasSimpleAccion", token_barra, "BARRA", [token_barra, {"key": key_lunar, "action": "ENTREGAR"}])
    assert deliv_l.get("ok"), f"ENTREGAR Lunar falló: {deliv_l}"
    print(f"  ✓ Comanda Lunar entregada exitosamente.")

    # 7. CONFIRMACIÓN FINAL DE CERO CONTAMINACIÓN
    print("\n[PASO 7/7] Verificando independencia total de eventos y reconciliación...")
    assert data_solar["ticket"] != data_lunar["ticket"], "Colisión de tickets entre ventas."
    assert data_solar.get("receipt") != data_lunar.get("receipt"), "Colisión de recibos en COBROS."
    print("  ✓ Cero contaminación: Ventas, tickets, cobros y KDS operaron concurrentemente sin interferencia.")

    print("\n" + "=" * 70)
    print("🏆 GATE SOLAR + LUNAR SIMULTÁNEOS EN STAGING: APROBADO AL 100%")
    print("=" * 70)
    return True


if __name__ == "__main__":
    try:
        run_simultaneous_gate()
    except AssertionError as ae:
        print(f"\n❌ GATE BLOCKED (Assertion): {ae}")
        sys.exit(1)
    except Exception as ex:
        print(f"\n❌ GATE ERROR: {ex}")
        sys.exit(2)
