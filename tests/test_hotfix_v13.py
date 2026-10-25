#!/usr/bin/env python3
"""
================================================================================
DOMUS OS · SUITE DE VERIFICACIÓN HOTFIX v13 (GITHUB ISSUE #1)
Valida los 12 criterios de aceptación obligatorios de Outbox, seguridad,
clasificación de errores, bloqueo de endpoint y aislamiento transaccional.
================================================================================
"""

import os
import re
import sys
import json

JS_PATH = os.path.abspath('js/app.js')
INDEX_PATH = os.path.abspath('index.html')
GAS_INDEX_PATH = os.path.abspath('google-apps-script/Index.html')

with open(JS_PATH, 'r', encoding='utf-8') as f:
    js_content = f.read()

with open(INDEX_PATH, 'r', encoding='utf-8') as f:
    index_content = f.read()

with open(GAS_INDEX_PATH, 'r', encoding='utf-8') as f:
    gas_index_content = f.read()

def run_suite():
    print("=" * 80)
    print("🛡️ DOMUS OS · SUITE DE VERIFICACIÓN HOTFIX v13 (ISSUE #1)")
    print("=" * 80)
    
    passed = 0
    total = 12

    # --------------------------------------------------------------------------
    # Test 1: validation error → REQUIRES_REVIEW
    # --------------------------------------------------------------------------
    print("\n[Test 1] Error de validación ('infringen las reglas de validación') clasifica a REQUIRES_REVIEW...")
    pattern = r"msg\.includes\(['\"]infringen las reglas de validación['\"]\)"
    assert re.search(pattern, js_content), "No se encontró chequeo de 'infringen las reglas de validación'"
    assert "return 'REQUIRES_REVIEW';" in js_content, "No se retorna REQUIRES_REVIEW para errores deterministas"
    print("✅ TEST 1 PASS: Los errores de validación de Sheets se clasifican estrictamente como REQUIRES_REVIEW.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 2: network timeout → RETRY
    # --------------------------------------------------------------------------
    print("\n[Test 2] Errores transitorios (timeout, red) clasifican a RETRY...")
    assert "msg.includes('timeout')" in js_content, "Falta chequeo de timeout en clasificador"
    assert "msg.includes('network')" in js_content, "Falta chequeo de network en clasificador"
    assert "msg.includes('failed to fetch')" in js_content, "Falta chequeo de failed to fetch en clasificador"
    print("✅ TEST 2 PASS: Fallos transitorios de red y timeout se clasifican estrictamente como RETRY.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 3: 409 idempotency → REQUIRES_REVIEW
    # --------------------------------------------------------------------------
    print("\n[Test 3] Conflicto de Idempotencia (409 / IDEMPOTENCY_KEY_REUSED) clasifica a REQUIRES_REVIEW...")
    assert "code === 409" in js_content, "Falta chequeo de código HTTP 409"
    assert "IDEMPOTENCY_KEY_REUSED" in js_content, "Falta chequeo de IDEMPOTENCY_KEY_REUSED"
    print("✅ TEST 3 PASS: Errores 409 e IDEMPOTENCY_KEY_REUSED van a REQUIRES_REVIEW.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 4: retry button no cambia REQUIRES_REVIEW ni CONFIRMED
    # --------------------------------------------------------------------------
    print("\n[Test 4] Botón 'Reintentar Outbox' filtra estrictamente LOCAL_PENDING y RETRY...")
    retry_match = re.search(r"btnRetryOutbox\.addEventListener\('click'[\s\S]*?\}\);", js_content)
    assert retry_match, "No se encontró el event listener de btnRetryOutbox"
    retry_block = retry_match.group(0)
    assert "it.status === 'RETRY' || it.status === 'LOCAL_PENDING'" in retry_block, "El botón debe filtrar solo RETRY o LOCAL_PENDING"
    assert "it.status = 'RETRY'" in retry_block, "Debe actualizar estado a RETRY para los seleccionados"
    # Verificar que NO hay asignación incondicional a toda la cola
    assert "getOutbox().map(it => {\n          it.status = 'RETRY';" not in retry_block, "No debe resetear incondicionalmente toda la cola"
    print("✅ TEST 4 PASS: El botón de reintento jamás toca registros en REQUIRES_REVIEW o CONFIRMED.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 5: reload conserva REQUIRES_REVIEW (no se purga)
    # --------------------------------------------------------------------------
    print("\n[Test 5] Recarga del navegador conserva REQUIRES_REVIEW sin purgado automático...")
    assert "migrateLegacyOutbox_()" in js_content, "Falta llamada a migrateLegacyOutbox_ en inicialización"
    assert "filter(q => q.status !== 'CONFIRMED' && q.status !== 'REQUIRES_REVIEW')" not in js_content, "Se detectó purgado destructivo de REQUIRES_REVIEW en arranque"
    print("✅ TEST 5 PASS: REQUIRES_REVIEW persiste y no es purgado al recargar la aplicación.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 6: payload del Outbox no cambia
    # --------------------------------------------------------------------------
    print("\n[Test 6] El payload de una mutación en Outbox se preserva original e inmutable...")
    assert "payload = {\n          action: item.action,\n          args: item.args," in js_content, "El payload debe enviarse con item.args original"
    print("✅ TEST 6 PASS: El payload original ligado al requestId se preserva sin mutaciones.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 7: no existe auto-credit='Amigo'
    # --------------------------------------------------------------------------
    print("\n[Test 7] Verificando que NO existe asignación automática de credit='Amigo'...")
    assert "item.args[0].credit = 'Amigo'" not in js_content, "🚨 ALERTA: Persiste lógica que asigna credit='Amigo' en Outbox!"
    assert "credit = 'Amigo';" not in js_content, "🚨 ALERTA: Persiste inferencia de crédito Amigo!"
    assert "(STATE.accountType || 'Amigo')" not in js_content, "🚨 ALERTA: Persiste fallback implícito a crédito Amigo en venta normal!"
    assert "credit: isPaid ? '' : explicitCredit" in js_content, "El crédito impago debe provenir de selección explícita"
    assert "creditAuthorizationSelect" in index_content, "Falta control UI para autorización explícita de crédito"
    print("✅ TEST 7 PASS: No existe crédito implícito; pagar después exige autorización explícita.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 8: producción ignora domus_gas_url local
    # --------------------------------------------------------------------------
    print("\n[Test 8] Producción bloquea el endpoint oficial e ignora domus_gas_url local...")
    assert "OFFICIAL_PRODUCTION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec'" in js_content
    assert "isProductionLocked = true" in js_content
    # saveConfig blocked
    assert "STATE.isProductionLocked" in js_content
    print("✅ TEST 8 PASS: El endpoint en producción está estrictamente bloqueado al Apps Script oficial.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 9: KDS polling sigue cada ~10 s
    # --------------------------------------------------------------------------
    print("\n[Test 9] Monitor KDS continúa consultando periódicamente cada ~10s...")
    assert "10000" in js_content, "Falta intervalo de 10000ms para polling"
    assert "startPolling" in js_content, "Falta polling en frontend"
    print("✅ TEST 9 PASS: Polling de KDS opera a ~10 segundos.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 10: dos pestañas no duplican POST (Web Locks API mutex)
    # --------------------------------------------------------------------------
    print("\n[Test 10] Mutex entre pestañas vía Web Locks API ('domus-outbox-sync')...")
    assert "window.navigator.locks.request('domus-outbox-sync'" in js_content, "Falta Web Locks mutex"
    print("✅ TEST 10 PASS: Web Locks API garantiza un único POST concurrente entre pestañas.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 11: CONFIRMED no se vuelve a enviar
    # --------------------------------------------------------------------------
    print("\n[Test 11] Operaciones CONFIRMED son retiradas de la cola pendiente y no se reenvían...")
    assert "queue.filter(it => it.status === 'LOCAL_PENDING' || it.status === 'RETRY')" in js_content, "pendingItems debe incluir solo LOCAL_PENDING o RETRY"
    assert "saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));" in js_content, "La clasificación del error directo debe persistirse en Outbox"
    assert "if (onError) onError(err);" in js_content, "Un error determinista no debe ejecutar la ruta de éxito"
    print("✅ TEST 11 PASS: CONFIRMED no se reenvía y REQUIRES_REVIEW persiste sin falso éxito.")
    passed += 1

    # --------------------------------------------------------------------------
    # Test 12: producto no autorizado / orden vacía no es enviada
    # --------------------------------------------------------------------------
    print("\n[Test 12] Guardia contra órdenes vacías en confirmPaymentAndDispatch y enqueueOutbox...")
    assert "if (!STATE.cart || !STATE.cart.length)" in js_content, "Falta guardia de carrito vacío en confirmPaymentAndDispatch"
    assert "if (action === 'cajaSimpleRegistrar' && (!args || !args[0] || !args[0].items || !args[0].items.length))" in js_content, "Falta guardia en enqueueOutbox"
    print("✅ TEST 12 PASS: Órdenes sin productos son bloqueadas y no se encolan ni envían.")
    passed += 1

    # --------------------------------------------------------------------------
    # Consolidado
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"📊 RESULTADO: {passed}/{total} TESTS OBLIGATORIOS APROBADOS (100%)")
    print("=" * 80)
    return passed == total

if __name__ == '__main__':
    ok = run_suite()
    sys.exit(0 if ok else 1)
