# Autenticación explícita durante revisión QA

Base exacta: `cd97783bad6040c44851a9c484f28cefe058981c`.
Backend conservado: `76563229067fb0f49ce66a7d7a2db478a68cbaa76a8d761df41b0ed948c32334`.

## Motivo y límites de la evidencia

La recuperación previa obtiene un token sólo en memoria. Puede conservar un intento UNCONFIRMED sin token CAJA reutilizable en sessionStorage. La consulta posterior exige ese token. El mensaje anterior agrupaba errores locales y de servidor; no demostraba expiración. El log sin un dispatch visible tampoco prueba por sí solo que nunca ocurrió. No se ha inspeccionado ni alterado el token del caso real.

El nuevo diagnóstico devuelve sólo booleanos y códigos de una lista cerrada. No muestra tokens ni su longitud/hash/prefijo, IDs, cuerpos, operador, archivos o mensajes de excepción arbitrarios. Token presente no significa sesión válida.

## Alcance del ajuste

Sólo cliente y su Index generado, pruebas y documentación. No se cambia el servidor, los libros, la política, las aprobaciones, los gates o los tickets. No se publica ni instala con este trabajo aislado.

La autenticación es un paso distinto y explícito. Usa `authCrearSesion` existente con credencial vacía y Google autorizado, rol CAJA y dispositivo/operador exactos del intento. Crea una sesión CAJA **general**, de hasta 12 horas; no es una sesión de lectura limitada. El servidor conserva la sesión en Cache/Properties. El cliente guarda únicamente el token en sessionStorage de esa pestaña. No lo añade al archivo de evidencia ni a localStorage.

Debe autorizarse expresamente la creación/reemplazo de esta sesión y su conservación en la pestaña antes de usarla. La autorización para consultar no equivale a autorización para crear esta capacidad.

Se conserva el hold, el intento UNCONFIRMED y las copias originales. La autenticación no consulta, abre, recupera, cobra, imprime, libera ni reenvía después de terminar. La consulta requiere un nuevo clic explícito.

## Guardas

- Sólo app nativa STAGING, bridge válido, Web Locks y contexto exacto.
- Health comprueba libros y backend antes de autenticar.
- Locks traffic y store, consentimiento vinculado al mismo intento y comprobación antes/después de cada espera.
- Se rechaza cualquier artefacto de recuperación por ausencia o liberación ya iniciado, incluido un valor corrupto. La observación existente puede conservarse.
- Al iniciar autenticación bajo ambos locks se descarta cualquier propuesta previa en memoria y se limpian su prueba, aprobación y hash. Incluso si auth falla, reservar o recuperar exige una propuesta nueva. No cambia ningún artefacto original.
- Una llamada auth, sin credencial de estación, fallback, login operativo, cambio de operador, renovación o reintento automático.
- Respuesta con rol, identidad y fechas válidas (tolerancia de validación de 1000 ms entre los dos Date.now del backend; no cambia la duración configurada de 12 horas); sesión anterior y evidencia no pueden haber cambiado mientras esperaba.
- Cancelación, cierre, navegación, timeout o cambio concurrente descartan la respuesta pendiente. Un servidor puede haber creado una sesión aun si la respuesta se pierde; no se afirma rollback remoto.
- Si falla la escritura local después de ejecutarse, el token puede existir. El resultado sigue incierto y no dispara otra acción. La evidencia y hold permanecen.

## Lo que no resuelve

Este ajuste no acredita ausencia de efectos, no resuelve UNCONFIRMED, no libera otras estaciones ni constituye autorización para una apertura o cobro. Los controles de conciliación y aprobación exacta siguen independientes.

No introduce una renovación para tickets/gates iniciados ni migración de principal. Ese escenario sigue bloqueado. No garantiza detención de clientes antiguos o ejecutores externos. El token general podría utilizarse fuera de esta UI, por lo que no debe presentarse como credencial restringida por el hold.

## Pruebas y entrega

`node tests/review_auth_regressions.js` ejercita funciones reales y dispatcher sin modificar, con almacenamiento/libros/identidades sintéticos. La suite debe verificar source y Index, cancelación, no-manager, cambios concurrentes, timeout tardío, respuesta incompatible, cuota y cero llamadas posteriores.

Las pruebas de navegador preparadas deben ejecutarse sólo en un entorno autorizado. Su preparación no equivale a ejecución. Antes de instalar se requiere revisión independiente, hashes/paridad, pruebas aplicables y autorización de publicación/instalación. En Apps Script sólo cambiaría Index; el backend debe permanecer idéntico byte por byte.
