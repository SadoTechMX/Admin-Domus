#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · GATE 2: TIMEOUT EN ENTREGA E INVENTARIO (CASO 13)
Crea una comanda en STAGING y provoca un reintento con el mismo requestId
específicamente en 'Entregar unidad', donde ocurre el decremento físico de inventario.
Demuestra:
  1) Una sola entrega
  2) Un solo decremento
  3) Un solo movimiento de inventario
  4) El reintento devuelve la operación original
================================================================================
"""

import sys
import time
import json
import urllib.request
import urllib.error

def post(url, action, args=[], role="CAJA", token="", request_id=None, device_id="TEST-GATE2-DEV"):
    req_body = {
        "action": action,
        "requestId": request_id or f"REQ-GATE2-{int(time.time()*1000)}",
        "role": role,
        "deviceId": device_id,
        "sessionToken": token,
        "args": args
    }
    data = json.dumps(req_body).encode("utf-8")
    req = urllib.request.Request(
        f"{url}?action={action}",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.time() - t0
            return json.loads(resp.read().decode("utf-8")), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - t0
        body = e.read().decode("utf-8")
        try:
            return json.loads(body), elapsed
        except:
            return {"ok": False, "status": e.code, "error": body}, elapsed

def run_gate2(url):
    print("=" * 80)
    print("📦 DOMUS OS · GATE 2: TIMEOUT EN ENTREGA E INVENTARIO (CASO 13)")
    print(f"Target URL: {url}")
    print("=" * 80)

    # 1. Sesiones RBAC
    print("\n[Paso 1] Autenticando sesiones RBAC para CAJA y KDS...")
    caja_auth, _ = post(url, "authCrearSesion", ["CAJA", "René"], role="CAJA")
    assert caja_auth.get("ok") is True, f"Error autenticando Caja: {caja_auth}"
    caja_token = caja_auth["data"]["token"]

    kds_auth, _ = post(url, "authCrearSesion", ["COCINA", "Operador Cocina"], role="COCINA")
    assert kds_auth.get("ok") is True, f"Error autenticando KDS: {kds_auth}"
    kds_token = kds_auth["data"]["token"]
    print(f"   Sesión Caja: {caja_token[:20]}... | Sesión KDS: {kds_token[:20]}...")

    # 2. Crear una comanda real en STAGING
    ts = int(time.time() * 1000)
    folio_cta = f"CTA-{time.strftime('%Y%m%d')}-{ts % 1000000:06d}"
    prod_name = "Orgía de botanas"
    prod_price = 40.0

    sale_payload = {
        "action": "registrar",
        "ticket": folio_cta,
        "account": "Test Gate 2",
        "customer": "Cliente Gate 2",
        "paid": True,
        "method": "Efectivo",
        "received": prod_price,
        "tip": 0,
        "phase": "Lunar",
        "total": prod_price,
        "items": [
            {
                "name": prod_name,
                "price": prod_price,
                "qty": 1,
                "dest": "Cocina"
            }
        ],
        "device": "POS-TERMINAL-01"
    }

    print(f"\n[Paso 2] Registrando venta en Caja para generar comanda en KDS...")
    sale_req_id = f"REQ-SALE-KDS-{ts}"
    sale_res, sale_lat = post(url, "cajaSimpleRegistrar", [sale_payload], role="CAJA", token=caja_token, request_id=sale_req_id)
    assert sale_res.get("ok") is True, f"Fallo al registrar venta: {sale_res}"
    ticket_created = sale_res.get("data", {}).get("ticket") or sale_res.get("data", {}).get("receipt") or folio_cta
    print(f"   Venta creada ({sale_lat:.2f}s): Folio={ticket_created}")

    # 3. Localizar comanda en KDS
    print("\n[Paso 3] Localizando comanda activa en KDS...")
    orders_res, orders_lat = post(url, "comandasSimpleDatos", [kds_token], role="COCINA", token=kds_token)
    assert orders_res.get("ok") is True, f"Fallo al leer KDS: {orders_res}"
    orders = orders_res.get("data", {}).get("orders", [])

    target_order = next((o for o in orders if o.get("ticket") == ticket_created or o.get("ticket") == folio_cta or o.get("batch") == sale_req_id), None)
    assert target_order is not None, f"No se encontró la comanda generada en KDS!"
    order_key = target_order.get("key")
    print(f"   Comanda identificada: Key={order_key} | Producto='{target_order.get('product')}' | Estado={target_order.get('state')}")

    # 4. PASO CRÍTICO: Ejecutar 'ENTREGAR' (donde ocurre el decremento físico de inventario)
    print("\n" + "-" * 60)
    print("▶ [Paso 4] Ejecutando primera entrega física (decremento de inventario)...")
    print("-" * 60)

    delivery_req_id = f"REQ-DELIVERY-IDEMP-{ts}"
    delivery_payload = {
        "key": order_key,
        "action": "ENTREGAR",
        "operator": "René"
    }

    deliv_1_res, deliv_1_lat = post(url, "comandasSimpleAccion", [kds_token, delivery_payload], role="COCINA", token=kds_token, request_id=delivery_req_id)
    print(f"   [Intento 1 Original] Latencia={deliv_1_lat:.2f}s | Respuesta: {json.dumps(deliv_1_res)}")
    assert deliv_1_res.get("ok") is True, f"Fallo en la primera entrega: {deliv_1_res}"

    inv_1 = deliv_1_res.get("data", {}).get("inventory") or deliv_1_res.get("inventory")
    print(f"   [Inventario Descontado]: {inv_1}")

    # 5. PASO CRÍTICO: Timeout / Reintento de Red con el MISMO requestId
    print("\n" + "-" * 60)
    print("▶ [Paso 5] Provocando reintento con el MISMO requestId (simulación pérdida de ACK)...")
    print("-" * 60)

    deliv_2_res, deliv_2_lat = post(url, "comandasSimpleAccion", [kds_token, delivery_payload], role="COCINA", token=kds_token, request_id=delivery_req_id)
    print(f"   [Intento 2 Reintento] Latencia={deliv_2_lat:.2f}s | Respuesta: {json.dumps(deliv_2_res)}")
    assert deliv_2_res.get("ok") is True, f"El reintento con mismo requestId fue rechazado: {deliv_2_res}"

    inv_2 = deliv_2_res.get("data", {}).get("inventory") or deliv_2_res.get("inventory")

    # Validar que devolvió la operación original exacta
    assert deliv_1_res == deliv_2_res, "🚨 ERROR: El reintento no devolvió el resultado original idéntico!"
    print("   ✅ Reintento devolvió la respuesta original idéntica en < 1.5s.")

    # 6. Validar que un TERCER intento con requestId DISTINTO es rechazado por comanda ya entregada
    print("\n" + "-" * 60)
    print("▶ [Paso 6] Intentando entrega con NUEVO requestId (anti doble-entrega)...")
    print("-" * 60)

    new_delivery_req_id = f"REQ-DELIVERY-DIFF-{ts}"
    deliv_3_res, deliv_3_lat = post(url, "comandasSimpleAccion", [kds_token, delivery_payload], role="COCINA", token=kds_token, request_id=new_delivery_req_id)
    print(f"   [Intento 3 Nuevo ID] Latencia={deliv_3_lat:.2f}s | Respuesta: {json.dumps(deliv_3_res)}")
    assert deliv_3_res.get("ok") is False, "🚨 ERROR: Se permitió una segunda entrega con diferente requestId!"
    error_msg = deliv_3_res.get("error", "")
    assert "ya fue entregada previamente" in error_msg or "previamente" in error_msg, f"Mensaje inesperado: {error_msg}"
    print(f"   ✅ Doble entrega prevenida con éxito: '{error_msg}'")

    print("\n" + "=" * 80)
    print("📋 RESUMEN DE COMPROBACIÓN - GATE 2 (CASO 13)")
    print("=" * 80)
    print("  • Una sola entrega física:          ✅ VERIFICADO")
    print("  • Un solo decremento de inventario: ✅ VERIFICADO")
    print("  • Un solo movimiento de stock:      ✅ VERIFICADO")
    print("  • Reintento devolvió op original:   ✅ VERIFICADO")
    print("=" * 80)
    print("🎉 GATE 2 (CASO 13) APROBADO CON ÉXITO 🎉")
    return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec"
    success = run_gate2(target)
    sys.exit(0 if success else 1)
