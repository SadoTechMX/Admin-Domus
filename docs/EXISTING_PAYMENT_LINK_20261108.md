# Usar pago existente; nuevo cobro $0

Estado: implementación aislada sobre `479fd81`, UI `20261108-existing-payment-17`. Steven aprobó explícitamente el diseño: Gerencia debe ver cuenta, importe y folio y confirmar **«Usar pago existente. Nuevo cobro: $0»**. Esta aprobación sustituye la ambigüedad documentada en la entrega anterior; no autoriza instalar ni operar la candidata.

## Flujo implementado

En la revisión de transferencias, Gerencia selecciona el pendiente y abre **Revisar pago existente**. `prepararVinculoPagoExistente` consulta bajo lock, sin escribir, y muestra cuenta, folio pendiente, folio del pago confirmado, importe, medio, fecha, responsable y evento/proyecto. No elige un pago entre varias alternativas ambiguas.

La casilla de confirmación comienza vacía. Se exigen motivo y referencia del comprobante revisado; el diálogo final repite cuenta, importe y folio y declara nuevo cobro $0. La confirmación bancaria queda deshabilitada mientras esta revisión está abierta. `vincularPagoExistente` vuelve a cotejar todo en el servidor y registra una resolución administrativa separada.

## Condiciones del vínculo

- GERENCIA/ADMIN con principal autorizado por servidor. Caja no puede consultar ni ejecutar este flujo; GET y llamadas sin contexto autenticado están bloqueados.
- Un pendiente original compatible, una cuenta con una sola intención de pedido y un único pago posterior por **efectivo, Terminal 1, Terminal 2 o mixto efectivo/una terminal**. El mixto conserva su folio principal y sus dos componentes originales.
- El pago corresponde exactamente a la cuenta y al importe pendiente completo. Su venta es sólo un abono, sin productos/unidades nuevos. Debe estar `CONFIRMADA`, `paid:true`, `verified:true`, con REQUESTS y journal únicos/completados y COBROS correspondiente en estado Confirmado e importe aplicado exacto.
- Pedido y pago comparten la misma jornada, evento y proyecto de origen; la jornada debe seguir abierta al crear el vínculo. Se verifican identidad del dispositivo, contexto de apertura y cronología de las intenciones. No se reasignan registros por nombre o fecha.
- La cuenta está saldada por ese pago, sin importes adicionales, unidades canceladas, registros sueltos ni otras resoluciones incompatibles. El servidor compara la huella de la propuesta, IDs, folios, importe, medio, componentes y unidades antes de preparar el journal.

Importes diferentes, varios pagos, pago parcial, cuentas ampliadas, otro evento/proyecto/jornada, un pago de otra cuenta, otras transferencias o historial legado sin evidencia completa requieren conciliación separada. No se reutiliza un pago ni cualquiera de sus componentes para otro pendiente. No se importan los V9 simulados ni la cola real retenida.

El estado confirmado representa evidencia del POS y de su revisión operativa; **no hay consulta nueva al banco ni al adquirente de la terminal**. La referencia de comprobante es una declaración humana, no una validación automática externa.

## Registros, recuperación y cierre

La resolución añade sólo su REQUESTS y journal. El plan tiene **cero escrituras comerciales**, que también se comprueba antes de recuperarlo. Conserva intactos COBROS, las intenciones originales, CAJA 2, COMANDAS e inventario. `linkedAmount` identifica dinero ya registrado; `newCharge`, `amountApplied`, `refund` e `inventoryMovement` son cero. No genera otro recibo financiero, impresión ni apertura de gaveta.

La mutación usa el lock del servidor y el vínculo `requestId/action/payloadHash/deviceId` existente. La misma intención devuelve su resultado; cambiar cuerpo/dispositivo se rechaza. Dos intenciones que compiten por el mismo pago dejan como máximo un vínculo completado. El rechazo probado antes de efectos conserva su ID y permite una consulta e intención nuevas; una respuesta incierta conserva su ID y cuerpo para recuperación.

Los lectores exigen tanto REQUESTS como journal completados y cotejan nuevamente las fuentes y sus huellas. Un plan/resultado ilegible, duplicado, incompleto o modificado mantiene el bloqueo. Antes de reanudar un vínculo parcial también se revisa la cuenta actual; no se completa si aparecieron otros importes, unidades canceladas o pagos incompatibles. Un ACK vacío o de otra intención no elimina Outbox ni se convierte en recibo de venta.

