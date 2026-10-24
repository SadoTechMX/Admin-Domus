# 🧪 DOMUS OS · PROTOCOLO DE VALIDACIÓN EN STAGING

Plan de pruebas de integración real para el entorno de Staging (`DOMUS-STAGING`) previo a cualquier autorización de merge a `main`.

---

## 🎯 Objetivo
Validar el comportamiento del sistema ante condiciones de red inestables, concurrencia multi-pestaña, pérdida de paquetes ACK y contención de recursos en Google Sheets / Apps Script en un entorno aislado sin afectar la operación real de DOMUS.

---

## 🏗️ 1. Infraestructura de Staging

### A. Copia del Libro de Google Sheets (`DOMUS-STAGING`)
Duplicar el libro maestro de producción (`1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U`) y asignarle el nombre `DOMUS_STAGING_DB`:
1. `CAJA 2`
2. `COBROS`
3. `COMANDAS`
4. `CATALOGO`
5. `INVENTARIO`
6. `ACCESO`
7. `ACTIVIDADES`
8. `REQUESTS` (Ledger transaccional de idempotencia)

### B. Deployment Separado de Google Apps Script (`DOMUS-STAGING`)
1. Crear un proyecto independiente en [script.google.com](https://script.google.com) o una implementación separada tipo *Staging*.
2. Configurar en `Config.gs`:
   ```javascript
   mainSheetId: '<STAGING_SPREADSHEET_ID>'
   ```
3. Desplegar como Web App:
   - *Ejecutar como:* Usuario que accede o cuenta de servicio staging.
   - *Quién tiene acceso:* Cualquiera o usuarios de prueba del club.
4. Obtener URL de Web App de Staging:
   `https://script.google.com/macros/s/<STAGING_DEPLOYMENT_ID>/exec`

---

## 📋 2. Checklist de las 14 Pruebas de Integración

| # | Prueba | Procedimiento de Ejecución | Resultado Esperado | Criterio de Aceptación |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Mismo `requestId` 10 veces** | Enviar 10 peticiones HTTP idénticas consecutivas con el mismo `requestId` y mismo payload. | Exactamente 1 movimiento asentado en `COBROS` y `CAJA 2`. Las 9 peticiones restantes retornan el mismo comprobante original. | Cero duplicados en base de datos; respuesta idéntica. |
| **2** | **Mismo ID + Payload Diferente** | Enviar `requestId: REQ-001` con total $500. Luego enviar `REQ-001` con total $800. | Rechazo inmediato con código `409 Conflict` y error `IDEMPOTENCY_KEY_REUSED`. | Transacción no se altera ni se duplica; se alerta discrepancia. |
| **3** | **10 Ventas Simultáneas** | Disparar 10 peticiones asíncronas concurrentes desde 10 hilos/dispositivos con diferentes `requestId`. | Exactamente 10 transacciones registradas sin colisión de celdas ni sobreescritura gracias a `LockService.getScriptLock()`. | 10 folios consecutivos y consistentes. |
| **4** | **Pérdida de ACK tras escritura** | Simular desconexión de red (abortar fetch) justo tras enviar la venta y antes de recibir respuesta. Reintentar. | El reintento consulta `REQUESTS` y `COBROS`, detecta el movimiento y devuelve el ticket sin reinsertar. | Cero duplicación ante caída de red. |
| **5** | **Dos pestañas sincronizan Outbox** | Poner navegador offline, crear 3 ventas en pestaña A. Abrir pestaña B. Conectar red simultáneamente. | `navigator.locks.request('domus-outbox-sync')` otorga el lock a una sola pestaña. La otra detecta lock activo y espera. | Ni una sola orden duplicada; cola se vacía ordenadamente. |
| **6** | **Cierre y reapertura de navegador** | Encolar 2 ventas en modo offline. Cerrar completamente el navegador. Reabrir. | Las transacciones permanecen intactas en `localStorage` / `Outbox` y se procesan automáticamente al reabrir. | Cero pérdida de datos locales. |
| **7** | **BARRA declara ADMIN** | Pestaña autenticada con rol `BARRA` manipula el payload para enviar `role: "ADMIN"` en una acción privilegiada. | `Auth.gs` recupera la sesión del servidor, detecta inconsistencia de rol y rechaza la solicitud. | `403 Forbidden` / Rechazo por Tampering. |
| **8** | **Token expirado** | Enviar petición con `sessionToken` con más de 12 horas de antigüedad o revocado. | Rechazo con código de sesión expirada obligando a reautenticar. | Acceso denegado seguro. |
| **9** | **Caja genera pedido → KDS** | Caja registra venta de 2 bebidas y 1 alimento. Monitorear pestaña de Barra/Cocina. | El pedido aparece exactamente una sola vez en el display KDS correspondiente. | Comanda visible en KDS sin duplicar. |
| **10** | **Red interrumpida Caja → KDS** | Cortar conexión mientras se envía pedido a Comandas; reconectar y reintentar. | El pedido se recupera y se muestra en KDS con su estado correcto sin renglones fantasma. | Consistencia en cocina y barra. |
| **11** | **Doble acceso** | Simular escaneo doble de un mismo código QR o folio de boleto en Accesos con <500ms de diferencia. | Se valida exactamente 1 entrada; el segundo intento reporta "Boleto ya utilizado". | Aforo exacto; cero entradas dobles. |
| **12** | **Doble devolución guardarropa** | Solicitar retiro simultáneo de una misma prenda desde 2 terminales. | Una sola devolución exitosa; la segunda reporta "Prenda ya entregada". | Control estricto de prendas. |
| **13** | **Timeout durante inventario** | Ejecutar sincronización de catálogo con interrupción forzada a los 25 segundos. | El estado del inventario se mantiene íntegro sin datos corruptos ni filas a medio escribir. | Consistencia transaccional. |
| **14** | **Rollback de backend** | Simular fallo crítico y ejecutar procedimiento de reversión a la versión anterior de Apps Script. | El sistema opera normalmente sobre la versión estable previa documentada en el release ledger. | Rollback en < 5 minutos comprobado. |

---

## ⏱️ 3. Protocolo de Medición de Latencia Caja → Comandas

Medición objetiva de rendimiento extremo a extremo (end-to-end):

### Método de Muestreo:
- Registrar 30 pedidos consecutivos desde la interfaz de Caja hacia KDS bajo carga de red de Staging.
- Marcar timestamp `T0` en el instante de click en "Cobrar / Enviar a Comandas".
- Marcar timestamp `T1` en el instante en que el pedido se dibuja en la pantalla de KDS (Cocina / Barra).
- Delta de latencia: $\Delta t = T1 - T0$.

### Métricas Requeridas:
- **P50 (Mediana):** $\le 2.5$ segundos.
- **P95 (Percentil 95):** $\le 5.0$ segundos.
- **Máximo:** $\le 8.0$ segundos.

---

## 🚫 Criterio de GO / NO-GO para Merge a Main

El paso a `main` permanecerá **BLOQUEADO (NO-GO)** hasta que:
1. Las 14 pruebas de integración tengan veredicto **PASS**.
2. La métrica P95 de Caja → Comandas sea estrictamente inferior a 5.0 segundos.
3. El administrador confirme la revocación del token GitHub comprometido en sus configuraciones de cuenta.
