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
- Fondo inicial real en efectivo: **$4,000.00 MXN**, compuesto por **$1,000.00** de préstamo temporal de Universidad del Swinger + **$3,000.00** aportados por **Ibrah** para arranque operativo. Tratamiento contable estricto: **Pasivo / Devolución de fondo separada (CXP UDS $1,000 / CXP Ibrah $3,000)**, gobernado en `30OCT_UDS_GO` (no en `MOVIMIENTOS`). NO es ingreso, NO es venta, se reintegra al 100% en el arqueo final antes de calcular utilidad o repartos.
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
- fondo inicial $4,000 ($1,000 UDS + $3,000 Ibrah)
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
- fondo temporal $4,000 ($1,000 UDS + $3,000 Ibrah) como pasivo/préstamo operativo, no venta;
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


## INVENTARIO FÍSICO INICIAL RECIBIDO · 30 OCT 2026 · 21:33

Fuente: conteo físico entregado por Dirección para apertura del evento.  
Validación final: **Pao pendiente**.  
Control productivo: `30OCT_UDS_INV`.

### Vendibles mapeados directamente
- Caguama Victoria 1.2 L: 3
- Volt Yellow: 3
- Agua Great Value 500 ml: 18 -> controlada como Agua natural 500 ml, marca física GV
- Carta Blanca 473 ml: 1
- Black Beer alemana 500 ml: 7
- Onírica Lager 355 ml: 13
- Onírica Viena 355 ml: 11
- Onírica IPA 355 ml: 3

### Mapeo pendiente
- Cervezas alemanas URBLOCK 500 ml: 16
- Candidato de catálogo: `Alemana Bock · FINAL-22OCT-BAR-001-BOCK`
- NO asumir equivalencia hasta validación física/proveedor.

### Botellas abiertas / bases líquidas
Registrar por contenido aproximado disponible, no como botella completa:
- Red Label 700 ml llena = 700 ml
- José Cuervo Especial Blanco 990 ml llena = 990 ml
- José Cuervo Tradicional 990 ml a 1/4 = 247.5 ml
- José Cuervo Especial Blanco 990 ml a 3/4 = 742.5 ml
- Oso Negro 1 L a 3/4 = 750 ml
- Bacardi 1.75 L a 3/4 = 1312.5 ml
- Bacardi 980 ml a 1/2 = 490 ml
- Smirnoff Tamarindo 1 L llena = 1000 ml
- Smirnoff Tamarindo 750 ml llena = 750 ml
- Jägermeister 750 ml a 3/4 = 562.5 ml
- Smirnoff Vodka tradicional 750 ml a 3/4 = 562.5 ml
- Gibson London Dry 700 ml llena = 700 ml
- Bombay Sapphire 700 ml a 3/4 = 525 ml
- 2 CALAHUAS de 1 L = 2000 ml; descripción literal, mapeo pendiente
- 2 jugos piña Jumex 960 ml = 1920 ml
- 1 jugo naranja Jumex 970 ml = 970 ml
- 1 jugo naranja 1.89 L = 1890 ml

### Tienda DOMUS
Costos/precios no deben inventarse durante apertura.
Conteo:
- Velas 21
- Condones Alfa 12
- Látigos 12
- Cubrebocas 11
- Lube Tube 4
- Abanico 1
- ORGIE She Spot rojo 2
- ORGIE Sexy Vibe azul 2
- ORGIE Orgasm Drops Intense 2
- SIYI 2
- ORGIE Sexy Vibe negro 1
- Arneses 6
- Plug 1
- Lentes 1
- Oreja de burro 2
- Posters 12
- Tablas 2
- Collar 1
- Conjunto peludo 1

### Desechables
- Vasos 1 L: 100
- Vasos 500 ml: 100

### Requisito arquitectónico Antigravity
El nuevo inventario debe soportar simultáneamente:
1. piezas cerradas;
2. volumen líquido en ml;
3. fracciones/porcentajes de botella;
4. insumos no vendibles;
5. productos de Tienda sin precio aún;
6. mapeo físico -> SKU canónica;
7. estado `MAPEO PENDIENTE` sin forzar equivalencias;
8. conteo inicial + validación por segundo responsable;
9. consumo por receta;
10. cierre físico y diferencias.

No convertir porcentajes visuales de botella en enteros de stock ni asumir equivalencia de marca/presentación.


## ACUERDO PAO · PROVEEDORA + PARTICIPACIÓN DE BARRA

