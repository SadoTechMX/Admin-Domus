# ACTIVIDADES: mapa canónico recibido — 5 noviembre 2026, Ciudad de México

**IMPLEMENTED / LOCAL_TESTED. Encabezados resueltos; contrato operativo pendiente. No instalado.** Continuación de `70f8df22e3618d136918c40748bf139d05b867c5`, mismo editor y rama. Se recibieron por coordinación los 35 nombres exactos A6:AI6 y la revisión íntegra de Antigravity IDE, basada en 28b2. Se reutilizó esa evidencia: no hubo lecturas Google, consultas remotas ni nuevas auditorías de IDE/Gemini. Esa revisión fue pasiva y **no revisó este código nuevo**.

Sólo los nombres necesarios para el contrato y el fixture se incorporan al repositorio. No se copiaron las evidencias privadas originales, texto integral AX, filas operativas, importes reales ni IDs privados. Las filas de prueba son ficticias. La recepción cierra el bloqueo de información señalado en [la entrega anterior](ACTIVITY_SCHEMA_GUARDS_20261105.md); no aprueba los ejemplos de enums, porcentajes o aforo propuestos por el revisor.

## Mapa implementado

Se comprueban los 35 encabezados y su posición A:AI, incluidos campos financieros no consumidos. Duplicados, faltantes, reordenamientos o columnas adicionales producen `ACTIVITY_SCHEMA_REQUIRES_REVIEW`/409. No se adapta silenciosamente un esquema distinto. El perfil legado de 13 campos sigue separado y conserva su búsqueda por nombre.

| Campo de lectura | Columna / significado |
| --- | --- |
| name | A · Actividad / evento |
| date | B · Fecha |
| area / project | C · Área / D · Proyecto; no son alias de type/organizer |
| priceGeneral / pricePareja / priceTrio | E · Entrada general / F · Paquete pareja / G · Paquete trío |
| priceGuardarropa | H · Guardarropa |
| status | U · ESTADO DEL EVENTO, devuelto sin aprobar ningún enum |
| capacity | No existe columna: devuelve null, nunca toma I ni inventa 150 |
| Notas | M, identificado; no se interpreta como capacidad ni contrato de boletos en el perfil canónico |

I/J/K (reparto), L (acuerdo), N:T y V:AI no se convierten en aforo, proveedor o estado ni reciben escrituras. La representación numérica del porcentaje no se ha validado y no se usa. En el perfil canónico, tarifas numéricas finitas no negativas se muestran como datos; cero explícito se conserva. Vacíos, texto u otros valores no confirmados se devuelven como null, nunca como cero o 50. Esto no verifica precios reales.

## Comportamiento seguro mientras falta el contrato

- `accesoSimpleDatos` puede leer el esquema de 35 campos y devuelve `activityPolicyPending:true`. `Área` y `Proyecto` se mantienen separados de `Tipo`/`Organizador`. No inventa un evento activo si no existe selección registrada.
- Nuevas operaciones de `registrarNuevoEvento`, `accesoCambiarActividad` y `accesoSimpleRegistrar` fallan cerrado con **`ACTIVITY_POLICY_REQUIRED`/409** antes de preparar journal o cambiar datos de negocio, incluso si U dice Confirmado o ACTIVO y L dice Confirmado. Esos valores son ejemplos pendientes de aprobación, no una lista de permisos.
- La UI explica el contrato pendiente y bloquea esos envíos. Un catálogo canónico vacío no se rellena con eventos locales de ejemplo. La tabla muestra Área/Proyecto, aforo desconocido y tarifas sin confirmar cuando corresponde.
- El journal no puede reanudar un plan de evento sobre este perfil pendiente, aunque tenga vínculo de encabezados; no se remapean coordenadas ni borran registros. REQUESTS COMPLETED sigue devolviendo su resultado sin nuevas escrituras. La recuperación previamente vinculada de otras acciones financieras no cambia.
- Las operaciones rechazadas pueden dejar su evidencia REQUIRES_REVIEW en REQUESTS: cero efectos comerciales no significa cero escritura de auditoría. No se concede permiso automático para reemplazar su ID.
- POS, Idempotency y Data no se modificaron en este delta. La suite comprueba que Caja sigue seleccionando el nombre del evento y cobrando con el código real bajo mocks, con ACTIVIDADES canónica intacta. Esto no acredita Caja productiva instalada ni certificada.

UI `20261106-activities-07`; backend fuente SHA-256 `b046e7d883ed59f42c3b3ee27f13c2656e5bc01498b018af94f63ffd7d965e8b`. Generados y huellas en `release-manifest.json`.

## Evidencia local

`node tests/activity_schema_regressions.js`: **20 PASS**, incluyendo los 12 casos anteriores y 8 sobre el contrato recibido: lectura U separada de L/I, tarifas desconocidas/cero, bloqueo de enums propuestos, comprobación de cada uno de los 35 encabezados, cambios/duplicados/extras, journal previo, Caja con el esquema canónico, controles UI y catálogo vacío. El fixture `tests/fixtures/activities_headers_35.json` contiene únicamente los nombres recibidos; no contiene datos operativos.

Regresiones ejecutadas localmente: backend 27; reconciliación 17; ACK transporte 13; revisión 16; recarga 8; cutover 9; evento/canal; Chromium 18 y carrera de dos pestañas 1. Build determinista, sintaxis de ambos bundles/HTML nativo y whitespace verificados. Pruebas con servicios simulados, sin Google ni hardware; no certifican producción. No se consultó CI remota en este tramo y no se reutiliza el resultado de 70f8df2 para acreditar un SHA posterior.

## Decisiones todavía necesarias

1. Ubicación y uso del aforo: no existe campo en la hoja. No escribirlo en porcentaje ni serializarlo en Notas sin contrato explícito.
2. Valores de U y qué estados permiten seleccionar, admitir/cobrar y cerrar un evento. Confirmado/ACTIVO/etc. del revisor no son aprobación.
3. Valores de L y relación del acuerdo con la habilitación comercial del evento.
4. Política de I/J/K al crear: quién proporciona porcentaje/beneficiario/base, su representación y si deben quedar vacíos. No usar DOMUS/Bruto por defecto sobre el contrato canónico.

El formulario canónico necesitará campos Área/Proyecto propios; no reutilizar Tipo/Organizador por similitud. No se implementa todavía un alta parcial que eluda decisiones pendientes. Continúan los bloqueos de exportación inmutable V16/HTML, integración y verificación autorizada descritos en [MASTER_INTEGRATION_20261106.md](MASTER_INTEGRATION_20261106.md). Sin PR, merge, deployment ni modificación productiva.
