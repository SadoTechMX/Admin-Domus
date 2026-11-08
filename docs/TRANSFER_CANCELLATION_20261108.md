# Cancelación de transferencia no recibida — 8 noviembre 2026 UTC

Estado: **implementada y probada con servicios simulados en la rama aislada**, sobre `2178e27`, UI `20261108-transfer-cancel-16`. No instalada ni validada con banco, datos productivos o equipos físicos. No cambia impresión, SEMANA, fórmulas ni las dos pruebas V9 clasificadas por separado.

## Decisión recibida y alcance

Steven respondió **«si»** a permitir que Gerencia cancele pedidos no entregados, incluso preparados. Sobre vincular un pago sustituto respondió **«no tiene que haber una forma de que no haya mal entendidos»**. Esa frase no constituye aprobación de una regla de sustitución: no se implementa vinculación ni se vuelve a cobrar para resolver un pendiente.

La consulta anterior `prepararResolucionTransferencia` sigue siendo de sólo lectura. La nueva acción administrativa `cancelarTransferenciaNoRecibida` requiere GERENCIA/ADMIN con principal autorizado, revisión humana del banco y de la ausencia de entrega, motivo, evidencia y declaración explícita de merma. El servidor no consulta el banco ni puede acreditar una observación física.

Esta primera implementación admite una cuenta compatible con una sola intención de venta, un único COBROS pendiente sin importe aplicado, unidades completamente vinculadas y la misma jornada de origen abierta. Cuentas ampliadas, abonos, otros pagos, historia incierta o incompatible y entregas totales/parciales quedan para conciliación. No adopta los registros V9 ni los pendientes reales retenidos.

## Flujo y efectos

1. Gerencia selecciona el recibo original y abre **Revisar cancelación sin ingreso**. Ve cuenta, recibo, importe, saldo y señales de entrega. La confirmación bancaria queda deshabilitada durante esta revisión.
2. Declara que revisó el banco y que ninguna unidad se entregó; registra motivo y referencia de revisión. La ausencia de señales en el sistema nunca marca estas casillas automáticamente.
3. Elige una observación de merma y la explica. Ninguna opción está preseleccionada. El diálogo final vuelve a mostrar cuenta, recibo e importe.
4. Bajo el lock existente, el servidor coteja nuevamente el hash de la observación, importe, unidades, jornada, pagos y entrega. Un estado cambiado se rechaza antes del journal; exige otra consulta e intención nueva. Un resultado incierto conserva el mismo ID y cuerpo para recuperación.
5. Un solo journal marca CAJA 2 P como `Cancelado` y COMANDAS H/M/N como cancelada, conservando evidencia de preparación y agregando actor, instante, motivo y resolución. REQUESTS y journal guardan el resultado administrativo; los REQUESTS y COBROS originales permanecen intactos.

La resolución declara **importe aplicado 0, devolución 0 y movimiento de inventario 0**. No emite recibo de cobro, no abre gaveta, no imprime y no limpia el carrito. Una respuesta vacía, mal formada o de otra intención permanece en Outbox, sin confirmación local válida.

Los lectores de pendientes y corte exigen REQUESTS y journal únicos/completados y cotejan fuente, resolución y unidades canceladas. Un plan parcial, duplicado o incompatible mantiene la revisión. Un ingreso bancario posterior no puede aplicarse automáticamente al pendiente cancelado; requiere conciliación separada. Un ACK completado se recupera con su ID original, sin repetir efectos.

## Merma y cierre

| Declaración de Gerencia | Efecto de esta acción | Corte |
|---|---|---|
| No observó merma, tras revisión física | Conserva la declaración; no modifica existencias | Esta cancelación deja de bloquear, si no existen otros pendientes |
| Observó merma | Conserva estado previo y descripción; no inventa cantidades ni costo | Bloqueado por conciliación de merma |
| Merma pendiente de revisar | Conserva incertidumbre y descripción | Bloqueado por revisión |

**Límite material:** todavía no hay una acción compatible para registrar/conciliar la merma y liberar los dos últimos casos. La cancelación administrativa sí queda registrada. No debe declararse «sin merma» para eludir ese bloqueo. Antes de habilitar este flujo operativo se necesita fijar y probar cómo registrar la cantidad física real y el responsable, evitando volver a descontar lo ya consumido. Este cambio no establece por inferencia pérdida, devolución ni existencias iniciales.

El corte incluye `cancelledTransfers` como trazabilidad, separado de sus movimientos cobrados. Una cancelación con merma pendiente aparece además como bloqueo `WASTE_REVIEW_REQUIRED`; nunca como ingreso. La regla de Steven de resolver pendientes antes de cerrar permanece.

