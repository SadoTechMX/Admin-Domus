> **Actualización posterior:** Steven autorizó la cancelación de pedidos no entregados, incluidos preparados. Ver [implementación y límites](TRANSFER_CANCELLATION_20261108.md). La sustitución de pago sigue sin aprobación. Este documento conserva el alcance y evidencia de la entrega de sólo lectura `2178e27`; sus preguntas de cancelación ya quedaron resueltas.

# Preparar la resolución de una transferencia no recibida

Estado: **propuesta y consulta de sólo lectura implementadas en la rama aislada**, base `9a6f8b6`. No hay acción de anulación/aplicación, botón operativo nuevo, instalación ni modificación de datos Google. Esta entrega no resuelve una cola real ni habilita un corte. Las cuatro reglas provisionales y el cierre hasta resolver pendientes siguen vigentes.

## Qué se puede comprobar ahora

`prepararResolucionTransferencia` recibe `sourceRequestId`, `sourceReceipt` y `ticket`. Sólo GERENCIA/ADMIN con principal autorizado pueden consultarla mediante el dispatcher POST/nativo. Una sesión de Caja o una sesión antigua de Gerencia sin principal no basta. GET rechaza la consulta privada; la llamada directa sin contexto autenticado también se rechaza.

La consulta usa el lock existente para leer conjuntamente REQUESTS, journal, COBROS, CAJA 2 y COMANDAS. Exige el recibo pendiente compatible y único; rechaza confirmaciones existentes, historia incompatible, importes ilegibles, duplicados, intenciones inciertas y planes incompletos. No crea hojas, REQUESTS ni journals y no reanuda ninguno. La guarda global es deliberadamente conservadora: las filas FAILED históricas sin prueba de ausencia de efectos siguen requiriendo conciliación.

Examina las unidades de **toda la cuenta**, no sólo las de la intención pendiente. Esto incluye el caso de una transferencia con `items: []` para abonar un pedido entregado anteriormente. Coteja los vínculos de venta/comanda/cuenta y considera como señal de entrega el estado, timestamp o responsable de entrega, su espejo y el consumo registrado. Ausencia de señal informática **no prueba ausencia de entrega física**; el resultado exige comprobación humana de entrega y banco.

Devuelve un `TRANSFER_RESOLUTION_PROPOSAL` con saldo, conteos y estados, jornada original cuando existe, identidad del revisor, instante de consulta y `snapshotHash`. El hash incluye identidades, datos y estados observados, con fechas convertidas a ISO. No contiene una firma de autorización y no sustituye un registro durable de resolución. Dos consultas del mismo estado producen el mismo hash sin crear una intención nueva; un cambio de fecha/estado invalida la observación anterior. `observedAt` cambia normalmente al consultar.

En todos los resultados: `readOnly: true`, `executable: false`, `policyRequired: true`; confirmar, cancelar, sustituir pago, entregar y cerrar están deshabilitados. No devuelve un ACK de venta ni campos `paid`, `verified` o un recibo nuevo. Las banderas del cliente no cambian estos límites.

## Decisiones mínimas para Steven

Son **propuestas**, no reglas aprobadas por extensión de las decisiones anteriores:

| Situación comprobada por Gerencia | Recomendación | Decisión necesaria |
|---|---|---|
| El dinero no figura al revisar y no se entregó el pedido | Permitir elegir entre conservar la misma cuenta para pago por otro medio o cancelar explícitamente el pedido y su transferencia pendiente, con motivo y evidencia. No hacer una venta nueva. | ¿Gerencia puede autorizar esta cancelación? Definir si también incluye pedidos ya preparados; no inferir merma ni devolver inventario automáticamente. |
| Existe otro pago confirmado de la misma cuenta | Conciliar y vincular el pago ya existente; no volver a cobrar. Conservar el pendiente original como antecedente. | Autorizar la sustitución de medio mediante resolución explícita de Gerencia. El pago alternativo actual, por sí solo, no habilita la entrega original. |
| Hubo entrega total/parcial o consumo registrado | Mantener el consumo y el saldo. No anular la venta, fingir devolución, reintegrar stock ni convertirla automáticamente en crédito/cortesía. | Recomendación inicial: exigir cobro o conciliación antes del corte. Si se quiere trasladar deuda o reconocer una pérdida, hace falta una regla separada con autoridad y tratamiento contable; puede posponerse manteniendo este caso bloqueado. |

No hace falta fijar un vencimiento automático para avanzar: se propone registrar **“no recibida al revisar”**, con fecha, revisor y referencia de evidencia, sin afirmar que el banco nunca podrá acreditarla. Un ingreso posterior iría a conciliación explícita; no se aplica automáticamente a una cuenta cancelada o pagada de otro modo. No solicitar claves ni números bancarios completos para decidir estas reglas.