### Estructura económica aprobada
Pao mantiene cuatro conceptos separados y auditables:
1. **Cuenta por pagar de inventario:** todo inventario entregado entra a DOMUS y genera CXP por costo final confirmado.
2. **Sueldo operativo:** Pao recibe $350 cuando trabaja como parte del staff.
3. **Gasolina:** $200 sólo cuando corresponde a surtido semanal o servicio especial; no es gasto diario automático.
4. **Participación:** Pao recibe 10% del resultado distribuible de barra elegible.

Nunca mezclar estos cuatro conceptos.

### Inventario inicial Pao
Valor total confirmado: **$11,003.18 MXN**.

El inventario queda físicamente en DOMUS y la deuda permanece abierta hasta que exista pago real. Los cortes diarios:
- identifican consumo;
- calculan costo consumido;
- registran resurtidos;
- recomiendan pago;
- reducen CXP únicamente contra pago real.

Los resurtidos futuros agregan nueva CXP. Si cambia el costo unitario, crear lote nuevo; no sobrescribir costo histórico.

### Base del 10%
Sólo aplica a ventas/operación de barra relacionadas con inventario Pao.
No incluir:
- Onírica;
- Felssloschen;
- Canna Treats;
- Jujutsu-shi;
- otros proveedores;
- propinas;
- extra Universidad del Swinger.

Antes del 10% descontar:
- costo real del inventario Pao consumido;
- demás insumos usados en esas ventas;
- sueldos operativos definidos para la jornada;
- gasolina Pao cuando aplique;
- comisiones reales de terminal/Mercado Pago;
- otros gastos necesarios para operar.

Fórmula:
`resultado_distribuible = ventas_elegibles_netas - costos_y_gastos_aplicables`
`pao_10 = MAX(0, resultado_distribuible * 0.10)`

Si el resultado es cero o negativo, participación Pao = $0 para ese corte.

### Nómina base 30/10
8 personas × $350 = **$2,800**:
- Ángel
- Pao
- Ibrah
- Wall E
- Miguel
- Zoe
- Steven
- Iván

### Gasolina
$200 sólo en surtido semanal o servicio especial.
Para el corte inicial del 30/10 se dejó parametrizada en $200 por el surtido inicial reportado. Debe poder ponerse en $0 si Dirección determina que ese surtido no genera gasolina.

### Jornada
El sistema debe soportar cortes separados:
- 30/10/2026 → cierre
- 31/10/2026 → cierre
- 01/11/2026 → cierre

### Control productivo creado
Hoja: `PROVEEDOR_PAO`

Contiene:
- inventario inicial por lote;
- cantidad;
- costo unitario final;
- valor inicial;
- resurtidos diarios;
- cierres diarios;
- consumo;
- costo consumido;
- CXP pendiente;
- pago sugerido;
- pago real;
- nómina;
- gasolina;
- comisión terminal;
- otros gastos;
- resultado distribuible;
- 10% Pao;
- saldo de participación.

### Requisito Antigravity
El módulo futuro debe modelar explícitamente:
- SupplierInventoryLot
- AccountsPayable
- SupplierReplenishment
- DailyInventoryCut
- OperatingPayroll
- ConditionalTransportExpense
- EligibleRevenuePool
- SupplierProfitShare

La reducción de inventario no reduce CXP por sí misma; sólo un pago confirmado reduce la deuda.


### Conciliaciones Operativas Especiales (Jornada 30/10 - 31/10)
- **Gaby Morita:** Cobro duplicado accidental resuelto (Opción A). Físicamente sólo pagó **$200 en efectivo**. `REC-MVVZ9PX5` queda activo ($200); `REC-MVVZA0DO` queda formalmente anulado. Se contabilizan $200 en efectivo para el arqueo final.
- **Alex Zamora:** Deuda de hoy de **$300** en `CTA-20261031-er8r90` pendiente de cobro en `COBROS`.
- **Oscar López:** Comanda `C2-202` entregada físicamente por Miguel; crédito $200 abierto en `CTA-20261031-3f7olp`.
- **Julian:** Folio oficial `A-5067` por $700 Terminal 1 (Pareja $600 + Guardarropa $100).
- **Fondo Inicial Efectivo:** $4,000 ($1,000 UDS + $3,000 Ibrah) en `30OCT_UDS_GO`.

## PRIORIDAD MAÑANA · OFFLINE-FIRST / PWA PARA ACCESOS

