# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-24 05:10 UTC-6
* **Rama Activa:** `stabilization/backend-v1`
* **LAST_VERIFIED_COMMIT:** `0e42322` (Suite extendida 14/14 casos y Fase 0.5 A-D aprobadas al 100%)
* **HEAD Activo:** `0e42322`
* **Estado de Working Tree al Handoff:** `clean`
* **Rama `main`:** Congelada en commit `1a89a14` (`production-pre-hardening`)
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)
* **URL Activa de Staging:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Backend Modular (11 archivos)** | `google-apps-script/*.gs` | `STAGING_VERIFIED` | Desplegado y verificado en Apps Script de Staging (`DOMUS_STAGING_BUNDLE.gs`, 2,133 líneas). |
| **RBAC Zero-Trust** | `Auth.gs`, `Api.gs` | `STAGING_VERIFIED` | Tests 7 y 8 aprobados: Escalación BARRA->ADMIN y sesiones expiradas rechazadas por el servidor. |
| **Idempotencia + Payload Binding** | `Idempotency.gs`, `Api.gs` | `STAGING_VERIFIED` | Tests 1, 2 y 4 aprobados: Reutilización con payload mutado arroja 409; pérdida de ACK recupera folio idéntico sin duplicados. |
| **Concurrencia / LockService** | `POS.gs`, `Idempotency.gs` | `STAGING_VERIFIED` | Test 3 aprobado: 10 ventas simultáneas registradas limpiamente en serie bajo `LockService` con 10 folios únicos sin colisiones. |
| **KDS / Comandas (Producción)** | `POS.gs`, `KDS.gs` | `STAGING_VERIFIED` | Tests 9 y 10 aprobados: Venta pagada genera exactamente 1 comanda; reintentos no duplican comanda. |
| **Ledger Transaccional (`REQUESTS`)** | `Idempotency.gs`, Sheets | `STAGING_VERIFIED` | Persistencia en 3 capas (Memoria/Cache, Properties, Sheets) validada en Staging. |
| **Mutex Outbox (Web Locks API)** | `js/app.js` | `STAGING_VERIFIED` | Tests 5 y 6 aprobados: Exclusión mutua multi-pestaña vía Web Locks y persistencia íntegra tras reinicio en `localStorage`. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html`, `js/app.js` | `STAGING_VERIFIED` | Tests 11, 12 y Canales A, B, C, D aprobados: Anti pass-back, anti doble devolución, y cobros correctos en `COBROS`. |
| **Entorno de Staging (14 Pruebas)** | `STAGING_PLAN.md`, `tests/*.py` | `STAGING_VERIFIED` | Los 14 casos del protocolo acordado ejecutados con exit code 0. |
| **Fase 1: Apertura / Turnos / Corte X / Z** | N/A | `PLANNING` | Desbloqueada para inicio tras aprobación formal previa de Dirección. |
| **Merge a Producción (`main`)** | `main` | `BLOCKED` | `main` permanece congelada hasta visto bueno formal de Dirección previa al merge. |

---

## 📊 Matriz de Cobertura de los 14 Casos de Integración (DOMUS-STAGING)

| # | Caso Acordado | Folio / ID de Prueba | Filas Afectadas | Resultado Esperado | Resultado Real Obtenido | Estado | Latencia |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | Mismo `requestId` 10× | `CTA-20261024-175229` | 1 fila en `COBROS` | 10 respuestas con el mismo folio sin duplicados | 10 peticiones retornaron el mismo folio | ✅ **PASS** | 7.10s (1ª), ~1.1s (2-10ª) |
| **2** | Mismo ID + payload distinto | `REQ-STG-IDEMP-...` | 0 filas | Rechazo con código 409 `IDEMPOTENCY_KEY_REUSED` | Rechazado con 409 `IDEMPOTENCY_KEY_REUSED` | ✅ **PASS** | 1.05s |
| **3** | 10 ventas concurrentes | 10 folios `CTA-...` | 10 filas consecutivas en `CAJA 2` y `COBROS` | Cero colisiones de celdas bajo `LockService` | 10 folios únicos registrados sin sobreescritura | ✅ **PASS** | 7.8s – 42.5s |
| **4** | Servidor escribe, cliente pierde ACK | `REC-MVMAOEX3` | 1 fila en `COBROS` | Reintento recupera folio original sin duplicar | Folio original recuperado idéntico | ✅ **PASS** | 9.82s (1ª), 1.46s (reintento) |
| **5** | Dos pestañas sincronizan Outbox | `ORD-001` a `ORD-003` | N/A (Frontend Mutex) | Lock exclusivo de Web Locks API a 1 pestaña | Segunda pestaña aborta; cero duplicados | ✅ **PASS** | Inmediata (<10ms) |
| **6** | Cerrar/reabrir navegador Outbox | `REQ-OFFLINE-001/002` | N/A (localStorage) | Cola intacta y sincronizable al reconectar | 2 órdenes recuperadas en `LOCAL_PENDING` | ✅ **PASS** | Inmediata |
| **7** | Escalación BARRA → ADMIN | `REQ-TAMPER-...` | 0 filas | Servidor detecta discrepancia de rol y rechaza | Petición bloqueada por RBAC del servidor | ✅ **PASS** | 1.10s |
| **8** | Token de sesión expirado | `DOMUS-SES-EXPIRED-...` | 0 filas | Rechazo por sesión expirada | Rechazado con "Sesión inválida o expirada" | ✅ **PASS** | 0.91s |
| **9** | Caja genera 1 comanda KDS | `CTA-20261024-058218` | 1 fila en `COMANDAS` | Exactamente 1 comanda visible en KDS | 1 comanda registrada en `COMANDAS` | ✅ **PASS** | 10.63s (Caja) + 2.57s (KDS) |
| **10** | Reintento Caja → KDS | `CTA-20261024-058218` | 1 fila en `COMANDAS` | Cero duplicación de comandas en reintento | KDS mantiene exactamente 1 comanda | ✅ **PASS** | 1.61s |
| **11** | Doble check-in / Anti pass-back | `TICK-STG-1792838261846` | 1 fila en `ACCESO` | 1er check-in PASS; 2º check-in RECHAZADO | 2º check-in arrojó "Boleto ya utilizado" | ✅ **PASS** | 1.25s (1º), 1.12s (2º) |
| **12** | Doble devolución guardarropa | `GUA-A-5021` | 1 fila en `ACCESO` (Col 32: `true`) | 1ª devolución PASS; 2ª RECHAZADA | 2ª arrojó "Prenda ya fue devuelta previamente" | ✅ **PASS** | 12.97s (1ª), 10.09s (2ª) |
| **13** | Consistencia inventario ADR-004 | `REC-MVMAPTLH` | 0 decrementos de stock | Stock físico se reserva hasta entrega KDS | Idempotente; stock no decrementado en venta | ✅ **PASS** | 1.22s |
| **14** | Rollback real del backend | Deployment `@exec-prod` / Staging | N/A | Ping y lectura responden tras rollback | Ambos despliegues responden `HEALTHY` en 1.2s | ✅ **PASS** | 1.21s / 1.29s |

---

## 🎟️ Verificación de Canales Comerciales de Fase 0.5 (ADR-005)

| Canal Comercial | Folio Asignado | Renglones y Montos en `COBROS` | Valor Comercial en `ACCESO` | Monto Cobrado en Puerta | Resultado |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **A. TAQUILLA_DOMUS** | `A-5022` / `GUA-A-5022` | 2 filas: Entrada ($150) + Guardarropa ($50) | $200.00 | $200.00 | ✅ **PASS** |
| **B. BOLETERA_EXTERNA** | `A-5023` / `GUA-A-5023` | 1 fila: Guardarropa ($50) únicamente; Entrada $0 | $300.00 | $50.00 | ✅ **PASS** |
| **C. TRANSFERENCIA (No Verificada)** | `A-5024` | 0 filas en `COBROS` (`PENDIENTE_VERIFICACION`) | $150.00 | $0.00 | ✅ **PASS** |
| **C. TRANSFERENCIA (Conciliada)** | `A-5025` | 1 fila en `COBROS` (`CONFIRMADA`, $150) | $150.00 | $150.00 | ✅ **PASS** |
| **D. CORTESIA** | `A-5026` | 0 filas en `COBROS` (Autorización: "Dirección") | $200.00 | $0.00 | ✅ **PASS** |


