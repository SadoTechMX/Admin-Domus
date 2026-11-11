# Lecturas de la propuesta histórica: optimización acotada

> **Corrección posterior:** la caché por rango de esta versión tiene una carrera reproducida entre validación y huella cuando cambia contenido sin cambiar dimensiones. No usar `178008c` como solución validada a ese riesgo. Ver [lector consistente y auxiliar compatible con V16](HISTORY_READ_CONSISTENCY_20261111.md). La espera inicialmente incierta fue confirmada después por coordinación como timeout del puente V16, con aprobación ausente en lectura posterior.

Estado: IMPLEMENTED / LOCAL_TESTED, sin instalación ni activación de esta corrección. Base `21895402734d75a66ba7c4bcc47139662aa22c9e`, reportada por coordinación como staging V16 instalado. No se consultó de nuevo el Web App, Sheets, colas ni ejecuciones reales desde cloud.

## Incidente y causa comprobable

Coordinación observó una única consulta diagnóstica pendiente durante más de diez minutos, con último monitor de 281 segundos y sin respuesta en la UI. Eso acredita espera del cliente, no que el servidor continuara ejecutando. El transporte nativo espera el callback de `google.script.run` sin plazo local. Google documenta un [límite de seis minutos por ejecución de Apps Script](https://developers.google.com/apps-script/guides/services/quotas). Un timeout es plausible; falta cotejar el estado/error de **esa ejecución existente** para confirmarlo. No repetir la consulta ni tratar la espera como aprobación o activación.

En código, `historySnapshot_` recorre los grupos REQUESTS; `journeyKnownNoEffects_` y otras comprobaciones llaman repetidamente a `journalFind_`, que vuelve a leer valores/fórmulas del journal completo. Además, el detector de referencias y la huella comercial leen los mismos rangos comerciales. Estas lecturas se reproducen en memoria con el código real.

El fixture de medición usa 326 filas REQUESTS y rangos comerciales hasta COBROS fila 4569/columna 33, CAJA 2 fila 194/columna 50 y COMANDAS fila 194/columna 14. Son dimensiones basadas en rangos documentados del respaldo acotado anterior, **no un inventario completo actual**. Todas las identidades, importes y filas del fixture son sintéticos.

| Llamadas del mock | Sin vista reutilizable | Con vista reutilizable |
| --- | ---: | ---: |
| getValues | 714 | 16 |
| getFormulas | 712 | 15 |
| Total valores/fórmulas | 1426 | 31 |
| Celdas de valores leídas | 339247 | 168970 |
| Celdas de fórmulas leídas | 341849 | 169015 |

No es una medición de latencia de Google ni garantiza que la consulta real termine dentro de su cuota. En el mismo build, diagnóstico y propuesta aprobada son idénticos byte por byte al desactivar solamente la nueva vista.

## Cambio y garantías

`historyReadView_` captura cada rango numérico exacto una vez por tipo de lectura dentro de **una llamada** a `prepararLimiteHistorico`, bajo su lock existente. No recorta filas, fórmulas ni campos, no salta validadores y no cambia la función de hash. Copia arrays y fechas nativas para impedir que un lector altere la evidencia capturada. La interfaz sólo expone lecturas; no permite mutadores.

No existe caché global, CacheService ni reutilización entre consultas. Al terminar, comprueba nuevamente presencia y dimensiones de las hojas MAIN consultadas; un cambio aborta la respuesta. No proporciona una transacción atómica frente a ediciones externas/manuales dentro de las mismas dimensiones. El lock sólo serializa este proyecto: la custodia de escritores sigue siendo indispensable. OPS mantiene sus lecturas originales.

`registrarLimiteHistorico`, ACK, replay, cobros, permisos y aprobaciones conservan su código y sus lecturas originales. La activación vuelve a cotejar las huellas; su latencia **no está optimizada ni medida aquí**. Los 17 grupos y las colas siguen sin resolverse. Consultar no crea una barrera activa.

## Pruebas y entrega

16 casos nuevos: igualdad completa con/sin vista, conteo de lecturas, fechas y copias, fórmulas cuyo valor es vacío, cambios entre consultas, cambios de dimensiones durante la consulta, journal huérfano, IDs malformados, referencias Unicode, excepción sin caché residual y rechazo de aprobación obsoleta en el registro sin usar la vista.

Regresiones PASS: retención 40, inicio nuevo 40, custodia 80, límite histórico 27, Chromium de propuesta 40 y guardrails 4. Build/manifiesto y sintaxis pasan. Las suites se solapan; son pruebas sintéticas de código real, no certificación operativa. CI debe cotejarse con el SHA final. Gemini/Antigravity no han revisado este delta según la evidencia disponible.

UI `20261111-history-read-23`; backend source SHA-256 `48897795ee48ddeb4a6ff5b49673e1e3054e595b544615e9c709f5cabfc36d4c`. Se regeneran bundles/Index/manifiesto y se fija esa huella en la pantalla. La pareja nueva debe instalarse junta, sólo tras autorización específica; no basta cambiar Index. La huella de build forma parte de la evidencia: no reutilizar una aprobación de otro build.

Paso inmediato: consultar únicamente estado/error de la ejecución ya iniciada. Después, revisar el delta y la CI exacta y respaldar/cotejar la pareja vigente antes de una eventual instalación autorizada en staging. Esta entrega no instala, activa, repite diagnóstico ni configura propiedades. Antes de activación puede restaurarse la pareja respaldada con escritores detenidos; después de un límite durable no regresar a código que ignore su custodia. No borrar filas, propiedades ni colas como reversión.
