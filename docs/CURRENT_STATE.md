# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-24 02:45 UTC-6
* **Rama Activa:** `stabilization/backend-v1`
* **LAST_VERIFIED_COMMIT:** `320e8f4` (Anclaje verificado de libros de Staging)
* **HEAD Activo:** Ejecutar `git rev-parse HEAD` para obtener el hash de trabajo actual
* **Estado de Working Tree al Handoff:** `clean`
* **Rama `main`:** Congelada en commit `1a89a14` (`production-pre-hardening`)
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Backend Modular (11 archivos)** | `google-apps-script/*.gs` | `LOCAL_TESTED` | Pasa suite `test_gates_audit3.py`. `DOMUS_STAGING_BUNDLE.gs` generado (2,116 líneas). |
| **RBAC Zero-Trust** | `Auth.gs`, `Api.gs` | `AUDITED` | Concepto aprobado por auditoría. Pendiente prueba #7 en Staging real. |
| **Idempotencia + Payload Binding** | `Idempotency.gs`, `Api.gs` | `LOCAL_TESTED` | SHA-256 canónico y rechazo 409 verificado localmente. Pendiente pruebas 1 y 2 en Staging real. |
| **Ledger Transaccional (`REQUESTS`)** | `Idempotency.gs`, Sheets | `LOCAL_TESTED` | Estructura de 8 columnas y persistencia en 3 capas verificada. Pendiente validar en Sheets real. |
| **Mutex Outbox (Web Locks API)** | `js/app.js` | `LOCAL_TESTED` | W3C Web Locks con lease fallback y BroadcastChannel verificado localmente. Pendiente prueba 5 en Staging real. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html`, `js/app.js` | `LOCAL_TESTED` | Canales (Boletera, Preventa, Taquilla, Cortesía), guardarropa desacoplado y modelo 22 campos verificado en `test_phase0_5_accesos.py` (ADR-005). |
| **Entorno de Staging (14 Pruebas)** | `STAGING_PLAN.md`, `tests/test_staging_suite.py` | `STAGING_CONFIGURED` | Libros Drive duplicados y anclados (`114VS...` y `1NDpuy...`). Harness automatizado listo. |
| **Fase 1: Apertura / Turnos / Corte X / Z** | N/A | `PLANNING` | Bloqueado formalmente hasta GO de Fase 0 y 0.5 en Staging. |
| **Merge a Producción (`main`)** | `main` | `BLOCKED` | Requiere todas las pruebas en `STAGING_VERIFIED` y SLA P95 < 5.0s. |

---

## 🧩 Detalle de Componentes Implementados

### 1. Backend (`google-apps-script/`)
* **Modularización:** 100% completada. `Code.gs` original fue eliminado y dividido en 11 archivos especializados:
  * `Config.gs`: IDs de libros, staff, roles, políticas de sesión.
  * `Auth.gs`: Gestión de tokens, sesiones y RBAC Zero-Trust anti-tampering.
  * `Idempotency.gs`: `withLock_` (LockService), hash SHA-256 canónico de payload, rechazo 409 `IDEMPOTENCY_KEY_REUSED`, y tabla transaccional `REQUESTS`.
  * `Api.gs`: Enrutamiento central POST/GET con RBAC y binding de payload.
  * `POS.gs`: Consultas de caja, cobros y ventas inmediatas o a cuenta abierta.
  * `Accounts.gs`: Gestión y saldos de cuentas de clientes/amigos.
  * `Payments.gs`: Asentamiento de transacciones en `COBROS`.
  * `KDS.gs`: Comandas activas para Barra y Cocina, despacho y resolución.
  * `Access.gs`: Control de aforo, taquilla, eventos y guardarropa.
  * `Inventory.gs`: Movimientos de stock y catálogo de productos.
  * `Events.gs`: Creación y control de fechas de eventos.
* **Bundle Monolítico:** Sincronizado en `google-apps-script/Index.html` (227.5 KB) para despliegues en Google Apps Script que requieran frontend embebido.

### 2. Frontend (`index.html`, `js/app.js`, `css/app.css`)
* **Outbox Offline:**
  * Cola persistente en `localStorage` con estados `LOCAL_PENDING`, `SYNCING`, `CONFIRMED`, `RETRY`, `REQUIRES_REVIEW`.
  * Exclusión mutua multi-pestaña garantizada por **Web Locks API** (`navigator.locks.request('domus-outbox-sync', ...)`).
  * Fallback temporal con lease en `localStorage` (`domus_outbox_lock_lease`) para navegadores heredados.
  * Sincronización reactiva entre pestañas con **`BroadcastChannel`** y evento `storage`.
  * Detección de reconexión automática vía `window.addEventListener('online', ...)`.
  * Manejo explícito de respuesta 409: detiene reintentos infinitos y marca el ítem como `REQUIRES_REVIEW`.
* **Banner Visual:** `#outboxBanner` integrado para alertar al operador de órdenes pendientes de sincronización.

### 3. Base de Datos (Google Sheets)
* **Libro de Producción:** ID `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U`
* **Hojas Operativas:** `CAJA 2`, `COBROS`, `COMANDAS`, `CATALOGO`, `INVENTARIO`, `ACCESO`, `ACTIVIDADES`
* **Nueva Hoja Transaccional (Fase 0):** `REQUESTS`: `REQUEST_ID | ACTION | PAYLOAD_HASH | DEVICE_ID | STATUS | CREATED_AT | COMPLETED_AT | RESPONSE`

---

## 🚧 Siguiente Tarea Inmediata
1. Desplegar el Web App en Google Apps Script (`DOMUS-STAGING · SISTEMA OPERATIVO`) copiando `DOMUS_STAGING_BUNDLE.gs` e `Index.html`.
2. Proporcionar la URL del Web App de Staging (`https://script.google.com/macros/s/<ID>/exec`).
3. Ejecutar la suite automatizada de pruebas con `python3 tests/test_staging_suite.py --url '<STAGING_URL>'` y validar las 14 pruebas de integración y SLA.
