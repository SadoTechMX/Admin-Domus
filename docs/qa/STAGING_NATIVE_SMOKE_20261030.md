# Revisión independiente del STAGING con interfaz instalada

**Veredicto: instalación visual observada; aceptación funcional completa NO-GO.**

Comprobación GET directa del 30/oct/2026 a las 20:37 UTC (14:37 CDMX), más observación en navegador con el perfil Google guardado. Endpoint `AKfycbwgLRDIvZ3rdl-dl3g_YtwexjYE7TBdGkxTfVdzBABb-58nKt-G7179bL163V5nTut2`. No ventas, pagos, accesos, estados KDS, inventario, impresión ni cajón ejecutados por el revisor.

| Comprobación | Evidencia | Estado y límite |
|---|---|---|
| Health | HEALTHY / STAGING, Main `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`, Ops `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE` | PASS de identidad exacta por GET independiente; el navegador no logró completar ese paso y su BLOCKED no invalida esta evidencia separada. |
| Build backend anunciado | repair-qa-20261030; sourceSha256 `c40b71deb07c57a6be0dc5f2709090faa32c2068445c658cb94f322f5ad01d9b` | Coincide la metadata reportada; no es una descarga/hash independiente de todos los bytes desplegados. |
| Rutas caja/comandas/accesos | HTTP 200 text/html, aproximadamente 411 kB por respuesta; antes devolvían JSON | PASS de entrega de HTML, no transacciones ni carga autenticada. |
| Versión visual | UI 20261030-repair-01 / STAGING / Lunar reportada por el navegador | Visible; no sustituye hash exacto de frontend. La extracción automática de userHtml no pudo establecer comparación byte por byte. |
| Caja | Pantalla Acceso Protegido a Caja; no se ingresó secreto ni se desbloqueó | Formulario visible; operación de Caja BLOCKED en esta sesión. No prueba rechazo/aceptación del servidor sólo por ver el modal. |
| KDS | Navegador reporta 13 activas y tarjetas con detalles; pestañas/filtro/buscador presentes | Contenido visible; no hay traza de autenticación/frescura ni comparación con Sheets en el resultado. No certificar datos servidor, filtros o TOMAR/LISTA/ENTREGAR por presencia visual. |
| Accesos | Formulario, tarifas y contadores visibles; actividad mostrada con fecha histórica | Presencia visual; verificar actividad de fixture intencional, lectura autenticada, fecha y tarifa contra ACTIVIDADES. Cero visible no demuestra ausencia real de registros. |
| Sincronización | Navegador reporta transición Sincronizando… → Desconectada | Requiere diagnóstico de red/auth en el navegador. No clasificar como normal de nube ni confundir con el estado de impresora. |
| Impresora | Desconectada para localhost desde navegador cloud | BLOCKED de hardware local, no defecto físico confirmado ni PASS de impresora/cajón. |

## Correcciones a las conclusiones automáticas

El resultado automático marcó PASS global de inspección visual y afirmó datos autenticados por ver tarjetas. El revisor no traslada esas etiquetas a aceptación funcional: faltan llamadas/sesiones comprobadas, estado esperado de fixture y lectura de Sheets. Tampoco adopta la afirmación de que la sincronización desconectada es esperable por nube. El GET health sí pudo comprobarse de forma independiente.

No se recibieron URLs individuales de capturas en el resultado. Evidencia de sesión: https://agent.tinyfish.ai/runs/11490f86-1ea9-4519-9791-2b1dd36874bb . No presentar ese enlace como captura exportada.

## Trabajo concreto pendiente de Antigravity

1. Entregar commit/manifiesto, versión GAS y hash del frontend servido; no sólo el hash de módulos backend. GitHub PR #18 sigue en f0c24ea al cotejar; no se demostró una corrección nueva de REV-001/REV-002.
2. Completar configuración y acceso legítimo por CAJA/BARRA/COCINA/ACCESOS, conservando secretos fuera de chat/Git/logs. El revisor no conoce la clave ni intentó adivinarla. No presumir identidad gerencial automática por tener sesión Google.
3. Corregir códigos de autenticación 500 genéricos y demostrar rechazo/aceptación por rol/dispositivo; distinguir status lógico JSON de código HTTP.
4. Resolver REV-001/REV-002 con pruebas de regresión y nueva versión instalada antes de declarar estable la recuperación.
5. Ejecutar matriz funcional con datos controlados y lectura antes/después de Sheets. Separar lectura UI de transacciones y de pruebas físicas. No promoción productiva con casos críticos pendientes.

La entrega HTML ya permite avanzar; no se pidió otro inicio de sesión Google ni acceso a secretos. La autenticación de estación es un requisito distinto de esa sesión.
