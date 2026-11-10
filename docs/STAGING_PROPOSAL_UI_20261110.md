# Consulta nativa de la propuesta de inicio

Base `a443af16cde4a56735932f70262f598a66379066`. Coordinación reportó backend staging V13 sano y una interfaz anterior sin control para `prepararLimiteHistorico`. Este cambio agrega exclusivamente una vía de consulta; no instala, activa ni modifica datos operativos. No requiere cambiar backend, permisos, credenciales, libros o propiedades de aprobación.

## Acceso soportado

Abrir la **misma URL nativa verificada de staging** con `?vista=propuesta-inicio` (o reemplazar `vista` si ya existe query). El `doGet` de V13 ya entrega `DOMUS_NATIVE_BOOT.view/environment`; por eso no se agregó otro endpoint ni se modifica `Api.gs`.

UI `20261110-staging-proposal-20`, generada en `google-apps-script/Index.html`. Esta vista exige `DOMUS_NATIVE_BOOT.environment=STAGING` y transporte nativo. GitHub Pages/REST, producción y perfiles con cola, intención huérfana o retención local quedan bloqueados antes de autenticar o consultar. La pantalla no arranca Caja/KDS, polling, impresión, migración ni Outbox. Eventos de conexión y almacenamiento no reenvían operaciones; no expone los helpers operativos del frontend.

La petición está fijada a `prepararLimiteHistorico`, rol GERENCIA. Reutiliza `ensureSessionToken` / `authenticatedTransport_`: sesión de Gerencia existente o autenticación normal con la identidad de Google autorizada; renovación una vez ante rechazo explícito de sesión caducada. No copia el token de Caja. Si Google no permite Gerencia, se detiene sin pedir una clave de estación ni crear permisos. La autenticación normal puede crear/renovar una sesión `ses:`; la consulta no escribe REQUESTS, journal, hojas, propiedades de aprobación ni comprobantes.

Antes de consultar, `health` debe devolver STAGING, ambos libros canónicos y el backend fuente exacto:

`4e62e02993a8ec7d69cbe8e97aaa32bf90bfdff4cde13de9928463e23230460a`

Es la misma huella de backend de `a443af1`; los bundles y módulos no cambian. Un build diferente requiere cotejo, no desactivar la comprobación.

## Formulario y resultado

Introducir referencias privadas de respaldo e inventario, SHA-256 real del archivo de respaldo, dispositivos del mapa/inventario de staging (uno por línea) y array JSON de cola con **sólo** `requestId` y `action`. No se piden tokens, secretos ni cuerpos de ventas.

La cola no viene precargada como vacía. Para usar `[]`, primero debe acreditarse que no hay intenciones de staging por incluir. Se exige confirmar el cotejo de destino. Las 15 intenciones offline reportadas por coordinación siguen retenidas por separado mientras corresponda: ausencia en REQUESTS/journal de staging o estado local CONFIRMED no acredita ausencia de efectos productivos. No importar ni descartar una cola por inferencia.

La interfaz valida referencias, huella, campos permitidos y duplicados. Al consultar, verifica el contrato `STAGING_FRESH_START_PROPOSAL`, `canActivate:false`, `resolved:false`, `financialFinal:false`, identidad del backend y correspondencia con los campos enviados; además recalcula SHA-256 de todo el snapshot con la misma serialización canónica del servidor. Una respuesta vacía, alterada o de otro inventario no habilita la descarga.

El resultado permanece sólo en memoria. Se descarga, a petición explícita, un JSON privado con entrada saneada, propuesta y huella; no incluye el sobre de autenticación, tokens ni almacenamiento del navegador. No se guarda en caché local, Outbox o recibos. Modificar el formulario invalida la descarga; si cambió mientras llegaba la respuesta, se debe consultar de nuevo. Una cola que aparezca durante la consulta bloquea la exportación. Recargar borra el formulario/resultado sin hacer consultas ni replay automáticos.

No existe botón ni petición para `registrarLimiteHistorico`, ni se configura `DOMUS_STAGING_FRESH_START_APPROVAL_V1`. La propuesta no exige los flags de activación. Se conservan todas las guardas del backend y su autorización específica posterior.

## Paso de instalación pendiente

1. Conservar copia y hash del **Index actual** del proyecto staging y confirmar que sigue sirviendo el backend V13 con la huella indicada. No tocar el proyecto productivo.
2. Tras autorización de instalación, sustituir únicamente `Index` por `google-apps-script/Index.html` del commit de esta entrega y cotejar su SHA-256 con `release-manifest.json` del mismo commit. Mantener el Código/backend V13, propiedades, libros y deployment canónicos; publicar la nueva versión exclusivamente en el deployment de staging ya verificado. No ejecutar instaladores o harness de ventas.
3. En el perfil QA limpio y la cuenta Google autorizada, abrir la URL nativa con `vista=propuesta-inicio`. Debe mostrarse la pantalla de propuesta sin autenticar, consultar ni sincronizar hasta pulsar «Consultar propuesta · Gerencia».
4. Usar los datos de los respaldos/inventario ya cotejados. Consultar una vez y conservar la descarga privada. Revisar la huella y obtener la aprobación concreta **antes** de cualquier activación separada. Si aparece incompatibilidad, detener; no relajar guardas.

Esta entrega **no ejecuta** ninguno de esos pasos en Google. Si es necesario revertir sólo este control antes de activar, restaurar el Index respaldado conservando backend/datos/colas; no volver a abrir clientes operativos antiguos ni activar otra versión por esa reversión. El control tampoco resuelve una jornada activa o un journal incompleto: esas causas siguen apareciendo en la consulta.

## Verificación aislada

[22 escenarios de Chromium](../tests/browser_staging_proposal.js), con Index generado y backend real en memoria: sesión normal de Gerencia, renovación y token de Caja intacto, propuesta sin writes/replay, download sin secretos, cero polling/impresión, bloqueo de producción/REST/colas, entradas inválidas, principal no autorizado, health incompatible, respuesta vacía/hash alterado/inventario distinto, doble envío y cambios concurrentes de formulario/cola. Todas las llamadas financieras, ampliaciones de filas y replays fallan deliberadamente en el mock si la consulta intenta usarlos.

Regresiones locales: navegación/autenticación Chromium 10, funciones de sesión 14, reconciliación cliente 17, custodia Outbox 8 y transporte maestra 13 PASS. Build/manifiesto verificados; backend idéntico a `a443af1`. CI debe verificarse contra el SHA final. No hubo nueva auditoría del histórico, suites Google ni pruebas de ventas. No se atribuye este delta a revisión de Gemini/Antigravity.
