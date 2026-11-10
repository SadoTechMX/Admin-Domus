# Inicio nuevo de staging con histórico retenido

Base `b5e15b231ee44b0d21d28d7420f01a02924ed487`. Steven decidió comenzar operaciones nuevas sin reconstruir jornadas anteriores, conservándolas como respaldo. Implementación aislada; **sin instalación, activación, lecturas de datos operativos ni escrituras Google**. No acredita caja lista para operar.

## Un solo límite

Se reutilizan `prepararLimiteHistorico` / `registrarLimiteHistorico`, el journal administrativo vacío, las guardas de integridad, ScriptLock y la custodia exacta de las nueve solicitudes del prototipo. Nuevo modo: `STAGING_FRESH_START_V1`; resultado durable: `STAGING_FRESH_START_BOUNDARY`.

No activar primero el aislamiento de nueve solicitudes: cualquier límite existente impide una segunda activación. Los modos anteriores conservan sus alcances y aprobaciones.

El nuevo modo retiene todo el prefijo REQUESTS aprobado, los IDs de cola declarados y los dos turnos/alias del prototipo. FAILED/COMPLETED duplicados siguen siendo conflictos; los IDs ausentes siguen ausentes. No devuelve ACK histórico, reanuda esos IDs ni los convierte en crédito o pagos de la jornada nueva. Referencias bajo otro ID, JSON escapado y salidas del servidor se rechazan antes de efectos. Las siete rutas financieras ya auditadas mantienen la preparación anterior a vincular REQUESTS.

TURNOS permanece OPEN. El registro lleva `resolved:false`, `financialFinal:false`, `newCharge:0`, `inventoryMovement:0`: los dos ceros describen sus efectos administrativos, **no saldos**. La nueva apertura requiere su fondo explícito y evento/proyecto; no hereda ni reinicia fondos anteriores. Su corte incluye el aviso de históricos pendientes y sólo movimientos nuevos vinculados.

## Respaldo y aprobación

La propuesta exige `backup.reference` y `backup.sha256` (SHA-256 hexadecimal de 64 caracteres del archivo privado verificado). Vincula proyecto y ambos libros canónicos, SHA-256 de fuente del backend, mapa de jornadas, prefijos REQUESTS/journal y TURNOS/CORTES_Z originales. Añade una huella de valores/fórmulas y dimensiones de COBROS, CAJA 2, COMANDAS, ACCESO, INVENTARIO, RECETAS CARTA, INSUMOS, MOVIMIENTOS, DEVOLUCIONES y AJUSTES_Z en MAIN y RESURTIDO en OPS; incluye hojas ausentes. No valida fórmulas, stock o saldos.

La huella comercial se recalcula al activar. Cambios entre propuesta y aprobación impiden usar la aprobación anterior. Después se conserva como evidencia del momento, sin congelar fórmulas que legítimamente cambiarán. Los prefijos de identidad y la evidencia del prototipo siguen validándose durante el uso; si cambian, se bloquea sin recalcular automáticamente el límite.

**El servidor no descarga ni verifica el archivo de respaldo.** El operador autorizado debe cotejar existencia, integridad y correspondencia con la propuesta. La copia debe preservar valores, fórmulas, validaciones, notas, formatos e identidades de ambos libros, pareja de código/configuración pertinente sin divulgar secretos y archivos originales de colas/comprobantes. La huella del runtime no sustituye esa copia; el código registra su referencia y SHA-256 como declaración explícita del autorizador.

La propiedad separada `DOMUS_STAGING_FRESH_START_APPROVAL_V1` exige `version:1`, `approved:true`, modo exacto, `snapshotHash`, `approvalReference`, `backupSha256`, `confirmBackupVerified:true`, `confirmLegacyTestWriterDisabled:true` y `acceptUnattributedEffectsUnresolved:true`. El cuerpo repite propuesta/hash y los flags `acknowledgeUnresolvedHistory`, `confirmStationsHeld`, `confirmBackupVerified`, `confirmLegacyTestWriterDisabled`, `acceptUnattributedEffectsUnresolved`, todos verdaderos. Las propiedades de aprobación anteriores no sirven. Se exige Gerencia efectiva y rol autorizado.

No hay aprobación ni huella de respaldo **real** configuradas. Los ejemplos de las pruebas son ficticios y no deben copiarse a Google.

## Bloqueos conservados

