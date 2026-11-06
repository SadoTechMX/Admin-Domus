# Registro de boletaje externo y entrega de ticket — 5 noviembre 2026, Ciudad de México

**IMPLEMENTED / LOCAL_TESTED. No instalado ni certificado.** Continúa la misma rama `repair/reconcile-pr18-main-20261105`, sobre `c718ae10ff93f680aa8bc28445ed3e8159bf3821`. UI `20261106-registration-08`; hashes exactos de fuentes y artefactos en `release-manifest.json`. Ninguna consulta o escritura a Google, venta real, PR, merge o despliegue en este tramo.

## Alcance vigente

Steven aclaró que cada proyecto utilizará su propio sistema de boletaje y DOMUS sólo debe registrar. No se integra Shopify ni se construye otra boletera. La instrucción posterior de coordinación conserva **transferencias incluidas**: no se aplicó la propuesta anterior de deshabilitarlas. Continúan pendientes de verificación, sin reducir deuda como si ya estuvieran confirmadas. Se mantiene la prioridad Caja/comandas y la entrega de ticket impreso o digital; un modal en pantalla o una descarga por sí solos no acreditan entrega al cliente.

## Hallazgos y corrección acotada

| Parte | Evidencia y resultado |
| --- | --- |
| Registro comercial | ADR-005 ya separaba entrada externa/prepagada, cobro en puerta y guardarropa. Eso es una regla documentada, no prueba de integración con proveedores. |
| Captura | Proveedor libre por proyecto; referencia real obligatoria, sin sustitutos `BOL-ACCESS…`/`PRE-ACCESS…`. Se capturan importe reportado en MXN, receptor y medio del pago externo, incluidos pagos por transferencia. El evento sigue siendo la actividad seleccionada y validada por el servidor. |
| Persistencia | `Access.gs` conserva proveedor y declaración en el JSON existente de **ACCESO!AD**, con operador autenticado. Antes se omitía el proveedor al escribir y se leía desde U; U realmente es **DOMUS entradas cobradas**. Ahora no se interpreta esa celda financiera como proveedor. No se agregan columnas ni se migran filas. |
| Dinero | `externalReportedAmount` es una declaración independiente de la tarifa nominal/comercial. No cambia tarifas, reparto, saldos ni genera ingreso de entrada en COBROS. Guardarropa genera sólo su propio cobro; si se paga por transferencia, queda pendiente. El receptor informado tampoco convierte automáticamente el importe en dinero recibido por DOMUS. |
| Verificación | Se devuelve `externalVerification=NO_VERIFICADA_AUTOMATICAMENTE`; la interfaz y el comprobante muestran ese límite. El estado histórico `PAGADO_EXTERNAMENTE` sigue siendo la clasificación del canal, no una prueba bancaria o validación del proveedor. No hay webhook, consulta de pedido o autorización externa en esta ruta. |
| Duplicados | Se conserva ID/cuerpo y journal para reintentos, incluso después de escritura parcial. La guarda existente rechaza otro folio igual dentro del mismo evento. **No** valida existencia/pago del boleto, ni resuelve boletos grupales o colisiones entre proveedores. No se amplió esa regla por inferencia. |
| Ticket de Caja | Nuevo botón **Descargar ticket** crea un HTML autónomo a partir del resultado confirmado o recuperado: cuenta, recibo, conceptos, importe y estado. Sin scripts, recursos remotos ni envío a terceros. La transferencia pendiente y cuenta abierta no se presentan como cobradas; cortesía conserva “sin cobro”. El operador debe entregar el archivo y verificar que el cliente lo abre. Se conserva impresión y recuperación del mismo recibo. |

La captura está dentro de la ruta de **Accesos/admisión existente**; no es una nueva contabilidad de pedidos externos ni un registrador independiente de eventos. El perfil real ACTIVIDADES de 35 columnas continúa bloqueando nuevas admisiones/altas/selecciones con `ACTIVITY_POLICY_REQUIRED`. Preparar estos campos no habilita esa ruta en producción.

## Diferenciar legado, documentación y candidata

Coordinación encontró la cartelera pública y reportó Shopify desde su política; Steven la excluyó del alcance. No se repitió la investigación remota ni se creó una conexión. En el código candidato no se encontró integración automática de proveedores.