## Propuesta para evitar confusiones con otro pago — no aprobada

1. Mostrar lado a lado la cuenta pendiente y el recibo **ya registrado**: importe, medio, fecha/hora, evento/proyecto/jornada y responsable. Diferenciar «pendiente sin ingreso» de «pago existente confirmado».
2. Si falta un vínculo único, el importe no coincide o hay más de un candidato, detener el trámite para Gerencia. No introducir el pago existente como una venta nueva.
3. Sólo si Steven aprueba posteriormente ese contrato, ofrecer **Usar pago existente; importe nuevo a cobrar: $0**, con confirmación explícita de ambos folios. La futura acción tendría su propia intención idempotente y auditoría; no crearía otro COBROS ni reutilizaría el ID de la venta.
4. Si hubo entrega, conservar el consumo y la deuda hasta una conciliación válida. Si llega después la transferencia original, conciliarla por separado; no aplicar dos veces ni inferir devolución.

Hoy la existencia de otro pago bloquea esta cancelación y no habilita vinculación. La decisión pendiente es concreta: autorizar o modificar el paso 3 y definir qué hacer si el importe o cuenta no coinciden. Se puede posponer conservando esos casos bloqueados.

## Evidencia acotada

- Backend: `tests/transfer_cancellation_regressions.js`, **16 casos**. Incluye roles, principal, pedido preparado, varias unidades, entrega/consumo, otro pago, mismo ID/cuerpo distinto, confirmación antes/después, cada celda comercial interrumpida, REQUESTS final fallido, journal duplicado, evidencia cambiada, merma y corte. Originales e inventario permanecen iguales en fixtures.
- Transporte real del cliente con backend simulado: `tests/transfer_cancellation_transport.js`, **4 casos**, con **22 variantes de ACK inválido** en REST/nativo. Recarga conserva ID/cuerpo, recupera el resultado una vez y no convierte un 500 parcial en rechazo definitivo.
- Chromium: `tests/browser_transfer_cancellation.js`, **4 casos**. Sin selección de merma por defecto; doble clic produce una resolución, sin cobro/impresión/gaveta; otros pagos y entrega mantienen bloqueo. Las solicitudes remotas se interceptan: no se accede a Google ni banco.
- Regresiones pertinentes: propuesta 19, confirmación 20, jornadas 23, recuperación 27, salida de revisión 8; navegador de confirmación 5 y jornadas 6. Build/paridad, guardas de producción 4 y seguridad del arnés 3 pasaron sobre los artefactos reconstruidos. CI se coteja por el SHA final, nunca por el de la base.
- Dos fallos iniciales del arnés de transporte se corrigieron: esperaba excepción donde el cliente devuelve `localOutbox`, y comparaba prototipos entre contextos VM. No eran pruebas de operación ni fallos bancarios. Los errores 500/422 impresos en la suite son inyecciones deliberadas.
- Versiones locales: Node 24.22.1, Python 3.12.14, Playwright 1.62.1; Chromium local. La CI declara Node 22 y Python 3.12. No acreditar concurrencia distribuida de Google, fórmulas completas ni condición física del pedido con estos mocks.

## Compatibilidad, coordinación y reversión

Se mantuvo la rama propietaria `repair/reconcile-pr18-main-20261105`; remoto/base y ausencia de editores locales concurrentes se cotejaron antes de editar. No se reconstruyó un delta privado ni un backend de ensayo. Las revisiones previas de Gemini/Antigravity no validan este nuevo cambio; no se les atribuye participación nueva sin evidencia.

La instalación futura necesita la pareja de cliente/backend reconstruida y un cotejo aislado del esquema y permisos. Siguen pendientes las compatibilidades conocidas de ACTIVIDADES, fórmulas/SEMANA, historial y configuración operativa. El listado puede consultarse sin alias bancarios configurados; confirmar ingreso sigue exigiendo la política de receptores.

**Reversión:** mientras no se instale ni se generen resoluciones reales, puede retirarse este delta y reconstruirse la base. Después de usarlo, volver al backend anterior a ciegas sería inseguro: desconocería las cancelaciones y podría volver a mostrar/aplicar pendientes originales. Primero se deben retener escrituras y colas, preservar REQUESTS/journal y disponer de lectores compatibles con todas las resoluciones; nunca borrar los registros para simular una reversión. No se ejecutó ningún rollback.

No hubo PR, merge, despliegue, cambio de libro compartido, banco, cola real ni configuración de impresión. Las pruebas aisladas no certifican que la caja pueda operar en producción.