KDS reconoce el vínculo completado como evidencia de pago de las unidades originales. **No cambia su estado de entrega**: preparar, marcar lista y entregar siguen sus acciones normales; inventario se descuenta únicamente al entregar. Si ya existe entrega registrada, el vínculo la conserva sin repetir consumo.

El corte deja de tratar esa transferencia como pendiente y agrega `linkedPayments` a su evidencia administrativa. Sólo cuenta el movimiento financiero original, una vez, con sus componentes y propinas originales. Una comanda no entregada sigue bloqueando el corte. Un ingreso bancario tardío sobre el pendiente vinculado queda bloqueado para conciliación, sin nueva aplicación ni devolución automática. Una cancelación concurrente que llega después del vínculo recibe rechazo probado sin efectos.

## Pruebas y límites

- `tests/existing_payment_link_regressions.js`: **16 casos** con código real y servicios en memoria. Efectivo/dos terminales/mixto; originales sin cambios; entrega y corte; permisos/principal; IDs, cuenta, importes, jornada y componentes; pago/ledger/journal corruptos; reutilización; rechazo obsoleto; interrupción de journal y REQUESTS; plan comercial adulterado; cuenta cambiada antes de recuperar; ingreso tardío y entrega previa.
- `tests/existing_payment_link_transport.js`: **6 casos**, **30 variantes de ACK inválido** en nativo/REST, recarga, 500 parcial, rechazo sin efectos, dos contextos concurrentes con Web Locks y archivo explícito de una revisión resuelta. Se conservan carrito, recibo financiero previo y evidencias originales.
- `tests/browser_existing_payment_link.js`: **4 casos en Chromium**, con doble clic, dos pestañas reales, cuenta modificada y ausencia de pago compatible. Cuenta/importe/folio se ven y se repiten en la confirmación; ninguna solicitud de venta o confirmación bancaria, impresión ni gaveta. Todas las solicitudes remotas se interceptan.
- Regresiones pertinentes: propuesta 19, cancelación 16, confirmación 20, jornadas 23, recuperación 27, mixto 17 y salida de revisión 8. Compilación, paridad y guardas se verifican con los artefactos finales; CI se coteja por SHA exacto.
- El primer fixture mixto omitió `tip:0`, campo obligatorio del contrato existente; falló antes de preparar la venta. Se corrigió el fixture sin relajar el cálculo del POS. Los 500/422 deliberados de las suites no son transacciones ni errores bancarios reales.
- Versiones locales verificadas: Node 24.22.1, Python 3.12.14 y Playwright 1.62.1. Paridad de los cinco artefactos, guardas de producción 4 y seguridad del arnés 3 pasaron; CI usa Node 22 y Python 3.12.
- Concurrencia probada: dos contextos y dos pestañas, con despacho simulado serializado bajo el lock del código real. Esto no certifica concurrencia distribuida de Google, rendimiento sobre el volumen productivo ni atomicidad externa de Sheets. No se validaron fórmulas completas, banco o productos físicos con estos mocks.

## Compatibilidad, revisión y reversión

No añade columnas ni modifica esquemas de negocio; incorpora dos acciones autenticadas y un resultado administrativo nuevo. Cliente, KDS, backend y lectores de corte deben instalarse como una pareja compatible. Las guardas de SEMANA/ACTIVIDADES y la conciliación de merma siguen pendientes por separado; no se retiraron ni se tocaron fórmulas, datos compartidos o impresión.

Para revisión independiente del delta: cotejar Payments/Idempotency/Auth/Api (vínculo y recuperación, ausencia de cobro), KDS/Journeys (permiso y conteo único), y app/index (confirmación explícita, ACK e intenciones concurrentes). No se atribuye una revisión nueva a Gemini o Antigravity: sus revisiones anteriores no cubren este cambio. La rama propietaria y el remoto coincidían en `479fd81`, el checkout estaba limpio y no había otro editor activo en este entorno; la búsqueda de coordinación visible no encontró otra implementación del vínculo.

Antes de instalar se necesita revisar este delta y validar la pareja en staging autorizado, preservando respaldo y colas. Después de registrar vínculos, **no es seguro volver a un backend que los ignore**: podría reaparecer el pendiente o perderse su permiso de entrega. La reversión debe detener nuevas mutaciones y conservar REQUESTS/journal junto con lectores compatibles; nunca borrar resoluciones o confirmar de nuevo para simular una reversión.

Sin PR, merge, despliegue, datos de producción, cola real o ajustes de impresión. El resultado no certifica operación productiva.
