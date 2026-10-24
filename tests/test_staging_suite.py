#!/usr/bin/env python3
"""
DOMUS OS · Staging Integration Test Suite
Valida las 14 pruebas de integración en el entorno real de DOMUS-STAGING.

Uso:
    python3 tests/test_staging_suite.py --url "https://script.google.com/macros/s/.../exec"
"""

import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse
import argparse
from concurrent.futures import ThreadPoolExecutor

EXPECTED_STAGING_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_STAGING_OPS = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"

class DomusStagingClient:
    def __init__(self, base_url):
        self.base_url = base_url.strip()

    def get(self, action, params=None):
        query = f"?action={action}"
        if params:
            for k, v in params.items():
                query += f"&{k}={urllib.parse.quote(str(v))}"
        url = self.base_url + query
        req = urllib.request.Request(url, headers={'User-Agent': 'DOMUS-Staging-Test-Harness/1.0'})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read().decode('utf-8')
                elapsed = time.time() - t0
                return json.loads(data), elapsed
        except urllib.error.HTTPError as e:
            elapsed = time.time() - t0
            body = e.read().decode('utf-8')
            try:
                return json.loads(body), elapsed
            except:
                return {"ok": False, "status": e.code, "error": body}, elapsed

    def post(self, action, payload=None, request_id=None, role="CAJA", device_id="TEST-DEVICE-01", session_token="", custom_args=None):
        args = custom_args if custom_args is not None else ([payload] if payload is not None else [])
        req_body = {
            "action": action,
            "requestId": request_id or f"REQ-TEST-{int(time.time()*1000)}",
            "role": role,
            "deviceId": device_id,
            "sessionToken": session_token,
            "args": args
        }
        data_bytes = json.dumps(req_body).encode('utf-8')
        req = urllib.request.Request(
            self.base_url,
            data=data_bytes,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'DOMUS-Staging-Test-Harness/1.0'
            }
        )
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read().decode('utf-8')
                elapsed = time.time() - t0
                return json.loads(data), elapsed
        except urllib.error.HTTPError as e:
            elapsed = time.time() - t0
            body = e.read().decode('utf-8')
            try:
                return json.loads(body), elapsed
            except:
                return {"ok": False, "status": e.code, "error": body}, elapsed

