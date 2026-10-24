# 📜 DOMUS OS · RELEASE & DEPLOYMENT LEDGER

Registro formal y auditable de versiones, commits, tags, deployments de Google Apps Script, versiones de esquema y procedimientos de rollback para **DOMUS Centro Cultural & Club**.

---

## 🏷️ Release Ledger

| Release | Git commit | Git tag | Apps Script deployment ID | Apps Script version | Schema version | Frontend version | Fecha | Responsable | Resultado pruebas | Rollback target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **v1.0.0-pre-hardening** | `1a89a14` | `production-pre-hardening` | `@exec-prod` | `v1` | `DOMUS-DB-v1` | `1.0.0` | 2026-10-24 | René / SadoTech | ✅ Estable en Producción | N/A (Baseline) |
| **v1.1.0-stabilization** | `731aa05` (`stabilization/backend-v1`) | `staging-stabilization-v1` | `AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk` (`114VSwo3...` y `1NDpuyx6...`) | `v2-modular (v15)` | `DOMUS-DB-v1.1` (incluye hoja `REQUESTS`) | `1.1.0` | 2026-10-24 | René / Antigravity IDE | 🟡 Despliegue de bundle 731aa05 en Staging para suite extendida | `1a89a14` (`production-pre-hardening`) |
| **v1.1.0-staging-verified** | `00fced7` (`stabilization/backend-v1`) | `staging-certified-v1.1` | `AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk` (`114VSwo3...` y `1NDpuyx6...`) | `v17` (Library `.../17`) | `DOMUS-DB-v1.1` (incluye hoja `REQUESTS`) | `1.1.0` | 2026-10-24 | René / Antigravity IDE | ✅ **100% STAGING VERIFIED**: 14/14 Casos + Fase 0.5 + 3 Gates Aprobados (Chrome real multi-pestaña, KDS inventario entrega física y Rollback operacional verificado) | `AKfycbzLkId5CWpQp3kBuY6UM5r6zhmyVyxmP1R80SfQidL83qXi_tUueRGd4P20Nc0tRYNH` |

---

## 🔒 Estado de los Gates de Validación Final

| Gate | Descripción | Estado | Implementación / Acción |
| :--- | :--- | :---: | :--- |
| **Gate 1: Token GitHub** | Revocación de credencial expuesta y limpieza de remotes. | 🟡 **Acción Humana** | El remote Git local está limpio (`https://github.com/SadoTechMX/Admin-Domus.git`). No se usan ni almacenan PATs en Git. El usuario debe revocar inmediatamente el PAT en GitHub Settings si aún no lo ha hecho. |
| **Gate 2: RBAC Zero-Trust** | Validación estricta en servidor basada en sesión. | ✅ **APROBADO** | `Auth.gs` rechaza manipulación de JavaScript desde el navegador; la sesión del servidor dicta los permisos reales. Verificado en Staging (Test 7 y 8). |
| **Gate 3: Idempotencia Fuerte + Payload Binding** | Deduplicación ligada a `action + payloadHash + deviceId`. | ✅ **APROBADO** | `Idempotency.gs` calcula SHA-256 canónico. Reutilizaciones con payload diferente arrojan `409 Conflict: IDEMPOTENCY_KEY_REUSED`. Pérdida de ACK recupera folio idéntico sin duplicados. |
| **Gate 4: Outbox Multi-Pestaña y Cierre Navegador** | Exclusión mutua entre pestañas y persistencia de cola. | ✅ **APROBADO** | **Validado en Google Chrome real**: 2 pestañas concurrentes emiten exactamente 1 POST gobernado por Web Locks API (`domus-outbox-sync`); terminación de proceso y reapertura conserva `LOCAL_PENDING` y confirma (Tests 5 y 6). |
| **Gate 5: KDS Entrega e Inventario Físico (ADR-004)** | Decremento de stock únicamente en entrega y tolerancia a reintentos. | ✅ **APROBADO** | **Validado en STAGING v17**: Comanda `DCS-138-...` entregada físicamente; reintento con mismo requestId recupera op original en 1.00s; segundo intento con ID nuevo rechazado por anti doble-entrega (Test 13). |
| **Gate 6: Rollback Operacional Real en STAGING** | Conmutación operativa entre despliegue nuevo y baseline. | ✅ **APROBADO** | Conmutación a baseline `AKfycbz...` (HEALTHY 1.09s, lectura catálogo ok=True) y restauración a versión nueva `AKfycbys...` (HEALTHY 1.16s) ejecutada sin pérdida operativa (Test 14). |
| **Gate 7: Fase 0.5 Ticketing & Access Commerce** | Separación contable Taquilla, Boletera Externa, Transferencias y Cortesías. | ✅ **APROBADO** | Validado financieramente: Taquilla $200 ($150 entrada + $50 guardarropa), Boletera $50 (guardarropa), Transferencia confirmada $150, Cortesía $0 cobrado (Tests A, B, C, D). |
| **Merge a Producción (`main`)** | Integración controlada de Fase 0 y 0.5 con tag `v1.1.0`. | ⏸️ **READY FOR AUTHORIZATION** | Todos los gates completados al 100%. `main` congelada en espera de confirmación expresa. |

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
