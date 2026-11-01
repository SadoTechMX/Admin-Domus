# DOMUS · HANDOFF PARA CHATGPT WORK · OPERACION 31 OCT 2026

## Mision de Work
Operar DOMUS en tiempo real durante la jornada 31 OCT -> 1 NOV 2026, usando:
1. Google Sheet MASTER como fuente operativa y financiera viva.
2. GitHub branch `arch/domus-erp-v15-antigravity` como fuente de codigo/handoffs.
3. Produccion READ-ONLY salvo autorizacion explicita.
4. Staging para cualquier mutacion tecnica/prueba.

No improvisar reglas financieras ni comerciales. Si hay contradiccion entre notas viejas y secciones vigentes de este handoff, prevalece lo mas reciente y lo confirmado por Direccion.

## Fuentes
MASTER:
https://docs.google.com/spreadsheets/d/1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U/edit

Tabs clave:
- 31OCT_GO
- ACTIVIDADES
- CARTA VIGENTE
- CATALOGO
- RECETAS CARTA
- CAJA 2
- COBROS
- ACCESO
- INVENTARIO
- COMPRAS
- MOVIMIENTOS
- FINANZAS · DIARIO
- PENDIENTES
- LIQUIDAR
- PROVEEDOR_PAO
- 31OCT_CIERRE_FISICO

Repo:
SadoTechMX/Admin-Domus
Branch:
arch/domus-erp-v15-antigravity

## Apertura vigente
Estado: GO.
Fondo fisico inicial: $5,970.00, arrastre exacto del cierre 30->31.
Terminal 1: Mercado Pago de Pao.
Inventario inicial: inventario fisico final del cierre 30->31.
Responsable/supervisor: Steven.

Pendientes P0: ninguno.
P1: conteo rapido de SKUs de barra libre + registrar cualquier resurtido nuevo.

## Eventos / bloques
1. Cierre Galeria · ARMII + DOMUS.
2. DARMIINIGHT Costume Party · 21:00-03:00.
3. Horror After Rave · 03:00-10:00.

DOMUS absorbe costos y captura 100% de los ingresos de los tres bloques.

### Tarifas
DARMIINIGHT:
- acceso general $100
- guardarropa $50
- playroom/calabozo +$100
- barra libre $500

Horror After:
- $50 con disfraz
- $100 sin disfraz
- guardarropa $50
- playroom/calabozo +$100
- barra libre $500

Continuidad:
- quien pago DARMIINIGHT permanece gratis al After.
- NO volver a cobrar acceso a las 03:00 a quien ya estaba dentro.
- nueva llegada despues de 03:00 paga tarifa After.

Cierre Galeria:
- integrado al evento, sin acceso adicional por galeria.
- ingresos atribuibles a galeria 100% DOMUS.

Precios de CARTA VIGENTE:
- confirmados SIN CAMBIO para esta jornada.
- no subir ni bajar sin instruccion expresa de Direccion.

## Barra libre · regla operativa actual
- DARMIINIGHT: $500, ventana operativa propuesta 21:00-01:00.
- After: nueva pulsera/folio $500, ventana propuesta 03:00-06:00.
- acceso continua al After; barra libre NO se reinicia ni se extiende automaticamente.
- usar pulsera/folio distinto por bloque.
- incluir preparados estandar autorizados/disponibles.
- excluir botellas completas, shots premium, productos de terceros/consignacion, cerveza premium no autorizada y SKUs marcados fuera de barra libre.

Si Direccion cambia esta regla durante operacion, actualizar MASTER y sistema antes de cobrar bajo la nueva politica.

## Staff
Caja: Steven + Pao.
Acceso: Zoe.
Guardarropa: Zoe.
Barra: Miguel + Mike.
Produccion general: Wall E + Angel + Ibrah.
Seguridad: Dylan.
Supervisor: Steven.
Drix: apoyo general/organizacion, $350 fijo.
Ivan: apoyo general/organizacion, $350 fijo.
Drix e Ivan no tienen otro pago/participacion por este evento.
DJs/performances: $300 c/u SOLO si DOMUS cubre primero todos sus gastos y el flujo lo permite. No tratar como gasto garantizado hasta cumplir la condicion.

## Regla financiera
Costo operativo consolidado vigente: $8,130 por jornada.
Asignacion:
- Acceso/Renta: $4,065
- Barra/Cocina/Tienda: $4,065
Excedente:
deuda -> reserva -> utilidad.

No confundir:
ventas != utilidad
liquidez != utilidad
inventario != gasto completo
pago decidido != pago ejecutado

## Arrastre del cierre 30->31
Caja final fisica: $5,970.
Mercado Pago procesado previo: $17,412.
Saldo visible previo: $16,987.85.
Comision/costo Mercado Pago aplicada: $424.15.
Pao 10% final: $473.28.
Abono inventario Pao: $1,650.48.
CxP inventario Pao restante: $9,352.70.

## ACTIVIDADES · estado actual
Cargadas en MASTER:
- fila 17: Cierre Galeria · ARMII + DOMUS
- fila 18: DARMIINIGHT Costume Party
- fila 19: Horror After Rave

