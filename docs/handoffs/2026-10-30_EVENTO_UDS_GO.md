# HANDOFF URGENTE · EVENTO 30 OCT 2026 · DEL CREPÚSCULO AL AMANECER

## Propósito
Este documento sincroniza a Antigravity con la operación real de hoy. No sustituye `AI_HANDOFF.md`, `CURRENT_STATE.md`, `OPERATING_RULES.md` ni los ADRs existentes. Añade únicamente el contrato operativo del evento y los requisitos de integración pendientes.

## Estado operativo confirmado
- Evento: **Del Crepúsculo al Amanecer**
- Organiza: **Universidad del Swinger**
- Fecha operativa: 30 octubre 2026
- Staff: 18:00
- Operación pública: 22:00–06:00
- Fase autoritativa de Caja en STAGING: **Lunar**
- Aforo: **250**
- Sin reingreso
- Guardarropa: **$50**, 100% DOMUS
- Fondo inicial: **$1,000**, préstamo temporal de Universidad del Swinger, no venta ni capital DOMUS
- Responsables Caja: Steven / Ibrah
- Conteo inventario: Steven; valida Pao

## Contrato económico
- Renta DOMUS: $12,000
- Limpieza / operación staff: $1,000
- Obligación total DOMUS: **$13,000**
- Anticipo aplicado: **$6,000**
- Saldo contractual pendiente: **$7,000**
- Performances a cargo del organizador:
  - Sativa $3,000
  - Bella $1,000
  - Total performances $4,000
- Cascada:
  1. Completar DOMUS $13,000
  2. Cubrir performances $4,000
  3. Excedente elegible -> Universidad del Swinger
- Si el evento no recauda suficiente, el organizador conserva la obligación contractual; Oscar López y Arely Orozco responden por el saldo.

## Accesos y tarifas
### Preventa F1
- Pareja $350 / 2 personas
- Unicornio $200 / 1 persona

### Preventa F2
- Pareja $500 / 2 personas
- Unicornio $300 / 1 persona

### Taquilla
- Pareja $600 / 2 personas
- Unicornio $350 / 1 persona
- Single $750 / 1 persona

Reglas:
- Preventas previas se concilian por evidencia real: acceso, nombre/foto, monto, fecha y referencia.
- No hubo boletera externa.
- Taquilla DOMUS: efectivo + terminal.
- Comisión Mercado Pago absorbida por DOMUS.
- Cortesías de acceso: Oscar, Arely o Steven.
- Cortesía suma aforo y vale $0.
- Sólo Steven autoriza cortesía de barra.

## Cuentas abiertas autorizadas
- Oscar
- Arely
- Gibran
- Paulina

No dar crédito automático a otras personas.

## Precios especiales
Fuente comercial autorizada:
- Google Sheet MASTER: pestaña `30OCT_US_PRECIOS`
- STAGING: pestaña `EVENTO_30OCT_PRECIOS`

Principio:
- Precio Lunar DOMUS = base protegida
- Precio Universidad del Swinger = precio público del evento
- Extra evento = precio evento - precio Lunar base
- El proveedor nunca debe recibir más por efecto del sobreprecio.
- Primero se preserva el reparto absoluto del proveedor sobre la base original; el extra queda como participación económica del evento y alimenta la cascada contractual.

### Estado temporal operativo STAGING
Por compatibilidad con el backend preservado:
- 124 productos fueron reconfigurados temporalmente en STAGING con precio Lunar = precio evento y % DOMUS recalculado para mantener exactamente el mismo monto absoluto del proveedor.
- La validación matemática de los 124 productos dio PASS.
- Existe backup: `BACKUP_30OCT_EVENTO_CATALOGO`
- 4 productos quedaron inactivos/bloqueados por no tener Precio Lunar confirmado:
  - Dulce Pelón / ALI-CAN-001
  - Galletas / ALI-CAN-002
  - Chocolates / ALI-CAN-003
  - Galletona / CAN-MENU-10
- Antigravity NO debe activar esos cuatro sin fuente de precio autorizada.

## Requisito arquitectónico permanente
El workaround temporal NO es el diseño final. Antigravity debe implementar de forma canónica:
1. `basePriceDomus`
2. `eventPrice`
3. `eventExtra`
4. `eventExtraBeneficiary`
5. Reparto proveedor calculado sobre `basePriceDomus`
6. Cobro al cliente usando `eventPrice`
7. Conciliación del extra por línea, ticket, evento y cierre
8. Restauración automática del perfil comercial al terminar el evento
9. Perfil de evento separado de Solar/Lunar base
10. Trazabilidad de quién autorizó el perfil y cuándo

## GO gates de hoy
No declarar GO total sin PASS en:
- Health correcto del entorno
- Fase Lunar
- Evento activo correcto
- precios cargados
- productos bloqueados no vendibles
- Caja carga catálogo real
- efectivo
- terminal
- cuentas abiertas
- doble click/retry sin duplicado
- KDS
- entrega descuenta inventario una sola vez
- accesos Pareja/Unicornio/Single
- preventas F1/F2
- cortesía
- guardarropa
- fondo inicial $1,000
- cierre económico $13k DOMUS + $4k performances + excedente
- impresora/cajón físico cuando aplique

## Estado de sincronización
- Esta rama de Antigravity NO debe asumir que `main`, `repair/qa-20261030` y `event/uds-20261030` están integradas.
- El contrato de evento completo vive en `event/uds-20261030/docs/events/2026-10-30_DEL-CREPUSCULO-AL-AMANECER.md`.
- PR #20 contiene la implementación propuesta del perfil de precios de evento.
- No hacer merge a producción durante operación activa sin autorización explícita y evidencia de STAGING.

