# Caja: lecturas consistentes y sondeo sin superposición — 11 noviembre 2026

Estado: implementado y probado aisladamente; sin instalación ni consulta Google en este tramo. Base Git `054fb43ce33b7724ac3a466a3b8488a2effde892`. UI `20261111-operational-reads-25`; runtime SHA-256 `b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61`. Las huellas completas de la pareja generada están en `release-manifest.json`.

## Causa y cambio

Coordinación observó después de activar staging lecturas de 315–330 s, otras agotadas a 360 s, y parejas de `dispatchNativeAction` cada diez segundos. La pestaña QA quedó cerrada sin apertura ni venta. No se repitió esa consulta para diagnosticar.

El cliente usaba `setInterval(10000)` para lanzar Caja y Comandas juntas, sin esperar respuesta. Cada lectura de jornada recorría varias veces REQUESTS, journal y evidencia comercial del límite retenido. Un error de Caja sólo iba a consola: permanecía el mensaje inicial o un periodo previamente permitido.

- Caja, `turnoEstado` y Comandas reutilizan la captura consistente existente durante una sola consulta. Mantienen validadores originales y vuelven a leer valores/fórmulas/identidades/dimensiones antes de devolverla. Se ejecutan bajo el lock del script. El lector admite rangos A1 acotados y lecturas escalares, sin métodos de escritura. No hay caché entre peticiones.
- El cliente comparte una sola consulta pendiente entre sondeo y refrescos manuales; Caja precede a Comandas. El siguiente sondeo se programa diez segundos después de terminar ambas. Una respuesta de otra vista/rol no modifica la vista actual ni dispara la siguiente lectura con un rol diferente.
- Un fallo detiene el sondeo automático. Un fallo de Caja muestra la causa y cierra el permiso local de cobro; `Sincronizar` reintenta lecturas. No se cancela ficticiamente la petición al vencer un temporizador local ni se libera su plaza mientras Apps Script aún podría ejecutarla. Si no llega callback, permanece pendiente hasta cerrar esa pestaña y comprobar las ejecuciones, sin abrir clientes antiguos.
- SEMANA se evalúa nuevamente al terminar la comprobación del backend, con fecha/hora reales y zona del libro. La respuesta incluye `checkedAt`. El cliente comprueba el día antes de abrir/confirmar pago mediante reloj servidor y tiempo transcurrido; incluye conservadoramente todo el tiempo de tránsito. Un cambio de día exige refrescar. La interfaz nueva bloquea si el backend antiguo omite estos datos.

Los endpoints de venta, apertura/corte, confirmación bancaria, recuperación/journal y sus guardas no se sustituyen. El límite aprobado conserva su snapshot y sus registros originales; no se reaprueba ni se redefine. No se toca impresión, permisos, propiedades reales, colas ni fechas del libro.

## Evidencia aislada

Con dimensiones sintéticas representativas (REQUESTS 326 filas; COBROS 4569×33; CAJA 2 194×50; COMANDAS 194×14), límite activado sintéticamente y las retenciones existentes:

| Consulta | Llamadas getValues/getFormulas sin captura | Con captura y revalidación |
| --- | ---: | ---: |
| cajaSimpleDatos | 257 | 44 |
| turnoEstado | 250 | 32 |
| comandasSimpleDatos | 85 | 32 |

Mismo resultado comercial y misma huella; se excluyen únicamente timestamps generados en cada lectura de la comparación. Son conteos del mock, no segundos ni una promesa de latencia Google. No se contaron llamadas de metadata en esa tabla.

`operational_reads_regressions.js`: 21 casos de módulos/bundle y un caso local adicional con el bundle V16 inmutable de referencia. Se detectan cambios concurrentes de valores/fórmulas/journal sin cambio de dimensiones, journal huérfano y evidencia alterada entre consultas. El caso V16 crea un límite sintético con el runtime antiguo y consulta después con el nuevo, conservando snapshot, propiedades y hojas sin reaprobación. No es una lectura del límite real.

`polling_regressions.js`: seis casos, incluyendo espera de 360 s, coalescencia, serialización, error/reintento manual, cambio de rol/vista, pestaña oculta y cruce al 11 noviembre CDMX antes de crear intención. `browser_polling.js`: dos recorridos Chromium (REST estático y HTML nativo generado), con servicio demorado 360 s y reloj simulado; máximo una lectura en vuelo, sondeo tras completar, pausa por error y recuperación manual. Cero operaciones comerciales o llamadas Google.

La primera ejecución de la regresión de dos pestañas agotó la espera de ambas intenciones. Su fixture esperaba sólo el primer timestamp de sincronización y cancelaba sólo el temporizador antiguo. Ahora espera la lectura inicial completa, deshabilita el sondeo del fixture y acredita las dos solicitudes esperando el lock de almacenamiento antes de liberarlo. Tres ejecuciones consecutivas pasan con esa barrera explícita; no se cambió el motor Outbox para obtenerlo.

Regresiones locales de recuperación, transporte, sesión/roles, periodo, consistencia de lecturas y navegador; build/manifiesto y guardrails. CI exacta del commit se informa separadamente: una ejecución anterior verde no acredita este delta.

## Paso siguiente y límites

1. Revisar este delta y la pareja exacta del manifiesto. Conservar el respaldo del editor y la versión anterior. No volver a instalar auxiliares temporales de aprobación ni ejecutar el límite: ya fue activado según coordinación.
2. Antes de una instalación staging autorizada, verificar que terminaron las ejecuciones antiguas y que QA permanece cerrada. Producción queda intacta. Instalar sólo la pareja revisada en el staging canónico y verificar identidad/build. Este trabajo no instala ni crea versión.
3. Con una sola pestaña QA y su cola vacía acreditada, efectuar una lectura de Caja y medir tiempo/ejecuciones: ninguna apertura ni venta. Comprobar fase, jornada retenida y causa del periodo. No prometer éxito por el conteo sintético.
4. SEMANA que termina el **10 noviembre** debe bloquear cualquier venta del **11 noviembre en America/Mexico_City**. Corregir una ventana de staging requiere la autorización y diferencial de esa configuración; este parche no la amplía ni retrofecha. La separación definitiva entre periodo de reportes y operación diaria sigue fuera de este cambio.

Reversión: volver a la pareja anterior sin borrar REQUESTS/journal, propiedades ni colas. Como la versión anterior mantiene el sondeo defectuoso, conservar QA cerrada mientras se revierte y no usarla para operar. El lock serializa escritores de este proyecto; ni éste ni las dobles lecturas constituyen una transacción atómica contra editores manuales u otros proyectos. La custodia de escritores sigue vigente. No se acredita caja productiva lista ni operación real por estas pruebas.
