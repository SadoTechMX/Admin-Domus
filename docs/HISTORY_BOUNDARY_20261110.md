# Históricos inciertos y nuevas jornadas — propuesta implementada, no activada

Base: `029acb9c2001bb187db795b21020a0cc9c4ab20a`. UI `20261110-history-boundary-18`.
Trabajo exclusivo en `repair/reconcile-pr18-main-20261105`. Sin Google, datos reales, despliegue, PR, merge ni impresión.

## Problema y alcance

`journeyAssertSettled_` y otros lectores consultaban todos los FAILED/duplicados antes de distinguir una jornada. REQUESTS no conserva el cuerpo ni la jornada de muchos errores antiguos: una fecha antigua, un campo vacío o FAILED **no acreditan ausencia de efectos**. Tampoco se puede elegir la fila COMPLETED de un ID duplicado y darlo por conciliado.

Coordinación reportó 149 IDs productivos, 40 en staging y una cola de 15 (cuatro coincidencias FAILED, una COMPLETED y diez ausentes). No se consultaron esas filas ni IDs. Los tests representan esos tamaños con identificadores y libros en memoria. Las cifras no son una nueva auditoría del estado real.

## Comportamiento implementado

1. `prepararLimiteHistorico`: consulta autenticada de Gerencia, bajo script lock, sin crear REQUESTS ni journal. Requiere inventario explícito de IDs/acciones de las colas, estaciones y referencia privada de evidencia. Devuelve propuesta, conteos, rangos y SHA-256, con `canActivate:false`, `resolved:false`, `financialFinal:false`.
2. `registrarLimiteHistorico`: **deshabilitado sin aprobación de servidor para esa huella exacta**. Exige identidad efectiva de Gerencia, confirmación expresa de retención de estaciones y de que el histórico sigue sin resolver. Registra una nueva intención administrativa, con journal vacío y resultado durable; no escribe COBROS, CAJA, COMANDAS, stock, fórmulas de reportes ni originales de REQUESTS. Una aprobación genérica o anterior no sirve.
3. Tras un registro íntegro, los IDs del prefijo histórico completo y de la cola inventariada quedan retenidos. Incluye los ausentes y los COMPLETED del inventario; no se importa un ACK legado. La guarda corre antes de crear vínculo, devolver ACK o reanudar journal. Consulta de estado de Caja y entrega/KDS tampoco liberan esos IDs. Referencias a comandas o pagos retenidos se rechazan antes de crear un REQUEST nuevo, para no generar otra intención incierta al intentar una acción prohibida. No se cambia ningún FAILED a COMPLETED.
4. Las nuevas aperturas y cortes deben nombrar explícitamente `historyBoundaryId`; un cliente antiguo que lo omita no puede abrir/cortar. Movimiento, apertura y corte conservan la referencia y la advertencia. El corte cubre recibos POS de su jornada, mantiene `financialFinal:false` y no se presenta como conciliación global.
5. No se omiten automáticamente NULL/UNKNOWN ni registros por fecha. El primer límite admite sólo incertidumbre legado de Caja/KDS **sin journal**; rechaza estados desconocidos, filas con contenido sin ID, esquemas incompatibles, journal incompleto/huérfano/duplicado y cualquier jornada moderna previa. No se puede crear un segundo límite para esconder nuevos fallos.
6. El prefijo de REQUESTS y el journal previo se cotejan por valores y fórmulas. Cambios, filas duplicadas añadidas, journals nuevos de IDs retenidos o cambios del mapa de estaciones/jornadas bloquean operaciones; no se recalcula la huella para aceptar la diferencia. Los originales se preservan en su lugar; la referencia de evidencia no reemplaza un respaldo privado.
7. Un registro administrativo parcial bloquea otros movimientos. Sólo su mismo ID/payload/device puede recuperar un plan vacío validado. Una evidencia cambiada o un plan comercial introducido durante el fallo se rechaza.
8. Los errores posteriores al límite siguen bloqueando apertura/corte. Cuando REQUESTS no permite atribuirlos a una jornada, el bloqueo sigue siendo global; no se adivina su alcance. Transferencias y comandas nuevas pendientes continúan impidiendo cerrar. El mismo script lock cubre creación de intenciones, snapshot y cierre.

La retención **no resuelve deuda, ingresos, consumo, entrega, merma ni diferencias**. Un conflicto FAILED/COMPLETED sigue pendiente aunque una jornada posterior tenga corte. La resolución individual requiere evidencia persistente de ausencia de efectos o conciliación/compensación completa; ese procedimiento no se implementa ni se sustituye con este límite. Cuentas y órdenes históricas no se adoptan automáticamente ni se cobran bajo otro ID.

## Decisión pendiente antes de activar

