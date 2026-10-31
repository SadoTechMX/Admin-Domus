# DOMUS Economic OS v15 — Arquitectura Antigravity

## Objetivo

Convertir Admin-Domus en un sistema operativo económico integral para DOMUS capaz de rastrear cada peso, obligación, activo, servicio, proyecto, artista, producto, evento y unidad de negocio desde su origen hasta su resultado.

El sistema debe responder siempre:

1. ¿Qué ocurrió?
2. ¿Qué unidad/proyecto lo originó?
3. ¿Qué producto/servicio/artista está involucrado?
4. ¿Quién pagó y quién cobra?
5. ¿Cuánto ingresó?
6. ¿Cuánto costó?
7. ¿Cuánto se debe repartir?
8. ¿Dónde está el dinero?
9. ¿Qué obligación o derecho de cobro creó?
10. ¿Qué resultado produjo?
11. ¿Qué evidencia respalda el movimiento?

## Principio rector

DOMUS no se modela como un POS con reportes. Se modela como una plataforma económica multidimensional.

VENTA != COBRO != INGRESO DEVENGADO != EFECTIVO DISPONIBLE != GASTO != RETIRO != DEUDA != APORTE != CUSTODIA != PROPINA != TRANSFERENCIA INTERNA != CAPEX.

Nunca mezclar categorías.

## Inspiraciones de arquitectura

Patrones estudiados:

- ERP / contabilidad analítica: Odoo.
- Dimensiones financieras y project-to-profit: Microsoft Dynamics 365 Business Central.
- Separación de cargos y transferencias multi-beneficiario: Stripe Connect.
- CRM cultural unificado: Tessitura.
- POS + inventario + labor + COGS: patrones de hospitality/restaurant ERP.
- Galería / consignación / artista / obra: patrones de gallery-management systems.

DOMUS no copia ningún producto. Absorbe patrones útiles y los adapta a su arquitectura y principios.

## 1. Universal Economic Ledger

Toda mutación económica produce un registro inmutable.

Entidad lógica:

`ECONOMIC_ENTRY`

Campos mínimos:

- entry_id
- timestamp
- business_date
- event_id
- source_module
- source_record_id
- entry_type
- account_from
- account_to
- gross_amount
- fee_amount
- tax_amount
- net_amount
- currency
- status
- operator
- evidence_url
- reversal_of
- idempotency_key
- created_at
- version

Tipos mínimos:

- SALE
- PAYMENT
- TIP
- PROCESSING_FEE
- COGS
- EXPENSE
- PAYROLL
- TRANSFER
- CASH_WITHDRAWAL
- CASH_DEPOSIT
- OWNER_CONTRIBUTION
- CUSTOMER_RECEIVABLE
- SUPPLIER_PAYABLE
- DEBT_PAYMENT
- REFUND
- REVERSAL
- INVENTORY_ADJUSTMENT
- CONSIGNMENT_ACCRUAL
- ARTIST_SETTLEMENT
- PROJECT_SETTLEMENT
- CAPEX
- FUND_ADVANCE
- FUND_RETURN

Nunca borrar entries. Correcciones = reversa + nuevo asiento.

## 2. Dimensiones universales

Cada movimiento puede portar dimensiones. Inspirado en contabilidad analítica y ERP dimensional.

Dimensiones iniciales:

- UNIT: DOMUS / SOLAR / LUNAR / INFRAMUNDO / ESFINTER / 4_DE_OROS / NEC
- PROJECT
- EVENT
- ACTIVITY
- PRODUCT
- SKU
- SERVICE
- ARTIST
- COLLECTIVE
- PROVIDER
- CUSTOMER
- STAFF
- SPACE
- SALES_CHANNEL
- PAYMENT_CHANNEL
- COST_CENTER
- REVENUE_CENTER
- CAMPAIGN
- CONTRACT
- ASSET
- INVENTORY_LOCATION

Regla: no crear una cuenta contable distinta para cada proyecto/artista/producto. Usar dimensiones para análisis transversal.

## 3. Financial Allocation Engine

Una venta puede pertenecer a varios beneficiarios.

Ejemplo:

Venta obra = $1,000

- artista 70% = $700
- DOMUS 30% = $300
- comisión terminal = $X
- impuesto = $Y

El sistema debe registrar:

- cobro bruto
- comisión
- neto
- obligación con artista
- ingreso DOMUS
- liquidación posterior
- reversa proporcional si existe devolución

Modelo:

`ALLOCATION_RULE`

- rule_id
- trigger_type
- scope
- beneficiary
- percentage
- fixed_amount
- priority
- valid_from
- valid_to
- approval_required
- version

Nunca recalcular historia con reglas nuevas.

## 4. Project / Event Profitability

Cada proyecto, evento, artista, taller, producto y servicio debe tener una vista de rentabilidad:

INGRESOS
- vendidos
- cobrados
- por cobrar
- devengados

COSTOS
- COGS
- nómina
- proveedor
- artista
- seguridad
- producción
- marketing
- plataforma
- renta imputada
- servicios imputados
- otros

RESULTADO
- margen bruto
- contribución
- resultado operativo
- caja generada
- ROI
- break-even
- avance a meta

Distinguir:
- previsto
- comprometido
- ejecutado
- pagado/cobrado

## 5. Product / Service / Artist Economics

Cada objeto monetizable debe tener un perfil económico.

`ECONOMIC_OBJECT`

Tipos:
- PRODUCT
- SERVICE
- EVENT
- WORKSHOP
- CLASS
- ARTWORK
- ARTIST
- PROJECT
- MEMBERSHIP
- RENTAL
- SPONSORSHIP
- IP
- MERCH
- FOOD
- DRINK

Campos:

