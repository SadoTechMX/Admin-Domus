# Caja: vista, rol y desbloqueo — corrección aislada

Base `889f47aabe28ff729f46b1dd0f6b3273711e0ea3`, reportada por coordinación como instalada en staging V11. Este tramo no abrió ese despliegue ni Google; investigó el código exacto y servicios mock. UI resultante: `20261110-station-routing-19`.

## Hallazgos

1. `syncBackendData` consultaba `cajaSimpleDatos` fuera de Caja mientras `phaseSyncedFromServer` era falso. `getStationRole` devolvía correctamente BARRA en Comandas; la combinación enviaba una lectura financiera con BARRA y el servidor la rechazaba correctamente. Darle más permisos a BARRA no es la solución.
2. `loadInitialData` iniciaba consultas con la vista inicial CAJA antes de `initRouting`. Una estación limpia dirigida a Comandas/Accesos o con Caja bloqueada podía iniciar una autenticación de CAJA ajena a su vista. En la reproducción anónima, aparecían simultáneamente el bloqueo de Caja y otro formulario de credencial.
3. `unlockCajaWithPin` autenticaba por separado. Una respuesta de autenticación de fondo rechazada después de un desbloqueo correcto abría otro formulario pese a existir ya una sesión CAJA. La reproducción con respuesta tardía dejó la vista Caja activa y ese segundo modal abierto. El caso de Gerencia sin retraso sí cerró el modal en la base: no se afirma que se haya identificado visualmente cuál de los dos diálogos quedó abierto en staging.

## Cambio y permisos

- Se inicializan los datos locales y listeners, se resuelve la ruta y después se inician las consultas de vista y polling. Caja sólo consulta sus datos en modo Caja; Comandas y Accesos usan sus rutas autorizadas. La fase inicial se muestra «sin consultar» hasta recibirla del servidor.
- Mientras el diálogo de bloqueo de Caja está abierto, `syncBackendData` no solicita datos ni otra autenticación. Cancelar regresa a Comandas e inicia su consulta. No se cambia el tratamiento de Outbox ni sus IDs, retenciones o roles originales.
- El desbloqueo impide doble envío y exige una respuesta de sesión CAJA. Si se canceló el diálogo durante la espera, la respuesta no cambia la vista ni guarda autorización local. El campo de credencial se vacía al enviarlo.
- `ensureSessionToken` vuelve a comprobar la sesión del mismo rol al completar el primer intento de login: una sesión ya establecida por el desbloqueo explícito impide que una respuesta anterior abra otro formulario o reemplace ese token. No toma tokens de otro rol.
- No cambia `Auth.gs`, la matriz de permisos, la lista de Gerencia ni propiedades de credenciales. Una identidad Google que el servidor ya reconoce como Gerencia puede obtener sesión sin credencial de estación según el contrato existente. Un usuario no reconocido sigue necesitando su credencial existente; vacío o incorrecto continúa rechazado. La UI explica esa diferencia sin conceder acceso por cuenta propia.

## Evidencia aislada

`tests/station_routing_regressions.js`: 14 casos de funciones reales, incluyendo los cuatro roles/vistas, fase aún sin consultar, bloqueo de polling, Gerencia con entrada vacía, estación con credencial vacía/incorrecta/válida, respuesta BARRA incorrecta, doble envío, cancelación en vuelo, respuestas tardías de éxito/rechazo y conservación del rechazo RBAC BARRA → Caja. El nuevo test falla contra una copia `git archive 889f47a` y pasa con el cambio.

`tests/browser_station_routing.js`: 10 casos en Chromium, con HTML estático/REST y HTML generado/nativo, backend real en VM y todos los destinos externos interceptados. Perfil limpio, un solo desbloqueo, ausencia de modal sobrante, rechazo sin autorización, recarga, expiración explícita y renovación del mismo rol; Comandas/Accesos arrancan y recargan sin solicitar Caja. Se comparan ambos libros mock completos antes/después: cero ventas y cero cambios de celdas. Las sesiones y credenciales de los tests son exclusivamente fixtures.

Regresiones locales: cliente/renovación (17), recuperación cliente (12), transporte maestro (13), transporte jornadas (21), identidad ledger (24), retención/liberación de Outbox (8+8), navegador general (21), concurrencia de dos pestañas (1 escenario), jornadas Chromium (6), selección de evento/canal, hotfix (12), guardas (4) y paridad del build. Los dos tests nuevos se incorporan a CI; su resultado exacto se registra en el handoff del nuevo SHA.

Reproducción antes del cambio, fallo sobre base y logs privados: `/workspace/domus-private/station-routing-20261110/`. No son rutas de la iMac. Backend y bundles GS mantienen el SHA-256 de fuentes `e426cc514dc396b93f93542d70da553c7a25125c80415da478d01fb1ead3e7f2`; cambian app.js, index.html, HTML nativo y sus hashes en el manifiesto.

## Siguiente paso y límites

Revisar el SHA corregido y su pareja de frontend antes de cualquier instalación autorizada. En staging, el próximo cotejo debe ser de identidad/sesión y lecturas: perfil QA, un solo diálogo, rol CAJA al cargar catálogo, recarga y retorno a Comandas, sin generar otra venta ni reenviar pendientes. La identidad Google efectiva sólo puede acreditarla el servidor en ese entorno; el correo visible en Chrome por sí solo no lo garantiza.

Sin credenciales nuevas, ampliación de permisos, lectura o modificación de datos reales, PR, merge, despliegue ni cambios de impresión. No se resolvieron históricos ni se activó un límite de jornadas. Las pruebas sintéticas no certifican operación en Apps Script.
