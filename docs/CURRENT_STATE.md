# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-24 05:35 UTC-6
* **Rama Activa:** `stabilization/backend-v1`
* **LAST_VERIFIED_COMMIT:** `00fced7` (Gates 1, 2 y 3 aprobados al 100%; STAGING_VERIFIED Completo)
* **HEAD Activo:** `00fced7`
* **Estado de Working Tree al Handoff:** `clean`
* **Rama `main`:** Congelada en commit `1a89a14` (`production-pre-hardening`)
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)
* **URL Activa de Staging:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec` (Apps Script Versión 17)
* **Baseline Rollback URL:** `https://script.google.com/macros/s/AKfycbzLkId5CWpQp3kBuY6UM5r6zhmyVyxmP1R80SfQidL83qXi_tUueRGd4P20Nc0tRYNH/exec`

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Backend Modular (11 archivos)** | `google-apps-script/*.gs` | `STAGING_VERIFIED` | Desplegado y verificado en Apps Script de Staging (`DOMUS_STAGING_BUNDLE.gs`, 2,178 líneas, Versión 17). |
| **RBAC Zero-Trust** | `Auth.gs`, `Api.gs` | `STAGING_VERIFIED` | Tests 7 y 8 aprobados: Escalación BARRA->ADMIN y sesiones expiradas rechazadas por el servidor. |
| **Idempotencia + Payload Binding** | `Idempotency.gs`, `Api.gs` | `STAGING_VERIFIED` | Tests 1, 2 y 4 aprobados: Reutilización con payload mutado arroja 409; pérdida de ACK recupera folio idéntico sin duplicados. |
| **Concurrencia / LockService** | `POS.gs`, `Idempotency.gs` | `STAGING_VERIFIED` | Test 3 aprobado: 10 ventas simultáneas registradas limpiamente en serie bajo `LockService` con 10 folios únicos sin colisiones. |
| **KDS / Comandas (Producción)** | `POS.gs`, `KDS.gs` | `STAGING_VERIFIED` | Tests 9 y 10 aprobados: Venta pagada genera exactamente 1 comanda; reintentos no duplican comanda. |
| **Ledger Transaccional (`REQUESTS`)** | `Idempotency.gs`, Sheets | `STAGING_VERIFIED` | Persistencia en 3 capas (Memoria/Cache, Properties, Sheets) validada en Staging. |
| **Mutex Outbox (Web Locks API)** | `js/app.js` | `STAGING_VERIFIED` | **Gate 1 Aprobado**: Dos pestañas de Chrome real en concurrencia emiten exactamente 1 POST; persistencia y sincronización tras cierre/reapertura completa del navegador verificadas. |
| **Entrega Física e Inventario (ADR-004)** | `KDS.gs`, `Inventory.gs` | `STAGING_VERIFIED` | **Gate 2 Aprobado**: Comanda entregada en KDS en STAGING v17; reintento con mismo requestId recupera op original en 1.00s; segundo intento con ID nuevo rechazado por anti doble-entrega. |
| **Rollback Operacional Resiliente** | `Api.gs`, Deployments | `STAGING_VERIFIED` | **Gate 3 Aprobado**: Conmutación operacional real de STAGING a baseline anterior (`AKfycbz...`), lectura operativa y restauración a versión nueva (`AKfycbys...`) con `HEALTHY`. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html`, `js/app.js` | `STAGING_VERIFIED` | Tests 11, 12 y Canales A, B, C, D aprobados: Anti pass-back, anti doble devolución, y cobros correctos en `COBROS`. |
| **Fase 0 Completa (14 Casos + 3 Gates)** | `tests/*.py` | `STAGING_VERIFIED` | 100% de la suite de integración ejecutada con exit code 0 contra el entorno real de STAGING. |
| **Fase 1: Apertura / Turnos / Corte X / Z** | N/A | `READY_FOR_BRANCHING` | Desbloqueada para inicio inmediatamente tras el merge controlado a `main`. |
| **Merge a Producción (`main`)** | `main` | `READY_FOR_AUTHORIZATION` | Todos los gates completados. Esperando autorización final expresa del usuario. |

---

## 📊 Matriz de Cobertura de los 14 Casos de Integración (DOMUS-STAGING)

| # | Caso Acordado | Folio / ID de Prueba | Filas Afectadas | Resultado Esperado | Resultado Real Obtenido | Estado | Latencia |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | Mismo `requestId` 10× | `CTA-20261024-507238` | 1 fila en `COBROS` | 10 respuestas con el mismo folio sin duplicados | 10 peticiones retornaron el mismo folio | ✅ **PASS** | 8.73s (1ª), ~1.0s (2-10ª) |
| **2** | Mismo ID + payload distinto | `REQ-STG-IDEMP-...` | 0 filas | Rechazo con código 409 `IDEMPOTENCY_KEY_REUSED` | Rechazado con 409 `IDEMPOTENCY_KEY_REUSED` | ✅ **PASS** | 0.87s |
| **3** | 10 ventas concurrentes | 10 folios `CTA-20261024-5938-0...` | 10 filas consecutivas en `CAJA 2` y `COBROS` | Cero colisiones de celdas bajo `LockService` | 10 folios únicos registrados sin sobreescritura | ✅ **PASS** | 7.19s – 35.29s |
| **4** | Servidor escribe, cliente pierde ACK | `REC-MVMAV76D` | 1 fila en `COBROS` | Reintento recupera folio original sin duplicar | Folio original recuperado idéntico | ✅ **PASS** | 9.07s (1ª), 0.85s (reintento) |
| **5** | Dos pestañas sincronizan Outbox | `REQ-OUTBOX-CONC-...` | N/A (Google Chrome Real) | Lock exclusivo de Web Locks API a 1 pestaña | Pestaña A emitió 1 POST; Pestaña B detectó lock y abortó con 0 POSTs | ✅ **PASS** | Web Locks (Mutex Navegador) |
| **6** | Cerrar/reabrir navegador Outbox | `REQ-OUTBOX-PERSIST-...` | N/A (Google Chrome Real) | Cola intacta y sincronizable al reconectar | Proceso de Chrome terminado; reapertura recuperó `LOCAL_PENDING` y confirmó | ✅ **PASS** | localStorage Persistente |
| **7** | Escalación BARRA → ADMIN | `REQ-TAMPER-...` | 0 filas | Servidor detecta discrepancia de rol y rechaza | Petición bloqueada por RBAC del servidor | ✅ **PASS** | 0.92s |
| **8** | Token de sesión expirado | `DOMUS-SES-EXPIRED-...` | 0 filas | Rechazo por sesión expirada | Rechazado con "Sesión inválida o expirada" | ✅ **PASS** | 1.02s |
| **9** | Caja genera 1 comanda KDS | `CTA-20261024-373848` | 1 fila en `COMANDAS` | Exactamente 1 comanda visible en KDS | 1 comanda registrada en `COMANDAS` | ✅ **PASS** | 9.96s (Caja) + 3.15s (KDS) |
| **10** | Reintento Caja → KDS | `CTA-20261024-373848` | 1 fila en `COMANDAS` | Cero duplicación de comandas en reintento | KDS mantiene exactamente 1 comanda | ✅ **PASS** | 1.05s |
| **11** | Doble check-in / Anti pass-back | `TICK-STG-1792840589687` | 1 fila en `ACCESO` | 1er check-in PASS; 2º check-in RECHAZADO | 2º check-in arrojó "Boleto ya utilizado" | ✅ **PASS** | 10.45s (Rechazo duplicado) |
| **12** | Doble devolución guardarropa | `GUA-A-5027` | 1 fila en `ACCESO` (Col 32: `true`) | 1ª devolución PASS; 2ª RECHAZADA | 2ª arrojó "Prenda ya fue devuelta previamente" | ✅ **PASS** | 9.58s (1ª), 10.21s (2ª) |
| **13** | Timeout entrega/inventario ADR-004 | `DCS-138-POS-1792841434679` | `COMANDAS` y `INVENTARIO` | 1 entrega, 1 decremento, reintento devuelve original | Entrega completada (4.93s); reintento con mismo ID devolvió original (1.00s); intento con ID nuevo rechazado | ✅ **PASS** | 4.93s (1ª), 1.00s (reintento) |
| **14** | Rollback operacional real STAGING | `AKfycbys...` / `AKfycbz...` | Deployments STAGING | Conmutación operativa a baseline anterior y restauración | Rollback a baseline (`AKfycbz...`) HEALTHY (1.09s), lectura catálogo ok=True; restauración a versión nueva HEALTHY (1.16s) | ✅ **PASS** | 1.09s (Rollback), 1.16s (Restauración) |

---

## 🎟️ Verificación de Canales Comerciales de Fase 0.5 (ADR-005)

| Canal Comercial | Folio Asignado | Renglones y Montos en `COBROS` | Valor Comercial en `ACCESO` | Monto Cobrado en Puerta | Resultado |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **A. TAQUILLA_DOMUS** | `A-5028` / `GUA-A-5028` | 2 filas: Entrada ($150) + Guardarropa ($50) | $200.00 | $200.00 | ✅ **PASS** |
| **B. BOLETERA_EXTERNA** | `A-5029` / `GUA-A-5029` | 1 fila: Guardarropa ($50) únicamente; Entrada $0 | $300.00 | $50.00 | ✅ **PASS** |
| **C. TRANSFERENCIA (No Verificada)** | `A-5030` | 0 filas en `COBROS` (`PENDIENTE_VERIFICACION`) | $150.00 | $0.00 | ✅ **PASS** |
| **C. TRANSFERENCIA (Conciliada)** | `A-5031` | 1 fila en `COBROS` (`CONFIRMADA`, $150) | $150.00 | $150.00 | ✅ **PASS** |
| **D. CORTESIA** | `A-5032` | 0 filas en `COBROS` (Autorización: "Dirección") | $200.00 | $0.00 | ✅ **PASS** |


