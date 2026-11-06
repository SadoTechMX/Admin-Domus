# Transferencias de Caja y autorización de entrega — 5 noviembre 2026, Ciudad de México

**IMPLEMENTED / LOCAL_TESTED; candidata no instalada.** Continúa `repair/reconcile-pr18-main-20261105`, sobre `ffe864d19bf814cf1dce90aaf9d8d3005259f7bd` (código funcional anterior `739a40a`). UI `20261106-transfers-09`; fuente backend SHA-256 `98ac440efbc293649ada90054fb9f092c614c099ceb458eb0be4434dc543008c`. `release-manifest.json` identifica los módulos y artefactos exactos. No se usó Google, banco, datos operativos, PR, merge ni deployment. Las fechas técnicas de build usan UTC.

## Reglas aceptadas provisionalmente

Coordinación transmitió la respuesta de Steven **«Si por el momento si»** a estas cuatro reglas:

1. Primero eventos existentes con acuerdo y reparto validados; puerta controla el aforo manualmente.
2. Boletera de cada proyecto: cotejar lista/comprobante, usar cada referencia una vez, grupos juntos; diferencias a Gerencia.
3. Gerencia concilia por separado dinero recibido por el proyecto y por DOMUS.
4. Confirmar ingreso en el banco antes de aplicar una transferencia y entregar producto o acceso.

No hace falta volver a decidir estas cuatro reglas. Son provisionales y no prueban que la aplicación las cumpla. No aprueban por extensión los literales `Confirmado`/`Sí` propuestos en otro documento, un porcentaje, una cuenta bancaria, una migración o un deployment. El vocabulario/mapeo real de ACTIVIDADES35 sigue pendiente. Las cuentas abiertas y cortesías legítimamente autorizadas conservan su contrato; una transferencia pendiente no se convierte en crédito autorizado.

## Implementación en la app existente

| Parte | Comportamiento y evidencia exigida |
| --- | --- |
| Registrar transferencia | POS conserva cuenta/comanda y cobro Borrador con aplicado cero. Guarda en REQUESTS el origen financiero y las unidades exactas autorizadas. El navegador no puede autorizar entrega con `credit`, `paid` o `verified`. |
| Revisar pendientes | Botón **Revisar transferencias · Gerencia** en Caja. Sólo GERENCIA/ADMIN con identidad Workspace autorizada; sesiones antiguas sin principal se renuevan antes de vincular una intención. La consulta no crea hojas ni importa historia. |
| Confirmar ingreso | Gerencia selecciona recibo original y cuenta receptora aprobada; captura importe bancario completo, identificador único del movimiento, fecha y referencia a evidencia, y declara haber cotejado el banco. El servidor valida autoridad, sourceRequestId/recibo/cuenta originales, saldo, moneda MXN, fecha y unicidad. Es revisión humana auditada, **no una consulta automática al banco**. |
| Aplicación | Bajo el lock y journal existentes se agrega un cobro Confirmado con nuevo folio ligado al Borrador. El Borrador permanece intacto y con aplicado cero. Se guardan evidencia y principal/rol/operador reales, sin confiar en nombres de revisor enviados por el cliente. |
| Duplicados | Un movimiento normalizado por receptor sólo puede aplicarse una vez. Mismo ID/cuerpo recupera el journal. Otro ID con la misma fuente y evidencia devuelve el comprobante original; evidencia distinta o movimiento ya utilizado requiere revisión. No se acepta repartir un movimiento entre varias cuentas. |
| ACK y recarga | La respuesta debe acreditar el resultado completo de esa confirmación: recibos original/final, cuenta, importe, receptor, evidencia, identidad y estado. ACK vacío, tipos inválidos, de otra fuente o error 500 conserva ID/cuerpo/Outbox y no emite un comprobante confirmado; recarga recupera el mismo ID. |
| Corregir captura | Sólo `TRANSFER_POLICY_REQUIRED_NO_EFFECTS` y `TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS`, status 422, acreditan rechazo previo al journal y permiten otra intención corregida. La intención rechazada y su cuerpo se conservan. Errores parciales, saldo/importe distinto, referencia usada o historial incompatible no reciben ese permiso. |
| Entregar | KDS coteja la unidad contra el resultado durable de la venta. Efectivo/terminal requieren su cobro aplicado; crédito/cortesía requieren autorización original; transferencia requiere además su confirmación COMPLETED y cobro aplicado. Pendiente o evidencia incompatible bloquea entrega en UI y servidor. Inventario sólo se afecta por la entrega física confirmada. |
| Recuperar planes antiguos | Antes de reanudar una entrega PREPARED se vuelve a comprobar el permiso financiero. Una admisión antigua pendiente/indeterminada por transferencia queda en revisión antes de repetir escrituras. Los resultados ya completados conservan su ACK histórico. |
| Ticket | La confirmación abre/imprime el comprobante final y permite su descarga/recuperación local, sin cajón ni recobro. El recibo pendiente original sigue siendo histórico. No se borra un carrito o intención de venta diferente. |

`cajaSimpleEstado` sólo puede devolver resultados de ventas de Caja; no expone evidencia privada de conciliación mediante el ID de otra acción.

## Activación cerrada y contratos todavía necesarios

**No se ha escrito ninguna configuración en Google.** `DOMUS_TRANSFER_REVIEW_POLICY` debe existir en Script Properties como objeto versión 1, `approved: true`, y lista `receivers` de alias aprobados. Los únicos valores usados en pruebas pertenecen a fixtures en memoria. No se copian nombres bancarios históricos ni se infiere receptor de la cuenta de correo.