La autorización recibida permite implementar y probar de forma aislada; **no aprueba operar un periodo nuevo con obligaciones históricas inciertas**. Hace falta decidir expresamente si se permite esa separación administrativa, manteniendo la conciliación histórica abierta y el bloqueo de sus cuentas/órdenes/IDs. La alternativa es resolver antes todos los históricos pertinentes. No se configura ninguna opción por defecto.

Si se autoriza la separación, primero deben acreditarse: respaldo privado, inventario completo de estaciones y colas detenidas, un solo proyecto escritor compatible, fondo inicial contado y revisión física de existencias/entregas pertinentes. No se asume que los 15 IDs abarcan todos los dispositivos ni que una ausencia en REQUESTS significa venta no realizada. No se recrean esas operaciones con nuevos IDs.

La propiedad de servidor propuesta es `DOMUS_HISTORY_BOUNDARY_APPROVAL_V1`, con `version:1`, `approved:true`, `snapshotHash` y `approvalReference` del caso revisado. Es una autorización específica de ingeniería/operación, no una credencial ni una prueba de ausencia de efectos. **No se ha establecido en ningún entorno real.** No hay botón de activación en la interfaz de Caja. Una activación requiere otra revisión concreta y autorización; este documento no es una orden para ejecutarla.

## Validación aislada

- `tests/history_boundary_regressions.js`: 27 casos con módulos y dispatcher reales, servicios mock. Escenarios 149/40/15; prefijos intactos; duplicados mixtos; aprobación/roles; evidencia obsoleta; journal huérfano; parcial antes/después de completar journal; misma intención; bloqueo de cuentas/comandas antiguas; operación nueva y corte con histórico aún visible; pago existente y recuperación; dos ejecuciones independientes compitiendo por el script lock.
- `tests/journey_transport_regressions.js`: 11 casos, incluidos REST y nativo para un ID retenido ausente. Conserva carrito/ID/Outbox, cero confirmaciones, cero nuevos REQUESTS/COBROS; recarga no lo reenvía. ACK de apertura/corte debe corresponder al límite solicitado.
- `DOMUS_TEST_HISTORY=1 node tests/browser_journey_operations.js`: 7 casos en Chromium local, UI real y backend mock, todo tráfico externo interceptado. Advertencia visible, ID del límite, ACK incompleto, misma intención, entrega y corte, transferencia pendiente, recarga y cero reenvíos históricos.
- Se conservan las suites de jornada sin límite, recuperación, corte legado, confirmación/cancelación/vínculo de transferencias, build determinista y guardas de escritura. CI se verifica por SHA exacto después del push; consultar el handoff para su resultado, no inferirlo de este documento.

Los fallos iniciales de desarrollo estuvieron en fixtures: comparación entre realms de VM, cuenta de prueba sin consumo/importe coherente y payload de vínculo sin `newCharge:0`. Se corrigieron los fixtures conservando las validaciones. No se acreditan banco, Google, fórmulas reales, rendimiento Apps Script, hardware ni operación productiva.

## Compatibilidad, límites y reversión

- Instalar la pareja exacta sólo tras revisión independiente. No basta actualizar el frontend. El módulo nuevo se incluye en ambos bundles y el manifiesto; los libros no se migran ni se renombran.
- El journal global no se relaja: un PREPARED comercial continúa bloqueando. Transferencias históricas incompatibles en COBROS pueden seguir bloqueando sus lectores; este límite no descarta esas filas ni sus posibles claves bancarias.
- LockService serializa ejecuciones del mismo proyecto. No protege contra otro proyecto Apps Script escribiendo el mismo libro ni contra edición manual simultánea. La exclusividad del escritor y la retención de estaciones son requisitos operativos sin verificar aquí.
- La validación de huellas relee el historial; falta medir latencia/cuotas con staging autorizado. El inventario tiene límites explícitos (500 IDs de cola y resultado <40.000 caracteres); nunca se trunca silenciosamente.
- Antes de registrar un límite se puede revertir la pareja sin borrar datos. **Después no es seguro volver a `029acb9` ni a V16 para operar**: no conocen la retención ni sus IDs ausentes. Ante un fallo, detener escritores y conservar journal/REQUESTS/colas; corregir hacia adelante o preparar una reversión que mantenga las guardas. Quitar la propiedad de aprobación no borra el registro; quitar/cambiar el mapa bloquea, no habilita el modo legado.
- Gemini sólo aportó una revisión conceptual anterior por coordinación; no revisó este código. Su sugerencia de excluir NULL/UNKNOWN se rechazó. Antigravity/IDE no se atribuyen como revisores de este cambio. Se entrega este delta para una única revisión complementaria, sin repetir auditorías reales.
