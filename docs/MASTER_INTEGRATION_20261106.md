# Integración en la app maestra — 6 noviembre 2026

**IMPLEMENTED / LOCAL_TESTED. Backend instalado sin identificar; no desplegado ni certificado.** Continuación de `0ea79ee6d45068491b24e7e47a21211a5e76ddec` en la misma rama `repair/reconcile-pr18-main-20261105`. No se creó otra app, motor de cobro o entorno de ensayo.

## Identidad y decisión

| Componente | Evidencia y límite |
| --- | --- |
| Repositorio principal | `origin/main` verificado en `2b7ba1f4030b1013555b93cb96cfcb594141fdcb`. |
| Frontend publicado | Entrada de Caja en README: `https://sadotechmx.github.io/Admin-Domus/?vista=caja`. Lectura del JS público observa UI `20261029-06`, etiqueta commit `e93a52d`, `dispatchNativeAction` y el endpoint oficial `AKfycbzy...I1WRGJGL`. Esas etiquetas también están en main; no equivalen al SHA real del activo. Coordinación comunica además coincidencia de activos con main. Esto **no identifica** el backend Apps Script desplegado. |
| Corrección existente | `0ea79ee` conserva POS legado: `cajaSimpleRegistrar`, payload `id/items/paid/method/expectedTotal`, `COBROS`, `COMANDAS`, REQUESTS y journal de recuperación. No es IntegratedStore. |
| Endpoint actual | El GET público `?action=health` del endpoint oficial respondió `ok:true`, `HEALTHY`, `PRODUCTION`, timestamp servidor `2026-11-06T03:08:46.385Z`, sin build ni versión. No acredita la versión 16 histórica ni la candidata. |
| Proyecto/versión instalada | Pendiente del cotejo de sólo lectura de ARIADNA. El historial tiene IDs de proyecto distintos. La respuesta pública no contiene project ID ni versión; no permite confirmar el contenido del editor. |
| Libros declarados | El health actual declara Main `1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U` y Ops `1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc`, coincidentes con configuración PRODUCTION. Esto no es una lectura de esas hojas ni prueba de su estado comercial. No se leyeron ni alteraron registros comerciales. |

Evidencia pública acotada en [master_public_identity_20261106.json](evidence/master_public_identity_20261106.json). Se consultó el archivo JS como texto, sin ejecutar la interfaz ni su autenticación, y sólo GET health en el backend; no se usó un perfil autenticado para estas consultas.

No copiar el backend del ensayo ni mezclarlo con esta candidata. El diff completo de `main` a `0ea79ee` comprende 51 archivos, incluidos generados, autenticación, journal, módulos financieros y bridge: no es un cambio de interfaz que pueda instalarse a ciegas. `worktree-integracion-operable`/`edac953` y coordinación `0d30678` tampoco acreditan equivalencia con la candidata o el deployment.

## Cambio posterior a 0ea79ee

`transport_` de la misma app valida el sobre de respuesta tanto nativo (`google.script.run`) como REST. Una respuesta nula, mal formada, JSON inválido o `{ok:true}` sin datos produce `TRANSPORT_INVALID_RESPONSE`/502: se conserva RETRY, ID y cuerpo, no se guarda una confirmación inventada ni se vacía el borrador. La consulta health también usa la validación; si es incompleta, no se envía la mutación. Los errores explícitos de negocio/autorización conservan su clasificación anterior.

La prueba usa los módulos reales de esta app y servicios simulados, incluido un cobro que sí termina en el backend simulado pero pierde su respuesta: tras recargar, el mismo ID recupera el recibo original y existe una sola fila de cobro. No depende del motor del ensayo.

- Antes del cambio: 7 casos fallaban y 2 controles pasaban en `tests/master_transport_regressions.js`.
- Después: **9 PASS**; además **12 cliente, 17 reconciliación, 16 revisión, 8 recarga/rechazos, 18 navegador y 1 carrera completa de dos pestañas PASS**. Conteos por suite, no certificación de operación.
- Generación determinista, sintaxis JS/nativa y whitespace verificados. CI remoto del commit nuevo no verificado.
- UI `20261106-master-04`; el backend **no cambió** en este paso: SHA-256 fuente `1437ae5b9952b53b31f2b5779bff4b336dc74eabef29cf312f096cd92b6cd893`. `release-manifest.json` registra las huellas actualizadas del frontend y HTML nativo.

## Pasos mínimos pendientes para integrar

1. Obtener del cotejo de ARIADNA la URL que usan las estaciones, proyecto, deployment, versión, archivos realmente instalados y ambos libros. Conservar respaldo privado del código/manifest y referencia de la versión anterior antes de escribir en el editor. No exponer propiedades secretas.
2. Comparar ese backend exacto con el POS legado de la candidata. Si difieren, adaptar sólo los cambios compatibles en estos mismos archivos; no sustituirlos por IntegratedStore ni asumir que main es la versión instalada. La corrección de comunicación ya está en `js/app.js` y su `google-apps-script/Index.html` generado.
3. Aplicar el conjunto revisado en el proyecto existente y verificar versiones/huellas de frontend y backend juntos. Una copia en el editor, un push de Git o un test local no actualizan ni certifican por sí solos el deployment operativo. Merge y deployment siguen pendientes, no ejecutados por este trabajo.
4. Verificar por lectura salud/IDs, catálogo, fase/evento, sesiones por rol y estado KDS en las estaciones reales; conservar intenciones pendientes antes de cerrar pestañas antiguas. Web Locks sigue siendo obligatorio. El recorrido de cobro/recibo/comanda/inventario sobre la misma implementación aún necesita evidencia transaccional autorizada sin ventas ficticias en producción. No trasladar al sistema maestro el resultado del ensayo distinto.

## Bloqueos observados

- El lector web inicial no pudo abrir las URLs; las consultas de metadatos Drive de ambos IDs históricos de proyecto devolvieron 404. La consulta pública sin autenticación sí resolvió el endpoint oficial y sus IDs declarados, como se documenta arriba. Sigue sin identificarse la versión/código privados del backend. Ningún 404 demuestra que el proyecto no exista.
- La revisión automática **denegó** la inspección del editor privado mediante TinyFish, antes de ejecutarse: enviaría código privado a un servicio tercero sin autorización explícita para ese destinatario. Se comprobó el historial y no apareció esa autorización; no se reintentó ni se buscó eludir el bloqueo. El cotejo de ARIADNA sigue siendo la vía de coordinación, sin nueva inspección duplicada aquí.
- La apertura de PR previamente denegada sigue detenida. La coordinación no autoriza PR, merge ni deployment; no se reintentaron.
