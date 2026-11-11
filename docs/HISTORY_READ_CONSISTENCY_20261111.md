# Revalidación consistente después del timeout de V16

IMPLEMENTED / LOCAL_TESTED / NOT_INSTALLED. Coordinación confirmó que la ejecución del puente en V16 terminó por timeout de seis minutos y que la inspección posterior encontró la aprobación ausente. Es evidencia recibida; cloud no repitió la consulta, abrió Google ni leyó/escribió propiedades reales. Base local y remota cotejada: `c2ef3d45bfffd8f2a91fd6469da650a439d5cc97`, sin otro delta publicado ni editor local activo conocido. Esto no acredita ausencia de actividad de terceros en Google.

## Fallo reproducido y corrección

La vista introducida en `178008c` almacenaba cada rango exacto por separado. Una lectura de las filas de journal podía validar `COMPLETED`; al cambiar un escritor externo la misma celda a `PREPARED`, la lectura posterior del prefijo completo incorporaba el valor nuevo a la huella. Las dimensiones permanecían iguales. La reproducción con el bundle real anterior emitió un diagnóstico pese al cambio; no hubo datos reales.

`historyReadView_` ahora captura una sola matriz de valores y fórmulas por hoja MAIN consultada. Todos los rangos, pequeños o grandes y en cualquier orden, usan las mismas celdas capturadas. Antes de devolver el resultado, relee valores y fórmulas y compara tipos, fechas nativas, identidad de hoja cuando está disponible, dimensiones y zona horaria usada. Conserva el nombre `assertDimensions` por compatibilidad, con controles más fuertes y protocolo `HISTORY_CONSISTENT_READ_V2`.

Un cambio observado aborta el diagnóstico/propuesta y la creación de aprobación. No recalcula la huella para acomodar el cambio, no normaliza evidencias, no reintenta, no escribe hojas y no modifica activación, ACK o replay. La validación y la huella ya no pueden utilizar dos versiones distintas de una misma celda de MAIN por rangos superpuestos.

## Vía mínima preparada para el V16 existente

- [StagingRetentionReadView.gs](../scripts/apps-script-admin/StagingRetentionReadView.gs) contiene el mismo lector, generado directamente desde `History.gs` por `build_release.py`. Usa un nombre privado distinto para evitar duplicados con un backend posterior. No tiene entrada pública, setters ni activadores.
- [StagingRetentionApproval.gs](../scripts/apps-script-admin/StagingRetentionApproval.gs) prefiere ese lector y exige el protocolo nuevo. Si falta o sólo existe la caché V1, se detiene con `RETENTION_ADMIN_CONSISTENT_READ_REQUIRED`; no vuelve al recorrido que agotó el tiempo.
- El puente temporal y el lector de propiedad de `c2ef3d4` conservan su código. La identidad, huella fija 708c, ventana absoluta de hasta diez minutos, última guarda bajo lock y conservación de valores existentes siguen vigentes.

Esta vía permite revisar y posteriormente añadir **sólo el lector privado y el delta del auxiliar**, preservando `domusRetencionAdminEntrada_` y su artefacto privado, sin reemplazar el backend/Index V16 ni crear versión o despliegue. La huella del lector auxiliar se verifica por separado: el build del backend no acredita ese archivo añadido. Los ensayos con el bundle inmutable de `2189540` conservan exactamente la huella sintética anterior cuando la evidencia no cambia. Eso no acredita coincidencia actual de la huella real 708c: el auxiliar aún debe comprobarla íntegra y rechazar cualquier diferencia.

Antes de una nueva ejecución deben cotejarse el delta/CI, los archivos realmente instalados y la retirada del escritor del intento anterior. Mantener custodia de estaciones y escritores externos. Inspeccionar la propiedad, preservar cualquier valor, preparar una nueva ventana absoluta únicamente para el intento expresamente coordinado y retirar el archivo escritor después de esa ejecución, aun si falla. No repetir a ciegas ni ampliar la aprobación a otra huella. Sigue siendo accesible por `/dev`; no es editor-only. El [procedimiento del puente](RETENTION_TEMPORARY_BRIDGE_20261111.md) continúa aplicando.

**Esta entrega no instala ni ejecuta esa vía.** El lector administrativo no cambia la consulta de propuesta del Web App V16: esa consulta mantiene su recorrido antiguo. La corrección de `History.gs` también está en la nueva candidata de backend, UI `20261111-history-read-24`, con build `ae76a4b2799bbf636b498cade21391755daf847eb1676f77cd3cc6e96262933e`. Instalar esa pareja sería otra acción y cambiaría el build incluido en el diagnóstico: no reutilizar allí la autorización 708c ni alterar hashes para hacerlo coincidir. No se propone tal despliegue como parte de este paso.

## Evidencia y límites

| Lecturas en el fixture documentado | Recorrido original | Vista corregida, incluida relectura final |
| --- | ---: | ---: |
| `getValues` | 714 | 20 |
| `getFormulas` | 712 | 20 |
| Total | 1426 | 40 |
| Celdas de valores | 339247 | 332586 |
| Celdas de fórmulas | 341849 | 332586 |

Se usan 326 filas REQUESTS y rangos hasta COBROS 4569×33, CAJA 2 194×50 y COMANDAS 194×14, con datos sintéticos. La reducción es de llamadas, no de todo el volumen de celdas: releer contenido es necesario para detectar cambios sin variación de dimensiones. No se midió latencia Google ni se garantiza terminar antes de seis minutos.

29 casos nuevos en `history_read_consistency_regressions.js` para módulos/bundle actuales; tres adicionales locales con el bundle completo inmutable V16 de `21895402734d75a66ba7c4bcc47139662aa22c9e` (SHA-256 del archivo `8ae96ee6cf60332cafbadbf902d2a4501bfe7d7d7dfe32e3ef26dc0ff5bbcf07`). Cubren la carrera original, estados/planes/REQUESTS, fórmulas con mismo valor visible, fechas/tipos, zona, identidad de hoja, ambos órdenes de rangos, mutaciones entre lecturas, fallos de relectura, preservación de build/hash, rechazo del auxiliar sin lector seguro y cero aprobación ante concurrencia detectada. La compatibilidad V16 usa `DOMUS_TEST_LEGACY_BUNDLE` apuntando a la copia local de Git; CI no descarga ni ejecuta ese backend en Google.

Regresiones locales: vista 16, núcleo administrativo 62, puente 51 y retención 40 PASS. Paridad generada y sintaxis PASS. La CI debe cotejarse contra el SHA final. No hay revisión nueva de Gemini/Antigravity acreditada para este delta.

El lock no impide ediciones manuales ni escrituras de otros proyectos. Las lecturas separadas de Google no ofrecen una transacción atómica: una modificación posterior a la última lectura o un cambio que se revierte entre lecturas puede no observarse. La captura común evita mezclar versiones para validar y calcular la huella; la relectura detecta diferencias observadas. **No sustituye la custodia externa ni demuestra ausencia de todos los escritores.** OPS conserva su lectura original. Fórmulas volátiles que cambien durante la comprobación pueden bloquearla legítimamente; no se omiten para forzar una aprobación. La aprobación sólo habilita preparar una propuesta, sin resolver históricos, liberar colas, confirmar dinero o activar el límite.
