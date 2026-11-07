> **Actualización vigente, 7 noviembre 2026 UTC:** [Pago mixto de Caja](MIXED_PAYMENT_20261107.md), UI `20261107-mixed-12`: una intención y recibo, efectivo más una terminal, dos filas vinculadas y recuperación con el mismo ID. 17 casos nuevos y 4 de Chromium pasan; puente térmico 12. Mixto aún no instalado, ticket físico pendiente. Coordinación reportó entrega/consumo de la misma comanda de staging 687, sin repetir cobro; no es validación productiva. Sin deployment, PR, merge ni datos reales en este tramo.

> **Actualización vigente, 7 noviembre 2026 UTC:** [Periodo operativo y salida de revisión](OPERATING_PERIOD_RECOVERY_20261107.md), UI `20261107-recovery-11`. La prueba de staging 8b reportada por coordinación confirmó fecha fuera de SEMANA; no se repitió. Corrección aislada: causa visible y rechazo antes de nuevas operaciones; cierre explícito sólo de revisión vacía/resuelta con archivo durable, sin replay. No retrofecha ni ajusta SEMANA; pendientes desconocidos siguen bloqueados. La nueva pareja no está instalada y producción permanece intacta.

> **Actualización vigente, 6 noviembre 2026:** [Revisión de Outbox](OUTBOX_REVIEW_20261106.md), UI `20261106-review-10`. Pausa anterior al arranque para colas previas/ilegibles, copias originales y exportación privada, sin reenvío ni liberación. 8 casos nuevos de funciones y 7 de Chromium pasan, además de regresiones relevantes. Sólo código aislado: los 15 IDs reales siguen intactos y sin resolver; no abrir el cliente productivo antiguo para inspeccionarlos. Gemini/IDE entregaron sus revisiones estáticas de 3f según coordinación, sin revisar este cambio. Candidata no instalada; producción sin cambios.

> **Vigente, 6 noviembre 2026 (Ciudad de México):** Leer [TRANSFER_CONFIRMATION_20261105.md](TRANSFER_CONFIRMATION_20261105.md). Steven aceptó provisionalmente las cuatro reglas de eventos existentes/aforo manual, boleto externo por referencia/grupo, conciliación separada y banco antes de aplicar/entregar. UI `20261106-transfers-09` prepara confirmación idempotente de Gerencia para Caja y permiso de entrega con evidencia durable; 20 + 5 pruebas nuevas aisladas pasan. Sin configuración bancaria real ni instalación. Accesos por transferencia y ACTIVIDADES35 siguen bloqueados; no inferir literales ni receptores. Data/Events ya están en 3f29bdc; root realizó revisión/evidencia, sin delta privado ni reserva de implementación. Ver [compatibilidad y reversión](COMPATIBILIDAD_REVERSION_3f29bdc_20261106.md). Los estados históricos siguientes no acreditan esta candidata.

# 🤝 DOMUS OS · AI HANDOFF PROTOCOL (Punto Canónico de Entrada)

> **Registro externo y ticket, alcance actualizado (5 noviembre, Ciudad de México):** [BOLETERA_REGISTRO_20261105.md](BOLETERA_REGISTRO_20261105.md). Cada proyecto usa su boletera; DOMUS captura proveedor/referencia/importe/receptor/medio como declaración sin verificación automática ni cobro duplicado. Transferencias conservadas como pendientes, sin integración Shopify. Ticket de Caja descargable y recuperable; entrega real pendiente. 9 casos de registro, 4 de documento y 21 de navegador locales pasan. ACTIVIDADES 35 sigue bloqueando admisiones. No instalado, Google/producción sin cambios.

> **Decisiones de apertura preparadas (5 noviembre, Ciudad de México):** [CAJA_DECISIONES_MINIMAS_20261105.md](CAJA_DECISIONES_MINIMAS_20261105.md) separa tres decisiones de alcance para Steven de los gates técnicos y del contrato de Accesos/Eventos. Es una propuesta, no aprobación ni configuración aplicada. Código operativo permanece en `69aeb07`; no hubo nuevas pruebas, consultas remotas ni despliegue.

> **Canonical header evidence received, 2026-11-05 Mexico City:** Read `docs/ACTIVITY_CANONICAL35_20261105.md`. Exact 35 names and the existing IDE review are now available. Canonical reads use U for raw status and distinct Area/Project, never percentage as capacity. New event/admission/selection mutations and event-journal replay fail closed with ACTIVITY_POLICY_REQUIRED until the owner defines lifecycle/agreement/share/capacity policy. 20 schema cases pass locally. No new remote reads/audits, production changes or installation.

> **Activity-schema follow-up, 2026-11-05 Mexico City:** Read `docs/ACTIVITY_SCHEMA_GUARDS_20261105.md`. One editor in the existing repair branch; Access/Events/Data and client guards are locally tested (12 new regressions). Unknown production 35-column schema stays BLOCKED until the complete existing header evidence and IDE review are received. Synthetic negative fixture is not production parity. No Google lookup/write, new engine, PR, merge or deployment. Do not infer capacity/status or replay unbound old event journals.

