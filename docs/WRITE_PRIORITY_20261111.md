# Prioridad de escritura y recuperación explícita de jornada — 11 noviembre 2026

Estado: código aislado probado, sin instalación, reintento real ni Google. Base `920c49e0222f4fc09fd9d0e1bec0997de0f5296d`; UI `20261111-write-priority-26`.

## Evidencia y causa

Coordinación reporta en staging V17 una lectura de Caja de aproximadamente 103 s y otra de aproximadamente 95 s, mientras una apertura QA de $0 enviada una vez recibió `SERVER_ERROR/500` después de 31 s por transacción concurrente. Reporta ID ausente del ledger/journal y cotejo de 36 hojas sin cambios; conserva la intención `RETRY` y cerró QA. Este tramo no repite esas lecturas ni verifica remotamente ese informe.

`operationalRead_` conserva el lock durante toda la consulta; `idempotentExecute_` espera como máximo 30 s por el mismo lock antes de buscar/vincular REQUESTS. El sondeo ya no solapa otras lecturas, pero sí competía con la apertura. Se reprodujo con dos contextos de ejecución y lock compartido en memoria: la escritura no alcanza REQUESTS/journal y no libera el lock del lector. No se reclasifica el error genérico 500 como prueba de ausencia de efectos.

El helper `DOMUS_PAUSE_FOR_REVIEW` sólo cancelaba timers. La lectura pendiente podía completar y programar otra consulta desde su `finally`.

## Delta mínimo

Sólo cambia el cliente y sus artefactos: **backend y bundles idénticos a V17/920c49e**, source SHA-256 `b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61`. El bundle staging conserva SHA-256 `431826f0c243db172ea0f23f395b5b030b000eeacb508e5bd6c13398ef382de5`. No se retira el lock ni se relajan huellas, permisos, idempotencia o guardas de jornada.

1. Una escritura del cliente reserva prioridad, cancela el siguiente timer y espera la respuesta real de la lectura en curso. La siguiente lectura de esa tanda se omite. Las escrituras de una misma pestaña se serializan; los refrescos solicitados se difieren hasta finalizar. Un fallo de lectura o una pausa impiden enviar la continuación aún no enviada. No hay timeout local que finja haber cancelado Apps Script.
2. `turnoAbrir` y `corteZCerrar` en `RETRY/LOCAL_PENDING` se excluyen de recuperación automática, incluidos arranque, recarga y evento `online`. Los registros mantienen su estado/evidencia. No cambia la política de recuperación de las demás acciones.
3. El botón de recuperación muestra la única apertura/corte pendiente, su ID e importe y pide confirmación explícita. Usa la acción, args, dispositivo, rol y operador originales; comprueba de nuevo esa identidad bajo el lock local antes de cambiar estado o enviar. Si cambiaron mientras esperaba, se detiene. Si hay varias jornadas pendientes, no las envía en lote: exige revisión individual. Un intento explícito no continúa con otras intenciones.
4. El helper deja una pausa en memoria que impide nuevos transportes/sondeos y continuaciones aún no enviadas. Sobrevive al `finally` de la lectura y a `startPolling`. Devuelve estado de lectura/escrituras pendientes y declara `cancelledServerExecutions:false`. No cancela peticiones ya enviadas ni constituye un bloqueo durable entre recargas. La custodia durable sigue correspondiendo al modo de revisión existente. Se conserva la cancelación del timer de impresión que el helper ya realizaba; no se modifica configuración ni implementación de impresión.

La recuperación llama al mismo endpoint idempotente: puede devolver un ACK existente, reanudar un journal válido o completar la intención original si aún no fue vinculada. Por eso no es una mera consulta y requiere la confirmación explícita. No se fabrica ACK ni apertura/corte de reemplazo.

## Pruebas

- `write_priority_regressions.js`: 14 casos de código real con mocks. Contención antes de ledger; espera de lectura y una sola apertura $0 por REST/nativo; captura del cuerpo original aunque cambie el formulario; conservación tras 500/recarga y tras fallo de presentación posterior al ACK; reintento manual del mismo ID sin duplicación; pausa persistente; lectura fallida conserva la cola byte por byte; cambio concurrente del cuerpo bloquea; serialización local; confirmación/cancelación y ambigüedad.
- `browser_write_priority.js`: cuatro recorridos Chromium, interfaz estática REST y HTML nativo generado. Lecturas demoradas 95 s con reloj simulado, apertura nueva y recuperación explícita, máximo una apertura y pausa durante la siguiente lectura. No hay dinero, folios ni datos reales.
- Regresiones de jornadas, contratos ACK, cobro mixto, transporte, pausa/custodia, dos pestañas, sondeos y guardrails. El fixture previo de recorrido de jornada necesitó aceptar y comprobar el nuevo diálogo de confirmación; su timeout inicial era la espera de una recuperación que el navegador cancelaba al no atender el diálogo.
- La CI inicial `42980856874` se detuvo en `test_hotfix_v13.py`: buscaba la llamada directa anterior del botón y el selector anterior como cadenas literales. Se actualiza la ruta estructural a la confirmación explícita y se añade ejecución real del cliente que acredita que CONFIRMED/REQUIRES_REVIEW/REJECTED permanecen intactos, aun con selección explícita. No se omite el control ni se relaja elegibilidad.
- La CI `42981160670` detectó una recuperación manual nativa sin envío tras el evento online. Se reprodujo una carrera real: `ifAvailable` descartaba silenciosamente el click cuando la comprobación automática aún ocupaba el lock local. El reintento explícito ahora espera ese lock, mientras el automático conserva `ifAvailable`; una regresión comprueba la espera y exactamente una continuación del mismo ID.
- Build y manifiesto acreditan que sólo cambian `js/app.js`, `index.html` e `Index.html`; no se modifican módulos backend. La CI exacta del SHA se entrega por separado.

## Paso operativo propuesto; no ejecutado

Revisar este delta y la huella de `Index.html` en el manifiesto. Verificar que terminaron las ejecuciones previas y conservar QA cerrada y su copia de cola. La instalación requiere autorización separada: sólo la interfaz nueva sobre el backend V17 acreditado, sin volver a registrar/activar el límite ni instalar puentes administrativos.

Después, únicamente en el perfil QA identificado y con su cola previamente cotejada, comprobar que no existe reenvío automático. La recuperación de la apertura pendiente exige la autorización/confirmación específica y conserva su ID original: no pulsar otra apertura como sustituto. Este tramo no ejecuta ese paso. La latencia real de la escritura y su resultado siguen pendientes de acreditación.

La solución coordina una pestaña. Otros clientes/proyectos o escritores manuales pueden seguir ocupando el lock; la custodia y comprobación de ejecuciones siguen siendo necesarias. La lectura observada de ~103 s no se acelera con este delta. Si no llega callback, la escritura sigue esperando; no debe abrirse otro cliente para forzarla. SEMANA, fecha real/CDMX, límites históricos y reglas de cierre permanecen intactos. Revertir a la interfaz anterior reintroduce competencia y recuperación automática de jornadas: conservar QA cerrada al revertir. Sin certificación de operación o producción.