- Producción, otro proyecto/libro, prototipo distinto, referencias a sus aperturas en otros movimientos, evidencia obsoleta o segundo límite.
- Identidades malformadas, estados desconocidos/PROCESSING/REQUIRES_REVIEW sin prueba durable de rechazo sin efectos, jornadas históricas fuera de la excepción exacta y fallos inciertos distintos de POS/KDS legado. No se excluyen por antigüedad o jornada ausente.
- Journals incompletos antes de activar, aunque REQUESTS diga COMPLETED; filas huérfanas, fragmentos incompletos, duplicados y corrupción de identidad siguen bloqueando.
- Después del límite, un journal incompleto bloquea apertura/corte, incluso con ledger COMPLETED o acción ajena a POS. Sólo se recupera su mismo ID; no se aparta mediante otro límite. La venta parcial nueva conserva recuperación idempotente.
- Transferencias nuevas sin confirmar, comandas pendientes y merma sin conciliar impiden cortar.

SEMANA, ACTIVIDADES, política bancaria e impresión permanecen intactos. Una hoja ausente en la huella no acredita ese flujo utilizable. El detector conservador puede bloquear coincidencias accidentales con IDs; no se renombra la intención para evadirlo.

## Siguiente paso y autorización concreta

1. Coordinar un operador, detener escritores/pestañas anteriores y conservar sus colas sin abrir un cliente que pueda reenviar. El servidor no descubre colas omitidas ni detiene editores manuales u otros proyectos; ScriptLock sólo serializa este proyecto. Usar perfil QA limpio con dispositivo autorizado; el perfil anterior queda retenido, sin vaciarlo ni copiar su cola al nuevo.
2. Verificar respaldo completo y pareja/proyecto/libros. Con la candidata revisada y cuya instalación haya sido autorizada, obtener la propuesta de sólo lectura; aún no registrar el límite. Conservar propuesta/hash con respaldo y archivos de estaciones. No mezclar colas productivas con staging.
3. Pedir autorización de Steven sobre **esas huellas reales**. Desarrollo autorizado no sustituye activación ni autoriza un despliegue. Texto para completar cuando existan los artefactos:

   > Autorizo exclusivamente en staging el límite único de inicio nuevo de la propuesta [referencia y snapshotHash], respaldada en [referencia y SHA-256]. Confirmo respaldo verificado, estaciones/colas retenidas y escritores anteriores detenidos. Históricos, pendientes y turnos originales permanecen sin conciliar ni cerrar; no se reinician saldos ni se confirma ingreso o entrega. Autorizo el nuevo registro administrativo y su journal vacío, sin replay ni cambios productivos.

4. Después de activación autorizada, comprobar identidad y `turnoEstado` por lectura: límite/modo correctos, `resolved:false`, sin nueva apertura todavía. Luego continuar el ensayo de apertura/venta nueva expresamente acordado, sin repetir ventas retenidas. Si el inventario no coincide o hay journal activo, detener; no ampliar la excepción.

No se incluye script de activación ni se cambian propiedades. Desde cloud no se creó el respaldo real ni se obtuvo su huella: ésta es la comprobación material siguiente, antes de pedir aprobación concreta. No requiere reconstruir todas las jornadas, pero conserva los bloqueos de integridad.

## Reversión y evidencia

Antes de activar puede retirarse la candidata conservando estaciones detenidas. Después, no volver a un backend que ignore el límite, borrar su registro ni restaurar un libro viejo encima de operaciones nuevas. Ante fallo: detener escritores, preservar REQUESTS/journal/colas y reparar hacia adelante o recuperar únicamente el mismo ID administrativo. Una copia permite estudiar/restaurar en entorno separado; no autoriza sobreescribir el origen.

[Suite nueva](../tests/staging_fresh_start_regressions.js): **40 casos PASS**, módulos y bundle reales con mocks. Incluye propuesta sin escrituras, aprobación/entorno/respaldo obsoletos, originales/fondos intactos, duplicados, colas ausentes, Unicode/salidas generadas, journals antes/después, recuperación parcial, concurrencia, cobro/entrega/corte nuevo y transporte nativo/REST sin ACK ni replay tras recarga.

Regresiones locales PASS: aislamiento 80, salidas preparadas 27, historial 27, journal 45, jornadas 23, recuperación 27, transporte de jornada 21, custodia Outbox 8 y salida de revisión 8. Build/manifiesto verificados. Los errores impresos de casos negativos son esperados. La CI debe cotejarse contra el SHA final; no se reutiliza la CI de la base.

Sin validación Google, banco, fórmulas reales, hardware o desempeño de libros grandes. Gemini/Antigravity no han revisado este delta; sus dictámenes anteriores no lo cubren.
