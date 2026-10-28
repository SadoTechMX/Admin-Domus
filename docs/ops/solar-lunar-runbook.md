# DOMUS · Runbook Operativo Solar / Lunar

## Objetivo

Permitir que DOMUS cambie entre Solar y Lunar sin mezclar:
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

La fase POS oficial vive en:
`CAJA 2!F2`

La actividad oficial de Acceso vive en:
`PropertiesService.scriptProperties.actividadAcceso`

Antes de este cambio podían divergir.

Ahora `operatingProfileSet` permite a GERENCIA/ADMIN:
1. cambiar la fase persistente;
2. opcionalmente cambiar la actividad;
3. validar que la actividad existe y está CONFIRMADA;
4. registrar quién/cuándo hizo el cambio;
5. retornar readiness.

Nunca escribir en historial de ACCESO para cambiar perfil.

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
`operatingProfileSet`

Roles:
- GERENCIA
- ADMIN

Payload:

```json
{
  "profile": "Solar",
  "activity": "Visita general DOMUS"
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

## Transición Solar → Lunar

1. Detener nuevas ventas durante el cambio.
2. Si cambia custodio, hacer conteo/corte intermedio.
3. Gerencia ejecuta `operatingProfileSet({profile:"Lunar", activity:"..."})`.
4. Todas las estaciones recargan Caja/Acceso.
5. Verificar badge Lunar + precios Lunar.
6. Verificar actividad de Acceso correcta.
7. Verificar KDS.
8. Reanudar ventas.

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
