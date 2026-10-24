# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo se actualiza en cada commit o sesión de trabajo para que cualquier IA o desarrollador conozca con exactitud milimétrica el estado técnico del sistema.

* **Fecha de Actualización:** 2026-10-24 02:15 UTC-6
* **Rama Activa:** `stabilization/backend-v1`
* **Último Commit:** `cd24636` (*feat(hardening): Idempotency payload binding, Web Locks API mutex, and Staging plan*)
* **Rama `main`:** Congelada en commit `1a89a14` (`production-pre-hardening`)
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)

---

## 🧩 Estado de Componentes

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
* **Hojas Operativas:**
  * `CAJA 2`, `COBROS`, `COMANDAS`, `CATALOGO`, `INVENTARIO`, `ACCESO`, `ACTIVIDADES`
* **Nueva Hoja Transaccional (Fase 0):**
  * `REQUESTS`: `REQUEST_ID | ACTION | PAYLOAD_HASH | DEVICE_ID | STATUS | CREATED_AT | COMPLETED_AT | RESPONSE`

---

## 🚧 Siguiente Tarea Inmediata
1. Esperar confirmación del usuario de la revocación del token personal en GitHub Settings.
2. Desplegar copia de pruebas `DOMUS-STAGING` y ejecutar el checklist de 14 pruebas detallado en [`STAGING_PLAN.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/STAGING_PLAN.md).
