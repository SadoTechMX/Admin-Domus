# 🤝 DOMUS OS · AI HANDOFF PROTOCOL (Punto Canónico de Entrada)

> [!IMPORTANT]
> **REGLA FUNDAMENTAL PARA TODAS LAS IAs (Antigravity, ChatGPT/Ariadna, Claude, etc.):**
> Antes de sugerir, diseñar o modificar cualquier archivo de este repositorio, **debes leer este documento completo**, [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md) y [`docs/OPERATING_RULES.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/OPERATING_RULES.md).
> **No asumas el contexto de una sesión anterior ni supongas el estado del código.**

---

## 📌 Identificación del Proyecto y Estado Actual

* **Proyecto:** DOMUS OS (Sistema Operativo de Punto de Venta, KDS, Accesos y Control Operativo para DOMUS Centro Cultural & Club).
* **Rama Canónica de Producción:** `main` (**CONGELADA · NO HACER COMMITS DIRECTOS NI MERGE**).
* **Rama Activa de Desarrollo:** `stabilization/backend-v1` (Rama aislada de estabilización).
* **Último Commit Auditado:** `cd24636` (*feat(hardening): Idempotency payload binding, Web Locks API mutex, and Staging plan*).
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

1. **El inventario se decrementa únicamente al entregar físicamente el producto en barra/cocina**, jamás al ingresar la orden en caja o abrir una cuenta.
2. **Cero inventar o alterar folios financieros**: el histórico transaccional en `COBROS` y `REQUESTS` es inmutable.
3. **RBAC Zero-Trust en Servidor**: El rol enviado por el cliente en JavaScript es una declaración no confiable; el servidor en `Auth.gs` determina el rol legítimo contrastando la sesión.
4. **Idempotencia con Payload Binding**: Un `requestId` reutilizado con un payload alterado produce **`409 Conflict: IDEMPOTENCY_KEY_REUSED`**.
5. **Outbox con Web Locks API**: La sincronización multi-pestaña utiliza `navigator.locks.request('domus-outbox-sync', ...)`.
6. **Políticas de Cortesía**: Solo Gerencia/Dirección autoriza cortesías.
7. **Fases Solar / Lunar**: Tienen cartas, precios y reglas de despacho distintas.
8. **Seguridad Git**: Jamás incluir Personal Access Tokens (PAT) en URLs de remotes, scripts o comandos.

---

## 🔄 Flujo de Sincronización entre IAs

```text
                 IA A (Antigravity IDE)
                           │
            Modifica código + ejecuta tests
                           │
             Actualiza docs/CURRENT_STATE.md
                           │
                 git commit + git push
                           │
                           ▼
                    GitHub Remoto
                           │
                           ▼
                 IA B (ChatGPT / Auditor)
                           │
        Lee AI_HANDOFF.md + diff + commits
                           │
             Emite veredicto y directrices
                           │
                           ▼
                 IA A (Antigravity IDE)
                           │
         Continúa exactamente en el estado auditado
```

---

## 📋 Pasos para la IA que Recibe este Contexto

1. Ejecutar `git status` y `git branch --show-current`.
2. Confirmar que estás en `stabilization/backend-v1`.
3. Revisar [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md) para conocer el último cambio técnico.
4. Validar cualquier cambio contra [`STAGING_PLAN.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/STAGING_PLAN.md).
5. Al terminar tu turno, actualiza `docs/CURRENT_STATE.md` con tu commit antes de cerrar.
