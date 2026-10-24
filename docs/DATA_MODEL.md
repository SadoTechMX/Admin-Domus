# 🗄️ DOMUS OS · DATA MODEL & SCHEMA SPECIFICATION

Especificación de la estructura de tablas, columnas y rangos del libro maestro de Google Sheets.

---

## 📊 Hojas del Libro Maestro

### 1. `CAJA 2` (Operación de Caja y Fase)
* **Celda `F2`:** Fase activa (`Solar` / `Lunar`).
* **Rango `A7:P500`:** Registro de órdenes y cuentas.
  * Col 2 (`B`): Folio del ticket / cuenta (`CTA-...`).
  * Col 4 (`D`): Actividad / Evento.
  * Col 5 (`E`): Nombre del cliente.
  * Col 7 (`G`): Total acumulado.
  * Col 12 (`L`): Importe adeudado.
  * Col 16 (`P`): Estado (`Cancelado`, `Cerrado`, etc.).

### 2. `COBROS` (Libro Mayor Financiero)
* **Rango `A7:N`:** Registro cronológico inmutable de pagos recibidos.
  * Col 1 (`A`): Folio del recibo (`REC-...`).
  * Col 2 (`B`): Fecha y hora.
  * Col 3 (`C`): Origen (`Caja`, `Accesos`, `Guardarropa`).
  * Col 4 (`D`): Folio / Ticket relacionado.
  * Col 5 (`E`): Método de pago (`Efectivo`, `Terminal 1`, `Terminal 2`, `Transferencia`).
  * Col 14 (`N`): Monto efectivamente cobrado en puerta ($).

### 3. `COMANDAS` (Cola de KDS)
* **Rango `A7:L`:** Cola de preparación para Barra y Cocina.
  * Columnas: Folio, Estación (`Barra` / `Cocina`), Producto, Cantidad, Notas, Estado (`Pendiente`, `Preparando`, `Listo`, `Entregado`), Timestamp.

### 4. `CATALOGO` (Carta de Productos)
* **Rango `A7:T306`:** Catálogo de productos.
  * Col 1 (`A`): Nombre del producto.
  * Col 2 (`B`): Grupo / Categoría (`Alimentos`, `Destilados`, etc.).
  * Col 3 (`C`): Precio base.
  * Col 7 (`G`): SKU único.
  * Col 8 (`H`): Destino de comanda (`Barra` / `Cocina`).
  * Col 9 (`I`): Activo para venta (`Sí` / `No`).
  * Col 16 (`P`): Flag de precios Solar/Lunar (`TRUE` / `FALSE`).
  * Col 17 (`Q`): Precio Solar.
  * Col 18 (`R`): Precio Lunar.

### 5. `REQUESTS` (Ledger Transaccional de Idempotencia)
* **Rango `A:H`:** Creada en Fase 0 para deduplicación y auditoría de peticiones API.
  * Col 1 (`A`): `REQUEST_ID` (Identificador único generado en cliente).
  * Col 2 (`B`): `ACTION` (Nombre de la función ejecutada).
  * Col 3 (`C`): `PAYLOAD_HASH` (Hash SHA-256 canónico del payload).
  * Col 4 (`D`): `DEVICE_ID` (Identificador del navegador/terminal).
  * Col 5 (`E`): `STATUS` (`PROCESSING`, `COMPLETED`, `FAILED`, `REQUIRES_REVIEW`).
  * Col 6 (`F`): `CREATED_AT` (ISO 8601).
  * Col 7 (`G`): `COMPLETED_AT` (ISO 8601).
  * Col 8 (`H`): `RESPONSE` (JSON serializado con el recibo generado).

### 6. `ACCESO` (Check-in, Taquilla, Preventas & Guardarropa)
* **Rango `A7:AF500`:** Registro transaccional de asistentes con desglose comercial (ADR-005):
  * Col 1 (`A`): `accessId` (Folio único: `A-0001`, `A-0002`).
  * Col 2 (`B`): `checkedInAt` (Timestamp de ingreso).
  * Col 3 (`C`): `eventId` / `activity` (Nombre del evento activo).
  * Col 4 (`D`): `customer` (Nombre o alias del asistente).
  * Col 5 (`E`): `email` (Opcional).
  * Col 6 (`F`): `phone` (10 dígitos).
  * Col 7 (`G`): `ticketTypeId` (General, Pareja, Trío, Early Bird, Preventa 1, VIP, etc.).
  * Col 8 (`H`): `persons` (Aforo real que representa este boleto).
  * Col 9 (`I`): `wardrobeQty` (Cantidad de prendas en guardarropa).
  * Col 10 (`J`): `faceValue` (Valor nominal comercial del boleto).
  * Col 13 (`M`): `wardrobeAmount` (Total por prendas de guardarropa).
  * Col 14 (`N`): `totalCommercialValue` (faceValue + wardrobeAmount).
  * Col 15 (`O`): `amountPaidAtDoor` (Efectivamente cobrado en puerta DOMUS).
  * Col 16 (`P`): `amountDueAtDoor` (Saldo pendiente en puerta).
  * Col 17 (`Q`): `paymentStatus` (`CONFIRMADA`, `PAGADO_EXTERNAMENTE`, `PENDIENTE_VERIFICACION`, `RECHAZADA`).
  * Col 18 (`R`): `externalTicketId` (Folio de preventa / código QR de boletera).
  * Col 19 (`S`): `courtesyAuth` (Autorización de cortesía / motivo).
  * Col 20 (`T`): `salesChannel` (`TAQUILLA_DOMUS`, `PREVENTA_DOMUS`, `BOLETERA_EXTERNA`, `TRANSFERENCIA_DIRECTA`, `LISTA`, `CORTESIA`).
  * Col 21 (`U`): `ticketProvider` (Nombre de la boletera externa: Boletia, Passline, Eventbrite, etc.).
  * Col 27 (`AA`): `paymentMethod` (`Efectivo`, `Terminal 1`, `Terminal 2`, `Transferencia`, `Externo`, `Gratis`).
  * Col 31 (`AE`): `ticketGuardarropa` (Folio físico: `GUA-A-0001`).
  * Col 32 (`AF`): `wardrobeReturned` (Booleano / `DEVUELTO`).

### 7. `ACTIVIDADES` (Programación de Eventos y Catálogo de Boletos)
* **Rango `A7:M100`:**
  * Col 1 (`A`): Nombre del evento.
  * Col 2 (`B`): Fecha.
  * Col 3 (`C`): `eventType` (`CLUB_NOCTURNO`, `FIESTA_TEMATICA`, `TALLER`, `RAVE`, `PERFORMANCE`, etc.).
  * Col 4 (`D`): Organizador / Aliado.
  * Col 5 (`E`): Tarifa General ($).
  * Col 6 (`F`): Tarifa Pareja ($).
  * Col 7 (`G`): Tarifa Trío ($).
  * Col 8 (`H`): Tarifa Guardarropa ($).
  * Col 9 (`I`): Capacidad / Aforo Máximo.
  * Col 12 (`L`): Estado del Evento (`Confirmado`, `En Venta`, `Finalizado`).
  * Col 13 (`M`): Notas / JSON de `ticketTypes` personalizados.
