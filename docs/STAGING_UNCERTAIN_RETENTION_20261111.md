> Aprobación específica recibida para una huella concreta: [auxiliar privado del editor](RETENTION_PROPERTY_ADMIN_20261111.md). Permite inspección y creación acotada de la propiedad con identidad Gerencia; no cambia el Web App ni autoriza activación. No ejecutado en Google.

> Actualización de lectura del 11 noviembre: [optimización y pareja requerida](HISTORY_READ_OPTIMIZATION_20261111.md), UI `20261111-history-read-23`. Sustituye la versión/hash de instalación de esta nota, conserva el contrato y las aprobaciones. Corrección no instalada; no repetir la consulta real pendiente.

# Retención específica de 17 grupos inciertos en staging

Base `e17068a600a793303c7f8ea4b3906e66e95873ff`. Coordinación informó que la consulta real V15 se detuvo en un FAILED de acceso, y que su respaldo contiene 17 grupos bloqueantes: 15 accesos y 2 guardarropa, sin journal, además de las nueve solicitudes del prototipo ya contempladas. No hay otros rechazos 422 acreditados según ese cotejo. No se leyeron esos registros desde cloud ni se publican sus IDs; las pruebas de esta entrega usan datos sintéticos.

## Alcance cerrado

Se reutilizan `prepararLimiteHistorico`, `registrarLimiteHistorico`, el modo `STAGING_FRESH_START_V1`, las guardas de identidad/journal, el mismo lock y la custodia existente. No hay otro motor ni un reset de datos. La excepción nueva sólo admite **exactamente 17 grupos**: 15 de `accesoSimpleRegistrar` y 2 de `guardarropaDevolver`. Todas las apariciones de cada ID deben ser FAILED, de la misma acción, sin journal ni vínculo de jornada. Duplicados FAILED del mismo grupo permanecen identificados; mezcla FAILED/COMPLETED, acciones mezcladas, PROCESSING/REQUIRES_REVIEW, otros tipos, 16/18 grupos o proporción distinta bloquean.

La acción de guardarropa debe coincidir con el literal real. Si los dos grupos tienen otra acción, no sustituirla ni ampliar el alcance por inferencia. Las nueve solicitudes del prototipo conservan su contrato exacto. Los rechazos explícitos sin efectos mantienen su tratamiento anterior; los 17 no se convierten en ellos.

## Diagnóstico, aprobación de retención y propuesta

1. Gerencia usa la misma pantalla nativa `vista=propuesta-inicio`, perfil QA limpio y manifiesto de los 15 pares UNKNOWN. La sesión/rol y los libros/proyecto de staging siguen siendo obligatorios. La consulta no escribe REQUESTS, journal, hojas ni propiedades de aprobación.
2. Tras pasar las guardas existentes, si detecta el conjunto exacto sin aprobación vigente, devuelve `STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1`: `canActivate:false`, `resolved:false`, `financialFinal:false`, `approvalRequired:true`, `evidence` y `evidenceHash`. **No contiene `snapshot` ni `snapshotHash`.** La UI permite descargar únicamente ese diagnóstico privado y lo identifica como tal.
3. La evidencia incluye pares ID/acción, filas físicas y huella de valores/fórmulas de cada grupo; prefijo REQUESTS/journal; proyecto/libros/build; mapa de jornadas; huella de colas y referencia del manifiesto; respaldo y huella comercial. No exporta RESPONSE, cuerpos de ventas, identidades de clientes o credenciales. Un cambio de datos, colas, manifiesto, respaldo o mapa exige otra aprobación.
4. Un operador autorizado podrá configurar **sólo después de aprobación humana específica** la propiedad `DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1`. La aplicación no la escribe. Contrato requerido: `version:1`, `mode:STAGING_ACCESS_WARDROBE_17_V1`, `approved:true`, `evidenceHash` exacto del diagnóstico revisado, `approvalReference` privada (1–200 caracteres), `confirmStationsHeld:true`, `confirmBackupVerified:true`, `acknowledgeUnresolvedHistory:true`. No usar hashes o aprobaciones sintéticos de los tests.
5. La siguiente consulta, bajo el mismo lock, vuelve a comprobar toda la evidencia. Sólo si coincide genera la propuesta normal y su `snapshotHash`, incorporando `retainedUncertain` y `counts.retainedUncertainIds:17`. Los 17 se suman a los inciertos; no desaparecen de la evidencia ni se consideran conciliados.

Texto para la aprobación **futura**, a completar con evidencia real:

> Autorizo exclusivamente preparar la propuesta de retención en staging de los 17 grupos identificados por la huella [evidenceHash] y el respaldo [referencia/SHA-256]. Confirmo custodia sin reenvío y respaldo verificado dentro de su alcance documentado. Sus efectos permanecen inciertos; no autorizo resolverlos, borrarlos, confirmar ingresos/entregas ni activar el límite.

Esta aprobación **no sustituye** la de `DOMUS_STAGING_FRESH_START_APPROVAL_V1`. Registrar el límite sigue exigiendo la propuesta/hash exactos y todos los flags anteriores. Una aprobación de retención ausente, revocada o desactualizada impide la primera activación. Después de una activación aprobada, la custodia ya asentada depende de la evidencia durable, no de mantener una propiedad temporal: eliminar esa propiedad no libera los IDs ni borra el límite.

## Protección y límites

Consultar o aprobar el diagnóstico no instala una barrera de servidor. Hasta activar por separado un límite válido, los clientes originales deben permanecer cerrados y sus colas bajo custodia offline. Tras activación autorizada, la barrera existente retiene el prefijo completo y las colas: los 17 IDs y referencias a ellos se rechazan antes de ACK, nuevo binding o replay, incluso desde lectores de recuperación. Los originales FAILED, turnos y valores comerciales permanecen intactos; sólo se permite el registro administrativo y journal vacío ya definidos.

Journals activos, huérfanos o incompletos siguen bloqueando. Un ID retenido añadido después del límite bloquea en vez de adoptarse como nuevo. El corte posterior cubre sólo la jornada nueva; no acredita saldos, stock, ingresos ni entregas anteriores. No cambiar el requestId para reconstruir una operación retenida. La retención de staging no protege por sí sola producción.

El lock serializa operaciones de este proyecto; no detiene ediciones manuales ni escritores externos. Las declaraciones de custodia y respaldo siguen requiriendo cotejo humano. El respaldo reportado excluye ScriptProperties secretas: conservar ese límite, no pedir ni exportar secretos para este flujo. No se exige reconstruir jornadas históricas para obtener el diagnóstico.

## Código y siguiente paso

UI `20261111-uncertain-retention-22`. **Esta entrega requiere una nueva pareja backend + Index de staging**; sustituye la instrucción anterior de actualizar sólo Index. La UI exige la huella exacta del nuevo backend y no aceptará el V13 anterior. No se cambian `Auth.gs`, rutas, permisos, acciones de cobro, impresión ni fórmulas de hojas.

Antes de una instalación autorizada: revisar el delta, respaldar la pareja actual y cotejar ambos artefactos con `release-manifest.json` del mismo SHA. No configurar aprobación ni ejecutar instaladores. Tras instalación autorizada, obtener el diagnóstico por la pantalla normal, cotejar los 17 grupos contra el respaldo privado y solicitar la aprobación específica de esa huella. No activar por esta entrega.

Antes de activar, una reversión de código puede restaurar la pareja respaldada manteniendo clientes antiguos cerrados, datos y colas intactos. Después de un límite durable, no volver a código que lo ignore; usar recuperación compatible hacia adelante. No limpiar propiedades, REQUESTS o journals como mecanismo de reversión.

## Evidencia de pruebas

**Resultados locales: 40 casos de retención, 40 de Chromium, 40 de inicio nuevo, 27 de límite histórico, 80 de custodia anterior y 4 guardrails PASS; build/manifiesto y sintaxis verificados.** Hay solapamiento entre suites. CI debe verificarse contra el SHA final.

`tests/staging_uncertain_retention_regressions.js` ejecuta módulos y bundle STAGING reales con servicios en memoria: diagnóstico sin snapshot, aprobación exacta, guardas de alcance, huellas obsoletas, journals, roles/entorno, lock, autorización de activación separada, custodia y anti-replay de los 17, conservación de originales y jornada nueva con corte. No se hizo una activación real: las aprobaciones y límites de esos tests son sintéticos.

`tests/browser_staging_proposal.js` usa el Index generado y dispatcher real con mocks. Añade descarga de diagnóstico sin cuerpos/snapshotHash, aprobación sólo configurada explícitamente por el fixture, propuesta posterior sin activación y rechazo de respuestas alteradas. Toda llamada de escritura, binding, replay o ampliación de hojas durante la consulta falla en el mock. Comprueba almacenamiento y datos sin cambios; sólo permite la sesión normal de Gerencia.

Los IDs reales y la pareja instalada no están acreditados por estas suites. No se atribuye este delta a una revisión de Gemini/Antigravity. Producción, Google y colas reales no se modificaron.
