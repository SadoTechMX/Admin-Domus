# Consulta nativa de la propuesta de inicio

Base backend `a443af16cde4a56735932f70262f598a66379066`; adaptación de formulario sobre `9f37f9e3fe91ba94563f453c5a3b832a897f4706`. Coordinación reportó backend V13 e interfaz V14 instalados, inventario de 14 perfiles Chrome cerrados de iMac y 15 intenciones github.io de destino histórico desconocido; Steven indicó que las pruebas se realizaron sólo allí. Es evidencia recibida, no una nueva lectura desde cloud. Esta adaptación está LOCAL_TESTED, no instalada. No requiere cambiar backend, permisos, credenciales, libros o propiedades de aprobación.

## Acceso soportado

Abrir la **misma URL nativa verificada de staging** con `?vista=propuesta-inicio` (o reemplazar `vista` si ya existe query). El `doGet` de V13 ya entrega `DOMUS_NATIVE_BOOT.view/environment`; por eso no se agregó otro endpoint ni se modifica `Api.gs`.

UI `20261110-retained-inventory-21`, generada en `google-apps-script/Index.html`. Esta vista exige `DOMUS_NATIVE_BOOT.environment=STAGING` y transporte nativo. GitHub Pages/REST, producción y perfiles con cola, intención huérfana o retención local quedan bloqueados antes de autenticar o consultar. La pantalla no arranca Caja/KDS, polling, impresión, migración ni Outbox. Eventos de conexión y almacenamiento no reenvían operaciones; no expone los helpers operativos del frontend.

La petición está fijada a `prepararLimiteHistorico`, rol GERENCIA. Reutiliza `ensureSessionToken` / `authenticatedTransport_`: sesión de Gerencia existente o autenticación normal con la identidad de Google autorizada; renovación una vez ante rechazo explícito de sesión caducada. No copia el token de Caja. Si Google no permite Gerencia, se detiene sin pedir una clave de estación ni crear permisos. La autenticación normal puede crear/renovar una sesión `ses:`; la consulta no escribe REQUESTS, journal, hojas, propiedades de aprobación ni comprobantes.

Antes de consultar, `health` debe devolver STAGING, ambos libros canónicos y el backend fuente exacto:

`4e62e02993a8ec7d69cbe8e97aaa32bf90bfdff4cde13de9928463e23230460a`

Es la misma huella de backend de `a443af1`; los bundles y módulos no cambian. Un build diferente requiere cotejo, no desactivar la comprobación.

## Formulario y resultado

Introducir referencia/SHA-256 real del respaldo y, por separado, referencia/SHA-256 real del manifiesto de custodia, total de intenciones retenidas según ese manifiesto, dispositivos del mapa/inventario de staging (uno por línea) y array JSON con **sólo** `requestId` y `action` originales. No cargar aquí el manifiesto completo, archivos del navegador, tokens, estados locales ni cuerpos de ventas. La referencia del manifiesto admite hasta 100 caracteres, sin `|` ni controles; su huella debe ser SHA-256 hexadecimal minúsculo de 64 caracteres.

El inventario es una lista de intenciones **retenidas sin atribución de destino (`UNKNOWN`)**, no una afirmación de que se enviaron a staging. Incluye las 15 reportadas, también la que conserva `CONFIRMED` local. La ausencia en REQUESTS/journal de staging no acredita ausencia de efectos. La consulta no importa el contenido a Outbox, no modifica estados ni inventa ACK, ingresos o entregas. Los originales permanecen bajo custodia fuera del perfil QA. Esta semántica sustituye la etiqueta de V14 «destino staging verificado»; no usar aquella declaración para estas intenciones.

El checkbox requiere cotejar el inventario completo contra el manifiesto y mantener originales sin reenvío. El total declarado debe coincidir exactamente con los pares; duplicados, claves extra o entradas incompletas se rechazan antes de autenticar. Cola y total no vienen precargados: `[]`/0 sólo corresponden a un inventario retenido realmente vacío, nunca al caso de las 15.

Se utiliza el campo existente `evidenceReference`, sin modificar el motor ni agregar parámetros de activación. Su formato exacto es `RETAINED_UNKNOWN_V1|<SHA-256 del manifiesto>|<cantidad>|<referencia privada>`, menor de 200 caracteres. El backend incorpora esa cadena completa y los pares exactos en `snapshotHash`; la UI exige igualdad de ambos en la respuesta y recalcula la huella. Cambiar manifiesto, cantidad o pares exige otra propuesta. Los IDs se conservan sin normalizar y el backend mantiene su validación de identidad.

El manifiesto privado debe conservar procedencia/perfiles, pares, estados observados, destinos UNKNOWN, referencias/huellas de los originales y alcance de custodia. **La pantalla no lee ese archivo ni verifica su contenido:** el cotejo de los 15 pares y la huella del archivo se hace sobre la evidencia ya preservada, sin abrir clientes. El formulario no puede detectar un total y una huella declarados incorrectamente si son coherentes con los pares introducidos. La vinculación criptográfica impide sustituir esa declaración en una propuesta ya obtenida; no certifica la veracidad del manifiesto.