Para la operación del 30/10 se mantiene el sistema actual con control compensatorio. No cambiar arquitectura durante el evento.

### Contingencia operativa actual
La interfaz GitHub Pages de Accesos sí dispone de:
- Outbox local en `localStorage`;
- requestId idempotente por mutación;
- reintento automático al evento `online`;
- cache local de eventos/accesos recientes;
- conservación local de accesos pendientes.

Regla operativa:
- la estación debe abrirse y autenticarse con internet;
- si cae la red, seguir usando la misma estación;
- no refrescar ni cerrar;
- no usar dos estaciones offline simultáneas;
- aforo operativo = aforo confirmado previo + accesos locales pendientes;
- al recuperar conexión, esperar Outbox=0 y conciliar REQUESTS -> ACCESO -> COBROS;
- REQUIRES_REVIEW nunca se recaptura automáticamente.

### Deuda técnica a resolver mañana
Implementar un modo offline-first real:
1. PWA / Service Worker;
2. arranque offline;
3. cache canónica del evento activo y tarifas;
4. sesión offline controlada;
5. Outbox persistente e inspeccionable;
6. contador de aforo local;
7. deduplicación entre estaciones;
8. reconciliación idempotente al reconectar;
9. UI explícita de OFFLINE / PENDIENTES / REQUIRES_REVIEW;
10. procedimiento de recuperación tras cierre/reinicio del navegador;
11. pruebas de pérdida de red, reconexión, refresh y doble dispositivo.

No desplegar esta arquitectura durante el evento activo del 30/10.


---

# ACTUALIZACIÓN DE CIERRE FINANCIERO/OPERATIVO · 31 OCT 2026 · HANDOFF A ANTIGRAVITY

## Autoridad operativa y regla de sincronización
A partir de este cierre, el Google Sheet MASTER es la **fuente operativa viva** y debe mantenerse sincronizado en tiempo real durante administración, finanzas y contabilidad.

MASTER:
https://docs.google.com/spreadsheets/d/1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U/edit

Pestañas críticas usadas en este cierre:
- `31OCT_CIERRE_FISICO`
- `30OCT_ADMIN_COMPLETA`
- `30OCT_UDS_INV`
- `PROVEEDOR_PAO`
- `CAJA 2`
- `COBROS`
- `MOVIMIENTOS`
- `PENDIENTES`
- `LIQUIDAR`
- `INVENTARIO`
- `COMPRAS`
- `RECETAS CARTA`

Evidencias Drive:
https://drive.google.com/drive/folders/1v3T1ptcdQgEMe9rCv19chd7V3dQizn-A

Regla para Antigravity:
1. leer MASTER antes de implementar lógica financiera;
2. no inferir números desde resúmenes viejos si existe reconciliación posterior;
3. toda decisión financiera debe distinguir dato confirmado, provisión, hipótesis y pendiente;
4. no mutar Producción para “corregir” contabilidad histórica sin migración/rollback explícitos.

## Cierre de efectivo confirmado
Conteo físico base confirmado: **$14,090.00**.

Movimientos posteriores al conteo:
- Ángel + Wall E + Miguel + Zoe: $2,600
- propinas pagadas: $600
- Dylan + Tarzan: $550
- Steven + Ibrah: $700
- Pao sueldo + gasolina: $550
- devolución fondo Ibrah: $3,000
- tamales Ibrah neto: $430
- guardarropa Zoe + ajuste extras mal cobrados: +$610
- reembolso adicional Ángel compras tienda: $300

Caja física final conciliada: **$5,970.00**.
Estado: **CUADRADO**.

## Reconciliación de ventas de barra
Fuente principal: `30OCT_UDS_INV` + `CAJA 2` + cierre físico.

Raw de unidades: **$25,210**.
Ajustes canónicos:
- Gaby: -$200 por cobro duplicado anulado.
- Óscar: -$400 por 2 Palomas no consumidas.
- Gibrán: +$200 por 1 Paloma no capturada.

Bar económico corregido: **$24,810**.

Separaciones:
- autoconsumo UDS liquidado por compensación: $1,320 bruto / $1,100 base / $220 extra;
- Alex Felssloschen: $300 por cobrar, externo a Pao;
- Ángel Felssloschen: $150 externo a Pao;
- barra cobrada confirmada: **$23,040**.

Felssloschen cobrado:
- 4 cervezas = $600 bruto;
- $400 base + $200 extra UDS;
- excluir del pool Pao sin volver a descontar su costo, para evitar doble conteo.

