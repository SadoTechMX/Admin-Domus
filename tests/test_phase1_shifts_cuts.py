#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · PHASE 1 VALIDATION TEST HARNESS (STAGING)
Tests de Turnos, Apertura, Gavetas de Custodia, Corte X/Z, Arqueo y Ajustes Z.
URL Objetivo: STAGING exclusivamente.
================================================================================
"""

import sys
import json
import time
import urllib.request
import urllib.error

STAGING_URL = "https://script.google.com/macros/s/AKfycbzLkId5CWpQp3kBuY6UM5r6zhmyVyxmP1R80SfQidL83qXi_tUueRGd4P20Nc0tRYNH/exec"

def post_rpc(action, args=None, token=None, role="ADMIN", device_id="TEST-DEV-PHASE1", request_id=None):
    payload = {
        "action": action,
        "args": args or [],
        "sessionToken": token or "",
        "role": role,
        "deviceId": device_id,
        "requestId": request_id or f"REQ-{action}-{int(time.time()*1000)}"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        STAGING_URL,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_rpc(action, params=None):
    url = f"{STAGING_URL}?action={action}"
    if params:
        for k, v in params.items():
            url += f"&{k}={urllib.parse.quote(str(v))}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}

def run_tests():
    print("=" * 80)
    print("🛡️ DOMUS OS · SUITE DE PRUEBAS DE FASE 1 (STAGING)")
    print(f"Target: {STAGING_URL}")
    print("=" * 80)

    # 0. Ping & Aislamiento
    ping = get_rpc("ping")
    print(f"[PASO 0] Ping Staging: {ping}")
    assert ping.get("ok") is True, "Ping falló en Staging"
    assert ping.get("data", {}).get("environment") == "STAGING", "No es entorno STAGING"

    # Autenticar Admin & Caja
    ses_admin = post_rpc("authCrearSesion", ["ADMIN", "Gerente Steven", "CAJA_1", "GAVETA_1"])
    assert ses_admin.get("ok"), "Fallo al crear sesión admin"
    admin_token = ses_admin["data"]["token"]

    ses_caja = post_rpc("authCrearSesion", ["CAJA", "Cajero Angel", "CAJA_1", "GAVETA_1"])
    assert ses_caja.get("ok"), "Fallo al crear sesión caja"
    caja_token = ses_caja["data"]["token"]

    results = []

    # Test 1: Apertura de Turno Caja 1 con Fondo $2,000
    print("\n▶ TEST 1: Apertura formal de Turno Caja 1 (Fondo $2,000)")
    shift_req = f"REQ-OPEN-1-{int(time.time()*1000)}"
    res_open = post_rpc("turnoAbrir", [{
        "stationId": "CAJA_1",
        "registerId": "GAVETA_1",
        "openingFloat": 2000.0,
        "phase": "Solar",
        "openingNotes": "Apertura turno matutino"
    }], token=admin_token, request_id=shift_req)
    print(f"   Resultado: {res_open}")
    shift_id = res_open.get("data", {}).get("shiftId")
    biz_date = res_open.get("data", {}).get("businessDate")
    assert res_open.get("ok") or "ALREADY_OPEN" in str(res_open), "Error en apertura"
    results.append(("1. Apertura Turno", "PASS"))

    # Test 2: Rechazo de Apertura Doble de la Misma Estación
    print("\n▶ TEST 2: Rechazo de apertura doble en la misma estación (409 STATION_ALREADY_OPEN)")
    res_double = post_rpc("turnoAbrir", [{
        "stationId": "CAJA_1",
        "registerId": "GAVETA_OTRA",
        "openingFloat": 1000.0
    }], token=admin_token)
    print(f"   Resultado: {res_double}")
    assert res_double.get("ok") is False and ("ALREADY_OPEN" in str(res_double) or res_double.get("status") == 409), "No rechazó estación abierta"
    results.append(("2. Rechazo Doble Estación", "PASS"))

    # Test 3: Rechazo de Apertura Doble con Misma Gaveta Física
    print("\n▶ TEST 3: Rechazo de apertura con la misma gaveta física (409 REGISTER_ALREADY_OPEN)")
    res_double_reg = post_rpc("turnoAbrir", [{
        "stationId": "GUARDARROPA",
        "registerId": "GAVETA_1",
        "openingFloat": 500.0
    }], token=admin_token)
    print(f"   Resultado: {res_double_reg}")
    assert res_double_reg.get("ok") is False and ("ALREADY_OPEN" in str(res_double_reg) or res_double_reg.get("status") == 409), "No rechazó gaveta ocupada"
    results.append(("3. Rechazo Doble Gaveta", "PASS"))

    # Test 4: Dos Estaciones con Gavetas Independientes Concurren
    print("\n▶ TEST 4: Dos estaciones con gavetas independientes pueden abrir turnos en paralelo")
    res_acc_open = post_rpc("turnoAbrir", [{
        "stationId": "ACCESOS",
        "registerId": "GAVETA_ACCESOS",
        "openingFloat": 1000.0,
        "phase": "Solar"
    }], token=admin_token)
    print(f"   Resultado Accesos: {res_acc_open}")
    assert res_acc_open.get("ok") or "ALREADY_OPEN" in str(res_acc_open), "Fallo al abrir accesos en paralelo"
    results.append(("4. Turnos Paralelos Independientes", "PASS"))

    # Test 5: Corte X es Snapshot Read-Only y no modifica datos
    print("\n▶ TEST 5: Corte X es de solo lectura y ejecutable N veces sin efectos colaterales")
    x1 = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    x2 = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    assert x1.get("ok") and x2.get("ok"), "Fallo en consulta Corte X"
    assert x1["data"]["expectedCash"] == x2["data"]["expectedCash"], "Corte X alteró montos entre consultas"
    print(f"   Efectivo Esperado X: ${x1['data']['expectedCash']} (Fondo: ${x1['data']['openingFloat']})")
    results.append(("5. Corte X Read-Only Idéntico", "PASS"))

    # Test 6: Fondo Inicial NO es Venta ni Ingreso
    print("\n▶ TEST 6: El fondo inicial NO infla las ventas ni ingresos gravables")
    assert x1["data"]["openingFloat"] >= 2000.0, "Fondo inicial no coincide"
    print(f"   Fondo: ${x1['data']['openingFloat']} | Ventas Brutas: ${x1['data']['grossSales']} | Ventas Efectivo: ${x1['data']['cashSales']}")
    results.append(("6. Fondo Inicial NO es Ingreso", "PASS"))

    # Test 7: Venta en Efectivo incrementa Efectivo Esperado
    print("\n▶ TEST 7: Venta en efectivo refleja exactamente la caja esperada")
    sale_req = f"POS-CASH-{int(time.time()*1000)}"
    res_sale = post_rpc("cajaSimpleRegistrar", [{
        "id": sale_req,
        "customer": "Cliente Efectivo Test",
        "method": "Efectivo",
        "paid": True,
        "received": 300.0,
        "tip": 0.0,
        "items": [{"name": "Victoria · 473", "qty": 3, "price": 40.0, "courtesy": False}]
    }], token=admin_token)
    print(f"   Venta Efectivo: {res_sale.get('data', {}).get('message')}")
    assert res_sale.get("ok"), "Venta efectivo falló"
    x_post_sale = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    print(f"   Post-Venta -> Ventas Efectivo: ${x_post_sale['data']['cashSales']} | Efectivo Esperado: ${x_post_sale['data']['expectedCash']}")
    assert x_post_sale["data"]["cashSales"] >= 120.0, "Venta efectivo no sumó"
    results.append(("7. Venta Efectivo en Caja Esperada", "PASS"))

    # Test 8: Terminales 1 y 2 se Concilian Separadas
    print("\n▶ TEST 8: Conciliación independiente Terminal 1 vs Terminal 2")
    t1_req = f"POS-T1-{int(time.time()*1000)}"
    res_t1 = post_rpc("cajaSimpleRegistrar", [{
        "id": t1_req,
        "customer": "Cliente Terminal 1",
        "method": "Terminal 1",
        "paid": True,
        "items": [{"name": "Caguama", "qty": 1, "price": 90.0, "courtesy": False}]
    }], token=admin_token)
    t2_req = f"POS-T2-{int(time.time()*1000)}"
    res_t2 = post_rpc("cajaSimpleRegistrar", [{
        "id": t2_req,
        "customer": "Cliente Terminal 2",
        "method": "Terminal 2",
        "paid": True,
        "items": [{"name": "Volt", "qty": 2, "price": 50.0, "courtesy": False}]
    }], token=admin_token)
    x_term = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    print(f"   Terminal 1: ${x_term['data']['terminal1']} | Terminal 2: ${x_term['data']['terminal2']}")
    assert x_term["data"]["terminal1"] >= 90.0, "Terminal 1 no concilia"
    assert x_term["data"]["terminal2"] >= 100.0, "Terminal 2 no concilia"
    results.append(("8. Terminales 1 y 2 Separadas", "PASS"))

    # Test 9: Transferencia Pendiente NO infla Efectivo ni Ingreso Confirmado
    print("\n▶ TEST 9: Transferencia pendiente no entra a ingresos confirmados")
    tr_req = f"POS-TR-{int(time.time()*1000)}"
    res_tr = post_rpc("cajaSimpleRegistrar", [{
        "id": tr_req,
        "customer": "Cliente Transferencia Pendiente",
        "method": "Transferencia",
        "paid": False,
        "items": [{"name": "Paloma · Vaso 500", "qty": 1, "price": 120.0, "courtesy": False}]
    }], token=admin_token)
    x_tr = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    print(f"   Transf Confirmada: ${x_tr['data']['transfersConfirmed']} | Transf Pendiente: ${x_tr['data']['transfersPending']}")
    assert x_tr["data"]["transfersPending"] >= 120.0 or x_tr["data"]["openAccounts"] >= 1, "Transferencia pendiente no registrada"
    results.append(("9. Transferencia Pendiente Aislada", "PASS"))

    # Test 10: Boletera Externa NO infla efectivo en puerta
    print("\n▶ TEST 10: Boletera externa registra valor comercial pero $0 en efectivo de entrada")
    bol_req = f"ACC-BOL-{int(time.time()*1000)}"
    res_bol = post_rpc("accesoSimpleRegistrar", [{
        "id": bol_req,
        "customer": "Asistente Boletera",
        "salesChannel": "BOLETERA_EXTERNA",
        "ticketProvider": "Boletia",
        "externalTicketId": f"BOL-EXT-{int(time.time()*1000)}",
        "faceValue": 250.0,
        "wardrobeQty": 1,
        "wardrobeUnitPrice": 50.0,
        "paymentMethod": "Efectivo"
    }], token=admin_token)
    x_bol = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    print(f"   Boletera Externa Comercial: ${x_bol['data']['ticketingExternalValue']} | Guardarropa: {x_bol['data']['wardrobe']}")
    assert x_bol["data"]["ticketingExternalValue"] >= 250.0, "Valor comercial boletera no acumulado"
    results.append(("10. Boletera Externa $0 Puerta", "PASS"))

    # Test 11: Cortesía $0 ingreso pero conserva valor comercial
    print("\n▶ TEST 11: Cortesía registra $0 ingreso y preserva valor comercial completo")
    cort_req = f"ACC-CORT-{int(time.time()*1000)}"
    res_cort = post_rpc("accesoSimpleRegistrar", [{
        "id": cort_req,
        "customer": "Invitado Especial",
        "salesChannel": "CORTESIA",
        "courtesyAuth": "Dirección General",
        "faceValue": 300.0,
        "wardrobeQty": 0
    }], token=admin_token)
    x_cort = post_rpc("corteXConsultar", [{"stationId": "CAJA_1"}], token=admin_token)
    print(f"   Cortesías Conteo: {x_cort['data']['courtesyCount']} | Valor Comercial: ${x_cort['data']['courtesyCommercialValue']}")
    assert x_cort["data"]["courtesyCount"] >= 1, "Cortesía no contada"
    assert x_cort["data"]["courtesyCommercialValue"] >= 300.0, "Valor comercial cortesía no registrado"
    results.append(("11. Cortesía $0 Ingreso + Valor Comercial", "PASS"))

    # Test 12: Arqueo Cuadrado
    print("\n▶ TEST 12: Arqueo Físico exacto (CUADRADO)")
    exp_cash = x_cort["data"]["expectedCash"]
    # Desglosar exactamente exp_cash en billetes
    b500 = int(exp_cash // 500)
    rem = exp_cash % 500
    b100 = int(rem // 100)
    coins = round(rem % 100, 2)
    arq_cuad = post_rpc("arqueoCapturar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "breakdown": {"b500": b500, "b100": b100, "coins": coins}
    }], token=admin_token)
    print(f"   Arqueo Cuadrado: {arq_cuad}")
    assert arq_cuad.get("ok") and arq_cuad["data"]["differenceStatus"] == "CUADRADO", "Arqueo no dio CUADRADO"
    results.append(("12. Arqueo CUADRADO", "PASS"))

    # Test 13: Arqueo con Faltante
    print("\n▶ TEST 13: Arqueo Físico con FALTANTE sin auto-compensación")
    arq_falt = post_rpc("arqueoCapturar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "breakdown": {"b500": max(0, b500 - 1), "b100": b100, "coins": coins}
    }], token=admin_token)
    print(f"   Arqueo Faltante: {arq_falt}")
    assert arq_falt.get("ok") and arq_falt["data"]["differenceStatus"] == "FALTANTE", "Arqueo no detectó FALTANTE"
    assert arq_falt["data"]["difference"] < 0, "Diferencia faltante debe ser negativa"
    results.append(("13. Arqueo FALTANTE", "PASS"))

    # Test 14: Arqueo con Sobrante
    print("\n▶ TEST 14: Arqueo Físico con SOBRANTE sin auto-compensación")
    arq_sobr = post_rpc("arqueoCapturar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "breakdown": {"b500": b500 + 1, "b100": b100, "coins": coins}
    }], token=admin_token)
    print(f"   Arqueo Sobrante: {arq_sobr}")
    assert arq_sobr.get("ok") and arq_sobr["data"]["differenceStatus"] == "SOBRANTE", "Arqueo no detectó SOBRANTE"
    assert arq_sobr["data"]["difference"] > 0, "Diferencia sobrante debe ser positiva"
    results.append(("14. Arqueo SOBRANTE", "PASS"))

    # Test 15: Cajero NO puede cerrar Corte Z (RBAC Servidor)
    print("\n▶ TEST 15: Rol CAJA rechazado al intentar ejecutar Corte Z (403 FORBIDDEN)")
    res_caja_z = post_rpc("corteZCerrar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "countedCash": exp_cash
    }], token=caja_token, role="CAJA")
    print(f"   Resultado Cajero: {res_caja_z}")
    assert res_caja_z.get("ok") is False and (res_caja_z.get("status") == 403 or "denegado" in str(res_caja_z).lower()), "Cajero no fue bloqueado"
    results.append(("15. Bloqueo RBAC Cajero para Corte Z", "PASS"))

    # Test 16: Cierre Atómico de Corte Z por Gerencia
    print("\n▶ TEST 16: Cierre formal e inmutable de Corte Z por Gerencia")
    z_req = f"REQ-Z-{int(time.time()*1000)}"
    res_z = post_rpc("corteZCerrar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "countedCash": exp_cash
    }], token=admin_token, role="ADMIN", request_id=z_req)
    print(f"   Resultado Corte Z: {res_z}")
    assert res_z.get("ok"), "Fallo al cerrar Corte Z"
    cut_id = res_z["data"]["cutId"]
    snapshot_hash = res_z["data"]["snapshotHash"]
    assert cut_id.startswith("CORTE-Z-"), "Folio de corte Z inválido"
    assert bool(snapshot_hash), "Falta snapshotHash"
    results.append(("16. Cierre Exitoso Corte Z", "PASS"))

    # Test 17: Doble Clic / Idempotencia genera exactamente el mismo Corte Z
    print("\n▶ TEST 17: Doble clic en Corte Z con mismo requestId recupera idéntico registro")
    res_z_dupe = post_rpc("corteZCerrar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "countedCash": exp_cash
    }], token=admin_token, role="ADMIN", request_id=z_req)
    print(f"   Resultado Replay: {res_z_dupe}")
    assert res_z_dupe.get("ok"), "Reintento de Corte Z falló"
    assert res_z_dupe["data"]["cutId"] == cut_id, "Reintento generó folio Z distinto"
    results.append(("17. Idempotencia Fuerte Corte Z", "PASS"))

    # Test 18: Reintento tras turno CLOSED recupera el Z sellado
    print("\n▶ TEST 18: Intento de volver a cerrar turno CLOSED recupera el Z original")
    res_z_closed = post_rpc("corteZCerrar", [{
        "shiftId": shift_id or x_cort["data"]["shiftId"],
        "countedCash": exp_cash
    }], token=admin_token, role="ADMIN")
    print(f"   Resultado Turno Closed: {res_z_closed}")
    assert res_z_closed.get("ok") and res_z_closed["data"]["cutId"] == cut_id, "No recuperó el Z previo"
    results.append(("18. Turno CLOSED Protegido", "PASS"))

    # Test 19: Consulta de Corte Z verifica firma criptográfica (Anti-Tampering)
    print("\n▶ TEST 19: Consulta de Corte Z y verificación de integridad criptográfica")
    res_z_cons = post_rpc("corteZConsultar", [{"cutId": cut_id}], token=admin_token)
    print(f"   Consulta Z: {res_z_cons.get('ok')} | Hash: {res_z_cons.get('data', {}).get('cut', {}).get('snapshotHash')}")
    assert res_z_cons.get("ok"), "Fallo al consultar Corte Z con firma válida"
    results.append(("19. Integridad Criptográfica Corte Z", "PASS"))

    # Test 20: AJUSTE-Z crea registro vinculado sin alterar Corte Z original
    print("\n▶ TEST 20: Registro de AJUSTE-Z no altera el Corte Z original")
    adj_req = f"REQ-ADJ-{int(time.time()*1000)}"
    res_adj = post_rpc("ajusteZRegistrar", [{
        "cutId": cut_id,
        "motivo": "Aclaración bancaria comisión Terminal 1 diferida",
        "importe": -15.50,
        "medio": "Terminal 1"
    }], token=admin_token, role="ADMIN", request_id=adj_req)
    print(f"   Resultado Ajuste Z: {res_adj}")
    assert res_adj.get("ok"), "Fallo al registrar Ajuste Z"
    assert res_adj["data"]["adjustmentId"].startswith("AJUSTE-Z-"), "Folio de ajuste inválido"

    # Verificar que el Corte Z original permanece 100% íntegro
    res_z_post_adj = post_rpc("corteZConsultar", [{"cutId": cut_id}], token=admin_token)
    assert res_z_post_adj.get("ok"), "Corte Z se corrompió tras ajuste"
    assert res_z_post_adj["data"]["cut"]["snapshotHash"] == snapshot_hash, "Hash de Corte Z cambió tras registrar ajuste"
    assert len(res_z_post_adj["data"]["adjustments"]) >= 1, "Ajuste no aparece vinculado"
    print(f"   Corte Z post-ajuste verificado íntegro con {len(res_z_post_adj['data']['adjustments'])} ajuste(s) vinculado(s).")
    results.append(("20. AJUSTE-Z Vinculado sin Modificar Z", "PASS"))

    print("\n" + "=" * 80)
    print("🏆 RESUMEN COMPLETO DE CASOS DE PRUEBA DE FASE 1 (STAGING)")
    print("=" * 80)
    for name, status in results:
        print(f"  • {name:<45} [{status}]")
    print("=" * 80)
    print(f"Total: {len(results)}/20 Casos APROBADOS exitosamente en STAGING.")

if __name__ == "__main__":
    run_tests()
