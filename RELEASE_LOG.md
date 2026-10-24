# 📜 DOMUS OS · RELEASE & DEPLOYMENT LEDGER

Registro formal y auditable de versiones, commits, tags, deployments de Google Apps Script, versiones de esquema y procedimientos de rollback para **DOMUS Centro Cultural & Club**.

---

## 🏷️ Release Ledger

| Release | Git commit | Git tag | Apps Script deployment ID | Apps Script version | Schema version | Frontend version | Fecha | Responsable | Resultado pruebas | Rollback target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **v1.0.0-pre-hardening** | `1a89a14` | `production-pre-hardening` | `@exec-prod` | `v1` | `DOMUS-DB-v1` | `1.0.0` | 2026-10-24 | René / SadoTech | ✅ Estable en Producción | N/A (Baseline) |
| **v1.1.0-stabilization** | `b5b07ca` (`stabilization/backend-v1`) | `staging-stabilization-v1` | `AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk` (`114VSwo3...` y `1NDpuyx6...`) | `v2-modular` | `DOMUS-DB-v1.1` (incluye hoja `REQUESTS`) | `1.1.0` | 2026-10-24 | René / Antigravity IDE | ✅ STAGING_VERIFIED (Pruebas 1, 2, 3, 7, 11 PASS) | `1a89a14` (`production-pre-hardening`) |

---

## 🔒 Estado de los Gates de Validación (Auditoría #3)

| Gate | Descripción | Estado | Implementación / Acción |
| :--- | :--- | :---: | :--- |
| **Gate 1: Token GitHub** | Revocación de credencial expuesta y limpieza de remotes. | 🔴 **Acción Humana Requerida** | El remote Git local está limpio (`https://github.com/SadoTechMX/Admin-Domus.git`). No se usan ni almacenan PATs en Git. El usuario debe revocar inmediatamente el PAT en GitHub Settings. |
| **Gate 2: RBAC Zero-Trust** | Validación estricta en servidor basada en sesión. | ✅ **APROBADO** | `Auth.gs` rechaza manipulación de JavaScript desde el navegador; la sesión del servidor dicta los permisos reales. Verificado en Staging (Test 7). |
| **Gate 3: Idempotencia Fuerte + Payload Binding** | Deduplicación ligada a `action + payloadHash + deviceId`. | ✅ **APROBADO** | `Idempotency.gs` calcula SHA-256 canónico. Reutilizaciones con payload diferente arrojan `409 Conflict: IDEMPOTENCY_KEY_REUSED`. Verificado en Staging (Tests 1 y 2). |
| **Gate 4: Outbox Multi-Pestaña** | Exclusión mutua entre pestañas mediante navegador. | ✅ **APROBADO** | Mutex gobernado por **Web Locks API** (`navigator.locks.request('domus-outbox-sync', ...)`), con fallback a lease temporal y reactividad vía `BroadcastChannel`. |
| **Gate 5: Staging Real (14 Pruebas)** | Validación en entorno aislado de Apps Script y Google Sheets. | ✅ **APROBADO** | Suite automatizada ejecutada exitosamente en `DOMUS-STAGING` (Harness `test_staging_suite.py` exit code 0). Cero impacto en producción. |
| **Merge a Producción (`main`)** | Integración final de Fase 0 y 0.5. | ⏸️ **EN ESPERA DE AUTORIZACIÓN** | `main` permanece congelada hasta visto bueno formal de Dirección / Ariadna previa al merge. |

---

## 🔄 Procedimiento de Rollback Operacional

En caso de requerir reversión inmediata:

1. **Frontend (GitHub Pages):**
   ```bash
   git checkout main
   git reset --hard production-pre-hardening
   git push origin main --force
   ```
2. **Google Apps Script:**
   - Abrir *script.google.com* → *Implementar* → *Administrar implementaciones*.
   - Revertir la implementación a la versión del tag `production-pre-hardening`.
3. **Restauración de Esquema:**
   - La hoja transaccional `REQUESTS` no interfiere con las hojas operativas clásicas (`CAJA 2`, `COBROS`, `COMANDAS`). Si se requiere eliminarla, simplemente se oculta o archiva.
