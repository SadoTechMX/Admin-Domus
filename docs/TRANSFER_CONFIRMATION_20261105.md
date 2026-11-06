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

**CI exacta verificada:** [run 42170253917](https://github.com/SadoTechMX/Admin-Domus/actions/runs/42170253917), SHA `3f29bdc6b39e364c579c2eb6e2cfd925659537a8`, `completed/success`, finalizado el 6 noviembre a las 05:55:24 UTC. Job `isolated-regressions` y todos sus pasos `success`, incluidas las tres suites de navegador y la nueva confirmación de transferencias. [Evidencia de estado y pasos](evidence/transfer_ci_3f29bdc_20261106.json). La CI de 739 (`42164620785`) es histórica. Pruebas sintéticas y CI no certifican operación ni habilitan producción.

## Siguiente tramo sin depender de la iMac

Este seguimiento sólo registra el resultado remoto y prepara la secuencia; no cambia código, configuración ni destinos. No repite suites ni revisiones asignadas a Gemini/Antigravity. La candidata funcional sigue siendo `3f29bdc`; cualquier commit posterior limitado a esta documentación no representa otra versión de la app.

| Paso | Trabajo concreto y responsable | Condición para avanzar |
| --- | --- | --- |
| 1. Una sola candidata | Coordinación/root aporta el SHA y diff exactos de su delta preventivo Data/Events. Codex coteja e integra únicamente ese delta autorizado sobre esta rama, sin duplicar su edición. El manifiesto de 3f29bdc ya identifica los artefactos entregados. | No asumir que el delta está incorporado ni atribuir esta CI a una combinación nueva. Si cambia código, regenerar artefactos y ejecutar las regresiones afectadas y CI del SHA resultante. No requiere iMac. |
| 2. Datos para conciliación | Dirección/Gerencia fija en un canal privado la correspondencia alias → cuenta receptora de DOMUS y el campo de movimiento único del banco. Mantener separado todo dinero recibido por proyectos. | No pedir otra aprobación de las cuatro reglas, ni publicar datos bancarios/credenciales. Preparar configuración revisable; no escribir Script Properties por este documento. No requiere iMac. |
| 3. Cerrar compatibilidad y reversión | Coordinación conserva el paquete privado existente y lo actualiza al SHA funcional acordado. Completar referencia inmutable de la pareja anterior, delta de módulos, inventario de pendientes y criterio de reportes por aplicado/estado. | Faltan evidencia de HTML/V16, fórmulas/reportes reales e historia pendiente. Nuevas lecturas Google o instalación necesitan un tramo autorizado; aquí no se ejecutan. No restaurar V16 ciegamente si ya existen operaciones de la candidata. |
| 4. Validar en el staging canónico existente | Después de autorización específica: misma pareja frontend/backend, identidad Main/Ops de staging, esquema representativo y sesiones reales. Usar casos de prueba identificados como tales sólo en staging; ninguna venta ficticia en producción. | No utilizar el backend IntegratedStore del ensayo ni crear otra boletera. ACTIVIDADES/Accesos siguen cerrados mientras sus contratos/flujos no estén resueltos. La autorización de staging no autoriza producción. |
| 5. Verificar estación y ticket | En el equipo que realmente vaya a operar: sesión por rol, Web Locks/almacenamiento, recarga, terminal elegida, KDS e impresora o recepción/apertura del ticket digital por el cliente. | Puede hacerse en otro equipo autorizado; no se certifica la iMac bloqueada ni hardware no probado. El ticket sigue siendo obligatorio; fallo de impresión no repite el pago. |
| 6. Presentar decisión de instalación | Consolidar SHA, manifiesto, CI, resultado de staging, prueba de estación, pendientes conciliados y reversión. | Mantener PR/merge/deployment detenidos hasta la autorización correspondiente. Caja no se declara operable por este plan. |

La secuencia mínima de aceptación de staging queda preparada así, sin ejecutarla:

1. **Efectivo y terminal:** cuenta/saldo correctos, un cobro, una comanda por unidad y ticket; ACK perdido/recarga recupera mismo ID/recibo. Terminal requiere además autorización externa real cuando se opere; el software sólo registra el medio.
2. **Transferencia pendiente:** aplicado cero, saldo no liquidado y entrega denegada tanto en UI como servidor, aunque el cliente mande banderas `paid/verified/credit`.
3. **Revisión de Gerencia:** identidad autorizada y evidencia de prueba controlada; confirmar importe completo crea un cobro aplicado ligado al original, que queda intacto. Doble clic/reintento/mismo movimiento en otra cuenta no duplica. Una evidencia simulada en staging prueba el mecanismo, no acredita un ingreso bancario real.
4. **Interrupción/recarga:** recuperar el mismo ID ante escritura parcial, ACK incompleto o 500. Un rechazo explícito previo a efectos permite corregir con otro ID sin borrar el rechazado; cualquier resultado incierto conserva intención y evidencia.
5. **Entrega y cierre:** sólo después de confirmación durable; inventario una vez al entregar físicamente. Crédito/cortesía legítimos conservan autorización. Conciliar reportes con `Cobrado aplicado`, sin sumar dos veces Borrador + Confirmado; no mezclar dinero del proyecto con DOMUS.
6. **Ticket final:** imprimir o entregar archivo confirmado y verificar recepción; recuperar el mismo comprobante tras recarga sin nuevo cobro ni cajón por transferencia.

Estos pasos no autorizan cambiar datos reales, iniciar pruebas Google, instalar ni eludir los bloqueos de revisión. La falta de iMac no impide terminar código/CI/preparación; sí permanece pendiente acreditar el entorno operativo y la estación que se vaya a usar.

## Localización del delta Data/Events de coordinación

Se consultaron las **24 ramas publicadas** en GitHub, se obtuvieron todos sus heads con Git y se examinó el historial de cambios de ambos módulos desde el 3 de noviembre. La rama `coord/domus-ecosistema-20261103` sigue en `0d30678bb8763e328ee0999164e42b8beb5a3503`, del 3 de noviembre. Las búsquedas del historial de coordinación accesible a este hilo no devolvieron un SHA para el delta preventivo comunicado por root. [Evidencia de búsqueda, ramas y huellas](evidence/data_events_lookup_20261106.json).

| Archivo | Último cambio publicado de esta candidata | Resultado |
| --- | --- | --- |
| Data.gs | `70f8df22e3618d136918c40748bf139d05b867c5` | Ya es ancestro de `3f29bdc`; no se vuelve a aplicar. |
| Events.gs | `69aeb07f620dcdc1f38a1614a122a242d14c0b69` | Ya es ancestro de `3f29bdc`; no se vuelve a aplicar. |

**No se localizó un delta independiente integrable.** Esto no prueba que no exista en otro hilo o worktree privado; tampoco demuestra que el delta de root sea equivalente a los commits anteriores. No se reconstruyó ni se duplicó su trabajo. La integración ya está autorizada si aparece un artefacto disponible y compatible: falta **un commit publicado o el patch exacto con su SHA base**, no otra autorización de Steven ni datos bancarios. Se conserva la reserva de root sobre esos módulos.

Queda preparado el cotejo para recibirlo, sin ejecutarlo sobre un artefacto supuesto:

1. Verificar SHA base/objetivo y diff completo; descartar que sea una repetición de los cambios ya presentes. Delimitar los cambios Data/Events y sus pruebas, sin importar archivos del ensayo, configuración de destinos ni respaldos privados.
2. Comprobar que conserva contrato de 35 encabezados, guardas antes de escribir/reanudar journal, separación acuerdo/estado, recuperación financiera y bloqueo de operaciones sin evidencia. No aprobar literales, aforo o reparto por inferencia.
3. Integrar sólo el delta compatible en esta rama. Regenerar con `python3 scripts/build_release.py` y comprobar `--check`. Las regresiones afectadas previstas son `activity_schema_regressions`, `recovery_regressions`, `legacy_cutover_regressions` y `transfer_review_regressions`; ampliar sólo si el diff real lo requiere. Obtener CI del nuevo SHA funcional.
4. Mantener receptores bancarios pendientes, sin pedir información sensible ni configurar Google. La secuencia de aceptación de Caja, recuperación, entrega y ticket anterior ya está preparada y no depende de recibir esos alias para revisar código.

Este seguimiento no cambia código ni repite suites/revisiones de Gemini/Antigravity. La evidencia funcional vigente sigue siendo el SHA `3f29bdc` y su CI exitosa; los cambios posteriores de este tramo son documentación.
