# 🗄️ DOMUS OS · DATA MODEL & SCHEMA SPECIFICATION

Especificación de la estructura de tablas y rangos del libro maestro de Google Sheets.

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
  * Col 3 (`C`): Origen (`Caja`, `Accesos`, etc.).
  * Col 4 (`D`): Folio / Ticket relacionado.
  * Col 5 (`E`): Método de pago (`Efectivo`, `Tarjeta`, `Transferencia`).
  * Col 14 (`N`): Monto cobrado ($).

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
