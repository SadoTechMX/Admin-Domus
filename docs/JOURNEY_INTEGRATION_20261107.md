> **Regla de cierre confirmada, 8 noviembre 2026 UTC:** Steven eligió impedir el corte hasta resolver transferencias sin confirmar y comandas pendientes. [Aplicación y pruebas](JOURNEY_CLOSE_RULE_20261108.md), UI `20261108-journey-close-15`: conteos de bloqueo, política en el resultado durable y rechazo de ACK de cierre con pendientes; 23 casos de operaciones, 8 de transporte y 6 de Chromium pasan. Se conservan cuentas abiertas, historial e idempotencia. La decisión ya está resuelta; siguen pendientes compatibilidad/configuración reales, fórmulas y staging. Sin producción, impresión ni despliegue. Sustituye las menciones históricas de decisión pendiente que siguen.

# Jornada vinculada a apertura, movimientos y corte

**IMPLEMENTED / LOCAL_TESTED, sin instalación ni configuración Google.** Base `071f4132736f6beb76d5c25be6b0c1b6ebe3a864`; UI `20261107-journey-14`. Fuente backend SHA-256 `ad0223139d1b91c95c0c622c7f677437f75d7677d0e27c09e5d9310ecc49d9cc`. La CI del nuevo commit debe verificarse por su SHA después del push. Las pruebas aisladas no acreditan operación real.

## Contrato disponible y coordinación

Steven aprobó agrupar por evento, proyecto y jornada, conservando timestamps reales. Cada jornada inicia al abrir caja y termina al hacer su corte; no cierra automáticamente a medianoche, a las 07:00 ni por antigüedad. La impresión está reservada a Steven y Antigravity: no se modificaron sus funciones, configuración ni puente.

GitHub seguía mostrando la integradora en `071f413` y `feature/phase-1-shifts-cuts` en `881a71c9f705ebe8ef4772273c9ed0a7a1b0d8fd` antes de editar. La coordinación visible no mostró otro editor sobre jornada/caja; no acredita trabajo privado ni hubo contacto directo con el editor de la rama antigua. Se cotejaron Shifts/Cuts/Auth de esa rama, conservando exclusión por estación/gaveta, fondo separado de ingresos, apertura de Caja y cierre reservado a Gerencia. No se copiaron su fallback NO_SHIFT, su identidad por fecha, las escrituras directas ni el efectivo contado supuesto igual al esperado.

El adaptador reside en `Journeys.gs` y usa REQUESTS/journal ya existentes. No agrega otro motor, hojas TURNOS/CORTES_Z ni columnas financieras. **No debe mezclarse con los módulos antiguos Shifts/Cuts en el editor:** comparten nombres RPC y contratos de persistencia distintos. No hay migración automática de registros históricos de esas hojas.

## Conexión implementada

