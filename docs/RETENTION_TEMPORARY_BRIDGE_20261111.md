# Puente temporal para la aprobación específica de retención

> **Tras el timeout confirmado de V16:** no repetir el recorrido anterior. La [corrección de lectura consistente](HISTORY_READ_CONSISTENCY_20261111.md) añade `StagingRetentionReadView.gs` y actualiza el núcleo privado; preservar su entrada y el backend V16. El puente/lector de propiedad de esta entrega siguen intactos. La nueva lectura requiere su revisión y cotejo antes de cualquier instalación o intento.

IMPLEMENTED / LOCAL_TESTED / NOT_INSTALLED. Steven autorizó expresamente preparar este puente para la única huella `708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b`. Permite registrar esa aprobación, nunca activar el límite. Esta entrega no instala archivos, ejecuta Google, escribe propiedades reales ni crea versiones o despliegues.

Sustituye la vía de menú de [RETENTION_PROPERTY_ADMIN_20261111.md](RETENTION_PROPERTY_ADMIN_20261111.md) para el proyecto staging reportado como standalone. El menú no acredita un contenedor y no se usará para eludir ese bloqueo.

## Accesibilidad y alcance exacto

**El puente es accesible por `/dev`; no es editor-only.** Google sirve allí el código guardado más reciente a usuarios con acceso de edición. Las identidades activa/efectiva y `_authContext` no prueban origen en el editor. El puente limita quién y qué puede ejecutar; no oculta el setter detrás de una supuesta distinción de contexto. [Web Apps de prueba](https://developers.google.com/apps-script/guides/web#test_a_web_app_deployment), [Session](https://developers.google.com/apps-script/reference/base/session).

Archivos fuera del bundle, Index y manifiesto de aplicación:

- [StagingRetentionApproval.gs](../scripts/apps-script-admin/StagingRetentionApproval.gs): núcleo privado existente, actualizado con una guarda final opcional bajo lock y su versión. Conservar la entrada privada ya preparada al actualizarlo.
- [StagingRetentionRead.gs](../scripts/apps-script-admin/StagingRetentionRead.gs): `domusInspeccionarRetencionTemporal`, consulta independiente de una sola propiedad; devuelve presencia, huella del valor y hora UTC del servidor, sin imprimir el contenido.
- [StagingRetentionBridge.gs](../scripts/apps-script-admin/StagingRetentionBridge.gs): `domusRegistrarRetencionTemporal`, entrada pública temporal sin parámetros. Se entrega deshabilitada con configuración vacía.

El escritor exige un operador fijado en la copia privada, identidad Google activa y efectiva iguales y autorizadas por `CONFIG.managers`, proyecto/libros/build staging canónicos, autorización fija, diagnóstico completo vigente y ausencia de límite. Sólo puede crear `DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1` si está ausente. Cualquier valor existente —incluso vacío, malformado o revocado— se conserva byte por byte. No enumera otras propiedades ni acepta clave, acción, usuario, artefacto o plazo desde el cliente.

La ventana usa dos literales UTC ISO con milisegundos, `issuedAt` y `expiresAt`, con duración máxima de diez minutos. Se comprueba antes del trabajo, después de adquirir el lock y justo antes de `setProperty`. No se renueva al invocar. Un auxiliar antiguo sin la guarda final se rechaza. La caducidad impide iniciar la escritura al vencer; no cancela una llamada Google ya iniciada.

## Procedimiento para revisión y posterior ejecución acotada

1. Verificar proyecto staging, versión desplegada y respaldo; mantener detenidos clientes, triggers, otros ejecutores y editores de la propiedad y hojas. No ejecutar si hay actividad o identidad incierta. El lock no sustituye esta custodia frente a escritores que no lo usan.
2. Actualizar únicamente el núcleo administrativo con este delta, **preservando `domusRetencionAdminEntrada_` y su evidencia privada**. Cotejar el resto contra Git. Añadir el archivo de lectura. No reemplazar el backend, Index o build, ni crear versión/despliegue. La aprobación se vincula al build y diagnóstico originales.
3. Como Gerencia ya autorizada, seleccionar `domusInspeccionarRetencionTemporal` en el editor y ejecutar. Conservar el resultado mínimo privado. Si hay cualquier valor o error, detener la creación; no borrar, corregir ni sobrescribir. La lectura no abre libros ni cambia datos.
4. Sólo si `present:false`, cotejar el artefacto diagnóstico original y los cinco compromisos privados del núcleo: estaciones retenidas, respaldo verificado, incertidumbre histórica conservada, sólo preparar propuesta y otros escritores detenidos. No publicar artefactos, IDs de cola, propiedades o credenciales.
5. Preparar el archivo escritor con `principal` igual al operador Google autorizado comprobado y fechas UTC absolutas cercanas a la ejecución, usando `serverTimeUtc` como referencia. Máximo diez minutos; nunca calcular un nuevo vencimiento dentro de cada llamada. Guardar esta copia privada sólo cuando todo esté preparado. Desde ese momento puede ser invocado también por `/dev` bajo las mismas guardas.
6. Seleccionar **una vez** `domusRegistrarRetencionTemporal` → Ejecutar, sin argumentos. Revalida la evidencia completa bajo el lock antes de escribir. `CREATED` acredita esa propiedad; `EXISTING_PRESERVED` acredita que no la reemplazó. Una huella cambiada, vencimiento o guarda fallida no autoriza modificar el diagnóstico ni ampliar el plazo y repetir a ciegas.
7. Tras esa única ejecución, **retirar completo `StagingRetentionBridge.gs` y guardar**, tanto si termina bien como si falla o queda incierta. El archivo no puede eliminarse a sí mismo. Si una ejecución sigue en curso, registrar ese estado: retirar código no cancela una ejecución ya iniciada. No lanzar otro escritor mientras no se aclare. No crear versión/despliegue.
8. Con el escritor retirado, usar sólo `domusInspeccionarRetencionTemporal` para cotejar presencia y huella, sin volver a crear. `RETENTION_ADMIN_WRITE_UNCERTAIN_INSPECT_ONLY` exige esta inspección y revisión; no implica ausencia. Comprobar que la función pública escritora ya no está en el código guardado y que la versión desplegada sigue intacta. Conservar evidencia privada de resultado y retirada; después puede retirarse también el archivo de lectura.
9. La propuesta de retención sigue siendo una acción posterior separada. Este auxiliar no llama a `prepararLimiteHistorico` ni `registrarLimiteHistorico`, no fabrica ACK, no reenvía colas, no concilia ingresos y no cambia REQUESTS, journal o registros comerciales. La activación permanece sin autorizar.

## Límites y pruebas

No existe garantía técnica de una sola **invocación**: bajo lock sólo se crea una vez mientras exista la propiedad, y toda llamada posterior conserva el valor. Tras un rechazo sin escritura, otra llamada podría intentarse durante la ventana; por eso se exige una sola ejecución operativa y retirada inmediata. No se añade un marcador persistente ni se borra propiedad alguna. La exposición `/dev` dura hasta retirar el archivo; la caducidad bloquea escrituras pero no retira código. La versión `/exec` no se actualiza por guardar, aunque la propiedad de proyecto es compartida por las ejecuciones del mismo proyecto. [Despliegues](https://developers.google.com/apps-script/concepts/deployments), [Properties](https://developers.google.com/apps-script/guides/properties).

PropertiesService no aporta compare-and-set frente a editores externos. Mantener su custodia durante la validación y escritura. La ruta completa del build `2189540` puede tardar o agotar tiempo; no se acortan huellas ni se presume éxito por una pantalla sin respuesta.

51 casos PASS en `tests/retention_bridge_regressions.js` con código real y servicios en memoria: acceso no autorizado; llamada pública con identidad válida y contexto nulo (documenta el riesgo `/dev`); parámetros rechazados; huella fija; evidencia, respaldo, cola y journal cambiados; expiración antes/durante lock y revalidación; valores existentes preservados; error posterior a escritura; confidencialidad; retirada del escritor conservando lectura. Los positivos sustituyen sólo en el fixture la autorización por una huella sintética; la huella real sin sustituir rechaza ese fixture.

62 regresiones del núcleo/menú pasan; sintaxis y paridad de artefactos pasan. Ninguna prueba acredita ejecución Google, latencia real, retirada remota o preparación para operar. Gemini/Antigravity no han revisado este delta; no se les atribuye esta validación. La CI debe cotejarse con el SHA exacto de entrega.
