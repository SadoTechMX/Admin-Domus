# Activación de jornadas sobre aperturas del prototipo — diagnóstico

**DIAGNOSED / BLOCKED; no cambio de runtime.** Base de código `7898be20ed81b77afca70960437cdcf218b076f3`, UI `20261110-station-routing-19`. Coordinación informó que staging V12 abre Caja y que el bloqueo aparece al habilitar el mapa QA. Esta investigación no abrió `/exec`, no modificó el libro, no escribió propiedades y no creó aperturas ni ventas. El deployment y el mapa efectivos no se inspeccionaron desde este host.

## Causa localizada

`cajaSimpleDatos` llama `journeyState_`. Con un mapa válido, `journeyState_` resuelve la estación y llama `journeyOpenings_`; esta última valida cada `turnoAbrir` mediante `journeyContext_` **antes** de filtrar por estación/gaveta. Una apertura antigua sin alcance verificable no puede descartarse sólo porque el dispositivo actual sea nuevo.

Las lecturas acotadas del libro canónico de staging confirmaron:

| Evidencia | Resultado |
| --- | --- |
| REQUESTS, encabezados A1:H1 | Contrato de ocho campos exacto |
| B2:B1000, búsqueda de `turnoAbrir` | Nueve filas, 131–139; sin truncamiento |
| Filas 131 y 134 | COMPLETED; respuesta `ok:true`, `status:OPEN`; faltan `journeyContract`, `openingRequestId`, `journeyId` y `scope` |
| Filas 132–133 y 135–139 | FAILED; respuesta sólo `{error:...}` sobre conflicto de turno abierto, sin código/estado de ausencia de efectos |
| TURNOS, filas 2 y 3 | Coincidencia única por cada `shiftId`, estado OPEN, sin `closedAt`/`cutId`; su `requestId` difiere del de REQUESTS |
| DOMUS_JOURNAL B2:B1000 | Ningún `turnoAbrir`; no se leyó ni ejecutó ningún plan comercial |
| REQUESTS B2:B1000 / CORTES_Z B2:B1000 | Ningún `corteZCerrar` / ningún corte con los dos `shiftId` consultados |

La metadata confirma 1000 filas actuales en esas pestañas; las búsquedas cubren ese límite y no devolvieron truncamiento. Los hallazgos son una lectura puntual, no una garantía frente a escritores posteriores. No se leyeron ventas/clientes ni se hizo una conciliación integral de movimientos o inventario.

La primera apertura, fila 131, explica exactamente la excepción «Apertura sin vínculo durable de evento/proyecto/jornada. No importar el prototipo por fecha». La fila 134 y los siete fallos requieren tratamiento adicional: no basta arreglar el primer registro que detiene la lectura.

El formato de las respuestas coincide con `Shifts.gs` del prototipo `881a71c`: usa día operativo por fecha y no guarda alcance de evento/proyecto. Ese escritor también podía generar un requestId separado para TURNOS cuando faltaba en el cuerpo. Esto explica una posibilidad para las referencias distintas; **no prueba qué versión escribió cada fila ni autoriza a renombrarlas**.

## Código frente a decisión de datos

No se encontró un defecto de rol o del mapa que justifique relajar la guarda. El contrato nuevo exige una identidad durable de jornada/evento/proyecto; las aperturas observadas no la contienen. No se cambian validaciones, permisos ni configuración para aparentar compatibilidad.

El límite histórico vigente rechaza registros `turnoAbrir`/`corteZCerrar` previos; su alcance original es legado POS/KDS incierto sin journal. Activarlo no es la salida técnica para este caso, además de seguir requiriendo aprobación específica. No se debe ampliar ese alcance sin un contrato y evidencia propios.

Ni el texto de conflicto de los siete FAILED ni la ausencia de un journal moderno prueban cero efectos. El prototipo llamaba `ensurePhase1Schema_` antes de revisar exclusión de turnos y escribía directamente a TURNOS. La respuesta vieja no sustituye el payload original, su vínculo de idempotencia ni la comprobación de efectos relacionados.

## Pasos mínimos seguros

1. Conservar los originales y detener nuevas mutaciones de diagnóstico. Consultar estado es lectura; pulsar Abrir puede registrar otra intención rechazada en REQUESTS, aunque no cree jornada ni venta. No reenviar las aperturas viejas ni sustituir sus IDs.
2. Confirmar si **estas dos aperturas concretas** fueron exclusivamente pruebas o tuvieron custodia/movimientos reales. La afirmación previa sobre las dos ventas V9 de $60 no clasifica automáticamente otros turnos. La consulta está pendiente; no se presume respuesta.
3. Revisar, sobre respaldo privado, las referencias de REQUESTS/TURNOS y los movimientos relacionados por `shiftId` en CAJA/COBROS/ACCESO/MOVIMIENTOS/DEVOLUCIONES, junto con las colas de estaciones retenidas. Esta conciliación integral no se ejecutó aquí. No asignar evento por nombre, fecha o proximidad a otro registro.
4. Si fueron pruebas, proponer clasificación auditable de esos IDs exactos y sus efectos, preservando originales; si hubo operación real o sigue incierta, conciliar custodia, ingresos, deuda, entrega y consumo antes de resolver. Cualquier adaptación de legado debe conservar ambas referencias, evidencia vigente y cierre explícito; no convertir FAILED en COMPLETED, fabricar cortes ni copiar el alcance QA al histórico.
5. Revisar el diferencial y autorizar el tratamiento específico antes de modificar datos o implementar una exclusión administrativa nueva. El software actual no contiene una resolución aprobada para este legado. Hasta entonces, este libro compartido sigue bloqueado para probar aperturas modernas. No se propone vaciarlo, quitar el mapa, crear otra app ni abrir un laboratorio remoto paralelo como atajo.

No se puede prometer habilitar la apertura en el libro actual sólo con otra instalación de código. Una vez conciliado/aprobado el tratamiento, el primer cotejo debe ser de identidad y lectura; después se revisará por separado el recorrido operativo autorizado, sin repetir ventas existentes.

## Reproducción y regresiones

La copia local de las nueve respuestas, identidades y estados leídos reproduce el error exacto ejecutando el código real de `7898be2` con servicios en memoria y un mapa QA sintético. Ambos libros mock permanecen idénticos antes/después. No se copió el libro completo ni se usaron los hashes/dispositivos originales para ejecutar mutaciones.

`tests/legacy_journey_activation_regressions.js`: ocho casos con datos sintéticos sin IDs/personas/importes del libro. Comprueba mapa limpio sin apertura automática, rechazo de apertura legado de otra estación, dos COMPLETED más siete FAILED, fallos sin prueba de ausencia de efectos, imposibilidad de completar alcance por fecha/estado/mapa, rechazo del límite administrativo, ausencia de un plan recuperable y la persistencia de una nueva intención si se solicita una apertura inválida. Se conserva el bloqueo y no se añade resolución de legado.

Evidencia original acotada y reproducción en `/workspace/domus-private/legacy-openings-20261110/`, fuera del repositorio; sólo el fixture sintético y este diagnóstico se publican. No se atribuyen a Gemini/IDE nuevas revisiones de este tramo. Runtime, frontend, manifiesto y bundles son idénticos a `7898be2`; este cambio añade documentación, test y su paso CI. No requiere desplegar otra versión para corregir el comportamiento observado.