Antes de configurar, coordinación debe fijar concretamente:

- **Receptores:** un solo alias canónico por cada cuenta que recibe dinero de DOMUS, sin alias duplicados para la misma cuenta. Se necesita la correspondencia privada real, no publicarla en el repositorio.
- **Movimiento único:** qué campo del banco identifica inequívocamente un depósito en esa cuenta a través del tiempo. El código normaliza espacios/mayúsculas y vincula receptor + identificador; una referencia corta que el banco reutiliza no sirve. Fecha, importe y referencia de evidencia se conservan aparte. El código no valida por sí solo la autenticidad bancaria.

No se necesita cambiar las cuatro reglas aprobadas para resolver estos datos concretos. Sin esta configuración la revisión/aplicación permanece cerrada. Se permiten sólo pagos completos del pendiente original; parcialidades, excedentes, varias cuentas por depósito, diferencias o una cuenta ya liquidada por otro medio van a conciliación. Cambiar de medio no autoriza automáticamente una comanda originalmente pendiente de transferencia.

## Límites de integración y compatibilidad

- **Accesos no usa esta confirmación de Caja.** Si el acceso/guardarropa cobraría a DOMUS por transferencia, se rechaza antes de crear el journal comercial; no se admite ni se entrega guardarropa contra un pendiente. Falta implementar su preparación/confirmación compatible. Los importes que el proyecto declara haber cobrado externamente siguen separados, sin convertirse en ingreso de DOMUS. ACTIVIDADES35 mantiene `ACTIVITY_POLICY_REQUIRED`; no se inventaron estados/acuerdos/aforos ni se tocaron hojas reales.
- **Reportes y cierre:** al preservar el Borrador y agregar Confirmado, la suma de `IMPORTE COBRADO` sin filtrar repetiría el importe. Saldos de la candidata usan `Cobrado aplicado` (N)/`paymentApplied_`. Antes de instalar hay que acreditar que los reportes/fórmulas efectivos usan aplicado/estado y no bruto sin distinguir. Esta suite no certifica las fórmulas reales.
- **Historia incompatible:** transferencias aplicadas sin confirmación durable compatible bloquean conciliación nueva; comandas anteriores sin vínculo financiero verificable bloquean entrega. No se importan ACK antiguos ni se reconstruye evidencia por inferencia. Resolver cada pendiente/historia antes de activar; un journal global pendiente puede bloquear otras mutaciones.
- **Coordinación:** root conserva Data.gs/Events.gs y su delta preventivo; no se editaron aquí ni se supone integrado sin SHA explícito. Estos módulos aún corresponden al manifiesto de esta rama. La revisión IDE de recibo sobre 739 fue estática y acotada; no revisó esta confirmación. La primera respuesta Gemini de 739 se descartó por mezclar código anterior; su rectificación no se ha recibido en este hilo. No se atribuye auditoría nueva a ninguna herramienta.
- **Instalación/reversión:** se reutiliza el cotejo recibido de deployment V16 y backup del editor actual; no se cuenta con exportación inmutable reciente V16/HTML enlazada. Falta validar la pareja candidata en staging canónico autorizado, sesiones reales, recuperación, fórmulas/stock/recetas y entrega de ticket en estación. No se necesita la iMac para estas pruebas de código; hardware/banco/Sheets siguen sin acreditar.

## Pruebas acotadas

Node local v24.22.1, Python 3.12.14, Playwright 1.62.1 y Chromium local. El workflow de GitHub usa Node 22/Python 3.12. Ninguna de estas pruebas usa banco, Google ni datos reales.

| Comando / suite | Resultado local |
| --- | --- |
| `node tests/transfer_review_regressions.js` | **20 PASS**: autoridad/principal, monto completo, fuente/receptor/evidencia, duplicados, pago parcial escrito, fallo al completar REQUESTS, cuarentena histórica, entrega, replay antiguo, privacidad, rechazo corregible, sesión anterior; 10 variantes de ACK/error por transporte nativo/REST con recarga y mismo ID. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser_transfer_review.js` | **5 PASS** con app real y backend modular en memoria: entrega pendiente bloqueada, rechazo de fecha corregible con ID nuevo, confirmación doble clic con un efecto, ticket descargado sin cajón/recobro y entrega habilitada sólo al completar confirmación. Red externa interceptada; stock/impresión/identidad/evidencia simulados. |
| Recuperación backend / cliente / reconciliación / revisión / recarga / transporte / cutover | **27 / 12 / 17 / 16 / 8 / 13 / 9 PASS**. |
| Esquema ACTIVIDADES / registro externo / ticket | **20 / 9 / 4 PASS**. El caso de transferencia en acceso ahora acredita bloqueo sin efectos; no admisión pendiente. |
| Navegador existente / concurrencia de dos pestañas | **21 / 1 PASS**. |
| Selección de evento y canal | PASS, fixtures aislados. |
| v13 / KDS estructural / bridge / guardrails / seguridad del harness | **12 / 11 / 11 / 4 / 3 PASS**. |
| Build determinista / sintaxis / `git diff --check` | PASS; el manifiesto identifica la pareja exacta. |

La CI de 739 (`42164620785`) es histórica. La ejecución remota de esta entrega se identifica por su SHA/run en la respuesta de entrega; no se atribuye por anticipado el resultado de otra versión. Pruebas sintéticas y CI no certifican operación ni habilitan producción.
