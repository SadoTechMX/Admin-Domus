# Validación de salidas antes de preparar operaciones retenidas

Base `80cfd82ef7db854679ca14dd455ba9876ea58f2f`. Corrección aislada, sin deployment, activación ni acceso a datos operativos. La revisión independiente confirmó los tres casos corregidos en esa base, pero encontró este residual; no activar la base por su CI verde.

## Reproducción

Se reprodujeron ambos casos con los módulos y el bundle STAGING de `80cfd82`, usando libros en memoria:

- Una sesión CAJA con operador `QA fixture-opening-0` incorporaba una referencia retenida mediante `openedBy`.
- Un requestId que no contenía una referencia retenida generaba un `shiftId = TURNO-<requestId>` coincidente con un turno original.

En ambos casos se escribían REQUESTS REQUIRES_REVIEW y journal PREPARED; las siguientes lecturas y reintentos fallaban. COBROS seguía sólo con encabezados. Validar únicamente el payload no alcanzaba: faltaban datos añadidos por servidor y la salida efectiva persistida.

## Cambio

`historyGuardPrepared_` valida el plan serializado completo y el resultado antes de la preparación durable. Cubre valores nuevos, imágenes anteriores, metadatos, JSON escapado y datos generados. `journalCommit_` obtiene/valida esa evidencia antes de crear el journal o ampliar filas; guarda exactamente la representación serializada validada. `journalResume_` también valida plan/resultado antes de devolver un ACK o aplicar efectos. El registro administrativo original conserva su excepción acotada y la validación independiente de inventario/plan vacío.

Cuando está activa la custodia exclusiva de staging, las siete rutas financieras que sólo leen/construyen un plan antes de `journalCommit_` difieren la primera escritura de REQUESTS hasta aceptar la preparación:

`turnoAbrir`, `corteZCerrar`, `cajaSimpleRegistrar`, `confirmarTransferencia`, `cancelarTransferenciaNoRecibida`, `vincularPagoExistente`, `comandasSimpleAccion`.

La lista es explícita: no se puede añadir una función que escriba antes del journal. La primera vinculación sigue bajo el mismo ScriptLock y precede PREPARED y todos los efectos. Incluye comprobación de identidad/acción/libro y rechaza preparaciones anidadas o ajenas. Una salida temprana sin journal también se serializa una sola vez, se valida y sólo entonces se vincula.

Si se rechaza durante esa preparación de sólo lectura, no se crea REQUESTS ni journal. No se borra ni se marca COMPLETED una intención anterior. Al comenzar cualquier intento de persistencia, incluso si falla el write/flush, se conserva la incertidumbre y el comportamiento de recuperación con el mismo ID. Las operaciones ya vinculadas nunca vuelven a la ruta de preparación diferida; sus hashes, permisos y replays permanecen vinculados al original.

Fuera de la custodia acotada no se difiere la escritura inicial del ledger. Las demás acciones conservan su comportamiento de vinculación; la guarda del plan evita sus efectos si existe una referencia retenida. No se amplió el conjunto de históricos excluidos, ni se cambió la política de cierre/entrega, el frontend o la impresión.

## Evidencia y límites

[Suite específica](../tests/staging_prepared_output_regressions.js): **27 casos PASS**. Incluye las dos reproducciones en módulos/bundle, operador/catálogo/folios de POS, imágenes anteriores, serialización efectiva, ampliación de filas, salidas tempranas, vinculación única antes de efectos, recuperación parcial con el mismo ID, fallo de persistencia incierto, plan antiguo ya contaminado y exclusión de concurrencia/preparación anidada. Las rutas completas de confirmación de transferencia, cancelación y pago existente más KDS/corte pasan con evidencia explícitamente ficticia, sólo en memoria.

Transporte nativo y REST: carrito e ID permanecen en Outbox REQUIRES_REVIEW, sin comprobante, sin escritura financiera y sin replay automático tras recarga. Se conserva el bloqueo local para revisión; este cambio no autoriza limpiar la cola o reemplazar su ID automáticamente.

Regresiones locales: aislamiento 80, límite histórico 27, journal 45, jornadas 23, recuperación 27, transporte de jornada 21, identidad persistida 24 e ID raíz 15 PASS. Errores impresos por escenarios negativos son esperados. Build/manifiesto se regeneraron; CI debe cotejarse contra el SHA final.

Un PREPARED o REQUESTS incierto ya creado por una versión anterior **no se repara automáticamente**. Las pruebas verifican que se conserva y bloquea. Un error de escritura después de aceptar el plan tampoco se reclasifica como rechazo sin efectos. Las filas ampliadas vuelven a comprobar sus validaciones heredadas antes de preparar el journal; un fallo después de esa ampliación conserva incertidumbre y no aplica el valor financiero. No se acredita banco, hardware, stock, fórmulas productivas ni compatibilidad instalada; sigue siendo necesaria revisión independiente del delta y autorización específica antes de activar en staging.