Tarifas y estados ya estan asentados como Confirmado.

### Colision de esquema detectada
Existe un bug de arquitectura:
- ACTIVIDADES!I esta rotulada historicamente "% DOMUS entradas" y formulas financieras viejas la usan como porcentaje.
- Access.gs y Events.gs usan r[8] como capacity/aforo.
- Para 31 OCT se uso I=150 como capacidad en filas 17:19.
- Se corrigieron formulas financieras P:Q de esas filas para asignar 100% de entradas/boletera a DOMUS sin multiplicar por I.

Post-operacion: separar `capacity` y `revenueShareDomus` en columnas distintas y migrar lectores/escritores/formulas.

## BUG EVENTO ACTIVO · causa raiz confirmada por Gravity
Sintoma:
al seleccionar DARMIINIGHT, la UI regresaba sola a "Del Crepusculo al Amanecer".

Causa combinada:
1. Evento del 30 seguia Confirmado y podia quedar como default.
2. Polling de `accesoSimpleDatos` cada ~6 s recibia `activeActivity` del servidor y sobrescribia la seleccion manual/local.

Flujo backend actual relevante:
- `Access.gs::accesoSimpleDatos()` lee ACTIVIDADES.
- `PropertiesService.getScriptProperties().getProperty('actividadAcceso')` determina evento activo.
- si no existe propiedad, usa la primera actividad de la lista.
- `accesoCambiarActividad(payload)` escribe `actividadAcceso`.

### IMPORTANTE: estado real del codigo remoto
Gravity reporto haber editado localmente:
- `js/app.js`
- `google-apps-script/Index.html`
para que la eleccion manual tenga prioridad y el polling no la revierta.

PERO la rama remota GitHub revisada despues TODAVIA contiene en `js/app.js` la logica anterior:
```
if (data.activeActivity) {
  STATE.activeActivity = data.activeActivity;
  localStorage.setItem('domus_active_event', data.activeActivity);
}
```
Es decir: el blindaje reportado por Gravity NO debe asumirse desplegado ni siquiera commiteado hasta verificar diff/commit/push/deploy.

## Protocolo inmediato del evento activo
Antes de operar accesos/caja:
1. Confirmar que `DARMIINIGHT Costume Party` aparece en dropdown.
2. Fijarlo como activo desde Eventos & Tarifas / Accesos.
3. Verificar que backend devuelve `activeActivity = DARMIINIGHT Costume Party`.
4. Refrescar Caja/Accesos.
5. Esperar al menos 10-15 s y comprobar que polling NO revierte seleccion.
6. Si revierte, NO mutar Produccion: usar workaround operativo y probar fix en Staging.

No cambiar el estatus de una fila a un valor que viole la validacion del Sheet. La validacion actual de columna L permite `Confirmado` y `Por validar`; "Finalizado" no esta autorizado por esa validacion sin cambio de esquema.

## Work debe verificar antes de tocar codigo
- git status / diff local de Gravity
- commit existente o no
- si los cambios estan pusheados
- si Staging los contiene
- si Produccion los contiene
- rollback disponible
- prueba manual del polling
- selector de Caja y Accesos
- persistencia localStorage `domus_active_event`
- propiedad de script `actividadAcceso`

## Reglas de operacion tecnica
Produccion:
- READ-ONLY para pruebas.
- No generar ventas/cobros/comandas/devoluciones ficticias.
- Smoke permitido: login, navegacion, catalogo, actividad activa, cuentas, cobros recientes, KDS lectura.

Staging:
- usar para mutaciones y pruebas.
- verificar requestId/idempotencia.
- una intencion = un requestId = un cobro = un recibo.

No desplegar a Produccion sin:
branch -> diff -> test Staging -> rollback -> autorizacion expresa.

## Riesgos historicos que Work debe vigilar
P0:
- doble cobro
- cuenta pagada reaparece
- pedido KDS perdido
- requestId no idempotente
- inventario columnas incorrectas
- auth bloquea Caja
- deadlocks
- estado financiero grave
- evento activo incorrecto durante cobro

P1:
- boton critico falla
- Caja no cobra
- Comanda no cambia
- Acceso no registra
- ticket/cajon bloquea

Otros:
- lecturas limitadas a 500 filas
- Cobros >4500
- transferencia pendiente no verificada
- Print Bridge token/CORS
- cajon solo efectivo
- reprint no abre cajon
- KDS token/body
- inventario/recetas deben consumir al entregar

## Objetivo de Work durante esta jornada
Mantener en tiempo real:
1. evento activo correcto
2. caja y cobros trazables
3. acceso/guardarropa/aforo
4. ventas por bloque
5. inventario y barra libre
6. Mercado Pago
7. gastos/nómina
8. P&L separado de galeria, DARMIINIGHT y After
9. consolidado de jornada
10. cierre final con caja, terminal, inventario, COGS, CxP/CxC, gastos, resultado y liquidez

Cada hallazgo debe clasificarse:
- CONFIRMADO
- PENDIENTE DE EVIDENCIA
- DECISION DE DIRECCION
- BUG TECNICO
- RIESGO P0/P1

No sustituir hechos con inferencias.
