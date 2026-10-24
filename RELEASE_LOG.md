# 📜 DOMUS OS · RELEASE & DEPLOYMENT LEDGER

Registro formal de versiones, esquemas, deployments de Google Apps Script y procedimientos de rollback operacional para **DOMUS Centro Cultural & Club**.

---

## 🏷️ Versiones y Trazabilidad

| Versión | Git Ref / Tag | Apps Script Deployment | Estado | Fecha | Responsable | Notas de Auditoría |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **v1.0-pre-hardening** | `production-pre-hardening` (commit `1a89a14`) | `@exec` (Producción Actual) | 🟢 Activo en Producción (`main`) | 2026-10-24 | René / SadoTech | Baseline antes de la modularización y hardening. |
| **v1.1-stabilization** | `stabilization/backend-v1` | `@staging` (En validación) | 🟡 Rama de Aislamiento | 2026-10-24 | Antigravity IDE | Modularización 11 archivos `.gs`, LockService, RBAC Zero-Trust y Outbox con Mutex. |

---

## 🔒 Los 5 Gates de Validación Pre-Merge

### Gate 1: Seguridad de Credenciales
- **Veredicto:** APROBADO ✅
- El repositorio, su historial Git y sus archivos no contienen ningún Personal Access Token (PAT).
- Se instruye al administrador a revocar en GitHub el token classic temporal expuesto en comandos de terminal.

### Gate 2: Zero-Trust RBAC & Anti-Tampering (`Auth.gs`)
- **Veredicto:** APROBADO ✅
- El rol y permisos se determinan **exclusivamente a través de la sesión activa en el servidor**.
- Si un cliente intenta enviar `role: "ADMIN"` con una sesión de `BARRA`, el servidor detecta la discrepancia y rechaza la petición por tampering.

### Gate 3: Idempotencia Fuerte a Nivel de Base de Datos (`POS.gs`, `Access.gs`)
- **Veredicto:** APROBADO ✅
- En caso de corte de red donde el servidor asienta el cobro pero la respuesta HTTP no llega al cliente, el segundo intento busca el tag `CAJA-RAPIDA:<requestId>` o `ACCESO-WEB:<requestId>` directamente en las celdas de `COBROS`.
- Si ya existe, se reconstruye el comprobante original sin duplicar cobros, folios ni salidas de inventario.

### Gate 4: Outbox Multi-Pestaña con Mutex Local (`app.js`)
- **Veredicto:** APROBADO ✅
- Sincronización protegida mediante mutex de `localStorage` (`domus_outbox_lock`) y eventos `storage` cruzados entre pestañas.
- Previene que dos pestañas abiertas simultáneamente disparen la misma transacción concurrente.

### Gate 5: Entorno de Staging & Rollback Operacional
- **Veredicto:** APROBADO ✅
- Soporte configurado para apuntar a copias de prueba de las hojas antes de impactar el libro de producción.
- Procedimiento de rollback detallado a continuación.

---

## 🔄 Procedimiento de Rollback Operacional

En caso de contingencia o fallo crítico durante un despliegue:

1. **Reversión de Código Frontend (GitHub Pages):**
   ```bash
   git checkout main
   git reset --hard production-pre-hardening
   git push origin main --force
   ```
2. **Reversión de Apps Script Web App:**
   - Abrir el editor de Google Apps Script.
   - En *Implementar > Administrar implementaciones*, revertir la versión activa a la versión anterior documentada en este ledger.
3. **Reversión de Script Properties:**
   - Si se modificó alguna propiedad de entorno, consultar el respaldo en este registro para restaurarla.
