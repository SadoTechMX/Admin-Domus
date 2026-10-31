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
