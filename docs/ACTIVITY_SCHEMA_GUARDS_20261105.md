# Guardas de ACTIVIDADES — 5 noviembre 2026, Ciudad de México

> Actualización posterior: [mapa canónico de 35 encabezados recibido](ACTIVITY_CANONICAL35_20261105.md). Ya no faltan los nombres ni la revisión íntegra de IDE. Sigue pendiente aprobar el contrato operativo; no habilitar escrituras por los ejemplos del revisor.

**IMPLEMENTED / LOCAL_TESTED. Adaptación completa al contrato real de 35 columnas BLOQUEADA por información faltante. No instalado.** Base `d49aeae6dfa500957f4f83f8d022813f0bc9bfbc`, misma rama `repair/reconcile-pr18-main-20261105` y un único editor Codex. Access, Events, Data, app y sus generados se mantienen en esta rama; no se abrió otro motor, laboratorio operativo ni rama paralela.

## Evidencia reutilizada y límite

Coordinación informó la revisión efectiva de Antigravity IDE desde desktop: propone mapa explícito/guardas y no decidir aforo/estados ni mover finanzas. Se reutiliza ese criterio. Aquí **no se recibió su texto íntegro ni el listado de los 35 encabezados**. Los archivos privados de compatibilidad están en otro entorno, no accesible desde este host. La búsqueda acotada en repositorio e historial sólo encontró el fixture legado de 13 campos y el resumen comunicado; Contexto personal no estuvo disponible. Se solicitó a coordinación el texto ya obtenido, sin nueva lectura Google.

Se conocen con evidencia comunicada I=`% DOMUS entradas`, L=`Acuerdo validado`, U=`ESTADO DEL EVENTO`. No se infiere el resto ni equivalencia de acuerdo/estado, capacidad o tarifas. **La guarda rechaza el esquema productivo sin mapa aprobado; todavía no habilita accesos ni creación de eventos con los 35 campos.** El fixture negativo de 35 columnas es sintético y está marcado así en la suite: combina los tres encabezados conocidos con campos desconocidos, y prueba además una mezcla que mantiene los 13 nombres antiguos. No es una copia de la hoja productiva ni acredita su compatibilidad.

## Cambios concretos

- `Events.gs`: contrato legado explícito por nombre, compartido con Access. Detecta encabezados faltantes/duplicados y señales del esquema productivo o mezclado, con `ACTIVITY_SCHEMA_REQUIRES_REVIEW`/409 antes de preparar el journal o escribir datos de negocio. Escribe sólo columnas nombradas, sin reemplazar una fila completa. La capacidad/estado faltantes no se convierten en 150/Confirmado. No se amplió el enum de estados ni se dedujo aforo.
- `Access.gs`: lectura, selección y registro usan campos nombrados, sin los índices I/L/M. Nombres duplicados o evento sin confirmación explícita no permiten seleccionar arbitrariamente una tarifa/estado. Ledger y journal de una petición COMPLETED conservan su respuesta original, sin nuevas escrituras.
- `Data.gs`: conserva en cada grupo del plan de evento los encabezados que vinculan sus columnas y los verifica **todos antes de reanudar escrituras**. Si cambian o el plan antiguo no los tiene, se detiene para conciliación. No remapea un PREPARED, no borra journal ni cambia IDs. Esto cierra la vía de reanudación que podía saltarse una guarda puesta sólo dentro de Events.
- `js/app.js`: crear evento deja de anunciar éxito/seleccionarlo antes del ACK. Rechazo, respuesta vacía o intención pendiente conservan formulario y evento activo; un ACK válido solicita refrescar el servidor. La tabla muestra aforo no confirmado en lugar de inventar 150. Guardarropa cero se conserva; un campo vacío/inválido no se convierte en tarifa gratuita ni en 50 durante el envío.

Las validaciones pueden registrar REQUIRES_REVIEW en REQUESTS por la intención rechazada: **cero efectos de negocio/journal no significa cero escrituras del ledger de auditoría**. No se convierten estos errores en autorización para reemplazar automáticamente el ID. Un plan de evento antiguo sin vínculo de encabezados necesita revisión manual incluso si sus coordenadas parecieran coincidir. Sigue pendiente la migración/conciliación; no se ejecutó ninguna.

UI `20261106-activities-06` (identificador técnico); backend fuente SHA-256 `e2d77a359a0357327b09fec06158dd259d0544c23e78b76b2c9017303b23eb73`. `release-manifest.json` registra los artefactos generados. Data depende del helper de Events: integrar los módulos juntos mediante el bundle revisado, no reemplazar archivos sueltos en Google.

## Pruebas y límites

`node tests/activity_schema_regressions.js`: **12 PASS** con fuente real y servicios en memoria. Incluye lecturas/escrituras tras reordenar encabezados, columnas ajenas intactas, esquema desconocido/mezclado de 35 columnas, encabezados faltantes/duplicados, aforo/estado vacíos, nombre duplicado, recuperación PREPARED con mismo ID, cambio de encabezados durante interrupción, plan legado sin vínculo, replay COMPLETED y rechazo/pending en UI. Reproducción con los módulos/app de `d49aeae`: **10 FAIL / 2 PASS**. Ninguna lectura Google.

Regresiones locales aprobadas: backend 27, cliente 12, reconciliación 17, revisión 16, recarga 8, transporte ACK 13, cutover 9; evento/canal; Chromium 18 y carrera de dos pestañas; controles v13 12, KDS 11, guardrails 4 y seguridad del harness 3. Generación determinista, sintaxis y whitespace verificados. Las suites se solapan y no certifican operación, fórmulas productivas, stock, Google o hardware. La CI exacta del nuevo SHA se informa con la entrega; no se reutiliza la CI de 0c23013 para este cambio.

## Para completar la adaptación real

1. Recibir desde coordinación los **35 encabezados exactos y la revisión íntegra de IDE ya obtenidos**, sin filas operativas ni secretos. Éste es el bloqueo actual; no hace falta repetir el cotejo Google.
2. Definir el mapa de cada campo consumido/escrito y documentar cuáles no existen. Si aforo, tarifas o estados requieren una decisión de negocio, mantener bloqueada esa acción hasta recibirla. No sustituir `Acuerdo validado` por estado del evento, ni escribir porcentajes/beneficiarios como capacidad/proveedor.
3. Incorporar el fixture de encabezados reales, pruebas de lecturas/escrituras estrechas y preservación de finanzas; luego revisión complementaria por IDE/Gemini sobre este delta, sin editar en paralelo. No se atribuye a esas herramientas la auditoría de código nuevo que aún no han recibido.
4. Conservar los bloqueos de instalación descritos en [MASTER_INTEGRATION_20261106.md](MASTER_INTEGRATION_20261106.md): exportación inmutable V16/HTML pendiente, integración emparejada y conciliación antes de revertir. Este cambio no autoriza PR, merge, deployment ni datos productivos.
