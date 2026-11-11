# Recuperación de apertura QA bajo retención — 11 noviembre 2026

Estado: código aislado y pruebas locales; sin instalación, Google, reintento real ni despliegue. Base `153e5b7766ea5932f5002ee86ed81b74090de6ae`; UI `20261111-held-opening-27`. La CI exacta se comunica por separado.

## Causa y alcance

Coordinación reporta que «Revisar sin reenviar» dejó una retención durable `REQUIRES_REVIEW` sobre la apertura QA de $0 que había recibido SERVER_ERROR/500. El registro original estaba en RETRY. Son dos estados distintos: **la retención no convierte una intención rechazada en reintentable**. No se inspeccionó ni modificó esa cola real desde cloud.

El arranque retorna antes de inicializar la app si hay retención. El botón de recuperación incorporado en la UI 26 vive dentro de esa app; `assertOutboxTraffic_` también lo bloquea. `Cerrar revisión sin pendientes` exigía cola vacía. Se reprodujo esa combinación con funciones reales y almacenamiento sintético.

Esta vía se limita a una única apertura `turnoAbrir`, cliente v2, estado RETRY transitorio, rol CAJA, fondo numérico $0, límite histórico explícito y dispositivo idéntico al almacenado. Exige copias inicial/final iguales y sin cambios respecto al almacenamiento actual, ninguna venta pendiente ni comprobante previo para el ID. No admite cortes, ventas, las 15 intenciones antiguas, entradas con estado REQUIRES_REVIEW/CONFIRMED/SYNCING, duplicados o destino desconocido.

Las entradas actuales no guardan el endpoint de origen. La UI exige cotejo humano de destino contra evidencia privada y una referencia breve, además de confirmación del ID mostrado. No inventa destino por la antigüedad, el prefijo, la ausencia en REQUESTS o el origen del navegador. Esa declaración no prueba efectos ni reemplaza autenticación de servidor.

## Recuperación y archivo

1. Sólo la app **nativa de STAGING** ofrece el control. No arranca sesiones operativas, sondeo, Outbox automático ni impresión. No se añade excepción general a `assertOutboxTraffic_` o a los escritores de la cola.
2. El usuario coteja ID, ámbito, dispositivo y destino de la prueba; registra referencia privada sin contenido sensible, confirma que las otras estaciones están detenidas y acepta el diálogo. Si cancela o falta cotejo, no hay llamadas.
3. Bajo locks exclusivos de tráfico y almacenamiento, se revalida la evidencia completa. La secuencia acotada llama `health`, autentica CAJA mediante Google y envía `turnoAbrir` una sola vez. Salud debe identificar los dos libros canónicos de staging y backend V17 source SHA-256 `b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61`. Login debe devolver el rol y dispositivo originales. No solicita credenciales, reutiliza tokens ni eleva permisos; la sesión normal nueva queda en el servidor, su token no se guarda en evidencia local ni exportación.
4. Antes del envío queda un registro durable `DOMUS_REVIEW_JOURNEY_V1` con el vínculo exacto a las copias/hold, identidad, referencia, destino declarado y momento del intento. Usa **el mismo ID, args, dispositivo, rol y operador**. La acción puede devolver un ACK, reanudar o completar la intención original. No es una consulta de sólo lectura. Mantiene idempotencia y guardas del backend intactas.
5. La cola y las dos copias permanecen byte por byte intactas durante la recuperación. Sólo un ACK completo para la misma apertura, importe, ámbito, límite y dispositivo se guarda como CONFIRMED en el registro separado. Un error, respuesta incompleta, cambio de evidencia o pérdida de callback conserva el bloqueo. Un SENT o UNCONFIRMED persistente **no se reintenta** al recargar, al volver online ni con otro click/pestaña: requiere revisar el resultado antes de otra acción. No se interpreta timeout como cancelación ni como ausencia de efectos.
6. Tras ACK válido, `Cerrar revisión sin pendientes` crea primero un archivo durable con hold, copias originales, cola original y resultado. Luego persiste el comprobante y retira exclusivamente esa única entrada ya confirmada de la cola activa. Si falla cualquier paso, el hold queda vigente; puede completarse el mismo archivo tras recargar sólo si todos los valores coinciden. No borra evidencias ni declara conciliados los históricos.
7. El cierre no llama al backend ni arranca la app. El enlace `Abrir la app` es una navegación explícita posterior. La otra pestaña retenida permanece sin tráfico. Descargar evidencia incluye el intento y los archivos de cierre, sin tokens.

## Pruebas y límites

- `tests/held_opening_regressions.js`: 13 casos agrupados de funciones reales y backend en memoria. Repro del bloqueo; ID ausente y ya completado; elegibilidad adversa; consentimiento; destino/build/rol/dispositivo; respuestas incompletas/ajenas, 500 y pérdida de respuesta; cambios durante llamadas; cuota; dos pestañas; interrupción de cada paso del archivo y evidencia modificada tras archivo parcial. No se crea COBROS en los mocks.
- `tests/browser_held_opening.js`: seis recorridos con Index nativo generado: apertura ausente, existente, ACK vacío, respuesta perdida, entorno incorrecto y Google denegado. Cotejo/diálogo, cancelación, recarga, segunda pestaña, descarga, archivo y ausencia de sondeo/replay. Toda red externa interceptada; logo servido desde fixture local.
- Regresiones de retención (8), cierre (8), prioridad de escritura (14), transporte de jornadas (21), Chromium de retención (8) y recuperación/periodo (4), build y guardrails (4).
- El primer ensayo del harness de navegador falló por contar solicitudes del logo estático como tráfico inesperado. Se intercepta ese recurso exacto desde archivo local; los seis recorridos pasan manteniendo bloqueo de cualquier otra red. No fue un fallo de la ruta financiera ni se abrió red real.

El backend/bundles no cambian; `DOMUS_STAGING_BUNDLE.gs` conserva SHA-256 `431826f0c243db172ea0f23f395b5b030b000eeacb508e5bd6c13398ef382de5`. La instalación propuesta sólo reemplaza Index con huella del manifiesto. No requiere activar otra vez el límite ni instalar auxiliares.

## Siguiente paso propuesto, no ejecutado

Revisión del delta y autorización de instalación de sólo Index en staging. Antes: conservar respaldo privado de Index y cola, confirmar que terminaron ejecuciones previas y que no hay otros clientes/escritores activos. Luego, sólo en el perfil QA cotejado, comprobar que el control muestra **el ID original** y fondo $0; descargar evidencia, completar referencia y confirmar una vez. Si la entrada dejó de ser RETRY o cualquier dato no coincide, detenerse: no editar storage, cambiar IDs o levantar el hold manualmente.

Sólo con respuesta válida se permite archivar/cerrar revisión y posteriormente entrar en la app. Si no llega respuesta o el servidor rechaza, detenerse y revisar la evidencia preservada; no repetir apertura. No instalar este control en producción. Revertir Index con QA cerrada conserva las claves nuevas, pero la UI anterior no puede finalizar este archivo: requiere volver a la versión compatible; no eliminar claves para forzarla.

La ruta evita los sondeos de esta pantalla, no cancela ejecuciones anteriores ni coordina escritores de otros perfiles/proyectos. El tiempo real de Google no está validado. SEMANA y fecha CDMX siguen sin cambios: el periodo vencido continúa bloqueando cobros tras recuperar la apertura. Tampoco acredita ticket físico, banco, operación diaria ni aptitud de producción.