Base Pao caja: **$18,240**.
Base Pao devengada/liquidada recomendada: **$19,340**, porque incluye $1,100 UDS liquidado económicamente por compensación.

## Política contable de inventario
Regla obligatoria:
- inventario inicial DOMUS = **activo**, no gasto automático;
- consumo/vendido del periodo = **COGS**;
- inventario remanente = activo;
- compra histórica aún no pagada = **CxP separada**;
- no cargar inventario inicial completo como gasto del día;
- no duplicar COGS + CxP.

Inventario Pao consumido físicamente confirmado: **$1,756.64**.
Este valor es control de proveedor/inventario y **no debe sumarse encima de un COGS estándar que ya incorpore esos componentes**.

COGS conservador total del cierre: **$6,568.0432**.
Incluye:
- benchmark conocido/estándar;
- Agua mineral real: $180;
- provisiones conservadoras donde no existe costo maestro suficiente.
Las provisiones no equivalen a gasto definitivo y deben liberarse/ajustarse cuando aparezca evidencia.

## Mercado Pago / Terminal 1
Correo/resumen Mercado Pago:
- procesado 30/10 05:12 → 31/10 05:12: **$17,412.00**;
- 60 ventas;
- propinas dentro del reporte: **$552.00**.

Saldo visible aportado como mejor evidencia: **$16,987.85**.

Diferencia:
**$424.15**.

Tratamiento:
- NO llamarla comisión confirmada;
- registrar como **provisión de conciliación Mercado Pago**;
- liberar o reclasificar sólo con evidencia posterior.

## Estructura operativa diaria DOMUS
Dirección aprobó que DOMUS recupere costos operativos mediante la suma de Solar + Lunar, con aportación variable según margen real.

Costos por jornada:
- Luz: $290
- Agua: $150
- Renta: $6,250
- Seguridad pública: $300
- Insumos de limpieza: $150
- Servicios públicos y gobierno: $600
- Internet: $190
- Mantenimiento del lugar: $200

Total operativo diario: **$8,130**.
Con 20 jornadas: **$162,600/mes**.

Renta confirmada:
- $6,250 por jornada operativa;
- $125,000/mes a 20 jornadas.

Asignación financiera aprobada:
- 50% Acceso/Renta: **$4,065/día**;
- 50% Barra/Cocina/Tienda: **$4,065/día**.

Importante:
- Solar y Lunar NO se reparten 50/50 entre sí;
- aportan de forma **variable por margen neto real**;
- $8,130 es obligación consolidada DOMUS por jornada;
- días fuertes deben sobrecubrir y formar reserva para días débiles;
- no duplicar $8,130 por cada unidad.

## Ecosistemas de ingreso a modelar
El ERP financiero debe soportar margen por ecosistema, no sólo ventas:
- boletera / tickets / taquilla;
- guardarropa;
- renta de espacio;
- barra;
- cocina / 4 DE OROS;
- tienda / merch;
- talleres / formación / DJ School;
- bazares / expositores;
- galería / obra / artistas;
- eventos Lunar / experiencias;
- eventos privados / producción / servicios;
- patrocinios / marcas / alianzas;
- contenido / digital / comunidad;
- IP / NEC / formatos propios.

Cascada DOMUS aprobada:
`Ingreso bruto → COGS/proveedores → costos directos/comisiones → margen de contribución → cobertura operativa → participaciones contractuales → reserva DOMUS → utilidad residual`.

No todas las unidades deben monetizar igual; registrar también su función de adquisición, conversión, retención, reputación, talento e IP.

## Cierre Pao · resultado distribuible
Pao conserva conceptos separados:
1. CxP de inventario;
2. sueldo;
3. gasolina;
4. 10% de resultado distribuible.

Cierre conservador:
- base elegible devengada/liquidada: **$19,340.00**
- COGS total conservador: **$6,568.0432**
- nómina + bono/redondeo: **$3,398.00**
- gasolina Pao: **$200.00**
- provisión conciliación Mercado Pago: **$424.15**
- costo operativo diario Barra/Cocina/Tienda: **$4,065.00**

Resultado distribuible:
**$4,684.8068**

Participación Pao 10%:
**$468.48068 → $468.48**

DOMUS residual después de participación:
**$4,216.33**

## CxP inventario Pao · decisión de liquidez
Inventario inicial Pao reconocido:
**$11,003.18**

Dirección decidió **NO liquidarlo de golpe** para proteger liquidez y cubrir otras deudas.