## Cierre
Después del evento:
- revertir precios temporales con `BACKUP_30OCT_EVENTO_CATALOGO`
- conciliar proveedor/DOMUS/Universidad del Swinger
- integrar la solución canónica de perfiles de evento en arquitectura v15
- actualizar `CURRENT_STATE.md` y ADR correspondiente


## ACTUALIZACIÓN AUDITORÍA FINAL · P0 Y CONTROLES COMPENSATORIOS

### P0-ACCOUNTS · lectura truncada de 500 filas
**Hallazgo productivo confirmado:**
- `POS.gs::cajaSimpleDatos()` lee `CAJA 2!A7:P506` y `COBROS!A7:N506`.
- `Accounts.gs::posBalanceFast_()` usa el mismo límite de 500 filas.
- Producción ya tiene `COBROS` hasta al menos fila 4566.
- Riesgo: una cuenta abierta puede calcular saldo usando consumo/pagos incompletos; una cuenta ya pagada puede reaparecer o liquidarse con saldo incorrecto.
- Impacta especialmente las cuentas autorizadas de Oscar, Arely, Gibran y Paulina.

**Solución canónica ya existente en la línea de reparación:**
- `repair/qa-20261030` sustituye lecturas fijas por `dataRows_` full-history y journal transaccional.
- Antigravity debe integrar esta corrección como requisito arquitectónico, no volver a introducir límites de 500 filas.

**Control compensatorio para el evento de hoy:**
- Hoja productiva `30OCT_UDS_GO`.
- Ledger full-history por ticket para Oscar, Arely, Gibran y Paulina.
- Fórmulas leen `CAJA 2` y `COBROS` hasta fila 5007.
- Al liquidar una cuenta, el operador debe cotejar este ledger; no confiar exclusivamente en el saldo mostrado por UI productiva.

### P0-INVENTORY · KDS vs esquema vigente de INVENTARIO
**Hallazgo productivo confirmado:**
- `KDS.gs` activo intenta interpretar `INVENTARIO` como:
  - columna A = SKU
  - columna B = nombre
  - F/G/H = inicial/salidas/disponible
- La hoja productiva vigente realmente usa:
  - A = Producto / variante
  - B = Familia
  - D = INICIAL REAL
  - G = Entregado por comandas
  - H = Existencia esperada
- Además, el `comandaItem` generado por el POS productivo no conserva `sku`.
- Evidencia histórica en `REQUESTS`: entregas con `INVENTORY_ITEM_NOT_FOUND` para productos reales.
- Resultado: KDS puede entregar correctamente una comanda sin descontar inventario.

**Solución canónica ya existente en la línea de reparación:**
- `repair/qa-20261030`:
  - conserva `sku` dentro de la comanda;
  - usa `deliveryInventoryWrites_`;
  - valida el esquema actual mediante nombres de columnas;
  - usa recetas/INSUMOS cuando existen;
  - exige conteo y fórmulas correctas;
  - no realiza decrementos silenciosos contra una columna errónea.
- Antigravity debe adoptar este modelo y eliminar definitivamente el modelo legacy.

**Control compensatorio para hoy:**
- Hoja productiva `30OCT_UDS_INV`.
- 128 productos del evento con:
  - precio base DOMUS;
  - precio evento;
  - extra por unidad;
  - % DOMUS temporal;
  - monto proveedor protegido;
  - unidades normales registradas;
  - extra facturado;
  - inventario inicial físico;
  - inventario esperado;
  - inventario final físico;
  - diferencia.
- Steven captura conteo inicial.
- Pao valida.
- Al cierre se captura conteo físico final y se reconcilia contra las unidades vendidas.
- Hasta desplegar la reparación, el inventario automático productivo NO se considera autoridad única.

### Control GO productivo creado
Hoja: `30OCT_UDS_GO`

Contiene:
- contrato DOMUS $13,000;
- anticipo $6,000;
- saldo DOMUS $7,000;
- performances $4,000;
- fondo temporal $1,000 como pasivo/préstamo, no venta;
- taquilla real del evento;
- guardarropa 100% DOMUS;
- ventas de productos del evento;
- extra Universidad del Swinger;
- cascada automática DOMUS -> performances -> excedente organizador;
- cuentas abiertas autorizadas con ledger full-history;
- checklist físico de apertura;
- veredicto automático sólo después de completar 9 pruebas físicas.

### Estado de apertura al crear los controles
- Backend productivo: HEALTHY.
- Fase: Lunar.
- Evento activo: Del Crepúsculo al Amanecer.
- Tarifas correctas.
- 128/128 precios de evento: PASS.
- 128/128 montos proveedor protegidos: PASS.
- Backup rollback: PASS.
- Cola KDS previa reciente: sin comandas En preparación / Lista / Pendiente.
- COBROS del evento al momento del corte: $0.
- Guardarropa del evento: $0.
- Ventas de productos del evento: $0.
- No se generaron ventas sintéticas.

### Requisitos post-evento para Antigravity
1. Integrar full-history de cuentas y pagos.
2. Integrar esquema canónico de inventario/recetas.
3. Integrar perfiles temporales de evento sin sobrescribir Precio Lunar base.
4. Persistir `basePriceDomus`, `eventPrice`, `eventExtra`, `eventExtraBeneficiary`.
5. Automatizar apertura/cierre del perfil y rollback.
6. Convertir `30OCT_UDS_GO` en módulo formal de evento/corte.
7. Convertir `30OCT_UDS_INV` en reconciliación automática de inventario por evento.
8. Corregir navegación nativa Apps Script hacia Accesos; GitHub Pages sí fue verificado.
9. Mantener idempotencia: una intención = un requestId = un cobro = un recibo.
10. No declarar PROD_VERIFIED para estas correcciones hasta pruebas reales de STAGING.