- `turnoAbrir`: Caja/Gerencia/Admin autenticados, estación/gaveta asignadas en servidor, evento/proyecto explícito, fondo contado numérico. Bajo el mismo lock de idempotencia, comprueba que estación, gaveta y evento/proyecto no tengan otra jornada abierta. Guarda el resultado versionado mediante journal y REQUESTS; no escribe un cobro por el fondo inicial.
- `turnoEstado` y `cajaSimpleDatos`: lectura del contexto activo y último corte, sin crear hojas ni reanudar intenciones. Una jornada no se obtiene del día o de etiquetas del navegador.
- `cajaSimpleRegistrar`: con el mapa habilitado exige `openingRequestId` y valida estado, estación, gaveta y evento/proyecto bajo el lock antes de preparar la venta. El mismo plan guarda timestamps reales y contexto en resultado/COMANDAS. **Conserva el control SEMANA y todas las fórmulas.**
- Cuentas existentes vinculadas: el origen de la cuenta se conserva; un pago posterior captura la jornada del nuevo ingreso. No mueve las filas antiguas. Otra cuenta histórica sin origen acreditado, otro proyecto o nuevos consumos bajo otro evento requieren revisión; no se importan por nombre/fecha.
- `confirmarTransferencia`: conserva el origen y agrega contexto del movimiento confirmado. La referencia bancaria y su importe siguen sometidos al contrato anterior. El corte cuenta una sola vez el resultado autoritativo, incluso si otra petición devuelve el mismo ACK de una confirmación previa.
- `corteZCerrar`: Gerencia/Admin con principal acreditado; efectivo contado obligatorio. Relee bajo lock, comprueba evidencias de cobros/comandas e intenciones inciertas, conserva snapshot y cierre en el journal. No vuelve a cobrar, entrega, mueve inventario ni cancela saldos. Una venta nueva/offline llegada después del corte se rechaza; un plan ya preparado o un ACK completo recupera su contexto original.
- UI: apertura, estado, cierre y resumen recuperable tras recarga. ACK vacío, sin contrato o de otra intención/jornada conserva ID y Outbox. Un cambio de jornada cambia también la identidad del borrador para que el ACK anterior no borre el nuevo carrito. Un rechazo explícito de prevalidación conserva el intento rechazado y permite una corrección con otro ID; fallos de servicio o journal permanecen inciertos.

## Alcance del corte y regla confirmada

El RPC se adapta al **cierre de jornada**, con `coverage: JOURNEY_POS_RECEIPTS` y `financialFinal: false`. Congela recibos POS vinculados, importes por medio, propina, fondo inicial, efectivo declarado y cuentas abiertas. No es el corte financiero integral del prototipo: **no incluye arqueo de MOVIMIENTOS/DEVOLUCIONES, otras cajas/canales, reparto ni LIQUIDAR**. La UI y el resultado lo declaran. No presentar sus totales como arqueo completo de la gaveta ni conciliación bancaria automática.

Las cuentas abiertas pueden permanecer vivas, según la regla 3 existente. **Actualización 8 noviembre:** Steven respondió «si hasta resolver»: transferencias todavía sin acreditar y comandas pendientes impiden cerrar hasta resolverse. La guarda previa se conserva como regla aprobada, con conteos explícitos y comprobación adicional del ACK de cierre. [Código y pruebas de esta actualización](JOURNEY_CLOSE_RULE_20261108.md). La evidencia de pruebas del 7 noviembre que sigue corresponde a la versión anterior, no acredita por sí sola el nuevo delta.

## Configuración y compatibilidad antes de activar

`DOMUS_JOURNEY_POLICY_V1` es un mapa explícito de servidor, sin credenciales. Debe fijar `version:1`, `scopes` (id, projectId/projectName, eventId/eventName, activity) y `stations` (deviceId, stationId, registerId, scopeIds). Un proyecto sin evento usa `eventId:null`, `eventName:""`; no se fabrica un evento. Los únicos mapas creados en este tramo son fixtures QA en memoria. **No se deducen IDs reales de ACTIVIDADES ni se escribe esta propiedad en Google.**

Sin mapa y sin aperturas previas, el flujo legado conserva su comportamiento y los controles nuevos quedan ocultos. Si ya hay evidencia durable de jornada, quitar el mapa bloquea nuevas mutaciones en vez de degradarlas silenciosamente al legado. Un mapa inválido, identidades ambiguas, intenciones inciertas o cortes legados detienen el flujo. La activación requiere revisar el mapa real de proyectos/eventos/estaciones/gavetas y los historiales/colas existentes; este cambio no resuelve los 15 pendientes históricos ni los reenviará para investigarlos.

El contrato mínimo conserva **una jornada abierta por evento/proyecto y estación/gaveta exclusiva**. No se implementó atención simultánea del mismo evento desde varias gavetas ni se mezcló caja de distintos proyectos. Si se necesita ese alcance, definir relación de jornadas y custodias antes de flexibilizar la exclusión existente.

