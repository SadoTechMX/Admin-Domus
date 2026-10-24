# 🛡️ DOMUS OS · INSTRUCCIONES PERMANENTES DE GOBERNANZA

> [!IMPORTANT]
> Estas reglas rigen el comportamiento de Antigravity IDE de forma permanente en todas las sesiones y tareas de este espacio de trabajo.

---

## 1. Gestión de Ramas y Flujo Git
* **Repositorio Canónico:** `SadoTechMX/Admin-Domus`
* **Rama `main` (Producción):** **ESTRICTAMENTE CONGELADA.** Nunca trabajar directamente sobre `main`, nunca hacer commits directos ni ejecutar merges a `main` sin autorización expresa y pruebas de Staging aprobadas.
* **Rama de Trabajo:** Trabajar siempre sobre ramas de aislamiento (actualmente `stabilization/backend-v1`).
* **Verificación Previa (Inbound):**
  1. `git fetch origin`
  2. `git status`
  3. `git branch --show-current`
  4. `git rev-parse HEAD`
  5. Consultar `docs/AI_HANDOFF.md`, `docs/CURRENT_STATE.md` y `docs/OPERATING_RULES.md`
  6. Revisar commits posteriores a `LAST_VERIFIED_COMMIT`
* **Verificación Pre-Commit (Outbound):**
  1. Ejecutar la suite de pruebas unitarias locales.
  2. Verificar el diff con `git diff`.
  3. Crear commit en la rama de trabajo.
  4. Pushear a origin con el remote limpio.
  5. Actualizar `docs/CURRENT_STATE.md` registrando estados con la taxonomía formal (`IMPLEMENTED`, `LOCAL_TESTED`, `STAGING_VERIFIED`, etc.).

---

## 2. Seguridad Absoluta de Secretos y Credenciales
* **PROHIBICIÓN TOTAL:** Jamás escribir ni incrustar Personal Access Tokens (PAT, `ghp_...`), contraseñas o llaves de API dentro de URLs de remotes Git, archivos de código, mensajes de commit o comandos de terminal ejecutados.
* **Origen Limpio:** El remote Git debe permanecer invariablemente como `https://github.com/SadoTechMX/Admin-Domus.git`. La autenticación se delega al gestor del sistema (macOS Keychain / GitHub Desktop).

---

## 3. Protocolo Canónico Multi-IA (AI Handoff)
* Al iniciar cualquier turno o tarea, consultar obligatoriamente:
  1. [`docs/AI_HANDOFF.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/AI_HANDOFF.md)
  2. [`docs/CURRENT_STATE.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/CURRENT_STATE.md)
  3. [`docs/OPERATING_RULES.md`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/OPERATING_RULES.md)
* No asumir contexto ni decisiones de sesiones anteriores sin verificar estos documentos y los ADRs en [`docs/adrs/`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/docs/adrs).

---

## 4. Principios Transaccionales de DOMUS
* **Inventario:** El stock se decrementa únicamente al entregar físicamente la comanda al cliente (ADR-004).
* **Finanzas:** Los registros de `COBROS` y `REQUESTS` son inmutables.
* **Idempotencia:** Todo `requestId` está ligado a `action + payloadHash + deviceId`. Toda colisión con payload mutado se rechaza con `409 IDEMPOTENCY_KEY_REUSED` (ADR-002).
* **Outbox:** El mutex entre pestañas del navegador se gobierna por Web Locks API (ADR-003).
