# Cierre de jornada sólo después de resolver pendientes

**IMPLEMENTED / LOCAL_TESTED; no desplegado.** Base `291e8ee42bf2fc79bd3c152bc04663405bedded8`, UI `20261108-journey-close-15`. Cambios en la misma rama `repair/reconcile-pr18-main-20261105`. La consulta de ramas confirmó esa base y turnos en `881a71c`; no apareció trabajo concurrente publicado sobre esta regla. No hubo contacto nuevo con Gemini/IDE ni se atribuye una revisión de este delta a sus revisiones anteriores.

Backend fuente SHA-256: `2d1d96b4505647ffee026bf00f06d30dc751555ccb815cd53f798fb8ad182495`.

## Decisión y aplicación

El 8 noviembre de 2026 Steven respondió «si hasta resolver» a la propuesta de impedir el cierre mientras haya transferencias sin confirmar o comandas sin entregar. Esta decisión sustituye el bloqueo provisional por falta de regla; no autoriza deployment ni certifica la aplicación.

- El servidor conserva la guarda bajo el lock y antes de preparar el journal del corte. Mientras haya cualquiera de esos pendientes en la jornada, rechaza con `JOURNEY_VALIDATION_NO_EFFECTS`/422, informa ambos conteos y conserva la jornada abierta. `force`, `allowPending` o listas vacías enviadas por el cliente no alteran el resultado.
- Confirmar el banco por sí solo no resuelve una comanda pendiente, en preparación o lista. La entrega debe completar su flujo existente. Una confirmación bancaria parcialmente escrita conserva la incertidumbre y bloquea el corte hasta recuperar su misma intención.
- El intento rechazado queda registrado en REQUESTS y no cambia cobros, comandas, inventario ni el journal de corte. Después de resolver los pendientes, se crea un nuevo intento de corte; reusar el ID rechazado devuelve su rechazo original. Un corte confirmado se recupera con su mismo ID, sin nuevos movimientos.
- Los nuevos resultados durables de cierre identifican `closurePolicy: RESOLVE_PENDING_TRANSFERS_AND_DELIVERIES`. La UI rechaza ACK que declaren cierre con pendientes o con una política incompatible. Los ACK originales de la versión anterior, sin este campo pero con ambos grupos de pendientes vacíos, siguen siendo recuperables; no se reescriben registros históricos.
- Se mantienen las cuentas abiertas autorizadas por la regla 3. Las cancelaciones explícitas que ya admite KDS cuentan como comandas resueltas; **no se cancela automáticamente para cerrar**, no se convierte una cancelación en entrega y cancelar una comanda no confirma su transferencia.
- La separación por evento/proyecto/jornada se conserva: pendientes completados en REQUESTS pero aún por acreditar/entregar en otro proyecto no se reasignan ni cierran con esta jornada. Las intenciones inciertas conservan la guarda global previa.

## Verificación aislada

| Prueba | Resultado |
| --- | --- |
| Operaciones de jornada con módulos reales y Sheets simulado | 23 PASS, incluidos 5 casos nuevos |
| Transporte REST/nativo y recuperación | 8 PASS, reforzados con ACK de cierre que contienen pendientes |
| UI completa en Chromium | 6 PASS, incluido un recorrido adicional transferencia → confirmación → entrega → cierre |
| Contexto de jornada | 9 PASS |
| Confirmación de transferencias | 20 PASS |
| Periodo operativo | 11 PASS |

Los casos nuevos prueban los estados intermedios de KDS, transferencia sin comanda pendiente en un abono a cuenta, fallo parcial bancario, rechazo de flags para forzar cierre, cancelación explícita y aislamiento entre proyectos. Se comparan filas originales de COBROS y datos de negocio antes/después de rechazos y recuperaciones; nunca se usan datos reales. El navegador comprueba los conteos visibles y que sólo haya un cobro original más su confirmación bancaria, preservando la fila pendiente.

La primera ejecución del nuevo recorrido de navegador falló porque el fixture omitía volver a capturar el cliente después de recargar. El control existente impidió abrir el modal de cobro. Se corrigió el fixture y se esperó explícitamente la apertura del modal; no se relajó ese control ni se forzaron clics sobre elementos ocultos. La ejecución corregida pasó.

La compilación/paridad y CI del SHA exacto se verifican en la entrega. Los valores bancarios y de inventario del arnés son ficticios; las pruebas no evalúan todas las fórmulas de Sheets ni acreditan banco, hardware, concurrencia real de Google o producción.

## Compatibilidad, riesgos y pendientes

No se modificaron fórmulas, SEMANA, permisos, configuración bancaria, impresión, datos Google ni hojas. El corte conserva alcance `JOURNEY_POS_RECEIPTS` y `financialFinal:false`: sigue pendiente el arqueo/liquidación integral de otros canales y movimientos. No se agregan nuevas tablas o migraciones para esta decisión.

La decisión de cierre ya está resuelta. Siguen pendientes el mapa real de evento/proyecto/estación/gaveta, la conciliación de historiales/colas inciertos, la validación de fórmulas SEMANA/LIQUIDAR y el recorrido autorizado en staging antes de activar. Se mantiene el bloqueo SEMANA hasta validar esas fórmulas.

**Transferencia que nunca llega al banco:** este flujo no incorpora rechazo/anulación/compensación de esa intención. Permanece pendiente y bloquea el corte; no se debe fabricar una confirmación ni borrar el registro. Si se necesita resolverla sin ingreso, falta un procedimiento y acción de conciliación explícitos. El límite durable de corte de 40.000 caracteres y la validación de rendimiento siguen pendientes como se documentó en la integración anterior.

La reversión de este delta no requiere migrar datos; la base 291 ya bloqueaba pendientes. Deben conservarse sus journals y confirmaciones y evitar volver a versiones anteriores que ignoren el contexto de jornada. El campo adicional no modifica un resultado anterior. No se ejecutó reversión, PR, merge ni deployment.
