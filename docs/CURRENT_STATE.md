# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-25 01:48 UTC-6 (Noche 24/10 cruzando medianoche 25/10)
* **Decisión Ejecutiva Operativa:** **PRODUCCIÓN EN VIVO OPERANDO AL 100%.**
* **Baseline Backend Vigente:** Apps Script **Versión 22** (`PROD_VERIFIED`, Hotfix KDS formula-ledger + Guardarropa $0)
* **Versión Rollback Garantizada:** Apps Script **Versión 12** (23 oct 2026, 10:58 p.m.)
* **Baseline Frontend Vigente (GitHub Pages):** Hotfix Accesos UI (`escapeHtml` def + GET transport + resilient boot)
* **Rama `main` (Producción):** Alineada con hotfix de enlace y renderizado de Accesos
* **Estado de Working Tree:** `clean`
* **Entorno de PRODUCCIÓN Oficial:**
  - Versión Activa en Producción: **Versión 22** (25 oct 2026, Baseline Vigente Oficial)
  - Versión Rollback Garantizada: **Versión 12** (23 oct 2026, 10:58 p.m.)
  - Deployment Web App Oficial: `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`
  - Libros Oficiales:
    - Main: `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U` (*DOMUS · SISTEMA OPERATIVO*)
    - Ops: `1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc` (*DOMUS · BARRA Y RESURTIDO*)
* **Módulos Operativos en Servicio Vivo:**
  - **Accesos (`ACCESOS GO`):** `activeActivity = Forza · sábado`, Boletera Externa, Entrada DOMUS $0, Guardarropa DOMUS $0, aforo sumando asistentes reales para liquidación ($150/asistente).
  - **Caja (POS):** Operativa, catálogo completo (151 productos), fondo inicial de caja de Steven ($600) protegido.
  - **KDS (Cocina / Barra):** Operativo en v22 sin sobreescritura directa en `INVENTARIO!G:H`, gobernado por fórmulas reactivas.
  - **Inventario:** Circuito reactivo por fórmulas intacto.
