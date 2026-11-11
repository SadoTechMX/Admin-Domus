# Lecturas acotadas durante apertura QA — 11 noviembre 2026

Estado: integración aislada sobre `cda9b8210061018ba076999a17401ca33ccb9838`; sin Google, iMac, instalación ni reintento real. UI `20261111-opening-read-scopes-28`. CI del commit exacto y revisión independiente se comunican por separado.

## Diagnóstico y alcance

Coordinación reportó una única ejecución `turnoAbrir` agotada a 360.679 segundos, sin cambios en el cotejo posterior de 36 hojas y con estado local UNCONFIRMED. Es evidencia reportada, no una inspección realizada por este parche. No se infiere ausencia de efectos ni permiso para reenviar.

En un fixture sintético representativo con límite y retención activos, la ruta original hace 864 llamadas a getValues/getFormulas, 688 antes de la primera escritura REQUESTS. Hay diez validaciones de límite y 104 búsquedas lógicas de journal; no se encontró una espera explícita de seis minutos. El lock tiene timeout de 30 segundos. El binding diferido bajo aislamiento puede dejar el ID sin registrar mientras aún se valida la evidencia. Esto es una causa probable del coste, no una medición del servicio Google ni prueba exclusiva del timeout real.

## Cambio mínimo

- `historyBoundary_` abre una captura de sólo lectura para cada validación, llama al cuerpo anterior `historyBoundaryRead_` y revalida valores, fórmulas, dimensiones, identidad y zona al terminar.
- `turnoAbrir` usa otra captura sólo para el preflight. La verifica antes de llamar al journal con el libro físico original.
- Ninguna captura se reutiliza entre escrituras, recuperaciones o peticiones. Las guardas originales de idempotencia, journal, padre/partes, referencias retenidas, política, estaciones y permisos permanecen. No cambian estados, columnas, saldos, SEMANA ni reglas de cierre.
- El wrapper común también alcanza otros consumidores de `historyBoundary_`; no es una excepción exclusiva de staging. Por eso se generan ambos bundles y se ejecutan regresiones generales. **Generar el bundle de producción no lo instala ni autoriza instalarlo.**
- La UI conserva exactamente las condiciones de recuperación y el bloqueo de SENT/UNCONFIRMED. Sólo actualiza la huella de salud exigida y el identificador de recursos. El build anterior se rechaza: backend e Index forman pareja.

## Resultados sintéticos

Módulos y bundle staging: 864 → 260 lecturas de valores/fórmulas (69.9% menos), 688 → 184 antes del primer binding (73.3% menos). Las cuatro escrituras administrativas, respuesta y snapshot coinciden, descontando únicamente la hora de apertura generada. Los libros comerciales permanecen idénticos. Los diez validadores y 104 lookups lógicos siguen ejecutándose, pero utilizan capturas coherentes.

No son todas las llamadas de servicio: getLastRow pasa 532 → 194; getLastColumn 70 → 168; getName 40 → 56. La copia/comparación de capturas aumenta trabajo de CPU y memoria; el tiempo Google no está medido. No se promete que 260 lecturas terminen dentro de un plazo concreto.

`node tests/opening_read_scopes_regressions.js`: 16 casos agrupados en módulos/bundle. Cubren equivalencia, ACK mismo ID sin escritura, PREPARED recuperable, cambio comercial de igual tamaño antes del binding, cambio de política, referencias retenidas en la salida, journal huérfano y fallo tras preparación durable con incertidumbre conservada.

La variante `DOMUS_TEST_PREVIOUS_BUNDLE=/ruta/bundle-b07.gs node tests/opening_read_scopes_regressions.js` añade un caso (17 total): verifica SHA-256 exacto `431826f0c243db172ea0f23f395b5b030b000eeacb508e5bd6c13398ef382de5`, crea el límite con ese runtime publicado y abre con el nuevo sin cambiar snapshot, aprobación, registro del límite ni libros comerciales. No es una prueba sobre datos reales ni reemplaza el cotejo del límite instalado.

Se añaden pruebas para rechazar b07 en salud y conservar una marca anterior SENT/UNCONFIRMED byte por byte, sin ninguna llamada de red. La prueba del auxiliar de retención permite un lector anidado sobre captura inmutable, pero sigue exigiendo que sólo el compañero revisado lea el libro físico. El compañero generado no cambia.

La batería local general comprende 52 comandos sin navegador. Chromium local no pudo iniciar por `socket() failed: Operation not permitted`; sus 16 comandos de navegador deben validarse en CI. No se eludió la restricción. Los resultados finales exactos se adjuntan al commit por coordinación; no se declara verde una etapa pendiente.

## Pareja y límites de instalación

- Runtime source SHA-256: `f24d94ffa387680b000b26c79e262c31fabda499231ddae7880fb6af200a31b1`.
- Staging backend: `google-apps-script/DOMUS_STAGING_BUNDLE.gs`, SHA-256 `84b4de6dbca58ca060b2609bf5bd43e643fe545fb71124c31b01d44dd97cd7e7`.
- UI: `google-apps-script/Index.html`, SHA-256 `c2c86b7adb05829dfbf536612dd7e5f96d8f41907d62cb41a5696362262d6f41`.
- El manifiesto Apps Script no cambia. No instalar los auxiliares administrativos ni regrabar aprobaciones. La allowlist del auxiliar admite la nueva huella para sus pruebas, sin cambiar su autorización específica ni sus guardas.
- Si se autoriza instalar después de revisión, cotejar la pareja completa en staging y conservar el límite/propiedades existentes. No recalcular el snapshot para encubrir diferencias. No desplegar producción.
- **El intento real UNCONFIRMED sigue bloqueado. Este parche no ofrece ni autoriza limpiarlo, archivarlo o reenviarlo, ni usar un ID nuevo.** No se incluye una vía de recuperación adicional. Una futura decisión requiere evidencia y autorización independientes.
- Las capturas detectan cambios observados; no proporcionan atomicidad ante escritores externos al lock ni detectan un cambio transitorio que se restaure antes de la relectura. No se reduce ese límite ya documentado.
