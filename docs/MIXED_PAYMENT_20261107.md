# Caja: efectivo más una terminal — 7 noviembre 2026 UTC

**IMPLEMENTED / LOCAL_TESTED; pago mixto aún no instalado.** Base `687a8de915bd9d9489ca132bdb912138df738b9b`, misma rama `repair/reconcile-pr18-main-20261105`, un solo editor. UI `20261107-mixed-12`; fuente backend `a540b1d969a74f126d8fe9236f761c07cfbf0e7d4131b4dc16c29a1eaafbf003`. El manifiesto incluye ahora la huella del Print Bridge además de app/Index/bundles. Este tramo no instaló código, abrió PR, fusionó, consultó Google ni modificó datos reales.

## Coordinación y alcance

Steven/coordinación autorizó implementar el mínimo de efectivo/terminal con una intención y un recibo, previa comprobación de que nadie lo implementaba. Se revisaron ramas y PR abiertos mediante GitHub, búsqueda de commits mixto/mixed/split y mensajes de coordinación: no se encontró trabajo activo publicado del mixto. La rama sigue siendo la única implementación de esta corrección. No se incorporó el backend IntegratedStore del ensayo detenido. No se atribuye a Gemini/Antigravity revisión del delta nuevo; las revisiones anteriores no lo cubren.

Coordinación reportó que la candidata 687 se instaló en **staging**, permitió cerrar la revisión resuelta y conservó la misma venta ficticia de $200. La misma comanda fue entregada y su consumo comprobado allí, sin nuevo cobro; el periodo temporal se restauró. Es evidencia recibida, no una nueva prueba ejecutada desde este host. Actualiza el pendiente de entrega del documento anterior, sin acreditar producción. El ticket físico y el mixto siguen pendientes de su prueba real aislada.

## Contrato implementado

- Sólo efectivo + **una** de Terminal 1/Terminal 2. Dos importes positivos en centavos cuya suma debe igualar exactamente el saldo actual, incluso al liquidar una cuenta existente. No admite transferencias ni dos terminales dentro del mixto.
- Se captura importe de terminal, referencia de su comprobante y declaración explícita del operador de que fue aprobado. Cambiar importe, terminal o referencia retira esa declaración. **No hay integración con adquirente/banco, cargo automático de tarjeta ni verificación externa.** No se afirma unicidad global de referencias de terminal entre operaciones distintas.
- El efectivo aplicado es saldo menos terminal. Recibido/cambio/propina corresponden sólo al efectivo; la propina no aumenta el saldo de la venta ni el importe de terminal. Ejemplo de fixture: cuenta $200 = $80 efectivo + $120 terminal; recibido $100, propina $5, cambio $15. Propina por tarjeta queda fuera de este mínimo.
- Una solicitud `cajaSimpleRegistrar`, un `requestId`, un resultado, un recibo del cliente. COBROS conserva medios existentes y recibe dos filas nuevas con folios `<recibo>-E` y `<recibo>-T`, mismo ticket y etiqueta `CAJA-RAPIDA:<requestId>`. La referencia terminal queda en el resultado durable de REQUESTS/journal y en el recibo; no reemplaza la etiqueta de enlace en COBROS.
- Ambas filas y las comandas se preparan en un único journal con filas distintas reservadas bajo el lock existente. No se afirma atomicidad física de múltiples escrituras Sheets: ante fallo parcial, la misma intención reanuda el mismo plan. Se conserva el enlace a contenido/dispositivo, las guardas de legado y el bloqueo de otro journal mientras exista uno incompleto.
- KDS exige REQUESTS COMPLETED y los dos componentes únicos, aplicados y compatibles con el resultado original. Rechaza importes/medios/vínculos alterados, filas duplicadas y componentes pendientes. Mantiene crédito/cortesía/transferencia y el estado de preparación previo a la entrega. No altera fórmulas ni reglas de consumo.
- ACK incompleto, suma distinta, otro ID o desglose diferente conserva ID/cuerpo/carrito/Outbox. No produce recibo ni apertura del cajón. La recuperación devuelve el mismo recibo, sin otro cobro. La retención de colas desconocidas al arrancar sigue vigente; estas pruebas no conceden salida a los 15 IDs históricos.
- Ticket en pantalla, HTML descargable y Print Bridge muestran el desglose, referencia y cambio. La confirmación normal solicita una impresión y una apertura de cajón por la parte en efectivo, ambas con IDs estables basados en el recibo. Recuperar/descargar/reimprimir no vuelve a cobrar ni abre automáticamente el cajón. El puente mantiene su contrato de apertura por efectivo; no recibe una orden de tarjeta. La impresión simulada no demuestra salida física.