- object_id
- object_type
- name
- owner
- unit
- active
- sale_price
- cost_method
- standard_cost
- provider
- allocation_rule
- inventory_link
- tax_profile
- revenue_account
- cost_center
- profitability_target

## 6. Inventory + COGS

El inventario se descuenta sólo por entrega física válida.

Flujo:
SALE -> PAYMENT -> KDS -> DELIVERED -> INVENTORY_CONSUMPTION -> COGS

Cortesías:
- ingreso = 0
- inventario sí disminuye
- COGS sí existe

Cancelación antes de entrega:
- no COGS
- no reducción de inventario

Métodos futuros de costo:
- estándar
- promedio
- FIFO

Fase inicial: costo unitario real por SKU + recetas.

## 7. Cash & Treasury

Separar cuentas físicas/electrónicas.

`TREASURY_ACCOUNT`

Ejemplos:
- Caja Barra
- Caja Acceso
- Mercado Pago Pao
- Bancos DOMUS
- Efectivo Steven
- Custodia Ibrah
- Fondos por comprobar

Cada cuenta:
- saldo inicial
- entradas
- salidas
- saldo esperado
- saldo real
- diferencia
- última conciliación
- responsable

## 8. Accounts Receivable / Payable / Debt

Cada obligación tiene ID inmutable.

`OBLIGATION`

- obligation_id
- direction: RECEIVABLE / PAYABLE
- counterparty
- concept
- original_amount
- applied_amount
- balance
- due_date
- priority
- status
- source
- evidence
- owner
- settlement_account

Estados:
- PENDING
- PARTIAL
- SETTLED
- UNDER_REVIEW
- DO_NOT_PAY
- OVERDUE

Cobrar una CxC no genera otra venta.
Pagar una CxP no vuelve a generar el gasto histórico.

## 9. Payroll / Labor

`SHIFT_COST`

- staff
- role
- unit
- event
- shift_start
- shift_end
- rate_type
- rate
- amount
- status
- paid_entry_id

Permitir:
- tarifa por jornada
- hora
- fijo mensual
- comisión
- reparto

## 10. Cultural CRM

Una persona puede ser simultáneamente:
- cliente
- miembro
- artista
- tallerista
- colaborador
- proveedor
- staff
- patrocinador
- creador

No duplicar perfiles por rol.

`PARTY`
+
`PARTY_ROLE`

Debe conectar:
- asistencia
- compras
- membresía
- talleres
- proyectos
- arte
- colaboraciones
- pagos
- deudas/cobranza
- consentimiento y privacidad cuando aplique

## 11. Analytics Layer

Dashboards mínimos:

### Dirección
- ventas hoy / semana / mes
- margen
- resultado operativo
- liquidez
- deuda
- CxC / CxP
- caja
- break-even
- avance a meta
- alertas

### Proyecto / evento
- ingresos
- costos
- margen
- staff
- inventario
- beneficiarios
- liquidaciones

### Producto
- unidades
- ingreso
- COGS
- margen
- merma
- rotación

### Artista / proveedor
- ventas
- reparto
- saldo
- pagos
- obra/stock

### Comunidad
- asistentes
- retorno
- ticket
- membresía
- participación por unidad

## 12. Data Quality

Cada métrica debe llevar quality_status:

- REAL
- RECONCILED
- ESTIMATED
- PENDING
- UNDER_REVIEW

La UI no puede mostrar ESTIMATED como REAL.

Si falta COGS:
- no declarar utilidad neta definitiva.

Si falta arqueo:
- no declarar caja conciliada.

## 13. API Domain Contract

Extender el patrón actual de Apps Script sin crear un backend paralelo.

Dominios lógicos:

- finance.summary
- finance.daily
- finance.period
- finance.ledger
- finance.treasury
- finance.obligations
- finance.receivables
- finance.payables
- finance.allocations
- finance.profitability
- analytics.products
- analytics.events
- analytics.artists
- analytics.units
- close.open
- close.finalize
- close.adjust

Los nombres finales deben respetar el router real de Code.gs cuando se implemente.

## 14. Compatibilidad actual

Preservar:
- Frontend estable v14
- Apps Script producción v23
- KDS 2.1
- COBROS inmutable
- inventario sólo al ENTREGAR
- Accesos/Forza aislado de mutaciones financieras de Caja
- Outbox con idempotencia y cuarentena
- GitHub Pages frontend
- Google Sheets como capa operacional/auditable durante la transición

## 15. Migración progresiva

Fase A — Observabilidad
- ledger derivado
- dashboards
- sin cambiar flujos de venta

Fase B — Finanzas
- movimientos
- obligaciones
- asignaciones
- cierre/apertura

Fase C — Rentabilidad
- COGS real
- nómina
- project/event profitability

Fase D — Ecosistema
- artistas
- talleres
- membresías
- renta
- sponsors
- NEC/IP
- marketplace interno

Fase E — Automatización
- conciliación
- alertas
- pronósticos
- anomalías
- recomendaciones

## 16. Reglas para Antigravity

1. No tocar producción directamente.
2. Trabajar por branch y PR.
3. No modificar ACCESO salvo tarea explícita.
4. No borrar historia.
5. Toda mutación debe ser idempotente.
6. Todo número debe ser trazable.
7. Backend calcula; frontend presenta.
8. Ninguna regla nueva altera historia sin versión.
9. Staging obligatorio.
10. Release bloqueado si falla cualquier prueba P0.

## Definición de éxito

DOMUS puede rastrear cada peso desde:

POTENCIAL -> VENTA -> COBRO -> ENTREGA -> COSTO -> REPARTO -> CAJA -> OBLIGACIÓN -> LIQUIDACIÓN -> RESULTADO

y cortar el análisis por:

unidad, proyecto, evento, artista, producto, servicio, canal, persona, proveedor, espacio y periodo.