## Contrato propuesto para la futura acción de resolución

Todavía no se implementa ni autoriza una mutación `resolverTransferenciaNoRecibida`:

1. Gerencia autenticada presenta decisión permitida, motivo, referencia de revisión bancaria/física, fuente exacta, pago sustituto si existe y hash de la observación. El servidor vuelve a leer y validar bajo el lock. Un hash antiguo no permite resolver un estado nuevo.
2. Se usa un **requestId nuevo de resolución**, ligado mediante `action/payloadHash/deviceId` al cuerpo completo. El requestId y ACK de la venta original permanecen intactos. Reintento con el mismo cuerpo recupera la misma resolución; cuerpo distinto con ese ID se rechaza.
3. REQUESTS/journal conservan la resolución administrativa y su actor/instante/evidencia. La resolución no es una confirmación bancaria. COBROS original permanece como antecedente; no se cambia Borrador a Confirmado ni se inventa un importe aplicado, devolución o autorización de precio.
4. Cancelación de pedido y cambio de medio tienen planes distintos. Antes de cancelar se deben acreditar las unidades afectadas, ausencia de entrega y tratamiento aprobado de preparación. Para sustitución se debe cotejar el pago completo ya asentado, su importe y su vinculación única; nunca cobrar otra vez para resolver el registro.
5. Los consumidores de pendientes, KDS, saldo y corte deben reconocer **la misma resolución completada**. Un journal parcial o REQUESTS sin completar mantiene todos los permisos bloqueados. Resolver la transferencia no convierte una comanda pendiente en entregada. La regla de cierre de Steven permanece.
6. Un ingreso bancario tardío no se confirma usando el pendiente resuelto: requiere conciliación separada con protección contra doble aplicación. No se borran la evidencia ni las intenciones del navegador; una eventual recuperación debe consumir el contrato administrativo explícito, sin falsificar ACK de cobro.

Esta separación requiere pruebas de interrupción en cada escritura, reintento/cambio de ID, carreras confirmación-versus-resolución, pago tardío, entrega parcial y cierre concurrente **antes** de habilitar la acción. No presentar las pruebas de esta consulta como prueba de esa futura atomicidad.

## Evidencia y límites

- `tests/transfer_resolution_proposal_regressions.js`: 19 casos con módulos reales y Sheets/Auth/transportes en memoria. Incluye permisos, identidad antigua, huellas, ausencia de escritura/replay, entrega parcial, abono a cuenta ya entregada, pago alternativo, cancelación existente, bloqueo del corte, errores de fórmulas, estados inciertos, GET y POST/nativo.
- Regresiones pertinentes: transferencias 20, jornadas 23, recuperación 27; todas pasaron. Compilación/paridad, guardas de producción 4 y seguridad del arnés 3 pasaron. Node `24.22.1`, Python `3.12.14`; backend fuente SHA-256 `501dd1947fd23e34a35bb8083866775264eeb3d611b1dc608a003d23216baaeb`. El cliente y su HTML generado no cambian. CI nueva se verifica por SHA exacto si se publica la rama.
- Primer fallo del nuevo test: la guarda de encabezados comparaba todas las columnas devueltas por `schemaColumns_`, no sólo las exigidas. Corregido para comparar el subconjunto esperado sin relajar posiciones. No hubo escritura Google ni cambio de datos a causa del fallo.
- La consulta no evalúa todas las fórmulas de Sheets ni verifica banco, productos físicos, cola real, volumen productivo o concurrencia distribuida de Google. Los $60 V9 simulados siguen su clasificación privada; este cambio no los adopta ni modifica.
- No se retiró SEMANA, no se cambiaron fórmulas de reportes/liquidación ni impresión. Tampoco se habilitan accesos por transferencia ni se migra historia incompatible.
- Coordinación: checkout limpio y remoto de la rama cotejados en `9a6f8b6`; ningún otro agente activo en este entorno. La búsqueda visible encontró el encargo de revisión a Antigravity, no una implementación entregada; la búsqueda de ramas `transfer` no devolvió coincidencias. Esto no acredita ausencia de trabajo privado en otra máquina. Se conserva la edición en la rama propietaria; Gemini/IDE no revisaron este delta desde este host.

Reversión de **esta consulta**: retirar su permiso, rutas y funciones y reconstruir artefactos; no tiene datos comerciales ni migración que revertir. No implica que sea seguro revertir los módulos financieros anteriores tras operaciones reales. Sin PR, merge ni despliegue.
