# Retirar el token de impresión del navegador — 7 noviembre 2026 UTC

**IMPLEMENTED / LOCAL_TESTED; sin instalación.** Base `0cc0b2c75952d308d810a6748909dddacbfb0886`, misma rama y editor. UI `20261107-print-token-13`. Se comprobaron ramas, PR, commits y coordinación publicados antes de editar: no se encontró otra implementación activa. No se repitieron revisiones de Gemini/IDE ni se afirma su participación sobre este delta.

## Causa y corrección

`saveConfig()` guarda el token sólo si el campo contiene texto. Vaciar el campo y guardar conservaba la credencial previa sin indicar cómo retirarla.

Configuración incorpora **Retirar token de este navegador**. La acción elimina exclusivamente la clave `domus_print_token` de localStorage y verifica su ausencia antes de informar éxito. Limpia el campo y marca impresión sin token. No llama al backend, al Print Bridge ni a sincronización; no toca Outbox, intención pendiente, comprobantes, archivos de revisión, sesiones ni configuración del backend. Un error de almacenamiento produce un aviso genérico, sin imprimir el secreto ni afirmar que se retiró.

Abrir Configuración ya no copia el secreto guardado al formulario: muestra sólo si existe. Guardar un campo vacío conserva la configuración existente, explicado junto al botón. Guardar/cancelar/cerrar limpian el campo. Otra pestaña con esta versión recibe la retirada mediante el evento de almacenamiento, limpia su campo y no lo vuelve a guardar. Una respuesta de salud iniciada antes de la retirada no restablece el estado conectado si ya no hay token.

## Evidencia y límites

- `print_token_removal_regressions.js`: **5 PASS** con funciones reales, almacenamiento simulado y credenciales ficticias: única clave eliminada, igualdad exacta de colas/recibos/sesiones, fallo o eliminación no confirmada, secreto ausente del formulario, guardado vacío, repetición y respuesta tardía de salud.
- `browser_print_token_removal.js`: **4 PASS** en Chromium con dos pestañas, app real y tráfico interceptado. El botón no emite solicitudes; conserva todos los demás valores del almacenamiento. La otra pestaña limpia su campo y guardar no restaura el token; la recarga mantiene retirada y evidencia pendiente. Ningún cobro se ejecuta.
- Build/manifiesto se regeneran para cotejar JS e Index nativo. Backend y Print Bridge mantienen el código de 0cc; no hay migración financiera ni de credenciales.

El alcance es el mismo origen/perfil del navegador. No revoca ni modifica el archivo de credencial del servicio, otros perfiles/orígenes, pestañas con código antiguo ni solicitudes ya enviadas. No se leyó, copió, retiró o reveló ninguna credencial real desde este entorno. La función requiere la UI nueva instalada en un tramo autorizado; esta entrega no instala código ni autoriza intervenir producción.

Tras cotejar e instalar la UI en el perfil de pruebas autorizado, usar el botón y comprobar el aviso de retirada. Conservar el perfil y sus comprobantes. Si el almacenamiento rechaza la acción, detener la retirada; no borrar el perfil para eludir el error. No se acredita impresión física ni retirada real hasta comprobarlas en ese tramo.