Se mantienen los bloqueos del [diseño de operación diaria](DAILY_OPERATION_DESIGN_20261107.md): falta evidencia vigente de fórmulas SEMANA/LIQUIDAR y dependencias de W/O/T/AA/AB/AL, su evaluación real y compatibilidad histórica. Ni encabezados compatibles ni este recorrido con mocks prueban esos resultados. ACTIVIDADES/Accesos siguen con sus guardas propias.

No hay límite fijo de fecha/duración de jornada. Sí hay límites técnicos: consultas recorren el historial; falta medir latencia en staging con volumen representativo. Un resultado de corte mayor de 40.000 caracteres se rechaza **antes de preparar el journal**, sin truncar historial; requiere adaptar almacenamiento/paginación. No prometer capacidad infinita de Apps Script/Sheets.

## Evidencia de pruebas

| Suite aislada | Resultado | Alcance |
| --- | --- | --- |
| `journey_operations_regressions.js` | 18 PASS | Dispatcher real, apertura, exclusión, POS/mixto, medianoche y SEMANA, roles/corte, pendientes, reintento parcial y ACK perdido, cuentas entre jornadas, transferencia, evidencia corrupta y volumen que excede el tamaño durable |
| `journey_transport_regressions.js` | 8 PASS | REST/nativo, ACK de apertura/corte/venta inválido, ID/cuerpo conservados, recuperación y propiedad del borrador |
| `browser_journey_operations.js` | 5 PASS | UI completa en Chromium: apertura recuperada, venta vinculada, corte bloqueado con pendiente y corte recuperable sin recobro |
| Contexto privado previo | 9 PASS | Identidad/tiempos, legado, duplicados y snapshot original |
| Recuperación / cliente / reconciliación / transporte | 27 / 12 / 17 / 13 PASS | Garantías existentes con módulos nuevos cargados |
| Transición histórica / transferencias / mixto / periodo | 9 / 20 / 17 / 11 PASS | Contratos y rechazo de periodo incompatibles conservados |
| Chromium periodo / mixto / dos pestañas | 4 / 4 / 1 PASS | Flujos existentes y carrera de Outbox con recuperación |
| Guardas producción / arnés staging | 4 / 3 PASS | Seguridad del arnés; no prueba productiva |

La primera prueba de reloj simulado detectó incompatibilidad de `instanceof Date` del arnés y después expiración legítima de sesión al avanzar varios días. Se corrigió el reloj del fixture y se renovó la sesión en el test; no se relajó Auth ni el control del periodo. Se añadió cobertura para no sumar dos veces un ACK de transferencia repetido bajo otro requestId. Los fallos inyectados y rechazos esperados quedan en logs locales; no representan fallos Google observados.

Los tests de KDS ejecutan código real con valores de fórmulas simulados expresamente. No calculan ni certifican el stock real, fórmulas completas, concurrencia distribuida de Apps Script, banco o hardware. Gemini/IDE no han revisado este nuevo delta desde este host; sus revisiones previas no se extienden a este SHA.

## Reversión y siguiente paso

Antes de cualquier activación: cotejar build/endpoint/libros, guardar el mapa y estado de colas/journal de forma privada, comprobar ausencia de módulos duplicados y validar el recorrido autorizado en staging. La validación de fórmulas sigue siendo condición previa para retirar SEMANA; no se hizo en este tramo.

Antes de crear evidencia de jornada, la reversión es de código/configuración aislados. **Después de aperturas o movimientos vinculados, volver al backend 071f413 o anterior no es una reversión segura:** ignora la obligatoriedad de contexto. Deben detenerse nuevas mutaciones, conservar el backend que entiende ese contrato para recuperar intenciones y preparar corrección compatible. Revertir sólo UI contra el backend nuevo hará fallar cerrado ventas sin apertura; no borrar mapa, REQUESTS, journal ni comprobantes para forzar funcionamiento. No se ha ejecutado ninguno de estos pasos en Google.
