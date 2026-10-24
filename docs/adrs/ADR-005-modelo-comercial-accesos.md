# ADR-005: Modelo Comercial Integral de Accesos y Taquilla (Fase 0.5)

## Estado
**APROBADO** (2026-10-24)

## Contexto
El módulo original de Accesos registraba entradas bajo un modelo simplificado de "General / Pareja / Trío" con un único método de pago. Esto provocaba un vacío crítico para la conciliación financiera y el futuro Corte X/Z:
1. No distinguía **de dónde proviene el boleto** (venta en puerta vs preventa anticipada vs boletera externa aliada).
2. Forzaba a asentar como "efectivo/cobro de taquilla" boletos adquiridos externamente en plataformas (ej. Boletia, Passline, Eventbrite), inflando ficticiamente el ingreso de puerta en `COBROS`.
3. No admitía tipos de boleto personalizados por evento (ej. Early Bird, Taller NEC, Beca, VIP).
4. No gestionaba transferencias pendientes de validación bancaria ni cortesías con desglose de valor comercial y responsable.
5. Mezclaba el cobro de entrada con el de guardarropa, impidiendo que un asistente con boleto externo pagado comprara guardarropa en efectivo sin contaminar la cuenta de taquilla.

## Decisión
Implementar la **Fase 0.5 — Ticketing & Access Commerce** antes de construir el Corte X/Z:

1. **Separación de 5 dimensiones ontológicas:**
   * **`EVENT_TYPE`**: Categoría de actividad (`CLUB_NOCTURNO`, `FIESTA_TEMATICA`, `TALLER`, `PERFORMANCE`, etc.).
   * **`TICKET_TYPE`**: Tipo de boleto perteneciente al evento (`GENERAL`, `PAREJA`, `TRIO`, `EARLY_BIRD`, `PREVENTA_1`, `PREVENTA_2`, `VIP`, `CORTESIA` o personalizados).
   * **`SALES_CHANNEL`**: Canal comercial (`TAQUILLA_DOMUS`, `PREVENTA_DOMUS`, `BOLETERA_EXTERNA`, `TRANSFERENCIA_DIRECTA`, `LISTA`, `CORTESIA`, `MEMBRESIA`).
   * **`PAYMENT_METHOD`**: Medio de cobro en puerta (`EFECTIVO`, `TERMINAL_1`, `TERMINAL_2`, `TRANSFERENCIA`, `EXTERNO`, `GRATIS`).
   * **`PAYMENT_STATUS`**: Estado transaccional (`CONFIRMADA`, `PAGADO_EXTERNAMENTE`, `PENDIENTE_VERIFICACION`, `RECHAZADA`).

2. **Atribución de Cobros e Ingresos en Puerta:**
   * Si `SALES_CHANNEL === 'BOLETERA_EXTERNA'` o `PREVENTA_DOMUS` pagada: la entrada tiene **$0 por cobrar en puerta** y **NO genera renglón de ingreso en `COBROS`** para admisión. Se registran folio externo, proveedor y valor bruto para conciliación contable posterior.
   * Si el asistente adquiere prendas de **Guardarropa ($50 c/u)**, el guardarropa se cobra como transacción independiente y genera su propio recibo en `COBROS` bajo el rubro "Guardarropa", sin mezclarse con la taquilla.

3. **Esquema de 22 Campos en Registro de Accesos:**
   `accessId`, `eventId`, `ticketTypeId`, `salesChannel`, `ticketProvider`, `externalTicketId`, `customer`, `phone`, `email`, `persons`, `faceValue`, `amountPaid`, `amountDue`, `paymentMethod`, `paymentStatus`, `paymentReference`, `verifiedBy`, `checkedInAt`, `checkedInBy`, `wardrobeQty`, `wardrobeAmount`, `requestId`.

## Consecuencias
* **Positivas:** Permite conciliación exacta por boletera, arqueo de taquilla sin dinero fantasma, control de aforo por canal y soporte a cualquier tipo de evento.
* **Negativas:** La interfaz de check-in requiere un flujo de 4 pasos dinámicos, que se optimiza con selección rápida por botones táctiles.