El respaldo reportado excluye ScriptProperties secretas. Mantener esa exclusión explícita: respaldo de libros/código no equivale a una restauración completa del proyecto. No exportar secretos para completar el formulario ni marcar verificación fuera del alcance real del respaldo.

La interfaz valida referencias, huella, campos permitidos y duplicados. Al consultar, verifica el contrato `STAGING_FRESH_START_PROPOSAL`, `canActivate:false`, `resolved:false`, `financialFinal:false`, identidad del backend y correspondencia con los campos enviados; además recalcula SHA-256 de todo el snapshot con la misma serialización canónica del servidor. Una respuesta vacía, alterada o de otro inventario no habilita la descarga.

El resultado permanece sólo en memoria. Se descarga, a petición explícita, un JSON privado `DOMUS_STAGING_FRESH_START_PROPOSAL_V2` con entrada saneada, propuesta/huella y `retainedInventory` (`kind: DOMUS_RETAINED_INVENTORY_V1`, `destination: UNKNOWN`, `resolved: false`, cantidad y referencia/huella del manifiesto). Este metadato se deriva de la misma referencia incluida en el snapshot; no se envía como otro campo al backend. La descarga no incluye el sobre de autenticación, tokens ni almacenamiento del navegador. No se guarda en caché local, Outbox o recibos. Modificar el formulario invalida la descarga; si cambió mientras llegaba la respuesta, se debe consultar de nuevo. Una cola que aparezca durante la consulta bloquea la exportación. Recargar borra el formulario/resultado sin hacer consultas ni replay automáticos.

No existe botón ni petición para `registrarLimiteHistorico`, ni se configura `DOMUS_STAGING_FRESH_START_APPROVAL_V1`. La propuesta no exige los flags de activación. Se conservan todas las guardas del backend y su autorización específica posterior. **Consultar no activa el bloqueo de IDs:** hasta una activación separada y autorizada, la protección de esas colas sigue siendo su custodia offline. No abrir perfiles antiguos como prueba de esta pantalla. La futura retención en staging no modifica ni protege por sí sola el backend productivo.

## Paso de instalación pendiente

1. Conservar copia y hash del **Index actual** del proyecto staging y confirmar que sigue sirviendo el backend V13 con la huella indicada. No tocar el proyecto productivo.
2. Tras autorización de instalación, sustituir únicamente `Index` por `google-apps-script/Index.html` del commit de esta entrega y cotejar su SHA-256 con `release-manifest.json` del mismo commit. Mantener el Código/backend V13, propiedades, libros y deployment canónicos; publicar la nueva versión exclusivamente en el deployment de staging ya verificado. No ejecutar instaladores o harness de ventas.
3. En el perfil QA limpio y la cuenta Google autorizada, abrir la URL nativa con `vista=propuesta-inicio`. Debe mostrarse la pantalla de propuesta sin autenticar, consultar ni sincronizar hasta pulsar «Consultar propuesta · Gerencia».
4. Usar referencias/huellas reales de respaldo y manifiesto ya cotejados. Declarar 15 y pegar los 15 pares originales, sin cuerpos ni clasificación inventada. Consultar una vez; cotejar entrada/snapshot, cantidad 15, clasificación UNKNOWN, referencia/huella del manifiesto y `canActivate:false`, `resolved:false`, `financialFinal:false`. Conservar la descarga privada. Revisar la huella y obtener la aprobación concreta **antes** de cualquier activación separada. Si aparece incompatibilidad, detener; no relajar guardas.

Esta entrega **no ejecuta** ninguno de esos pasos en Google. Si es necesario revertir sólo este control antes de activar, restaurar el Index respaldado conservando backend/datos/colas; no volver a abrir clientes operativos antiguos ni activar otra versión por esa reversión. El control tampoco resuelve una jornada activa o un journal incompleto: esas causas siguen apareciendo en la consulta.

## Verificación aislada

[34 escenarios de Chromium](../tests/browser_staging_proposal.js), con Index generado y backend real en memoria: 15 pares sintéticos exactos (14 con revisión y 1 con confirmación local en archivo de prueba), vínculo de manifiesto, omisiones/duplicados/claves extra, cambio de manifiesto concurrente, respuesta con otro manifiesto o un par omitido aun con hash recalculado, journal activo bloqueante y las 22 regresiones anteriores. Cada caso coteja hojas, REQUESTS/journal, localStorage y propiedades originales sin cambios; sólo puede crearse la sesión normal de Gerencia. Las llamadas financieras, ampliaciones de filas y replays fallan deliberadamente en el mock si se intentan. Descarga sin secretos ni cuerpos privados de fixture; cero red Google/REST/impresión.

**Límite de evidencia:** los 15 pares reales no están disponibles en este host. No se usaron ni publicaron IDs o archivos reales; esta suite no sustituye el cotejo exacto de la descarga con el manifiesto privado original. No hubo nueva revisión Gemini/Antigravity ni nuevas lecturas de datos.

Regresiones de esta adaptación: navegación/autenticación Chromium 10, guardrails y build/manifiesto. Backend, Build.gs y ambos bundles deben permanecer byte por byte idénticos a `9f37f9e`/`a443af1`. CI debe verificarse contra el SHA final. No hubo auditoría histórica adicional, suites Google ni ventas.