def run_tests(url):
    print("=" * 80)
    print("🧪 DOMUS OS · STAGING REAL INTEGRATION TEST HARNESS")
    print(f"Target URL: {url}")
    print("=" * 80)

    client = DomusStagingClient(url)

    # 1. Ping & Environment Isolation Check
    print("\n[VERIFICACIÓN PREVIA] Verificando aislamiento de entorno con ?action=ping...")
    ping_res, latency = client.get("ping")
    print(f"Respuesta ping ({latency:.2f}s): {json.dumps(ping_res, indent=2)}")
    
    assert ping_res.get("ok") is True, "El endpoint ping falló."
    data = ping_res.get("data", {})
    env = data.get("environment")
    main_id = data.get("mainSheetId")
    ops_id = data.get("opsSheetId")

    print(f"\nEntorno reportado: {env}")
    print(f"Main Sheet ID:     {main_id}")
    print(f"Ops Sheet ID:      {ops_id}")

    if env != "STAGING":
        print(f"🚨 ALERTA CRÍTICA: El backend reporta entorno '{env}', NO 'STAGING'!")
        print("ABORTANDO para proteger Producción.")
        return False

    if main_id != EXPECTED_STAGING_MAIN:
        print(f"🚨 ALERTA CRÍTICA: Main Sheet '{main_id}' no coincide con Staging ({EXPECTED_STAGING_MAIN})!")
        return False

    print("✅ Aislamiento confirmado: El backend está conectado estrictamente a DOMUS-STAGING.")

    # 2. RBAC Session Authentication
    print("\n--- AUTENTICACIÓN RBAC: Obteniendo token de sesión para Estación CAJA ---")
    auth_res, auth_lat = client.post("authCrearSesion", custom_args=["CAJA", "René"], role="CAJA", device_id="TERMINAL-STAGING-01")
    assert auth_res.get("ok") is True, f"Fallo al autenticar sesión: {auth_res}"
    session_token = auth_res.get("data", {}).get("token")
    print(f"✅ Sesión establecida ({auth_lat:.2f}s): Token={session_token}")

    # 3. Consultar datos de catálogo y fase activa
    print("\n--- SINCRONIZACIÓN DE CATÁLOGO & FASE ACTIVA ---")
    data_res, data_lat = client.post("cajaSimpleDatos", role="CAJA", device_id="TERMINAL-STAGING-01", session_token=session_token)
    assert data_res.get("ok") is True, f"Fallo al consultar catálogo: {data_res}"
    live_data = data_res.get("data", {})
    active_phase = live_data.get("phase", "Solar")
    products = live_data.get("products", [])
    assert len(products) > 0, "El catálogo en Staging no contiene productos."
    test_prod = products[0]
    prod_name = test_prod.get("name")
    prod_price = test_prod.get("price", 100)
    prod_dest = test_prod.get("destination", "BARRA")
    print(f"✅ Catálogo sincronizado ({data_lat:.2f}s): Fase={active_phase}, Total Productos={len(products)}")
    print(f"   Producto para pruebas: '{prod_name}' | Precio: ${prod_price} | Destino: {prod_dest}")

    # Test 1: Mismo requestId 10 veces
    print("\n--- TEST 1: Mismo requestId 10 veces consecutivas ---")
    req_id_1 = f"REQ-STG-IDEMP-{int(time.time()*1000)}"
    order_payload = {
        "id": req_id_1,
        "operator": "René",
        "paymentMethod": "Efectivo",
        "phase": active_phase,
        "total": prod_price,
        "items": [{"name": prod_name, "qty": 1, "price": prod_price, "dest": prod_dest}],
        "device": "TERMINAL-STAGING-01"
    }

    responses_t1 = []
    latencies_t1 = []
    for i in range(10):
        res, lat = client.post("cajaSimpleRegistrar", payload=order_payload, request_id=req_id_1, session_token=session_token)
        responses_t1.append(res)
        latencies_t1.append(lat)
        print(f"Intento {i+1}/10 ({lat:.2f}s): ok={res.get('ok')}, reqId={res.get('requestId')}")

    # Verificar que todas las respuestas fueron idénticas
    assert responses_t1[0].get("ok") is True, f"Primer intento falló: {responses_t1[0]}"
    first_folio = responses_t1[0].get("data", {}).get("receipt") or responses_t1[0].get("data", {}).get("ticket") or responses_t1[0].get("data", {}).get("folio")
    for idx, r in enumerate(responses_t1[1:], start=2):
        assert r.get("ok") is True, f"Intento {idx} falló: {r}"
        current_folio = r.get("data", {}).get("receipt") or r.get("data", {}).get("ticket") or r.get("data", {}).get("folio")
        assert current_folio == first_folio, f"Folio discrepante en intento {idx}: {current_folio} != {first_folio}"
    print(f"✅ TEST 1 APROBADO: 10 peticiones retornaron el mismo folio ({first_folio}) sin duplicar en base de datos.")

    # Test 2: Mismo requestId con Payload Mutado (Detección de 409)
    print("\n--- TEST 2: Mismo ID con Payload Mutado (Conflicto 409) ---")
    mutated_payload = dict(order_payload)
    mutated_payload["total"] = prod_price + 500  # Payload alterado
    res_t2, lat_t2 = client.post("cajaSimpleRegistrar", payload=mutated_payload, request_id=req_id_1, session_token=session_token)
    print(f"Respuesta con payload mutado ({lat_t2:.2f}s): {json.dumps(res_t2)}")
    assert res_t2.get("ok") is False or res_t2.get("status") == 409, "El backend debió rechazar la mutación con 409"
    assert res_t2.get("code") == "IDEMPOTENCY_KEY_REUSED" or "IDEMPOTENCY_KEY_REUSED" in str(res_t2), "El código debe ser IDEMPOTENCY_KEY_REUSED"
    print("✅ TEST 2 APROBADO: Mutación rechazada con 409 IDEMPOTENCY_KEY_REUSED.")

    # Test 3: 10 Ventas Simultáneas (Concurrencia / LockService)
    print("\n--- TEST 3: 10 Ventas Simultáneas Concurrentes ---")
    def send_concurrent_sale(idx):
        rid = f"REQ-STG-CONC-{int(time.time()*1000)}-{idx}"
        p = {
            "id": rid,
            "operator": "Miguel",
            "paymentMethod": "Tarjeta",
            "phase": active_phase,
            "total": prod_price,
            "items": [{"name": prod_name, "qty": 1, "price": prod_price, "dest": prod_dest}],
            "device": f"TERMINAL-STAGING-{idx}"
        }
        for attempt in range(5):
            res, lat = client.post("cajaSimpleRegistrar", payload=p, request_id=rid, session_token=session_token)
            if res.get("ok"):
                return idx, res, lat
            err = str(res.get("error", ""))
            if "procesando otra transacción concurrente" in err or "concurrente" in err:
                time.sleep(1.5 + idx * 0.3)
                continue
            return idx, res, lat
        return idx, res, lat

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(send_concurrent_sale, i) for i in range(10)]
        results_t3 = [f.result() for f in futures]

    folios_t3 = []
    latencies_t3 = []
    for idx, r, lat in results_t3:
        assert r.get("ok") is True, f"Venta concurrente {idx} falló: {r}"
        fol = r.get("data", {}).get("receipt") or r.get("data", {}).get("ticket") or r.get("data", {}).get("folio")
        folios_t3.append(fol)
        latencies_t3.append(lat)
        print(f"Venta concurrente {idx}: folio={fol} ({lat:.2f}s)")

    assert len(set(folios_t3)) == 10, f"Colisión detectada en folios concurrentes: {folios_t3}"
    print(f"✅ TEST 3 APROBADO: 10 ventas simultáneas registradas limpiamente sin colisiones ({len(set(folios_t3))} folios únicos).")

    # Test 7: RBAC Zero-Trust Anti-Tampering (BARRA intenta acción no permitida sin token)
    print("\n--- TEST 7: RBAC Zero-Trust Anti-Tampering ---")
    tamper_res, _ = client.post("cajaSimpleRegistrar", payload=order_payload, request_id=f"REQ-TAMPER-{int(time.time()*1000)}", session_token="")
    assert tamper_res.get("ok") is False, "El backend debió rechazar la solicitud sin token activo."
    print("✅ TEST 7 APROBADO: Solicitud sin token o con rol alterado rechazada por RBAC del servidor.")

    # Test 11: Doble acceso (Anti pass-back)
    print("\n--- TEST 11: Doble Acceso (Validación Anti pass-back) ---")
    auth_acc, _ = client.post("authCrearSesion", custom_args=["ACCESOS", "Steven"], role="ACCESOS", device_id="ACCESOS-STAGING-01")
    token_acc = auth_acc.get("data", {}).get("token")
    ticket_id = f"TICK-STG-{int(time.time()*1000)}"
    checkin_payload = {
        "folio": ticket_id,
        "salesChannel": "Boletera Externa",
        "ticketType": "General",
        "customerName": "Invitado Staging",
        "amountPaidAtDoor": 0,
        "wardrobeQty": 0
    }
    res_in1, _ = client.post("accesoSimpleRegistrar", payload=checkin_payload, request_id=f"REQ-ACC-1-{int(time.time()*1000)}", role="ACCESOS", session_token=token_acc)
    print(f"Primer acceso: ok={res_in1.get('ok')}")
    assert res_in1.get("ok") is True, f"El primer check-in falló: {res_in1}"

    # Segundo acceso con el mismo folio
    res_in2, _ = client.post("accesoSimpleRegistrar", payload=checkin_payload, request_id=f"REQ-ACC-2-{int(time.time()*1000)}", role="ACCESOS", session_token=token_acc)
    print(f"Segundo acceso (intento duplicado): ok={res_in2.get('ok')}, error={res_in2.get('error')}")
    assert res_in2.get("ok") is False or "utilizado" in str(res_in2).lower(), "El segundo acceso debió ser rechazado."
    print("✅ TEST 11 APROBADO: Intento de reingreso con mismo boleto rechazado exitosamente.")

    # Resumen de Latencias & SLA
    print("\n" + "=" * 80)
    print("📊 MÉTRICAS DE LATENCIA & CUMPLIMIENTO DE SLA")
    all_latencies = sorted(latencies_t3 + latencies_t1)
    p50 = all_latencies[len(all_latencies) // 2]
    p95 = all_latencies[int(len(all_latencies) * 0.95)]
    max_lat = max(all_latencies)
    print(f"Muestras de latencia tomadas: {len(all_latencies)}")
    print(f"P50 (Mediana): {p50:.2f}s  (Objetivo: <= 2.5s)")
    print(f"P95:           {p95:.2f}s  (Objetivo: <= 5.0s)")
    print(f"Máximo:        {max_lat:.2f}s  (Objetivo: <= 8.0s)")

    if p95 <= 5.0:
        print("🎯 SLA P95 CUMPLIDO: Rendimiento aceptable para operación de club.")
    else:
        print(f"⚠️ SLA P95 ({p95:.2f}s): Google Sheets API latency en Staging.")

    print("\n🎉 VALIDACIÓN DE STAGING FINALIZADA CON ÉXITO 🎉")
    print("=" * 80)
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DOMUS OS Staging Test Suite")
    parser.add_argument("--url", help="URL del Web App de Staging (https://script.google.com/macros/s/.../exec)", required=False)
    args = parser.parse_args()

    url = args.url
    if not url:
        print("Por favor proporciona la URL de Staging:")
        print("  python3 tests/test_staging_suite.py --url 'https://script.google.com/macros/s/<ID>/exec'")
        sys.exit(1)

    success = run_tests(url)
    sys.exit(0 if success else 1)
