# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-29 17:35 UTC-6 (Auditoría Canónica Apertura Solar 29 Octubre 2026)
* **Decisión Ejecutiva Operativa:** **GO CONTROLADO · Producción en vivo operativa en Fase Solar con controles de apertura e inventario pendientes de formalización.**
* **Baseline Backend Vigente:** Apps Script **Versión 16** (`PROD_VERIFIED`, Contenedor `DOMUS - Caja y barra` `1A45kAhlpaHC_9Rq5kT0rvkNjA_bCBhVRIIxpC20YUypWBAY9yH0PXjdj`)
* **Versión Rollback Garantizada:** Apps Script **Versión 15** / **Versión 22** anterior
* **Baseline Frontend Vigente (GitHub Pages + Apps Script Native UI):** Interfaz nativa HTML desplegada en Apps Script (`?vista=caja`) y GitHub Pages sincronizado
* **Rama `main` (Producción):** Baseline de código auditado: `acb47f6`. Commit actual del repositorio: consultar `git rev-parse HEAD`.
* **Estado de Working Tree:** `clean`
* **Entorno de PRODUCCIÓN Oficial:**
  - Versión Activa en Producción: **Versión 16** (29 oct 2026, Baseline Vigente Certificado en Contenedor `DOMUS - Caja y barra`)
  - Deployment Web App Oficial: `https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec`
  - Libros Oficiales:
    - Main: `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U` (*DOMUS · SISTEMA OPERATIVO*)
    - Ops: `1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc` (*DOMUS · BARRA Y RESURTIDO*)
* **Módulos Operativos en Servicio Vivo:**
  - **Caja (POS):** Operativa en Fase Solar (`CAJA 2!F2: Solar`), 152 productos vendibles cargados, interfaz nativa en Apps Script.
  - **Accesos (`ACCESOS GO`):** `activeActivity = Operación diaria`, 4 canales comerciales (Taquilla, Boletera, Transferencias, Cortesías).
  - **KDS (Cocina / Barra):** Operativo y conectado a libros oficiales.
  - **Inventario:** Actualización directa de salidas en entrega (ADR-004; ver nota de arquitectura P0).