> **Master-app update, 2026-11-06:** Read `docs/MASTER_INTEGRATION_20261106.md`. UI `20261106-master-05` validates the sale result and matching request ID; 13 transport and 9 legacy-cutover cases pass. Production panel V16 and current-editor/public acb47f6 match were reported by coordination; immutable V16/HTML parity is still unproven. ACTIVIDADES has 35 columns and incompatible positional Access/Events assumptions: integration remains blocked pending explicit mapping/guards. Do not infer migration or copy IntegratedStore. Same reserved files/branch, no Google writes, PR, merge or deployment.

> **Reload/rejection follow-up, 2026-11-05:** Read `docs/RELOAD_REJECTION_FIXES_20261105.md`. UI `20261105-reconcile-03` fixes 5xx recovery across reload and permits replacement only for explicit pre-effect POS validation outcomes. Eight new real-source/mock tests and strengthened real-browser reload coverage pass. Old unproven quarantines stay blocked. Still LOCAL_TESTED / NO-GO; no deployment or live data operations.

> **Review follow-up, 2026-11-05:** See `docs/REVIEW_FIXES_20261105.md` and ADR-006 before using the earlier candidate. UI `20261105-reconcile-02` fixes rejected-intent handling, draft ownership, all Outbox writers, total courtesy and 5xx recovery. It requires Web Locks; old tabs must be closed before any later installation. Still LOCAL_TESTED / NO-GO.

> **2026-11-05 isolated reconciliation:** Read `docs/RECONCILIATION_20261105.md` first. Candidate combines current main `2b7ba1f` with PR #18 `f0c24ea` in a separate branch. LOCAL_TESTED only; no merge, deployment, live Sheets or hardware checks. Earlier deployment observations below are historical.

> **2026-10-30 repair coordination update:** Read `docs/ANTIGRAVITY_CROSSCHECK_20261030.md` and `docs/REPAIR_STATUS_20261030.md` before using historical phase/deployment labels below. PR #18 remains draft/NO-GO. Published `AKfycbwg...` passed exact Main/Ops identity checks, but its native routes return JSON and the candidate is not deployed. The old Caja simple/staging label must not authorize writes to production books.

