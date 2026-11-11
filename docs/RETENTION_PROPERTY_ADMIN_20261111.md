# Aprobación de retención: utilidad privada del editor

IMPLEMENTED / LOCAL_TESTED. No instalada, ejecutada en Google ni activada. Steven autorizó **preparar la propuesta**, reteniendo los 17 grupos de staging vinculados a `708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b`; no autorizó activar el límite. Esa huella queda fijada en el código. La evidencia real permanece privada; los casos positivos usan una autorización sintética explícita sólo dentro del fixture.

## Vía mínima y alcance

Archivo: [`scripts/apps-script-admin/StagingRetentionApproval.gs`](../scripts/apps-script-admin/StagingRetentionApproval.gs). Es un auxiliar **del editor**, fuera de módulos, bundle y Web App. No se cambia `BACKEND_BUILD`, Index, dispatcher ni permisos: reemplazar el backend podría invalidar la huella que Steven ya aprobó. El auxiliar necesita su propio cotejo de archivo/SHA; la huella del backend no acredita el archivo auxiliar añadido.

La limitación de cincuenta propiedades es de la edición manual: Google indica usar métodos programáticos para cantidades mayores. Se usa `getProperty`/`setProperty` de una sola clave, nunca enumeración, escritura masiva ni borrado. [Documentación oficial de Properties](https://developers.google.com/apps-script/guides/properties).

La clave única es `DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1`. La inspección devuelve presencia, SHA-256 del texto exacto y si su estructura corresponde a la autorización fijada. No imprime el valor, referencia privada, email, cuerpos de operaciones ni otras propiedades. Un error de lectura no se interpreta como ausencia.

Todas las funciones terminan en `_`: no pueden invocarse desde `google.script.run`; no se añade ninguna acción al dispatcher. Se exige identidad Google activa y efectiva iguales, no vacías y pertenecientes a `CONFIG.managers`, sin contexto de llamada Web App. Si Google no proporciona la identidad, se detiene; no usar el ejecutor propietario como sustituto del usuario. [Funciones privadas](https://developers.google.com/apps-script/guides/html/communication#private_functions), [identidades de Session](https://developers.google.com/apps-script/reference/base/session).

Sólo admite el proyecto staging `1sh5fyAaa0onlNsNZ40EokGumubebYEMisTGZ8rNj75gBiOsYPkA-rV4O`, sus libros canónicos y los builds conocidos de `2189540` o `178008c`. Además, el build actual debe coincidir con el incluido en el diagnóstico autorizado. No se ajustan hashes para forzar coincidencias.

## Procedimiento de ejecución por Gerencia (no ejecutado en esta entrega)

1. Conservar respaldo del código del editor y mantener detenidos clientes, triggers/escritores externos y **editores de la propiedad**. Cotejar el proyecto staging y el bundle actual contra el respaldo aprobado. Esta entrega no realiza esas acciones remotas.
2. En el editor de ese proyecto, con la cuenta de Gerencia autorizada, añadir únicamente el auxiliar como archivo `.gs`. No sustituir el bundle, crear versión, desplegar ni ejecutar instaladores. No cargarlo en producción. No crear un trigger ni una ruta pública para ejecutarlo.
3. Seleccionar y ejecutar `domusInspeccionarAprobacionRetencion_`. Sólo lee la propiedad específica bajo el lock. Guardar el resultado mínimo en la evidencia privada. `present:false` es la condición para poder crear; cualquier error exige detenerse.
4. Si `present:true`, conservar **todos sus bytes**. No vaciar, corregir, sobrescribir ni borrar, incluso si el valor es vacío, malformado, revocado o de otra huella. `approvalForAuthorizedHash:true` informa correspondencia estructural, no vigencia actual de los libros. Si es falso, se necesita resolver ese conflicto por separado; el auxiliar no lo modifica.
5. Sólo si está ausente, completar `domusRetencionAdminEntrada_` en la **copia privada del editor**: `artifact` es el objeto completo de la descarga `DOMUS_STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1`, con su `diagnostic` y `input` originales; `approvalReference` identifica la autorización de Steven (sin credenciales); `expectedPropertyState:'ABSENT'`; y los cinco booleanos `confirmStationsHeld`, `confirmBackupVerified`, `acknowledgeUnresolvedHistory`, `confirmOnlyPrepareProposal`, `confirmPropertyWritersStopped` en `true` únicamente tras verificarlos. No publicar ese objeto con los IDs privados ni alterar su entrada para que coincida.
6. Ejecutar **una vez** `domusRegistrarAprobacionRetencion_`. Bajo el mismo lock, vuelve a comprobar ausencia, artefacto/hash autorizados, proyecto/build, ausencia de límite y diagnóstico completo mediante el validador existente. Relee la propiedad inmediatamente antes de crear y verifica el texto guardado. No llama a `registrarLimiteHistorico`, no genera un ACK ni escribe en REQUESTS, journal o tablas comerciales.
7. `CREATED` acredita sólo esa propiedad y la comprobación realizada; incluye en el valor guardado autor efectivo, timestamp, referencia, hash y versión de herramienta. `EXISTING_PRESERVED` significa que ya había un valor y no se escribió; puede ocurrir después de perder una respuesta. `RETENTION_ADMIN_WRITE_UNCERTAIN_INSPECT_ONLY` requiere **sólo inspección** antes de decidir otro paso: no borrar, revertir automáticamente ni repetir el setter. Si la evidencia cambió, obtener y revisar un nuevo diagnóstico; la autorización actual no cubre otra huella.
8. Una vez cotejado el resultado, la pantalla normal de Gerencia puede preparar la propuesta. Esta utilidad no la consulta automáticamente ni activa nada. La aprobación y acción de activación permanecen separadas y no autorizadas por este encargo.

## Concurrencia y límites

El lock serializa el auxiliar con las operaciones de este proyecto; la comprobación final detecta otro valor surgido durante la revalidación. PropertiesService no ofrece una operación condicional atómica frente a un editor/escritor que ignore el lock. Por eso se exige confirmar que esos escritores estén detenidos; si no se puede acreditar, no ejecutar la creación. Tampoco hay una captura atómica frente a ediciones manuales de Sheets: mantener la custodia vigente.

El build `178008c` reutiliza su vista de lectura por consulta. `2189540` conserva el recorrido anterior, posiblemente lento: el auxiliar no evade un timeout ni reduce la evidencia. Antes del único `setProperty` no hay escritura de aprobación; si el fallo ocurre durante/después, el estado se declara incierto. La inspección posterior es acotada y no abre libros.

La aprobación sólo permite preparar la propuesta de retención; no concilia efectos, no acredita dinero/banco/entrega y no protege por sí sola producción. No cambia las 15 intenciones UNKNOWN ni libera colas. No crea sesiones de Gerencia ni amplía la lista de usuarios autorizados.

## Pruebas

50 casos PASS en `tests/retention_property_admin_regressions.js`: módulos/bundle reales; más de cincuenta propiedades; ausencia y valores existentes intactos; pin de autorización; identidad activa/efectiva, entorno/proyecto/libros/build; flags; evidencia obsoleta/alterada; journal incompleto; exclusión mutua y cambio concurrente detectado; errores antes/después de guardar; lectura posterior; confidencialidad y ausencia de rutas públicas. El código real de registro/diagnóstico sigue vigente y el auxiliar no tiene llamadas de operación o escritura de hojas.

Prueba local adicional PASS con el bundle inmutable completo `2189540` obtenido de Git, sólo servicios en memoria: una propiedad sintética nueva, libros intactos y sin límite. Build/manifiesto y sintaxis pasan; los artefactos de aplicación son idénticos a `178008c`. La CI debe verificarse contra el nuevo SHA. No hubo lecturas de propiedades reales, Google, instalación, activación, ventas ni revisión nueva de Gemini/Antigravity.