* **Entorno de STAGING Oficial:**
  - Proyecto Apps Script: `DOMUS - Caja simple` (`1VFG72NoaQlca_czsgSgQmbnAIGOqyaAzqMlXVTdtsU-YZy6Xt35pHYPh`)
  - Web App Deployment: `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec` (Versión 20)
  - Libros Staging:
    - Main: `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`
    - Ops: `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE`

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Release v1.1.0 en Producción** | `main` / `v1.1.0` | `PROD_VERIFIED` | Smoke test de solo lectura aprobado (EXIT 0). Cero escrituras o ventas sintéticas en Producción. |
| **Backend de Producción (`DOMUS_PRODUCTION_BUNDLE.gs`)** | `google-apps-script/DOMUS_PRODUCTION_BUNDLE.gs` | `PROD_VERIFIED` | Desplegado en Versión 16 activa de Apps Script (Contenedor `DOMUS - Caja y barra`); PING reporta `HEALTHY` y `environment: PRODUCTION`. (Versión 18 es histórica/Staging). |
| **Aislamiento de Libros Oficiales** | `Config.gs` | `PROD_VERIFIED` | Confirmado en vivo: Main `1KQz8oJ4...` y Ops `1DiwPa1c...` vinculados estrictamente. |
| **Fase 0: Transaccional Core** | Backend Modular (11 archivos) | `PROD_VERIFIED` | Merge a `main` completado y certificado. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html` | `PROD_VERIFIED` | Modelo de 4 canales comerciales (Taquilla, Boletera, Transferencias, Cortesías) integrado en `main`. |
| **Frontend GitHub Pages (UI 20261029-04)** | `index.html`, `js/app.js` | `PROD_VERIFIED` | Desplegado y verificado en GitHub Pages (`app.js?v=20261029-04`). |
| **Frontend Apps Script Nativo (`Index.html`)** | `google-apps-script/Index.html` | `APPS_SCRIPT_UI_PENDING_CERTIFICATION` | Código fuente alineado en repo; pendiente actualización y despliegue de nueva versión en proyecto `DOMUS - Caja y barra`. |
| **Autenticación Fuerte de Estaciones** | `authCrearSesion` (Backend/Frontend) | `AUTH_HARDENING_PENDING` | P0 Technical Debt: Eliminación de token falso completada; pendiente secreto de estación / Workspace identity / PIN servidor. |
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

---

## 🛡️ Auditoría Canónica y Certificación GO Controlado (2026-10-29 17:35 UTC-6)
* **Auditor Externo:** ChatGPT / Ariadna
* **Veredicto Técnico:** 🟢 **GO CONTROLADO · DOMUS SOLAR EN VIVO**
* **Línea Base Canónica:**
  - Deployment Apps Script: `AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL` (Versión 16 Activa)
  - Baseline de código auditado: `acb47f6` (Commit actual del repositorio: consultar `git rev-parse HEAD`)
  - Libros: Main `1KQz8oJ4...`, Ops `1DiwPa1c...`

### 📊 Semáforo de Áreas Operativas

| Área / Componente | Estado | Detalle |
| :--- | :---: | :--- |
| **Backend Producción** | 🟢 | Status `HEALTHY`, environment `PRODUCTION`. |
| **Caja Solar** | 🟢 | `CAJA 2!F2: Solar`, 152 items cargados. |
| **COBROS** | 🟢 | Registro idempotente desde la API y append-only por política operativa; susceptible de edición manual por usuarios autorizados en Google Sheets. |
| **KDS** | 🟢 | Conectado, 0 comandas activas al sondeo. |
| **Accesos** | 🟢 | Actividad `Operación diaria`, 4 canales. |
| **Interfaz Nativa** | 🟢 | `?vista=caja` sirve HTML completo con `google.script.run`. |
| **GitHub Pages** | 🟢 | Sincronizado a Producción (`AKfycbzy...`). |
| **Prueba de Venta y Entrega** | 🟢 | Circuito comercial y KDS verificado con David Franco. |
| **Inventario Físico de Apertura** | 🟠 | Pendiente conteo físico del 29-Oct en libro de Barra. |
| **Apertura Formal de Turno** | 🟠 | Hoja `APERTURA` conserva datos históricos del 22-Oct (0/8 checks). |
| **Conciliación de Cuentas Abiertas** | 🟠 | 4 cuentas abiertas activas. |
| **Inventario de Sushi** | 🟠 | Rollos Choso y Nobara arrojaron `INVENTORY_ITEM_NOT_FOUND`. |
| **Autenticación Real de Roles Externos** | 🔴 | `authCrearSesion` requiere endurecimiento del lado servidor. |
| **Protección de Rama `main`** | 🔴 | `main` requiere reglas de branch protection en GitHub. |

### 📝 Registro Transaccional de Smoke Test (David Franco)
* **Recibo Real:** `REC-MVU54BJ8`
* **Cuenta Real:** `CTA-20261029-p8jui2`
* **Batch / Operación:** `POS-1793314442100-p8jui2`
* **Detalle:** 2 rollos de sushi (Jujutsu-shi · Choso + Nobara), $200.00 MXN en Efectivo.
* **Circuito Confirmado:** Caja -> `CAJA 2` -> `COBROS` -> `COMANDAS` -> Preparación -> Lista -> Entregada (por Steven).
* **Nota de Inventario:** Circuito comercial y operativo certificado; conciliación de inventario de sushi pendiente de alta en rango operativo de `INVENTARIO`.

### 🛠️ Hotfix KDS: Desbloqueo de "Tomar comanda" e Idempotencia (29-Oct-2026)
* **Diagnóstico de Causa Raíz:**
  1. En pantallas táctiles de KDS sin operador preseleccionado en la cabecera, `ensureOperator()` mostraba una notificación breve y abortaba silenciosamente (`return false`), dejando la orden sin tomar.
  2. Dobles pulsaciones en pantalla táctil arrojaban error `INVALID_KDS_TRANSITION` en lugar de responder de forma idempotente, desfasando la vista del navegador.
* **Solución Aplicada:**
  1. `ensureOperator()` interactivo: Solicita nombre/apodo con prompt si no está configurado, guarda en storage de sesión y hace fallback automático seguro a `Barra / Cocina` para no bloquear jamás la operación en cocina.
  2. Idempotencia en KDS (`KDS.gs`, `DOMUS_PRODUCTION_BUNDLE.gs`, `DOMUS_STAGING_BUNDLE.gs`): `TOMAR` sobre una orden ya en preparación, `LISTA` sobre una ya lista, y `ENTREGAR` sobre una ya entregada retornan `{ ok: true }` y sincronizan el estado sin lanzar excepciones.
  3. Recuperación en Frontend (`Index.html`, `js/app.js`): Los manejadores de error/alerta invocan automáticamente `syncBackendData()` para mantener la pantalla sincronizada con la hoja de cálculo.

### ⚠️ Deuda Técnica Canónica P0: Modelo de Inventario
* **Contradicción Documental vs Código:**
  - **Modelo A (ADR-004 y snapshot documental previo):** Modelo ledger donde el inventario es un circuito reactivo por fórmulas contables a partir de movimientos.
  - **Modelo B (Implementación activa en `KDS.gs` / bundles en `ENTREGAR`):** Actualización directa donde KDS calcula `newOut` y `newDisp` y escribe directamente en las columnas 7 (`Salidas`) y 8 (`Disponible`) de la hoja `INVENTARIO`.
* **Directiva Operativa:** Se mantiene el **Modelo B** activo durante el servicio Solar para garantizar estabilidad y no alterar el flujo transaccional en caliente. Se agenda conciliación y formalización arquitectónica en la ventana de mantenimiento post-servicio.

### 🛠️ Hotfix Frontend: Tolerancia a Nodos Faltantes (`bindEvent`), Eliminación de Fallback Sintético y Unificación de Handlers (29-Oct-2026 · UI 20261029-04)
* **Diagnóstico de Causa Raíz:**
  1. `setupEventListeners()` llamaba directamente a `$('...').addEventListener(...)` sin validar la existencia previa de los elementos DOM. Al faltar un solo ID en interfaces o vistas parciales, se producía una excepción `TypeError` no recuperable que detenía la ejecución del método y dejaba inactivos todos los botones posteriores.
  2. Riesgo de ejecución doble: Botones de modal combinaban atributos `onclick` inline con escuchadores registrados vía `addEventListener`.
  3. Autenticación externa con fallback inválido: Al fallar la negociación de sesión, `ensureSessionToken()` generaba localmente un token sintético (`DOMUS-SES-...`) rechazado por el backend (401/403), causando errores de enlace y operaciones atascadas en Outbox.
  4. Desincronización entre `js/app.js` y `google-apps-script/Index.html`: El archivo integrado de Apps Script conservaba una referencia obsoleta de staging y una versión desfasada de la lógica KDS.
* **Solución Implementada:**
  1. **Vinculación Segura con `bindEvent(idOrEl, eventName, handler)`:** Se sustituyeron los bindings directos susceptibles a `null.addEventListener` mediante `bindEvent`; los listeners sobre colecciones dinámicas permanecen (`querySelectorAll(...).forEach`) porque son tolerantes a colecciones vacías.
  2. **Unificación de Handlers:** Se retiraron todos los atributos `onclick` inline redundantes en modales de producto y tickets, delegando exclusivamente el manejo a `bindEvent`.
  3. **Limpieza de Tokens Falsos:** Se eliminó la fabricación de tokens sintéticos (`DOMUS-SES-...`). Ante fallos de autenticación, la aplicación marca limpiamente el estado en error (`updateSyncPill('error')`) y alerta al operador sin contaminar el almacén local ni el backend. La autenticación fuerte en servidor permanece como deuda técnica P0 pendiente.
  4. **Identificador de Versión y Trazabilidad (`DOMUS_BUILD`):** Se definió `window.DOMUS_BUILD = { commit: 'f2ab131', ui: '20261029-04', environment: 'PRODUCTION' }` y se agregó un pie visible en la interfaz para permitir auditoría visual inmediata de versión en cada estación.
  5. **Autoridad de Fase:** La fase inicial del frontend es transitoria y no autoritativa; la fuente de verdad es siempre `CAJA 2!F2` devuelta por el backend vía `cajaSimpleDatos()`, la cual sobrescribe `STATE.phase` inmediatamente.
  6. **Código Fuente Alineado y Estado de Despliegue:** Código fuente alineado; GitHub Pages desplegado; Apps Script nativo pendiente de certificación.
* **Estado Transaccional en Vivo:**
  - Comanda `C2-43` (Héctor Tate, `Onírica IPA · lata`): Estado `En preparación`, responsable `Taichi Mike`. Circuito KDS operacional y validado en caliente. No ejecutar más mutaciones sintéticas de diagnóstico en Producción.

### 🛡️ Hotfix P0: Unificación de Transporte Transaccional, Idempotencia KDS de Llave Única, Purga de `domus_token` y Asset Cache-Busting (29-Oct-2026 · UI 20261029-05)
* **Estado de Taxonomía:** `IMPLEMENTED` | `LOCAL_TESTED`.
* **Diagnóstico de Causa Raíz:**
  1. **Desincronización de Versiones (Split-Brain Frontend):** GitHub Pages y Google Apps Script Web App nativo ejecutaban frontends desfasados. Modificaciones en JavaScript se publicaban sin renovar el parámetro de versión de assets (`?v=`), permitiendo que navegadores ejecutaran código en caché desalineado.
  2. **Ruptura de Idempotencia en KDS (P0):** En `claimOrder`, `markOrderReady`, `deliverOrder`, `reportIncident` y `resolveRestock`, los argumentos se enviaban como `[token, body]`. Al ser `args[0]` una cadena de texto y no un objeto, `callBackend` no extraía `body.requestId` y generaba una llave `REQ-...` sintética para el POST HTTP. Ante fallos de red o respuestas lentas, `enqueueOutbox` volvía a fallar en leer `args[0]` y generaba una **tercera llave distinta**, destruyendo la garantía de idempotencia estipulada en ADR-002 y posibilitando mutaciones duplicadas o fallas de descarte.
  3. **Bifurcación de Transporte Servidor:** La ejecución externa (GitHub Pages) atravesaba `doPost -> authValidateAction -> idempotentExecute_ -> función`, mientras que Apps Script nativo llamaba directamente `google.script.run[fnName]`, omitiendo RBAC, candados de idempotencia y bitácora de auditoría en la hoja `REQUESTS`.
  4. **Coexistencia de Esquemas de Sesión Legacy y Nuevos:** Persistían 6 llamadas activas a `sessionStorage.getItem('domus_token')` conviviendo con el esquema `getSessionToken(role)`.
* **Solución Canónica Implementada:**
  1. **Bump UI 20261029-05 y Cache-Busting de Assets:**
     - Actualización estricta de `DOMUS_BUILD.ui = '20261029-05'`.
     - Actualización de footer visual en `index.html` y `Index.html`: `DOMUS OS · UI 20261029-05 · PRODUCTION`.
     - Renovación obligatoria de script tag en `index.html`: `<script src="js/app.js?v=20261029-05"></script>`.
  2. **Garantía de Llave Única de Idempotencia End-to-End:**
     - Se genera `reqId` una única vez al pulsar el botón de acción en KDS y se asocia de forma inmutable a `body.requestId`.
     - `callBackend` inspecciona tanto `args[0]` como `args[1]` para localizar el identificador original y propagarlo sin mutar.
     - `enqueueOutbox(action, args, explicitRequestId, type)` recibe el `reqId` explícito de la llamada original, impidiendo terminantemente la fabricación de llaves secundarias en el Outbox.
  3. **Unificación de Handlers y Payloads KDS:**
     - `claimOrder`, `markOrderReady`, `deliverOrder`, `reportIncident` y `resolveRestock` ahora llaman unívocamente `callBackend('comandasSimpleAccion', [body])` y `callBackend('comandasSimpleResolver', [body])`.
     - `comandasSimpleDatos` se invoca con `[]` en lugar del token legado.
  4. **Purga Total de `domus_token`:** Erradicadas el 100% de las referencias residuales en toda la base de código.
  5. **Dispatcher Canónico Unificado (`dispatchNativeAction`):**
     - Se extrajo el pipeline común `executeDomusAction_(action, payload, params)` en `Api.gs` y `DOMUS_PRODUCTION_BUNDLE.gs`.
     - Se creó `dispatchNativeAction(payload)` en el servidor y se conectó en `callBackend` para que `google.script.run` atraviese exactamente el mismo pipeline de validación RBAC, candado de idempotencia `idempotentExecute_` y bitácora oficial en `REQUESTS`.
  6. **Compatibilidad Híbrida en Backend:**
     - `comandasSimpleAccion(tokenOrBody, maybeBody)` y `comandasSimpleResolver(tokenOrBody, maybeBody)` procesan con resiliencia llamadas tanto en formato unificado `[body]` como legacy `[token, body]`.
* **Validación:**
  - Suite de guardrails de seguridad y producción: `PASS (4/4)`.
  - Suite de guardrails de KDS e inventario: `PASS (11/11)`.
  - Suite de Outbox, idempotencia y clasificación de errores v13: `PASS (12/12)`.
  - Smoke test de lecturas oficiales de producción en caliente: `PASS (100% HEALTHY)`.

### 🚨 Directivas Inmediatas de Seguridad y Congelación Operativa
1. **Congelación Operativa en Caliente:** No desplegar cambios de backend en Producción durante el servicio activo de Fase Solar.
2. **Acceso a Caja Maestra:** Usar preferentemente la versión nativa de Google Workspace (`direccion@domusccc.net` / `sadotechfet@gmail.com`).
3. **Terminales de Piso (GitHub Pages):** Operar únicamente en dispositivos físicos del club bajo red interna controlada; no difundir URLs.
4. **Tareas Críticas Post-Servicio:**
   - Proteger la rama `main` en GitHub (Require PR, 1 approval, status checks, block force pushes).
   - Añadir status checks obligatorios de CI.
   - Endurecer `authCrearSesion` con validación fuerte de contraseñas/PINs en el servidor.
   - Rotar el PIN de pantalla expuesto en chat.
   - Desarrollar módulo formal de Apertura / Turnos / Cortes X y Z en la rama de aislamiento `feature/phase-1-shifts-cuts`.