> [!IMPORTANT]
> **REGLA FUNDAMENTAL PARA TODAS LAS IAs (Antigravity, ChatGPT/Ariadna, Claude, etc.):**
> Antes de sugerir, diseñar o modificar cualquier archivo de este repositorio, **debes leer este documento completo**, [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md) y [`docs/OPERATING_RULES.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/OPERATING_RULES.md).
> **No asumas el contexto de una sesión anterior ni supongas el estado del código.**

---

## 📌 Identificación del Proyecto y Línea Base

* **Proyecto:** DOMUS OS (Sistema de POS, KDS, Accesos y Control Operativo para DOMUS Centro Cultural & Club).
* **Rama Canónica de Producción:** `main` (**CONGELADA · NO HACER COMMITS DIRECTOS NI MERGE**).
* **Rama Activa de Desarrollo:** `stabilization/backend-v1` (Rama aislada de estabilización).
* **LAST_VERIFIED_COMMIT:** `5dd47ab` (Último commit formalmente auditado por ChatGPT / Ariadna).
* **HEAD Activo Actual:** Determinado dinámicamente ejecutando `git rev-parse HEAD` (siempre manda sobre hashes escritos en texto).
* **Tag de Línea Base Estable:** `production-pre-hardening` (commit `1a89a14`).
* **Versión de Apps Script:** `v2-modular` (11 módulos independientes en `google-apps-script/`).
* **Versión de Esquema de Datos:** `DOMUS-DB-v1.1` (incluye hoja transaccional `REQUESTS`).

---

## 🚦 Semáforo de Fases

| Fase | Alcance | Estado | Política |
| :--- | :--- | :---: | :--- |
| **Fase 0** | Hardening transaccional, modularización, RBAC Zero-Trust, Idempotencia y Outbox. | **~95% (En Staging)** | Implementado en repo local. Pendiente validación real de 14 pruebas en `DOMUS-STAGING`. |
| **Fase 0.5** | **Ticketing & Access Commerce**: Canales comerciales, boleteras externas, preventas, transferencias, cortesías y guardarropa desacoplado (ADR-005). | 🟢 **EN IMPLEMENTACIÓN** | Requisito previo indispensable para evitar contaminar el Corte X/Z con ingresos ficticios. |
| **Merge a `main`** | Despliegue de Fase 0 + 0.5 a Producción. | ⛔ **BLOQUEADO (NO-GO)** | Requiere veredicto PASS en las pruebas de Staging y P95 < 5.0s. |
| **Fase 1** | Apertura de Caja, Turnos, Corte X, Arqueo de Efectivo y Corte Z. | 🔒 **EN ESPERA** | No comenzar hasta que Fase 0 y 0.5 estén validadas en Staging. |

---

## 🏷️ Taxonomía Obligatoria de Estados de Verificación

Para evitar que una IA declare como "completa" una tarea que solo está codificada, se debe usar estrictamente esta taxonomía:

1. **`IMPLEMENTED`**: El código o documentación fue escrito y agregado al repositorio.
2. **`LOCAL_TESTED`**: Pasó con éxito la suite de pruebas automatizadas locales (`python3 test_gates_...`).
3. **`STAGING_VERIFIED`**: Ejecutado y validado en el entorno real de `DOMUS-STAGING` (con Google Apps Script y Google Sheets reales).
4. **`AUDITED`**: Revisado y aprobado conceptual y técnicamente por el auditor externo (ChatGPT / Ariadna).
5. **`APPROVED_FOR_MERGE`**: Autorizado explícitamente por Dirección/Gerencia para ser integrado a producción.
6. **`PROD_DEPLOYED`**: Desplegado en el Web App activo de Apps Script y/o publicado en GitHub Pages.
7. **`PROD_VERIFIED`**: Verificado en vivo durante la operación real del club.

---

## 🏛️ Las 5 Fuentes Canónicas de Verdad

Para evitar contradicciones entre agentes y sesiones:

| Dimensión | Fuente Canónica de Verdad | Regla de Oro |
| :--- | :--- | :--- |
| **Código Fuente** | GitHub (`main` = producción, `stabilization/backend-v1` = desarrollo) | Ninguna IA asume código que no esté en Git. |
| **Backend de Producción** | Google Apps Script Web App Deployment ID | Un `git push` **no actualiza** el backend hasta que se despliega una nueva versión. |
| **Datos Operativos** | Google Sheets Maestro (`1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U`) | El estado financiero real (saldos, tickets, comandas) vive en Sheets, no en el cliente. |
| **Reglas de Negocio** | [`docs/OPERATING_RULES.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/OPERATING_RULES.md) y [`docs/DOMUS_CONTEXT.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/DOMUS_CONTEXT.md) | Ninguna IA reinterpreta decisiones de cortesías, Solar/Lunar o NEC. |
| **Decisiones de Arquitectura** | Directorio [`docs/adrs/`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/adrs) (ADRs) | Toda decisión estructural tiene un registro inmutable. |

---

## 🔒 Decisiones Críticas que Ninguna IA Puede Reinterpretar

1. **El inventario se decrementa únicamente al entregar físicamente el producto en barra/cocina** (ADR-004), jamás al ingresar la orden en caja o abrir una cuenta.
2. **Cero inventar o alterar folios financieros**: el histórico transaccional en `COBROS` y `REQUESTS` es inmutable.
3. **RBAC Zero-Trust en Servidor**: El rol enviado por el cliente en JavaScript es una declaración no confiable; el servidor en `Auth.gs` determina el rol legítimo contrastando la sesión.
4. **Idempotencia con Payload Binding**: Un `requestId` reutilizado con un payload alterado produce **`409 Conflict: IDEMPOTENCY_KEY_REUSED`** (ADR-002).
5. **Outbox con Web Locks API**: La sincronización multi-pestaña utiliza `navigator.locks.request('domus-outbox-sync', ...)` con lease fallback en `localStorage` (ADR-003).
6. **Políticas de Cortesía**: Solo Gerencia/Dirección autoriza cortesías.
7. **Fases Solar / Lunar**: Tienen cartas, precios y reglas de despacho distintas.
8. **Seguridad Git**: Jamás incluir Personal Access Tokens (PAT) en URLs de remotes, scripts o comandos.

---

## 📋 Protocolo de Trabajo Obligatorio para IAs

### 📥 ANTES DE ACTUAR (Protocolo de Entrada)
1. `git fetch origin`
2. `git status`
3. `git branch --show-current` (Verificar que estás en `stabilization/backend-v1`, jamás en `main`)
4. `git rev-parse HEAD` (Conocer el hash de trabajo activo)
5. Leer [`docs/AI_HANDOFF.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/AI_HANDOFF.md)
6. Leer [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md)
7. Leer [`docs/OPERATING_RULES.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/OPERATING_RULES.md)
8. Revisar commits posteriores a `LAST_VERIFIED_COMMIT`: `git log <LAST_VERIFIED_COMMIT>..HEAD --oneline`
9. **No asumir que `CURRENT_STATE.md` describe commits aún no auditados.**

### 📤 ANTES DE HANDOFF (Protocolo de Salida)
1. Ejecutar la suite de pruebas unitarias locales (`python3 ...`).
2. Revisar `git diff`.
3. Crear commit en la rama de aislamiento (`stabilization/backend-v1`).
4. `git push origin stabilization/backend-v1`.
5. Actualizar [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md) registrando qué componentes están `IMPLEMENTED` y cuáles `LOCAL_TESTED`.
6. Indicar con claridad la siguiente acción técnica requerida y bloqueos pendientes.
