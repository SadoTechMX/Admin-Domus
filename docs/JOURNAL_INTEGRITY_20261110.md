# Journal sin identidad y fragmentos huérfanos — corrección aislada

Base reproducida: `26d847a4eda4e639f84313fb07fafccdcff8d125`. Sin Google, datos reales, despliegues ni cambios a políticas operativas. Se mantiene deshabilitada la activación del límite histórico sin aprobación específica.

La auditoría independiente encontró dos omisiones reales que la CI anterior no cubría:

- Una fila con contenido en DOMUS_JOURNAL, REQUEST_ID vacío y estado PREPARED quedaba fuera de los filtros `r[0]`. Repro con código real y mocks: propuesta, registro del límite, apertura y corte admitidos; fila original aún PREPARED. Ocurría antes y después del límite.
- Un JOURNAL_PART COMPLETED con plan comercial, sin padre, se admitía si existía el ID base en REQUESTS. Repro previo al límite con `legacy-0#part:0`; posterior con un ID sintético nuevo COMPLETED en REQUESTS. Ambos permitían abrir/cerrar sin journal padre. No se ejecutó el contenido comercial del fragmento, ni se afirmó que estuviera aplicado.

## Corrección

`journalRows_` en Data.gs valida todas las filas de los seis campos canónicos, incluidos los valores, las fórmulas y los encabezados canónicos. History.gs, búsqueda/reanudación de journal y preparación de nuevos planes usan esa lectura común.

- Sólo se omite una fila completamente vacía y sin fórmulas. Se conservan los índices físicos; una fila vacía no desplaza la dirección de reanudación.
- Toda fila con contenido exige ID y acción de texto, no vacíos y sin espacios externos, además de estado PREPARED o COMPLETED. Una fórmula no es identidad o evidencia durable, aunque muestre vacío. Identidad ausente, numérica/booleana, estado ausente/desconocido y IDs duplicados bloquean.
- Cada fragmento exige identidad canónica `padre#part:N`, estado COMPLETED y plan JSON array. Necesita un único padre, un descriptor válido y exactamente las partes `0..N-1`, sin faltantes, extras o duplicados. Un plan inline legado no admite fragmentos anexos. Un descriptor vacío `{parts:0}` sigue siendo válido.
- Los planes PREPARED íntegros siguen siendo recuperables por su mismo ID. Un plan estructuralmente incompleto no se reconstruye, elimina ni marca COMPLETED.
- El error es `JOURNAL_INTEGRITY_REQUIRES_REVIEW`, HTTP lógico 409. La guarda corre antes de vincular nuevas intenciones y también antes de preparar/reanudar un journal. Se bloquean ACK y recuperación ante evidencia inválida. La Outbox conserva su intención y no la reenvía automáticamente tras recargar.

## Evidencia aislada

- Suite nueva `tests/journal_integrity_regressions.js`: **45 casos**. Antes/después del límite, cambio entre propuesta/aprobación, uso sin límite, variantes de identidad/estado/fórmula, fragmentos huérfanos/incompletos, filas vacías legítimas, planes válidos, recuperación parcial y conservación exacta de celdas. Incluye ejecuciones independientes compitiendo por LockService, ambos órdenes de llegada y una inserción externa detectada entre preflight y preparación de corte.
- `tests/journey_transport_regressions.js`: **15 casos**, cuatro nuevos para REST/nativo y ambas omisiones. Preservan ID, payload, carrito actual, Outbox y ausencia de ACK; tras recargar no hay nuevo envío ni escritura mock.
- Regresiones relevantes: histórico 27, recuperación 27, jornadas 23, cancelación 16, pago existente 16, transferencias 20 y esquema ACTIVIDADES 20. La prueba anterior de journal duplicado en cancelación ahora exige el error global previo y además verifica REQUESTS/journal intactos: no se debilitó el rechazo.
- Ambas reproducciones originales y los logs se conservan en `/workspace/domus-private/journal-integrity-20261110/`, con IDs sintéticos. La primera regresión falló en la base por ausencia de excepción y pasa con la corrección. CI final debe cotejarse por SHA exacto en el handoff.

## Límites y siguiente paso

Los filtros ya no excluyen estas evidencias por ID vacío. Esto no prueba ausencia de efectos de un plan dañado ni habilita resolverlo automáticamente: hace falta conciliación con evidencia preservada y revisión independiente del nuevo delta. No hay mecanismo para completar fragmentos por inferencia.

LockService protege ejecuciones del mismo proyecto. Otro proyecto o una edición manual fuera del lock no queda serializado; el test de revalidación no garantiza atomicidad frente a cualquier edición externa durante escrituras. Sigue siendo indispensable la exclusividad del escritor. No se verificaron Sheets, fórmulas reales, rendimiento Apps Script, banco ni hardware, y no se certifica operación.