Existe además `reservePreventa_` en el archivo histórico raíz `DOMUS_OS_Modos_Angel_Zoe.gs`: busca una orden de origen Boletera en COBROS, comprueba actividad/personas y reserva lugares. **No forma parte de MODULES en `scripts/build_release.py` ni de la ruta API candidata.** Su presencia no acredita instalación, enlace a Shopify ni compatibilidad del flujo nuevo. No se ejecutó `probarPreventaGrupalDOMUS`, que escribe hojas; tampoco se copió ese backend a la candidata.

Los antiguos `PROD_VERIFIED`/PASS de CURRENT_STATE y RELEASE_LOG corresponden a versiones/contextos anteriores. La evidencia actual de despliegue sigue siendo la recibida: panel V16, backup del editor actual y ausencia de exportación inmutable reciente V16/HTML. Esta candidata no está instalada.

## Pruebas ejecutadas, límites

- `node tests/external_registration_regressions.js`: **9 PASS**, código real y servicios simulados. Round-trip de proveedor/importe/receptor/medio; cero cobro externo; columnas financieras conservadas; guardarropa efectivo/terminales/transferencia; datos incompletos sin efectos; duplicados; recuperación parcial; referencia real; guarda canónica de 35 columnas.
- `node tests/receipt_delivery_regressions.js`: **4 PASS**. Contenido escapado; estados de pago distintos; descarga local sin otro cobro; fallo de descarga conserva comprobante.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser_local_regressions.js`: **21 PASS**. Tres tamaños, recuperación tras recarga y descarga/apertura del archivo del recibo recuperado sin otro cobro. Red externa interceptada.
- Regresiones existentes: backend **27**, cliente **12**, reconciliación **17**, revisión **16**, recarga/rechazo **8**, transporte maestra **13**, transición legado **9**, esquema de actividades **20**; selección de evento/canal pasan. Build determinista, sintaxis y `git diff --check` correctos.
- Dos pestañas Chromium **1 PASS**; controles estructurales v13 **12**, KDS **11**, guardrails **4** y seguridad del harness **3**, todos locales.

Estos resultados no prueban operación en Sheets, entrega a un cliente, impresora/cajón, autorización de terminal ni verificación bancaria. Las fórmulas/stock/movimientos reales siguen sin validar. Las pruebas positivas de admisión usan el contrato legado permitido en el fixture; el contrato productivo de 35 columnas sólo se acredita como **bloqueado**, no como operativo.

Los resultados históricos completados conservan su contrato: no se rellenan proveedores ni importes por inferencia. Intenciones antiguas aún no preparadas que carezcan de la nueva declaración pueden requerir revisión; no se reescribe su cuerpo bajo el mismo ID para superar una validación.

## Decisiones mínimas que faltan

1. **Validación manual de boletos:** quién verifica el comprobante y qué evidencia admite cada proyecto. La captura guarda lo reportado; no concede autoridad ni prueba el pago externo. Definir si cada referencia es por persona, paquete u orden y cómo tratar referencias iguales entre proveedores antes de cambiar la guarda de duplicados.
2. **Conciliación de dinero:** quién recibió el dinero y quién debe liquidar a DOMUS, según el acuerdo de cada evento. Si el pago ya llegó a DOMUS, hay que vincular el cobro existente y verificarlo una sola vez; registrar de nuevo el importe externo no lo hace. Para transferencia nueva a DOMUS sigue faltando el flujo autorizado de comprobación bancaria y aplicación; no usar una bandera del navegador como sustituto.
3. **Eventos:** catálogo operativo de U, significado de L, reparto I/J/K y aforo del contrato de 35 columnas, ya detallados en `ACTIVITY_CANONICAL35_20261105.md`. No adoptar ejemplos de IDE como reglas. Hasta entonces Accesos/Eventos siguen cerrados; Caja de consumos no depende por sí sola de ese contrato.
4. **Entrega del ticket en estación:** comprobar papel o transferencia efectiva del archivo al cliente en el equipo real. Descargar no significa entregado. Falta esa evidencia antes de operar, además de los gates de integración, identidad, sesiones, pendientes/journals, fórmulas y KDS descritos en `MASTER_INTEGRATION_20261106.md`.

Codex conserva edición única de app/Index/POS/Idempotency/Access/Events/Data. Este tramo modifica Access y cliente/artefactos, no POS/Idempotency/Events/Data. Las revisiones Gemini/Antigravity IDE recibidas desde desktop fueron de bases anteriores; no se presentan como revisión de esta nueva entrega. GitHub recibe la misma rama y las nuevas suites; la CI de un SHA anterior no acredita este cambio. PR sigue restringido; sin nueva autorización de merge/deployment.
