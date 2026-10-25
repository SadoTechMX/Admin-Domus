# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-25 00:00 UTC-6
* **Decisión Ejecutiva Operativa:** **RELEASE v1.1.2 AUTORIZADO (HOTFIX KDS FORMULA LEDGER).** Protección absoluta de fórmulas operativas en `INVENTARIO`.
* **Tag Oficial:** `v1.1.2`
* **Rama `main` (Producción):** Preparada para fast-forward a `v1.1.2`
* **Rama de Hotfix:** `hotfix/kds-formula-ledger`
* **Rama de Fase 1 (Turnos y Cortes):** Aislada en `feature/phase-1-shifts-cuts` (Commit `881a71c`)
* **Estado de Working Tree:** `clean`
* **Entorno de PRODUCCIÓN Oficial:**
  - Versión Activa en Producción: **Versión 22** (25 oct 2026, Release v1.1.2)
  - Versión Rollback Garantizada: **Versión 12** (23 oct 2026, 10:58 p.m.)
  - Deployment Web App Oficial (Conservado): `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`
  - Version Library ID: `https://script.google.com/macros/library/d/1VFG72NoaQlca_czsgSgQmbnAIGOqyaAzqMlXVTdtsU-YZy6Xt35pHYPh/22`
  - Libros Oficiales:
    - Main: `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U` (*DOMUS · SISTEMA OPERATIVO*)
    - Ops: `1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc` (*DOMUS · BARRA Y RESURTIDO*)
* **Entorno de STAGING Oficial:**
  - Proyecto Apps Script: `DOMUS - Caja simple` (`1VFG72NoaQlca_czsgSgQmbnAIGOqyaAzqMlXVTdtsU-YZy6Xt35pHYPh`)
  - Web App Deployment: `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`
  - Libros Staging:
    - Main: `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`
    - Ops: `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE`

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
---

## 🌿 Hotfix Operacional: Menú Cannábico / Canna Treats (2026-10-24)

| Componente | Estado | Detalle |
| :--- | :---: | :--- |
| **Pestaña `🌿 Menú Cannábico` en POS** | `PROD_DEPLOYED` | Chip permanente y prominente situado entre `Todas` y `Barra`. Filtra los 22 productos Canna Treats (SKUs CT01 a CT22). |
| **Búsqueda Cannábica** | `PROD_DEPLOYED` | El buscador de Caja detecta palabras clave (`canna`, `cannabico`, `alitas`, `hamburguesa`, `boneless`, `treats`, etc.) y despliega los productos de alimentos cannábicos. |
| **Ruteo de Comandas KDS** | `PROD_DEPLOYED` | Todos los alimentos Canna Treats se asignan inequívocamente a `Cocina`, manteniendo la Barra libre de sobrecarga de alimentos. |
| **Distintivo Visual (Badge)** | `PROD_DEPLOYED` | Badge verde esmeralda `🌿 Menú Cannábico · Canna Treats` con borde y hover dinámico. |

---

## ⚡ Hotfix Quirúrgico Forza & Release v1.1.1 (2026-10-24)

| Gate | Descripción | Resultado | Detalle de Verificación |
| :---: | :--- | :---: | :--- |
| **A** | Fila inventario >306 localizable | ✅ **PASS** | Producto `Papas misioneras` localizado en fila 315 (> 306) con rango dinámico `getLastRow()`. |
| **B** | Entrega producto >306 descuenta 1 | ✅ **PASS** | Fila 316 (`Papas gajo`) descuenta exactamente 1 unidad física al entregar en KDS (Salidas: 0->1, Disp: 25->24). |
| **C** | Idempotencia en KDS (mismo requestId) | ✅ **PASS** | Reintento con requestId idéntico no descuenta dos veces. Mantiene ejecución atómica única. |
| **D** | Victoria 473 descuenta Victoria 473 | ✅ **PASS** | SKU `VICTORIA-473` mapea exclusivamente a fila 102 (`CARTA-VICTORIA-473`). |
| **E** | Modelo 473 descuenta Modelo 473 | ✅ **PASS** | SKU `MODELO-473` mapea exclusivamente a fila 126 (`CARTA-MODELO-473`). |
| **F** | Carta Blanca descuenta Carta Blanca | ✅ **PASS** | SKU `CARTA-BAR-CB-LATA` mapea a fila 78 (`BAR-CB-LATA`). |
| **G** | Victoria 473 nunca toca Victoria 710 | ✅ **PASS** | Cero colisión: Victoria 710 ml (fila 20) permanece invariable con salidas=0. |
| **H** | Modelo 473 nunca toca Modelo 710/genérico | ✅ **PASS** | Cero colisión: Modelo 710 ml permanece invariable con salidas=0. |
| **I** | SKU desconocida no descuenta nada | ✅ **PASS** | Retorna `INVENTORY_ITEM_NOT_FOUND`, loguea advertencia y no altera ninguna celda. |
| **J** | FORZA guardarropa devuelve $0 | ✅ **PASS** | `priceGuardarropa: 0` evaluado con semántica nullish segura. No cobra ni recauda guardarropa DOMUS. |
| **K** | Boletera FORZA sin cover DOMUS | ✅ **PASS** | Cover en puerta DOMUS = $0. Asistencia validada registra obligación comercial ($150/asistente vs $3,000 anticipo). |
| **L** | Productos sin SKU fuera de POS | ✅ **PASS** | SIPA, Modelo Negra, Alitas 12 pzas, Hamburguesa pan de muerto permanecen aislados. |
| **M** | Cannábicos no autorizados deshabilitados | ✅ **PASS** | Waffle BDSM, Guacannabis, Pan de muerto con Nutella permanecen fuera de carta. |
| **N** | Caja/KDS normales operativos | ✅ **PASS** | Ping `HEALTHY`, 147 productos activos en catálogo, KDS y sesiones RBAC operativos. |

