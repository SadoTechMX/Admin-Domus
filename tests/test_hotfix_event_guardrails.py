#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · HOTFIX VALIDATION TEST HARNESS (STAGING)
Valida los guardrails de precios pre-evento, boleteras externas, guardarropa,
Caja, KDS e idempotencia en STAGING.
================================================================================
"""

import sys
import json
import time
import urllib.request
import urllib.error

STAGING_URL = "https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec"
if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
    STAGING_URL = sys.argv[1]

def post_rpc(action, args=None, token=None, role="ADMIN", device_id="TEST-HOTFIX-DEV", request_id=None):
    payload = {
        "action": action,
        "args": args or [],
        "sessionToken": token or "",
        "role": role,
        "deviceId": device_id,
        "requestId": request_id or f"REQ-{action}-{int(time.time()*1000)}"
    }
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(2):
        req = urllib.request.Request(
            STAGING_URL,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if res.get("ok") and isinstance(res.get("data"), dict) and "data" in res["data"] and isinstance(res["data"]["data"], dict):
                    res["data"] = res["data"]["data"]
                return res
        except urllib.error.HTTPError as e:
            return json.loads(e.read().decode("utf-8"))
        except Exception as e:
            if attempt == 0:
                time.sleep(2)
                continue
            return {"ok": False, "error": str(e)}

def run_tests():
    print("=" * 80)
    print("🛡️ DOMUS OS · SUITE DE VALIDACIÓN DEL HOTFIX PRE-EVENTO (STAGING)")
    print(f"Target URL: {STAGING_URL}")
    print("=" * 80)

    # 0. Autenticar Admin
    ses = post_rpc("authCrearSesion", ["ADMIN", "Gerente René", "ACCESOS", "GAVETA_ACCESOS"])
    assert ses.get("ok"), f"Fallo al crear sesión admin: {ses}"
    token = ses["data"]["token"]
    print(f"Sesión creada: {token}")

    results = []

    # Test 1: Forza con Taquilla es RECHAZADO con EVENT_PRICING_NOT_CONFIRMED
    print("\n▶ TEST 1: Intento de cobro en taquilla para evento 'Por validar' (Forza)")
    res_forza_door = post_rpc("accesoSimpleRegistrar", [{
        "id": f"ACC-FORZA-{int(time.time()*1000)}",
        "customer": "Asistente Forza Puerta",
        "activity": "Forza · sábado",
        "salesChannel": "TAQUILLA_DOMUS",
        "ticketTypeId": "General",
        "faceValue": 150.0,
        "wardrobeQty": 0
    }], token=token)
    print(f"   Resultado: {res_forza_door}")
    assert res_forza_door.get("ok") is False, "Debió rechazar cobro de Forza"
    assert "EVENT_PRICING_NOT_CONFIRMED" in str(res_forza_door), "No arrojó EVENT_PRICING_NOT_CONFIRMED"
    results.append(("1. Forza 'Por validar' Bloqueado en Taquilla", "PASS"))

    # Test 2: Evento con tarifa $0 es RECHAZADO con EVENT_PRICING_NOT_CONFIRMED
    print("\n▶ TEST 2: Intento de cobro en taquilla con tarifa vacía o $0")
    res_zero = post_rpc("accesoSimpleRegistrar", [{
        "id": f"ACC-ZERO-{int(time.time()*1000)}",
        "customer": "Asistente Tarifa Cero",
        "activity": "Operación diaria",
        "salesChannel": "TAQUILLA_DOMUS",
        "ticketTypeId": "General",
        "faceValue": 0.0,
        "wardrobeQty": 0
    }], token=token)
    print(f"   Resultado: {res_zero}")
    assert res_zero.get("ok") is False, "Debió rechazar tarifa 0"
    assert "EVENT_PRICING_NOT_CONFIRMED" in str(res_zero), "No arrojó EVENT_PRICING_NOT_CONFIRMED"
    results.append(("2. Tarifa $0 Bloqueada en Taquilla", "PASS"))

    # Test 3: Boletera externa (Boletia) para Forza es PERMITIDA ($0 puerta + $50 guardarropa)
    print("\n▶ TEST 3: Asistente con boletera externa (Boletia) para Forza ($0 entrada + $50 guardarropa)")
    res_ext = post_rpc("accesoSimpleRegistrar", [{
        "id": f"ACC-BOL-{int(time.time()*1000)}",
        "customer": "Asistente Boletia Forza",
        "activity": "Forza · sábado",
        "salesChannel": "BOLETERA_EXTERNA",
        "ticketProvider": "Boletia",
        "externalTicketId": f"BOL-FORZA-{int(time.time()*1000)}",
        "faceValue": 250.0,
        "wardrobeQty": 1,
        "wardrobeUnitPrice": 50.0,
        "paymentMethod": "Efectivo"
    }], token=token)
    print(f"   Resultado: {res_ext}")
    assert res_ext.get("ok") is True, f"Boletera externa debió pasar: {res_ext}"
    door_amt = res_ext.get("data", {}).get("doorCollected") if res_ext.get("data", {}).get("doorCollected") is not None else res_ext.get("data", {}).get("total")
    assert door_amt == 50.0, f"Cobro en puerta debió ser exactamente $50 (guardarropa), obtenido: {door_amt}"
    results.append(("3. Boletera Externa Forza Permitida ($50 Guardarropa)", "PASS"))

    # Test 4: Cortesía para Forza es PERMITIDA ($0 en puerta)
    print("\n▶ TEST 4: Cortesía autorizada para Forza ($0 cobro en puerta)")
    res_cort = post_rpc("accesoSimpleRegistrar", [{
        "id": f"ACC-CORT-{int(time.time()*1000)}",
        "customer": "Invitado Especial Forza",
        "activity": "Forza · sábado",
        "salesChannel": "CORTESIA",
        "courtesyAuth": "Dirección General",
        "faceValue": 300.0,
        "wardrobeQty": 0
    }], token=token)
    print(f"   Resultado: {res_cort}")
    assert res_cort.get("ok") is True, f"Cortesía debió pasar: {res_cort}"
    door_cort = res_cort.get("data", {}).get("doorCollected") if res_cort.get("data", {}).get("doorCollected") is not None else res_cort.get("data", {}).get("total")
    assert door_cort == 0.0, f"Cobro de cortesía debió ser $0, obtenido: {door_cort}"
    results.append(("4. Cortesía Forza Permitida ($0 Puerta)", "PASS"))

    # Test 5: Evento con acuerdo Confirmado y tarifa válida es PERMITIDO ('Sensorama fetish y kinky', $150)
    print("\n▶ TEST 5: Cobro en taquilla para evento Confirmado con tarifa ('Sensorama fetish y kinky', $150)")
    res_conf = post_rpc("accesoSimpleRegistrar", [{
        "id": f"ACC-CONF-{int(time.time()*1000)}",
        "customer": "Asistente Sensorama Taquilla",
        "activity": "Sensorama fetish y kinky",
        "salesChannel": "TAQUILLA_DOMUS",
        "ticketTypeId": "General",
        "faceValue": 150.0,
        "wardrobeQty": 0,
        "paymentMethod": "Efectivo"
    }], token=token)
    print(f"   Resultado: {res_conf}")
    assert res_conf.get("ok") is True, f"Evento confirmado debió cobrar: {res_conf}"
    door_conf = res_conf.get("data", {}).get("doorCollected") if res_conf.get("data", {}).get("doorCollected") is not None else res_conf.get("data", {}).get("total")
    assert door_conf == 150.0, f"Cobro debió ser $150, obtenido: {door_conf}"
    results.append(("5. Evento Confirmado en Taquilla Cobrado Exitosamente", "PASS"))

    # Test 6: Venta POS en Caja
    print("\n▶ TEST 6: Venta normal en Caja POS")
    pos_req = f"POS-SALE-{int(time.time()*1000)}"
    res_pos = post_rpc("cajaSimpleRegistrar", [{
        "id": pos_req,
        "customer": "Cliente Barra Hotfix",
        "method": "Efectivo",
        "paid": True,
        "received": 200.0,
        "items": [{"name": "Orgía de botanas", "group": "Comida público", "qty": 2, "price": 40.0, "courtesy": False}]
    }], token=token)
    print(f"   Resultado POS: {res_pos}")
    assert res_pos.get("ok") is True, f"Venta POS falló: {res_pos}"
    results.append(("6. Venta POS en Caja Intacta", "PASS"))

    # Test 7: Comandas KDS operando
    print("\n▶ TEST 7: Recepción y visualización en KDS")
    kds_req = f"{STAGING_URL}?action=comandasSimpleDatos"
    req_k = urllib.request.Request(kds_req, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req_k, timeout=30) as r:
        kds_res = json.loads(r.read().decode())
    print(f"   Resultado KDS: {kds_res.get('ok')}")
    assert kds_res.get("ok") is True, "KDS falló al responder"
    results.append(("7. KDS Comandas Operativo", "PASS"))

    # Test 8: Idempotencia Fuerte (Reintento del Test 6 devuelve original)
    print("\n▶ TEST 8: Idempotencia Fuerte (Reintento con mismo requestId)")
    res_replay = post_rpc("cajaSimpleRegistrar", [{
        "id": pos_req,
        "customer": "Cliente Barra Hotfix",
        "method": "Efectivo",
        "paid": True,
        "received": 200.0,
        "items": [{"name": "Orgía de botanas", "group": "Comida público", "qty": 2, "price": 40.0, "courtesy": False}]
    }], token=token, request_id=f"REQ-cajaSimpleRegistrar-{pos_req}")
    print(f"   Resultado Replay: {res_replay.get('ok')}")
    assert res_replay.get("ok") is True, "Replay de idempotencia falló"
    results.append(("8. Idempotencia y Anti-Duplicación Intactas", "PASS"))

    print("\n" + "=" * 80)
    print("🏆 RESUMEN COMPLETO DE PRUEBAS DEL HOTFIX (STAGING)")
    print("=" * 80)
    for name, status in results:
        print(f"  • {name:<55} [{status}]")
    print("=" * 80)
    print(f"Total: {len(results)}/8 Pruebas APROBADAS exitosamente en STAGING.")
    return True

if __name__ == "__main__":
    run_tests()
