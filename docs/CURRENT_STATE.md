# ⏱️ DOMUS OS · CURRENT STATE SNAPSHOT

> [!NOTE]
> Este archivo resume el estado técnico del sistema. La fuente de verdad para el commit activo siempre es el comando `git rev-parse HEAD`.

* **Fecha de Último Handoff:** 2026-10-24 04:38 UTC-6
* **Rama Activa:** `stabilization/backend-v1`
* **LAST_VERIFIED_COMMIT:** `b5b07ca` (Anti pass-back implementado y Staging verificado al 100%)
* **HEAD Activo:** `b5b07ca`
* **Estado de Working Tree al Handoff:** `clean`
* **Rama `main`:** Congelada en commit `1a89a14` (`production-pre-hardening`)
* **Remote Git:** `https://github.com/SadoTechMX/Admin-Domus.git` (Limpio, autenticación delegada a Git Credential Manager / Keychain)
* **URL Activa de Staging:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`

---

## 🏷️ Matriz de Estados de Verificación (Taxonomía Formal)

| Componente | Archivo(s) | Estado Actual | Evidencia / Próximo Paso |
| :--- | :--- | :---: | :--- |
| **Backend Modular (11 archivos)** | `google-apps-script/*.gs` | `STAGING_VERIFIED` | Desplegado y verificado en Apps Script de Staging (`DOMUS_STAGING_BUNDLE.gs`, 2,163 líneas). |
| **RBAC Zero-Trust** | `Auth.gs`, `Api.gs` | `STAGING_VERIFIED` | Test 7 aprobado: Solicitudes sin token o rol alterado son rechazadas por el servidor. |
| **Idempotencia + Payload Binding** | `Idempotency.gs`, `Api.gs` | `STAGING_VERIFIED` | Tests 1 y 2 aprobados: 10 peticiones consecutivas retornan el mismo folio; mutación arroja 409 `IDEMPOTENCY_KEY_REUSED`. |
| **Concurrencia / LockService** | `POS.gs`, `Idempotency.gs` | `STAGING_VERIFIED` | Test 3 aprobado: 10 ventas simultáneas registradas limpiamente en serie bajo `LockService` con 10 folios únicos sin colisiones. |
| **Ledger Transaccional (`REQUESTS`)** | `Idempotency.gs`, Sheets | `STAGING_VERIFIED` | Persistencia en 3 capas (Memoria/Cache, Properties, Sheets) validada en Staging. |
| **Mutex Outbox (Web Locks API)** | `js/app.js` | `LOCAL_TESTED` | W3C Web Locks con lease fallback y BroadcastChannel verificado localmente. |
| **Fase 0.5: Ticketing & Access Commerce** | `Access.gs`, `Events.gs`, `index.html`, `js/app.js` | `STAGING_VERIFIED` | Test 11 aprobado: Validación Anti pass-back en tiempo real en hoja `ACCESO` rechaza doble check-in de boletos. |
| **Entorno de Staging (14 Pruebas)** | `STAGING_PLAN.md`, `tests/test_staging_suite.py` | `STAGING_VERIFIED` | Ejecución de suite automatizada contra `DOMUS-STAGING` exitosa con exit code 0. |
| **Fase 1: Apertura / Turnos / Corte X / Z** | N/A | `PLANNING` | Desbloqueada para inicio de diseño formal tras aprobación de Fase 0 y 0.5 en Staging. |
| **Merge a Producción (`main`)** | `main` | `BLOCKED` | Requiere aprobación formal del usuario / Ariadna previa al merge. |

---

## 🧩 Detalle de Componentes Implementados

### 1. Backend (`google-apps-script/`)
* **Modularización:** 100% completada. `Code.gs` original fue dividido en 11 archivos especializados:
  * `Config.gs`: IDs de libros, staff, roles, políticas de sesión y resolución de entornos.
  * `Auth.gs`: Gestión de tokens, sesiones y RBAC Zero-Trust anti-tampering.
  * `Idempotency.gs`: `withLock_` (LockService), hash SHA-256 canónico de payload, rechazo 409 `IDEMPOTENCY_KEY_REUSED`, y tabla transaccional `REQUESTS`.
  * `Api.gs`: Enrutamiento central POST/GET con RBAC y binding de payload.
  * `POS.gs`: Consultas de caja, cobros y ventas inmediatas o a cuenta abierta sin colisiones de validación en columna G.
  * `Accounts.gs`: Gestión y saldos de cuentas de clientes/amigos.
  * `Payments.gs`: Asentamiento de transacciones en `COBROS`.
  * `KDS.gs`: Comandas activas para Barra y Cocina, despacho y resolución.
  * `Access.gs`: Control de aforo, taquilla, eventos, guardarropa desacoplado y Anti pass-back.
  * `Inventory.gs`: Movimientos de stock y catálogo de productos.
  * `Events.gs`: Creación y control de fechas de eventos.
* **Bundle Unificado:** Generado en `google-apps-script/DOMUS_STAGING_BUNDLE.gs` (2,163 líneas) y `google-apps-script/Index.html` (239 KB).

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
* **Libros de Staging:**
  * Sistema Operativo: `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`
  * Barra y Resurtido: `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE`
* **Hojas Operativas:** `CAJA 2`, `COBROS`, `COMANDAS`, `CATALOGO`, `INVENTARIO`, `ACCESO`, `ACTIVIDADES`, `REQUESTS`.
* **Libro de Producción (FROZEN):** `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U`.

---

## 📊 Resultados de la Suite Automatizada de Integración (`tests/test_staging_suite.py`)
* **URL:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec`
* **Ping / Aislamiento:** PASSED (1.18s) - Entorno `STAGING` confirmado.
* **RBAC Session Auth:** PASSED (1.18s) - Token generado para rol `CAJA`.
* **Catálogo & Fase Activa:** PASSED (5.77s) - Fase `Lunar`, 147 productos sincronizados.
* **Test 1 (Idempotency 10x):** PASSED - 10 llamadas idénticas retornaron `CTA-20261024-175229` sin duplicar filas.
* **Test 2 (Payload Mutation 409):** PASSED (1.05s) - Rechazado con `IDEMPOTENCY_KEY_REUSED`.
* **Test 3 (10 Ventas Concurrentes):** PASSED - 10 ventas simultáneas registradas con 10 folios únicos bajo `LockService`.
* **Test 7 (RBAC Zero-Trust Anti-Tampering):** PASSED - Petición sin token rechazada.
* **Test 11 (Anti pass-back en Accesos):** PASSED - Intento de reingreso con mismo boleto rechazado con `Boleto ya utilizado previamente`.
* **Exit Code:** `0` (Éxito Total).