Abono decidido para esta jornada:
- 15% de $11,003.18 = **$1,650.48**

Saldo CxP inventario Pao:
**$9,352.70**

Esta decisión del 15% corresponde a este cierre; NO convertirla automáticamente en política permanente sin aprobación explícita.

Sueldo Pao:
- $350, ya pagado en efectivo.

Gasolina:
- $200, ya pagada en efectivo.

Participación:
- $468.48, determinada;
- ejecución/retención debe confirmarse como movimiento real.

Total que Pao debe retener si se ejecuta la instrucción completa:
**$2,118.96 = $1,650.48 inventario + $468.48 participación**.

Saldo visible de Mercado Pago a devolver/transferir a DOMUS después de esa retención:
**$14,868.89**.

No registrar la transferencia como ejecutada hasta confirmar el movimiento real.

## Deudas y devengados relevantes
- Iván jornada actual: **$350 pendiente**, debe reconocerse como gasto devengado aunque no se haya pagado.
- Ángel: dentro del pago de cierre se aplicó abono histórico de $150; saldo histórico esperado en su registro: $900, separado de reembolso de compras.
- El resto de deudas históricas/proveedores debe leerse desde `PENDIENTES` y `LIQUIDAR`; no copiar cifras antiguas desde chats como autoridad.

## Reglas que deben convertirse en arquitectura ERP
Antigravity debe modelar, como mínimo:

### Accounting / Treasury
- OperatingDay
- OperatingCostAllocation
- RevenueEcosystem
- ContributionMargin
- OperatingCoveragePool
- OperatingReserve
- AccruedExpense
- AccountsPayable
- AccountsReceivable
- CashSettlement
- PaymentEvidence
- Provision / ReconciliationDifference

### Inventory / COGS
- OpeningInventory
- InventoryAsset
- Consumption / COGS
- ClosingInventory
- SupplierInventoryLot
- Replenishment
- Variance / Shrinkage
- UnpaidInventoryPurchase CxP
- receta vs. consumo físico
- prohibición de doble conteo COGS/CxP

### Supplier profit share
- EligibleRevenuePool
- explicit exclusions by provider/event-extra/tips
- actual COGS + attributable payroll + transport + fees + operating-cost allocation
- `profitShare = MAX(0, distributableResult * rate)`
- pago de CxP separado de profit share
- partial AP payments without marking invoice fully paid

### Event economics
- base DOMUS vs event price vs event extra
- provider exclusion
- UDS compensation / non-cash settlement
- duplicate-payment reversal
- consumed vs not-consumed line adjustments
- cash vs accrual views side by side

## Prioridades técnicas post-cierre
1. Mantener el MASTER como autoridad operativa mientras el ERP no sustituya estas conciliaciones.
2. No volver a usar límites de 500 filas en cuentas/cobros.
3. Formalizar `30OCT_UDS_GO` como módulo de evento/corte.
4. Formalizar `30OCT_UDS_INV` como reconciliación por evento.
5. Formalizar `PROVEEDOR_PAO` como Supplier/AP/DailyCut/ProfitShare.
6. Añadir cierre por jornada con:
   - caja;
   - terminales;
   - inventario;
   - COGS;
   - proveedores;
   - nómina devengada/pagada;
   - gastos operativos;
   - reservas;
   - CxP/CxC;
   - resultado distribuible;
   - movimientos pendientes.
7. Toda mutación monetaria debe mantener idempotencia: una intención = un requestId = un movimiento.
8. No declarar “pagado”, “transferido” o “liquidado” sólo porque exista una decisión contable; exigir evidencia del movimiento.

## Estado final para retomar
- Caja física final: **$5,970.00**
- MASTER actualizado en vivo.
- Costos diarios DOMUS: **$8,130**
- Barra/Cocina/Tienda absorbe: **$4,065**
- Pao 10%: **$468.48**
- Abono inventario Pao decidido: **$1,650.48**
- CxP Pao restante: **$9,352.70**
- Saldo MP visible después de retención Pao: **$14,868.89**
- Diferencia MP $424.15 sigue provisionada, no resuelta.
- Transferencias/pagos que no tengan evidencia real deben seguir marcados como pendientes de ejecución.

## Restricción
Esta actualización es de **arquitectura/operación/finanzas**. No autoriza despliegues en Producción, cambios destructivos ni publicación de nuevas versiones durante la operación sin el workflow branch → diff → pruebas → rollback → autorización.
