# Identidad persistida de REQUESTS — corrección aislada

Base reproducida: `91ff27bf50e6e8aa2c5731750ab9d465eae30a41`. Su validación de IDs entrantes no validaba el valor original almacenado: `String(r[0]).trim()` hacía coincidir `" valid-root "` con `"valid-root"`, y el número `123` con el texto `"123"`. Con REQUESTS COMPLETED se devolvía un ACK; con un journal parcialmente aplicado se recuperaba la operación y se sobrescribía el ID histórico. La reproducción confirmó las cuatro combinaciones usando módulos reales y libros mock.

## Cambio

- `requestRows_` conserva valores nativos y posiciones físicas. Toda fila no vacía debe tener un ID literal de texto que cumpla el contrato de raíz ya existente; se rechazan espacios externos, números, booleanos, ausencia de ID, controles, fórmulas y el namespace reservado a fragmentos. También se detecta una fórmula que muestra un ID aparentemente válido o una fila sólo con fórmulas. Las filas totalmente vacías se conservan sin bloquear ni desplazar índices.
- La búsqueda compara valores exactos y exige una sola fila antes de interpretar RESPONSE. No elige un COMPLETED entre duplicados ni ignora un alias malformado para tratar la intención como nueva. El resultado conserva la identidad original, sin recortarla o convertirla.
- `saveRequestRecord_` vuelve a comprobar identidad y posición: un registro existente sólo se actualiza en su fila original, y una inserción no puede duplicar un ID existente. Un cambio de fila/identidad después de la lectura provoca rechazo, sin sobrescribir la evidencia.
- El índice de pagos y las lecturas de límites históricos usan el mismo lector. La reanudación directa del journal comprueba además la unicidad del ID objetivo antes de devolver un resultado o aplicar el plan. Los duplicados canónicos históricos siguen representados íntegros en el índice para el contrato explícito de revisión; no se convierten en un único registro ni se excluyen por edad.
- Errores tipados `LEDGER_IDENTITY_REQUIRES_REVIEW` y `LEDGER_DUPLICATE_REQUIRES_REVIEW`, estado lógico 409. La UI conserva intención y payload en revisión, sin ACK, sustitución de ID ni reenvío automático al recargar. No se declara que el intento original carezca de efectos.

Una identidad malformada en cualquier fila bloquea estas lecturas/operaciones, incluso si parece ajena al ID consultado. No puede acreditarse su alcance ni descartarse que sea un alias del intento actual. Esta decisión puede impedir operar hasta conciliar la evidencia; no se habilita una excepción automática por jornada o antigüedad.

## Pruebas y evidencia

`tests/ledger_identity_regressions.js`: 24 casos agrupados. Incluyen COMPLETED y parcial; espacios iniciales/finales, tabulador/NBSP/control, números/booleanos/vacíos, fórmulas, duplicados COMPLETED/FAILED y alias mixtos; fila 5101; nombre legado TRANSACCIONES_API; posición física y escritura con referencia obsoleta; bloqueo antes y después de límite histórico; IDs válidos incluidos `"123"`, `"0"` y espacios internos; recuperación con el mismo ID y un solo cobro; vínculo de payload/dispositivo; ambos bundles generados ejecutados en VM con servicios mock, sin Google.

La suite nueva falla sobre una copia `git archive 91ff27b` y pasa con la corrección. La reproducción previa, resultado rojo y logs están en `/workspace/domus-private/ledger-identity-20261110/`, fuera del repositorio.

`tests/journey_transport_regressions.js`: 21 casos, cuatro nuevos para nativo/REST y operación COMPLETED/parcial. Comprueban ID/payload/Outbox conservados, carrito intacto, ausencia de confirmación, cero cambios adicionales en ambos libros mock y ningún reenvío tras recarga. Las expectativas anteriores de rechazo por ID ausente se ajustan al nuevo error específico, conservando las aserciones de cero cambios.

También pasan recuperación (27), corte legado (9), histórico (27), journal (45), raíz entrante (15), jornadas (23), contexto de jornada (9), transferencias (20), cancelación (16), pago existente (16), esquema ACTIVIDADES (20), transporte maestro (13), recarga/rechazo (8), cliente (17), mixto (17), build/paridad y guardas de escritura. La CI remota y sus pasos deben cotejarse por SHA exacto en el handoff; la CI verde de 91ff27b no cubría este defecto.

## Límites y siguiente paso

Revisión independiente del delta y de su SHA antes de instalación. No se normaliza, renombra, elimina ni resuelve ningún histórico; no se cambia formato de columnas reales. El comportamiento de tipado de Sheets y los tiempos con volúmenes reales no se verificaron en este tramo. La lectura añade comprobación de fórmulas a todo el rango del ledger; no usa caché ni un límite de filas que pueda omitir evidencia.

La serialización del dispatcher sigue bajo ScriptLock; la comprobación adicional de fila detecta el cambio simulado entre lectura y guardado, pero no promete atomicidad frente a un editor externo que no participe en ese lock. Siguen siendo necesarias la exclusividad del escritor y la custodia de las estaciones para una futura instalación. La aprobación del límite histórico continúa pendiente. Sin acceso a datos reales, activación, despliegue, merge, PR o impresión. Estas pruebas no certifican operación productiva.
