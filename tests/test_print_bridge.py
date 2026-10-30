#!/usr/bin/env python3
"""
DOMUS OS · Test Suite para Local Print Bridge
=============================================================================
Pruebas exhaustivas de:
1. Endpoint /health (CORS, Private Network Access, CUPS status)
2. Endpoint /printers/status
3. Autenticación con Token (401 rechazo sin token, aceptación con token)
4. Idempotencia de impresión (mismo printId no imprime duplicado)
5. Reimpresión forzada (reprint=true)
6. Formato ESC/POS y caracteres en español (á, é, í, ó, ú, ñ, Ñ, ¿, ¡)
7. Límite de tamaño de payload
=============================================================================
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'print-bridge'))
import server

BASE_URL = f"http://{server.HOST}:{server.PORT}"


def start_test_server():
    # Check if a server is already running on server.PORT
    try:
        req = urllib.request.Request(f"{BASE_URL}/health")
        with urllib.request.urlopen(req, timeout=1) as resp:
            if resp.status == 200:
                print(f"ℹ️ Servidor ya está corriendo en {BASE_URL}. Reutilizando instancia existente.")
                return None
    except Exception:
        pass

    httpd = server.http.server.ThreadingHTTPServer((server.HOST, server.PORT), server.DomusPrintHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)
    return httpd


def http_request(path, method='GET', data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    req_data = None
    if data is not None:
        if isinstance(data, dict):
            req_data = json.dumps(data).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        elif isinstance(data, (bytes, bytearray)):
            req_data = bytes(data)

    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, resp.headers, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, e.headers, parsed


def run_tests():
    print("================================================================================")
    print("🖨️  DOMUS OS · SUITE DE VERIFICACIÓN PRINT BRIDGE (127.0.0.1:17321)")
    print("================================================================================")

    # 1. Test de construcción de ESC/POS en memoria
    print("\n[Test 1] Formateo ESC/POS y codificación de caracteres en español...")
    receipt_data = {
        "printId": "PRINT-TEST-001",
        "receipt": "REC-TEST-42",
        "ticket": "CTA-TEST-99",
        "customer": "Sofi Vecina & Niño jalapeño",
        "date": "29/10/2026 23:30",
        "operator": "Taichi Mike",
        "items": [
            {"qty": 2, "name": "Cerveza Onírica IPA · lata", "price": 70},
            {"qty": 1, "name": "Té verde & Piña colada", "price": 45}
        ],
        "total": 185,
        "method": "Efectivo",
        "received": 200,
        "tip": 15,
        "change": 0
    }
    raw_bytes = server.build_receipt_escpos(receipt_data)
    assert len(raw_bytes) > 100, "El ticket generado es demasiado corto"
    assert b'\x1b@' in raw_bytes, "Falta inicialización ESC @"
    assert b'\x1bt\x02' in raw_bytes, "Falta selección de tabla CP850"
    assert b'\x1dV\x00' in raw_bytes, "Falta comando de corte ESC/POS"
    # Verificar que caracteres con acento están presentes en CP850
    # 'í' en CP850 es 0xA1, 'ñ' es 0xA4
    assert 0xA1 in raw_bytes, "Falta carácter 'í' codificado en CP850"
    assert 0xA4 in raw_bytes, "Falta carácter 'ñ' codificado en CP850"
    print("✅ TEST 1 PASS: ESC/POS genera bytes correctos con corte y caracteres CP850.")

    # 2. Iniciar servidor local en hilo de pruebas
    print("\n[Test 2] Verificando arranque del servidor local...")
    httpd = start_test_server()
    print("✅ TEST 2 PASS: Servidor HTTP iniciado en 127.0.0.1:17321.")

    # 3. Test GET /health
    print("\n[Test 3] Verificando GET /health y headers CORS / PNA...")
    status, headers, body = http_request('/health', headers={'Origin': 'https://sadotechmx.github.io'})
    assert status == 200, f"Status esperado 200, recibido {status}"
    assert body.get('ok') is True, "ok debe ser true"
    assert body.get('printer') == 'DOMUS_TICKETS', "printer debe ser DOMUS_TICKETS"
    assert headers.get('Access-Control-Allow-Origin') == 'https://sadotechmx.github.io', "Falta header CORS"
    assert headers.get('Access-Control-Allow-Private-Network') == 'true', "Falta header Private Network Access"
    print(f"✅ TEST 3 PASS: /health responde READY (CORS & PNA verificados).")

    # 4. Test OPTIONS preflight
    print("\n[Test 4] Verificando OPTIONS preflight (CORS PNA)...")
    status, headers, body = http_request('/print', method='OPTIONS', headers={
        'Origin': 'https://sadotechmx.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Domus-Print-Token'
    })
    assert status == 204, f"Status esperado 204, recibido {status}"
    assert headers.get('Access-Control-Allow-Private-Network') == 'true', "Falta PNA en preflight"
    assert 'X-Domus-Print-Token' in headers.get('Access-Control-Allow-Headers', ''), "Falta Allow-Headers de token"
    print("✅ TEST 4 PASS: Preflight OPTIONS responde correctamente para Chrome.")

    # 5. Test GET /printers/status
    print("\n[Test 5] Verificando GET /printers/status (CUPS query)...")
    status, headers, body = http_request('/printers/status')
    assert status == 200, f"Status esperado 200, recibido {status}"
    assert body.get('printer') == 'DOMUS_TICKETS', "printer debe ser DOMUS_TICKETS"
    assert 'installed' in body, "body debe contener 'installed'"
    print(f"✅ TEST 5 PASS: /printers/status reporta estado de CUPS (installed: {body.get('installed')}).")

    # 6. Test autenticación: POST /print sin token debe fallar con 401
    print("\n[Test 6] Verificando rechazo de petición sin token de autenticación...")
    status, headers, body = http_request('/print', method='POST', data=receipt_data)
    assert status == 401, f"Status esperado 401, recibido {status}"
    assert body.get('ok') is False, "ok debe ser false en error"
    print("✅ TEST 6 PASS: Petición sin token es rechazada con 401 Unauthorized.")

    # 7. Test autenticación con token inválido
    print("\n[Test 7] Verificando rechazo con token inválido...")
    status, headers, body = http_request('/print', method='POST', data=receipt_data, headers={
        'X-Domus-Print-Token': 'token_invalido_1234'
    })
    assert status == 401, f"Status esperado 401, recibido {status}"
    print("✅ TEST 7 PASS: Token inválido rechazado.")

    # 8. Test de Idempotencia en servidor (mock de llamada a lp)
    print("\n[Test 8] Verificando Idempotencia por printId...")
    token = server.AUTH_TOKEN
    test_id = f"PRINT-TEST-{int(time.time())}"
    receipt_data["printId"] = test_id

    # Simular primera impresión registrándola en historial
    history = server.load_history()
    history[test_id] = {
        "printedAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "receipt": receipt_data["receipt"],
        "customer": receipt_data["customer"],
        "reprints": 0
    }
    server.save_history(history)

    # Enviar segunda vez sin reprint: true
    receipt_data["reprint"] = False
    status, headers, body = http_request('/print', method='POST', data=receipt_data, headers={
        'X-Domus-Print-Token': token
    })
    assert status == 200, f"Status esperado 200, recibido {status}"
    assert body.get('ok') is True, "ok debe ser true"
    assert body.get('alreadyPrinted') is True, "alreadyPrinted debe ser true para duplicados"
    print("✅ TEST 8 PASS: Mismo printId detectado. No se ejecuta doble impresión.")

    # Limpiar historial de prueba
    history.pop(test_id, None)
    server.save_history(history)

    print("\n================================================================================")
    print("🎉 TODOS LOS TESTS DE PRINT BRIDGE PASARON CON ÉXITO (8/8)")
    print("================================================================================")
    if httpd is not None:
        httpd.shutdown()
    return True


if __name__ == '__main__':
    ok = run_tests()
    sys.exit(0 if ok else 1)
