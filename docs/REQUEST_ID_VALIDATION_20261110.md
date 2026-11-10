# Validación de ID antes de persistencia — corrección aislada

Base reproducida: `cd0c266f76d6cde6d77ebcb94453affde9852440`. La auditoría detectó que `client#part:0` podía entrar como ID de cliente: se guardaba REQUESTS y se preparaba un journal, pero el lector lo rechazaba por invadir el espacio reservado a fragmentos. La siguiente venta quedaba bloqueada. La reproducción local confirmó REQUESTS en REQUIRES_REVIEW, raíz PREPARED y fragmento `client#part:0#part:0`, con COBROS todavía sólo con encabezados.

## Cambio

- `requestRootIdValid_` define un único contrato para IDs raíz: texto no vacío, sin recortar/coaccionar, sin espacios externos, sin fórmula inicial `=`, sin controles/saltos de línea y sin el marcador reservado literal `#part:`. La lectura de raíces y de padres de fragmentos usa el mismo predicado.
- `idempotentExecute_` rechaza antes de hash, lock, acceso a libro y creación de REQUESTS. `saveRequestRecord_`, `findRequestRecord_`, `journalCommit_` y `journalResume_` vuelven a validar antes de sus efectos. El commit no llega a crear journal, ampliar filas ni preparar un plan inválido.
- El contexto de acción recibe el mismo ID resuelto que se vincula en REQUESTS. Esto evita que una ruta que consume `_authContext.requestId` use un alias distinto cuando no hay ID en el sobre. Se conserva la prioridad existente del dispatcher; no se reasignan IDs de dominio.
- Los fragmentos generados internamente siguen siendo válidos y recuperables mediante su raíz. Un cliente no puede reanudarlos como si fueran una intención raíz.
- Error tipado `REQUEST_ID_INVALID`, estado lógico 422. La UI lo conserva en revisión; no hay sustitución automática de ID, ACK ni reintento al recargar. El error **no afirma ausencia de efectos de un intento anterior** con ese mismo ID.

## Evidencia

`tests/request_id_regressions.js`: 15 casos agrupados, incluyendo 24 variantes inválidas en entrada y cuatro rutas de persistencia/lectura, las 20 rutas mutativas por REST y nativo, aliases del sobre/cuerpo y segundo argumento KDS, rechazo sin crear hojas o ampliar filas, venta válida posterior, vínculo de payload/device, namespace interno y recuperación de un plan de dos fragmentos parcialmente aplicado. También conserva intacto un histórico ya dañado y mantiene su bloqueo. Los dos bundles generados (STAGING y PRODUCTION) se ejecutan en VM con servicios/libros exclusivamente mock: rechazan el ID reservado sin persistencia y admiten después una venta sintética válida; no contactan Google.

La primera regresión se ejecutó contra una copia `git archive cd0c266` y falló; pasa con la corrección. La expectativa inicial de un caso positivo se corrigió para leer el ID desde `fulfillment.sourceRequestId`, ubicación del contrato legado; no se cambió el resultado del POS para satisfacer el test.

`tests/journey_transport_regressions.js`: 17 casos, dos nuevos que comprueban ID/payload/Outbox conservados, carrito actual intacto, ausencia de ACK, cero escritura mock y ningún reenvío ni cambio de ID tras recarga. Las regresiones de journal (45), histórico (27), recuperación (27), corte legado (9), jornadas (23), cancelación (16) y pago existente (16) siguen pasando. Build determinista y CI deben cotejarse por SHA exacto en el handoff.

Reproducción, resultado rojo y logs privados: `/workspace/domus-private/request-id-20261110/`. Sólo fixtures en memoria y copia local del código; no Google, datos reales, banco, impresión, PR, merge ni despliegue.

## Límites

No se borran, renombran ni reparan automáticamente filas ya persistidas con un ID inválido. Ese histórico permanece bloqueado y exige revisión con evidencia; cambiarle el ID podría duplicar efectos. Tampoco se habilita el límite histórico ni cambia su aprobación pendiente. Falta revisión independiente del SHA corregido; las pruebas sintéticas no certifican operación ni compatibilidad real de Sheets.