> [!NOTE]
> **Deuda Técnica Registrada (Post-Evento):**
> 1. Las fórmulas de control en la hoja `INVENTARIO` que contienen `$A$7:$A$306` se conservan operativas durante el evento sin bloquear el servicio, y serán migradas a rangos dinámicos abiertos en la primera ventana de mantenimiento post-evento.
> 2. `posExpandCart_()`: el fallback que acepta datos enviados por cliente cuando no encuentra un producto en catálogo debe reemplazarse post-evento con rechazo estricto `PRODUCT_NOT_FOUND`.

---

## 🛡️ Hotfix Quirúrgico: Preservación del Circuito Reactivo por Fórmulas & Release v1.1.2 (2026-10-25)

* **Diagnóstico Canónico:**
  La hoja de PRODUCCIÓN `INVENTARIO` no es un ledger plano, sino un **circuito reactivo gobernado por fórmulas**:
  - `A = Producto / variante` | `B = Familia` | `C = Unidad` | `D = Inicial real` | `E = Entradas recibidas` | `F = Merma` | `G = Entregado por comandas (Fórmula SUMIF)` | `H = Existencia esperada (Fórmula D+E-F-G)` | `I = Conteo físico`.
  - Circuito: `KDS: COMANDAS Col 8 = Entregada` ➔ `CAJA 2 Col X detecta entrega` ➔ `CAJA 2 Col V calcula Unidades consumidas` ➔ `INVENTARIO Col G acumula por SUMIF` ➔ `INVENTARIO Col H recalcula D+E-F-G`.
  - Incompatibilidad corregida: `KDS.gs` intentaba escribir directamente con `.setValue()` en columnas G y H usando un esquema obsoleto (asumiendo A=SKU, B=Nombre, F=Inicial, G=Salidas, H=Disponible). Dicha mutación destruía las fórmulas operativas.
* **Acción Quirúrgica Ejecutada:**
  - `KDS.gs`: Eliminado todo `.setValue()` sobre columnas G y H de `INVENTARIO`. Se suprimió el recálculo manual de salidas y disponibles.
  - Certificación de entrega física: KDS escribe únicamente en `COMANDAS` (Col 8 = `'Entregada'`, Col 14 = `'Entregada por...'`).
  - Respuesta KDS: Modo solo lectura de `INVENTARIO` para auditoría (`FORMULA_PROPAGATED` o `FORMULA_LEDGER_NOT_RESOLVED`), sin mutación ni fallo en la entrega.
  - `Events.gs`: Corrección del bug `parseFloat(evento.priceGuardarropa) || 50` para evaluar semántica nullish segura (`0 !== undefined ? 0 : 50`).
* **Reglas Operativas Estrictas Durante el Evento:**
  - ⛔ PROHIBIDO ejecutar `sincronizarCartaConCatalogoDOMUS()` (reconstruye con esquema antiguo e inventa stock 50).
  - ⛔ PROHIBIDO ejecutar `registrarNuevoProducto()` (inventa stock 50 con `parseInt(prod.stock, 10) || 50`).
  - ⛔ PROHIBIDO crear nuevos eventos con `registrarNuevoEvento()` durante el evento.
* **Resultados de Verificación (`tests/test_kds_formula_ledger.py`):**
  - `CHECK_1_FORMULAS_INITIAL`: ✅ **PASS** (Col G y H inician con `formulaValue`).
  - `CHECK_4_FORMULAS_PRESERVED`: ✅ **PASS** (Col G y H se mantienen como `formulaValue` tras entrega).
  - `CHECK_5_REACTIVE_PROPAGATION`: ✅ **PASS** (`COMANDAS` ➔ `CAJA 2` X, V ➔ `INVENTARIO` G, H recalcula reactivamente).
  - `CHECK_6_ROWS_PAST_306`: ✅ **PASS** (Nachos libres y Tacos de la parrilla en filas > 306 acumulan por fórmula).
  - `CHECK_7_IDEMPOTENCY`: ✅ **PASS** (Reintento de entrega con mismo `requestId` no duplica consumos).
  - `CHECK_8_ANTI_DOUBLE_DELIVERY`: ✅ **PASS** (Segunda entrega explícita rechazada).
  - `CHECK_9_EVENTS_WARDROBE_ZERO`: ✅ **PASS** (`priceGuardarropa: 0` evaluado a $0.00).

