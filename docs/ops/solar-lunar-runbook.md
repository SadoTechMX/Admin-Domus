# DOMUS · Runbook Operativo Solar / Lunar

## Objetivo

Permitir que DOMUS opere Solar y Lunar de forma simultánea sin mezclar:
- precios,
- actividad de acceso,
- caja,
- KDS,
- inventario,
- liquidaciones,
- apertura/cierre.

## Perfiles canónicos

### SOLAR
- Ventana operativa objetivo: 14:00–21:00
- POS: `priceSolar`
- Funciones: aprendizaje, galería, talleres, 4 DE OROS, visitas, comunidad.
- Acceso: usar únicamente una actividad CONFIRMADA en `ACTIVIDADES`.
- No heredar automáticamente reglas de un evento Lunar.

### LUNAR
- Ventana operativa objetivo: 21:00–cierre / según programación
- POS: `priceLunar`
- Funciones: rave, fiesta, performance, experiencias nocturnas.
- Acceso: evento CONFIRMADO y política comercial específica.
- No mezclar liquidaciones de colectivos con venta general DOMUS.

## Regla técnica

Solar/Lunar es una dimensión de cada transacción, no un modo global.

- `CAJA 2!F2` queda únicamente como default de compatibilidad/estación.
- Cada venta lleva `phase: Solar|Lunar`.
- Cada línea escribe su unidad en `CAJA 2!AK = Solar / Lunar registrado`.
- La actividad viaja en la propia venta/acceso.
- KDS e inventario son compartidos: una entrega descuenta una sola vez, sin importar la unidad.
- Finanzas y liquidaciones se cortan por `phase + activity`.

Así pueden coexistir:
- Solar · Taller A
- Solar · Galería
- Lunar · Evento B
en el mismo minuto y usando el mismo stock físico.

## Endpoints

### GET
`operatingProfileDatos`

Roles:
- CAJA
- ACCESOS
- GERENCIA
- ADMIN

Entrega:
- profile
- activeActivity
- selectedActivity
- confirmedActivities
- catalog readiness
- opening readiness
- blockers

### POST
`operatingContextValidate`

Roles:
- CAJA
- ACCESOS
- GERENCIA
- ADMIN

Payload:

```json
{
  "phase": "Solar",
  "activity": "DOMUS Solar · operación diaria · 28 oct"
}
```

La actividad es opcional. Si se envía, debe estar CONFIRMADA.

## Gate antes de abrir Solar

1. Actividad Solar confirmada.
2. Tarifa/política de acceso confirmada.
3. Perfil backend = Solar.
4. Catálogo visible y priceSolar correcto.
5. Inventario físico del subconjunto vendible contado.
6. Terminal/cuenta/fondo comprobados.
7. KDS verificado.
8. Staff asignado.
9. Apertura de hoy registrada.
10. Corte/cierre asignado.

## Gate antes de abrir Lunar

Mismos 10 gates, más:
- evento Lunar específico confirmado;
- acuerdo de reparto / boletera / colectivo documentado;
- resurtido entre Solar y Lunar;
- cambio de precio confirmado por backend;
- corte intermedio Solar si cambia custodio/caja.

## Concurrencia Solar + Lunar

1. No detener Solar cuando inicia Lunar.
2. Cada venta selecciona su contexto antes de agregar/cobrar.
3. El backend valida `phase + activity`.
4. La línea queda marcada en AK como Solar o Lunar.
5. El mismo KDS procesa ambas; puede mostrar la unidad como etiqueta.
6. Inventario descuenta la unidad física una sola vez al entregar.
7. Cortes y dashboards separan por unidad/evento.
8. Si cambia custodio de caja, sí hacer corte intermedio por responsabilidad, no por cambio de unidad.

## Prohibido

- cambiar sólo el estado local del navegador;
- usar Forza por default en un día Solar;
- cobrar actividad Por validar;
- usar una tarifa histórica sin revalidación;
- modificar filas históricas de ACCESO para “resetear”;
- mezclar retiro, fondo o liquidación con venta;
- cambiar a Lunar sin comprobar resurtido.

## Gate STAGING

Ejecutar:
- `python3 tests/test_operating_profiles.py`
- `python3 tests/test_staging_solar_lunar.py`
- suites existentes POS/KDS/inventario

Éxito:
- STAGING aislado;
- CAJA/ACCESOS pueden leer;
- CAJA/ACCESOS no pueden cambiar perfil;
- GERENCIA/ADMIN sí;
- Solar→Lunar persiste;
- rollback al perfil original;
- no muta ACCESO;
- POS entrega precios correctos para cada fase.

## Estado 28 oct 2026

Catálogo producción:
- 156 productos activos
- 152 con esquema dual explícito
- 0 huecos de precio Solar
- 0 huecos de precio Lunar
- 0 destinos KDS inválidos
- 0 SKUs activos duplicados detectados

Inventario:
- 16 EN CONTROL
- 103 CONTAR INICIAL
- 28 VALIDAR BASE INICIAL
- 10 aproximados / medir / pesar / confirmar

Conclusión:
el catálogo no bloquea la apertura. El inventario físico sí requiere un conteo dirigido del surtido que realmente se venderá.


## Reglas comerciales canónicas

### Consumo
- Solar usa `priceSolar` por transacción.
- Lunar usa `priceLunar` por transacción.
- Dos ventas simultáneas del mismo SKU pueden tener precios distintos si pertenecen a unidades distintas.

### Entrada
- Taquilla y transferencia directa sólo pueden cobrar una actividad en estado `Confirmado`.
- El precio cobrado se toma de `ACTIVIDADES`, nunca del navegador.
- No existe cover heredado entre jornadas.
- Si la actividad es gratuita, registrar el ingreso mediante `LISTA`, `CORTESIA` o `MEMBRESIA` según corresponda; no crear boleto de taquilla con precio 0.

### Guardarropa
- La tarifa se toma exclusivamente de `ACTIVIDADES`.
- `0` explícito significa sin cobro.
- No existe fallback automático de $50.
- Una actividad `Por validar` no puede cobrar guardarropa.

### Boletera externa
- No duplicar el cover en puerta.
- Registrar proveedor/folio/canal y sólo cobrar en DOMUS los conceptos autorizados adicionales.

### Canna Treats
- Reparto vigente: 30% DOMUS / 70% proveedor.
- Comisión de terminal a cargo de DOMUS.
- El consumo puede pertenecer a Solar o Lunar sin cambiar el acuerdo de reparto.

### Corte
Todo cierre debe poder segmentarse por:
`unidad + actividad + medio de pago`.

## Conteo dirigido de apertura

No contar 158 referencias para poder abrir.

### P0 — antes de abrir Solar
Contar/validar las 10 referencias compartidas de mayor criticidad:
- Modelo Especial 473 ml
- Victoria 473 ml
- Corona Extra lata
- Carta Blanca lata
- Corona 710 ml
- Modelo 710 ml
- Victoria 710 ml
- Victoria Mega 1.2 L
- Feldschöbchen
- Onírica

### P1 — antes del arranque Lunar
Completar además:
- agua natural
- Squirt
- Coca-Cola
- agua mineral
- Volt Blue
- Volt Yellow
- limón agrio
- Clamato 946 ml
- José Cuervo
- Bacardí
- Smirnoff

El tablero operativo en Google Sheets mantiene el checklist vivo y enlazado a `INVENTARIO`.
