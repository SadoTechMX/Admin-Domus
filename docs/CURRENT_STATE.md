# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-24 05:45 UTC-6
* **Rama Activa:** `main` (Producción)
* **Release:** `v1.1.0` (Tag `v1.1.0` publicado en origin)
* **LAST_VERIFIED_COMMIT:** `5736e91` (Release v1.1.0 desplegada y verificada en Producción)
* **HEAD Activo:** `5736e91`
* **Estado de Working Tree al Handoff:** `clean`
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)
* **URL Activa de Producción:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec` (Apps Script Versión 18)
* **Libros Oficiales de Producción:**
  - Main: `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U` (*DOMUS · SISTEMA OPERATIVO*)
  - Ops: `1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc` (*DOMUS · BARRA Y RESURTIDO*)

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Release v1.1.0 en Producción** | `main` / `v1.1.0` | `PROD_VERIFIED` | Smoke test de solo lectura aprobado (EXIT 0). Cero escrituras o ventas sintéticas en Producción. |
| **Backend de Producción (`DOMUS_PRODUCTION_BUNDLE.gs`)** | `google-apps-script/DOMUS_PRODUCTION_BUNDLE.gs` | `PROD_VERIFIED` | Desplegado en Versión 18 de Apps Script; PING reporta `HEALTHY` y `environment: PRODUCTION`. |
| **Aislamiento de Libros Oficiales** | `Config.gs` | `PROD_VERIFIED` | Confirmado en vivo: Main `1KQz8oJ4...` y Ops `1DiwPa1c...` vinculados estrictamente. |
| **Fase 0: Transaccional Core** | Backend Modular (11 archivos) | `PROD_VERIFIED` | Merge a `main` completado y certificado. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html` | `PROD_VERIFIED` | Modelo de 4 canales comerciales (Taquilla, Boletera, Transferencias, Cortesías) integrado en `main`. |
| **Fase 1: Apertura / Turnos / Corte X / Z** | N/A | `READY_FOR_DEVELOPMENT` | Desbloqueada para iniciar desarrollo en la rama aislada `feature/phase-1-shifts-cuts`. |

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


