# 🤝 DOMUS OS · AI HANDOFF PROTOCOL (Punto Canónico de Entrada)

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
| **Merge a `main`** | Despliegue de Fase 0 a Producción. | ⛔ **BLOQUEADO (NO-GO)** | Requiere veredicto PASS en las 14 pruebas de Staging y P95 < 5.0s. |
| **Fase 1** | Apertura de Caja, Turnos, Corte X, Arqueo de Efectivo y Corte Z. | 🔒 **EN ESPERA** | No comenzar hasta que Fase 0 esté aprobada en Staging. |

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