## Evidencia aislada

| Prueba | Resultado local |
| --- | --- |
| `mixed_payment_regressions.js` | **17 PASS**, módulos reales y Sheets en memoria: ambas terminales, cuentas existentes, centavos/cambio/propina, rechazos sin efectos, tres cortes en COBROS, fallo al completar REQUESTS, integridad KDS, prevalidación de ambas filas, estados de entrega, ACK alterado y recuperación con recarga nativa/REST. |
| `browser_mixed_payment.js` | **4 PASS**, Chromium con tráfico externo interceptado: captura y aprobación explícita, doble clic, una intención/recibo/impresión/cajón, ticket descargable y recuperación de ACK incompleto sin segundo pago. |
| `bridge_recovery_regressions.py` | **12 PASS**, incluye desglose mixto, cambio/propina, un trabajo por ID y ausencia de pulso de cajón en el documento. CUPS simulado. |
| Regresiones relevantes | Backend 27; cliente 12; reconciliación 17; revisión 16; recarga 8; transporte 13; cutover 9; transferencias 20; recibo 4; cierre Outbox 8; periodo 11; Chromium general 21, dos pestañas 1 y periodo/retención 4. Build/manifiesto verificados. |

El primer pase de la suite nueva falló por dos supuestos del arnés: suponía COMANDAS escrita antes de COBROS (el journal ordena por hoja) y usaba un nombre incorrecto del helper de REQUESTS. Se corrigió el arnés; la prueba de fallo parcial utiliza la unidad del plan durable. El fixture no calcula fórmulas generales de Sheets ni comprueba un débito bancario o stock físico. La CI del SHA resultante se verifica aparte, sin reutilizar el verde de 687.

## Siguiente comprobación mínima y reversión

1. Revisión complementaria del delta exacto, sin repetir auditorías anteriores: backend/journal/ACK por Gemini; desglose y recibo/puente por IDE, sólo si coordinación confirma su participación. Aquí no se les enviaron tareas ni datos.
2. En un tramo autorizado, cotejar e instalar la pareja app/backend **sólo en staging existente**. Cotejar también el Print Bridge por su huella antes de exigir desglose térmico: una instalación anterior no lo imprime. No copiar secretos ni alterar configuración bancaria.
3. Confirmar periodo vigente antes de capturar. Probar una intención nueva de fixture para el mixto y acreditar suma/aplicación de ambas filas, un recibo, entrega al cliente y recuperación sin duplicación. No repetir la venta de $200 anterior como si no hubiese ocurrido. La prueba del terminal se declara simulada salvo evidencia real autorizada; no pasar una tarjeta real para completar un ensayo.
4. El ticket físico sigue dependiendo de impresora conectada y salida comprobada. Si falla, recuperar el recibo y entregar una copia digital comprobada; no repetir el cobro para imprimir. Producción sigue sin autorización ni evidencia suficiente de compatibilidad completa.

Revertir código no deshace cobros. Antes de volver a 687 hay que preservar pendientes/REQUESTS/journal y recibos mixtos. El cliente anterior no valida ACK mixtos y KDS anterior no reconoce sus componentes para nuevas entregas; un downgrade indiscriminado puede dejarlos bloqueados. No borrar las dos filas, la cola ni el historial de impresión, ni convertir la operación a dos ventas. Transferencias/configuración bancaria, ACTIVIDADES35, conciliación histórica y pareja inmutable de producción conservan sus bloqueos previos.