* **Entorno de STAGING Oficial:**
  - Web App Deployment canónico: `https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec`
  - Deployment alterno histórico `AKfycbwg...`: sólo evidencia de gate previo; no usar como target canónico de nuevas suites.
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
| **Solar / Lunar Concurrent Operating Model (PR #16)** | `OperatingProfiles.gs`, `POS.gs`, `KDS.gs`, `app.js` | `CANONICAL_STAGING_REDEPLOY_REQUIRED` | La concurrencia fue probada 7/7 sobre deployment alterno `AKfycbwg...`. El target canónico `AKfycbzy...` aún debe recibir el HEAD actual (incluye pricing guardrails y contextos concurrentes) y repetir el gate antes de producción. |

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
> Las fórmulas de control en la hoja `INVENTARIO` que contienen `$A$7:$A$306` se conservan operativas durante el evento sin bloquear el servicio, y serán migradas a rangos dinámicos abiertos en la primera ventana de mantenimiento post-evento.

---

## 🛡️ Hotfix Accesos: Anti-duplicados y Debounce (2026-10-25 03:05 UTC-6)
* **Commit:** `89ed892`
* **Estado:** `PROD_DEPLOYED`
* **Problema Triageado:** Al confirmar acceso de un cliente (ej. *irvin gonzales*, *fernando*), el sistema generaba dos filas en la misma fracción de segundo: el registro legítimo con su nombre y un registro fantasma nombrado `"Asistente A-xxxx"`.
* **Causa Raíz Identificada:** Existencia de doble listener sobre `#btnConfirmAccess` (`onclick` en HTML/JS + `addEventListener` en `setupEventListeners`). La primera ejecución registraba al cliente y reseteaba el campo de texto a `""`; la segunda ejecución se ejecutaba inmediatamente en el mismo clic, leía el campo vacío y activaba el fallback automático de respaldo `Asistente ${rowId}`.
* **Acciones Implementadas:**
  1. Se eliminó el `addEventListener` redundante y el `onclick` en HTML, dejando un único manejador atómico en `renderAccesosView()`.
  2. Se agregó guardia de debounce `isRegisteringAccess` con deshabilitación visual del botón (`"⏳ Registrando..."`, 1.5s de bloqueo).
  3. Validación de campo: si el nombre del asistente está en blanco, no se registra y se alerta al operador mediante toast (`"⚠️ Por favor ingresa el nombre o alias del asistente antes de confirmar"`).

---

## 🎟️ Liquidación Automática FORZA: Cuota de $150 por Asistente (2026-10-25 03:18 UTC-6)
* **Commit:** `f027f77`
* **Estado:** `PROD_DEPLOYED`
* **Acuerdo Comercial Oficial:** Cada asistente registrado bajo la lista o boletera de FORZA (`BOLETERA_EXTERNA`, `LISTA`) genera **$150.00 MXN para DOMUS**. El asistente entra con **$0.00 en puerta**. Las cortesías autorizadas (`CORTESIA`) están exentas ($0.00 para DOMUS).
* **Automatización en el Sistema:**
  1. **Asignación Automática de Cuota:** Al seleccionar `Forza · sábado` en el canal de venta externo o lista, el sistema asigna automáticamente `faceValue = $150.00` por persona ($300 Pareja, $450 Trío) y `commercialTotal = $150.00`.
  2. **Cobro en Puerta DOMUS en Cero:** `doorEntryCharge = $0.00` y `doorTotal = $0.00`. No se genera cobro físico al asistente ni se escribe en `COBROS`.
  3. **Registro Transaccional en `ACCESO`:**
     - Columna J (`faceValue`): `$150.00`
     - Columna N (`totalCommercialValue`): `$150.00`
     - Columna O (`amountPaidAtDoor`): `$0.00`
     - Columna T (`salesChannel`): `BOLETERA_EXTERNA` / `LISTA`
     - Columna H / Z (`persons`): Aforo real validado.
  4. **Exención de Cortesías:** Al seleccionar canal `CORTESIA`, `faceValue = $0.00`, eximiéndolas del cálculo.
  5. **Métricas en Vivo:** El KPI de taquilla refleja en tiempo real la cuota total acumulada para DOMUS: `Cuota DOMUS ($150 × N)`, lista para contrastarse contra el anticipo de $3,000 MXN.

---

## ✏️ Edición y Eliminación Manual de Registros de Acceso (2026-10-25 03:30 UTC-6)
* **Commit:** `7307d70`
* **Estado:** `PROD_DEPLOYED`
* **Funcionalidad Implementada:**
  1. **Botón Eliminar (`🗑️`):** Permite purgar registros duplicados o accidentales (como folios fantasma). Descuenta al asistente del aforo y del cálculo de cuota de liquidación en tiempo real. Persiste en `localStorage` (`domus_deleted_access_ids`) para que el polling de red no vuelva a resucitar los registros eliminados.
  2. **Botón Editar (`✏️`):** Abre el modal de edición (`editAccessModal`) para modificar en caliente:
     - Nombre / Alias del asistente.
     - Teléfono de contacto.
     - Asistentes amparados (1, 2 o 3 personas).
     - Canal de ingreso: Cambiar entre Lista / Boletera Externa ($150 para DOMUS) y Cortesía ($0 para DOMUS).
     - Validación estricta de Cortesía: Exige campo de quién autorizó (`courtesyAuth`, ej. Steven / Dirección) y motivo.
  3. **Distintivos Visuales en Tabla:** Badges directos para identificar inmediatamente `⭐ Cortesía ($0)` vs `📋 Lista ($150)` y autorización respectiva.

---

## 🍽️ Homologación Canónica de Carta Oficial · Solar / Lunar (2026-10-25 04:00 UTC-6)
* **Fuente Canónica:** Google Spreadsheet `1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ` · Pestaña `CARTA SOLAR LUNAR` (`gid=926692473`)
* **Estado:** `PROD_DEPLOYED`
* **Principios Clave Aplicados:**
  1. **Separación de Proveedor vs Cannabis:** `Canna Treats` es estrictamente una línea gastronómica/proveedor. NO define cannabis. Se rige por el atributo booleano explícito `containsCannabis = (CONTIENE CANNABIS? === 'SI')`.
  2. **23 Alimentos Regulares de Canna Treats:** Hamburguesas, alitas, papas misioneras, gajo, boneless, etc. operan con `containsCannabis = false` y se asignan a `Cocina / Alimentos Cocina`, liberando el chip cannábico.
  3. **18 Productos con Cannabis Autorizados:** 14 de Canna Treats (Greenburgesa, Espagueti verde, Monchis pizza 420, Guacanabis, Wafle BDSM, Cheescake, Canabites, Pelon, etc.) y 4 de ANDY (Muffins, Chocolates 2 dosis, Chocolates 4 dosis, Chocolates Vagina).
  4. **Desagregación Limpia de Barra:** Se eliminó la bolsa única de 92 items y se organizaron chips dedicados para:
     - `Cervezas` (14 items)
     - `Cheladas y Micheladas` (21 items)
     - `Cócteles` (26 items)
     - `Refrescos y Aguas` (17 items)
     - `Cafetería` (12 items)
     - `Shots` (3 items)
     - `Alimentos Cocina` (23 items)
     - `Sushi Jujutsu-shi` (9 items)
     - `🌿 Menú Cannábico` (18 items infusionados)
  5. **Precios Solar vs Lunar:** 73 productos con tarifas dinámicas alternables al toque del botón de Fase. Cero divergencias de precio (100% verificado contra la Carta Oficial).
