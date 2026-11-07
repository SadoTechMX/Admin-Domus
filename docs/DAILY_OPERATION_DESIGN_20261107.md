# Operación continua y periodos de reporte — diseño, 7 noviembre 2026 UTC

> **Decisión recibida de Steven, 7 noviembre:** «Será por evento, proyecto y jornada». Se conservan fecha/hora reales. La alternativa de agrupación por fecha calendario queda descartada como recomendación operativa. Falta definir alcance, responsables y cierre de jornada; no se activó una política por inferencia.

**DESIGN_PREPARED / CONTRACT_INCOMPLETE. No se habilitó cobro fuera de SEMANA.** Se inspeccionó la candidata `989d59e9d424c659af61784febfa7b184a641fbc`: rama local limpia y mismo SHA remoto. Ramas y coordinación publicadas no muestran otro editor activo sobre este cambio. Esto no prueba ausencia de trabajo privado no comunicado. No se ejecutaron suites anteriores, pruebas Google, ventas ni despliegues. Esta entrega sólo agrega diseño y evidencia estática; no es una nueva implementación ni otro motor de ensayo.

## Hallazgos que determinan el alcance

| Fuente inspeccionada | Comportamiento y consecuencia |
| --- | --- |
| `POS.gs:115,128–130` | Recupera primero el journal; para nuevas operaciones compara la fecha del servidor contra SEMANA. Retirar sólo esa comparación habilitaría cobros cuya revisión de hoja sigue fallando. |
| `Schema.gs:10` (`CAJA 2!W`) | Dos condiciones comparan C con SEMANA!B7:B8. Mover la ventana puede cambiar la revisión de filas anteriores sin cambiar sus datos. |
| `Schema.gs:7–13` | O, T, AA y AB dependen de W. T/AA/AB participan en importes de reparto. Desacoplar W tiene efectos financieros derivados que deben cotejarse, aunque COBROS no se sobrescriba. |
| `Schema.gs:10`, `OPERATING_RULES.md`, regla 3 | W compara timestamps C de todas las filas de una cuenta por desigualdad exacta. Dos consumos del mismo ticket con timestamps distintos pueden quedar como `TICKET REUTILIZADO · REVISAR`, incluso dentro del mismo día. Esto contradice continuidad de cuentas abiertas entre turnos. Es análisis de la expresión existente, no ejecución del motor de fórmulas de Sheets. |
| `Accounts.gs:26–45`, `POS.gs:44–69` | Saldo suma consumos y resta cobros aplicados por ticket a través del historial; no depende de SEMANA. Debe conservarse este alcance. |
| `KDS.gs:237–278`, `Schema.gs:9,11,14` | La entrega usa los estados de COMANDAS y preserva fórmulas de inventario; V deriva unidades entregadas y Y su costo. No añadir un filtro semanal a consumo ni reiniciar acumulados al cambiar el reporte. No se han cotejado aquí las fórmulas reales actuales de inventario. |
| `DOMUS_OS_Modos_Angel_Zoe.gs:249–251` | El código histórico escribe agregados en SEMANA/LIQUIDAR con SUM/SUMIF sin criterio de fecha explícito, con rangos hasta fila 506. Es evidencia del repositorio, no acreditación de que estas fórmulas sigan instaladas. Impide asumir que cambiar sólo W conservará los reportes. |

La fuente actual de fórmulas está capturada sólo para nuevas filas de Caja. No tenemos en este host un contrato completo vigente de fórmulas de SEMANA, LIQUIDAR y sus dependencias. Las coincidencias previas de **encabezados** y una entrega en staging no reemplazan ese cotejo. Tampoco se ha demostrado un archivo histórico inmutable completo de reportes cerrados.

## No duplicar las ramas existentes

`feature/phase-1-shifts-cuts`, SHA `881a71c9f705ebe8ef4772273c9ed0a7a1b0d8fd` (24 octubre), contiene `Shifts.gs`: calcula fecha local en America/Mexico_City al abrir y conserva businessDate en el turno. Crea hojas/columnas y contempla cortes. No pertenece a esta candidata, no acredita aprobación de la política de medianoche y no se incorpora por copia. Sus documentos históricos de producción contradicen el cotejo reciente V16, por lo que no se usan como prueba de instalación.

`feat/erp-v15-dimensions-daily-finance`, SHA `e9c4160d1ebad2d0ae9db787c52b33dcb0441ff2`, contiene trabajo de analítica diaria. Tampoco se fusiona ni se reconstruye su motor aquí. El cambio mínimo propuesto se limita a la candidata POS actual y a sus dependencias de fórmulas, coordinando cualquier trabajo posterior sobre turnos/reportes.

**Cotejo posterior a la decisión:** la rama de turnos sigue en `881a71c` y la integradora en `af17358`, comprobado en GitHub, sin cambios publicados adicionales. No apareció otro editor activo en la coordinación visible; no hubo contacto directo con un editor de esa rama ni se afirma coordinación humana completada. Se conservan `Shifts.gs`/`Cuts.gs` como trabajo existente para adaptar en esta integración, sin abrir una segunda implementación de turnos.

| Elemento de la rama de turnos | Compatibilidad con lo solicitado |
| --- | --- |
| `operationDayId = OPDAY-<fecha>` | No distingue dos jornadas abiertas el mismo día. No usar la fecha ni el nombre del evento como identidad única. |
| `shiftId`, `stationId`, `registerId` | Identifican turno/custodia de caja, no evento/proyecto/jornada de DOMUS. Deben poder relacionarse sin sustituirse entre sí. |
| `businessDate` congelada al abrir | Útil como etiqueta de inicio; no reemplaza timestamps reales ni determina por sí sola qué estaciones/eventos comparten jornada. |
| `getActiveShiftForStation_` con fallback `NO_SHIFT` y fecha actual | No acredita una jornada abierta. No usar el fallback para asignar movimientos silenciosamente a otra jornada. |
| `corteZCerrar` | Cierre financiero de un turno, distinto del cierre operativo de una jornada con pendientes. No se declara equivalente ni se copia como nueva regla de negocio. |
| `ensurePhase1Schema_` / consultas de corte | Agregan hojas/columnas; `corteXConsultar` llama a helpers que pueden agregar encabezados. No ejecutar como cotejo de sólo lectura ni trasladar a producción para descubrir el esquema. |

## Contrato propuesto para implementación

1. **Instante real del movimiento:** conservar timestamp del servidor y zona del libro, sin fecha fija de caducidad, sin backdate enviado por el cliente y sin modificar SEMANA para permitir operar. Es el comportamiento temporal que ya existe al registrar una venta; no requiere inventar una hora de corte.
2. **Agrupación aprobada:** evento, proyecto y jornada como dimensiones separadas del timestamp. Cada movimiento conserva el contexto de origen y su instante real. No usar la fecha calendario como sustituto de jornada ni cambiar de jornada a medianoche. Apertura/cierre y alcance quedan sujetos a las decisiones siguientes; no se agrega automáticamente un corte Z.
3. **Ventana de reporte:** SEMANA sólo selecciona qué movimientos se presentan en un informe. Un periodo vencido o mal formado produce un informe no disponible/aviso, no invalida una venta ni un pago. La habilitación exige que la versión compatible de fórmulas/reportes esté acreditada; no basta cambiar el texto o `allowed` del cliente.
4. **Validación operativa independiente:** la nueva W conserva datos requeridos, cuenta/proyecto/cliente coherentes, categoría, producto activo, reparto autorizado, cortesía y precio. Retira únicamente las dependencias temporales de reporte y la igualdad de timestamps dentro de la misma cuenta. Mantiene prohibición de reutilizar ticket con otro cliente/proyecto. La fórmula exacta se revisa junto con T/AA/AB y los consumidores reales antes de activarla.
5. **Nuevo contrato por versión:** nuevos registros reciben metadatos de contrato/fecha dentro del plan y resultado durable, sin confiar en banderas del navegador. No se añaden columnas por inferencia ni se sobrescribe COBROS. Una migración de fórmulas se prepara con precondiciones y diferencias exactas; las filas históricas y pendientes desconocidos no se convierten automáticamente a la nueva versión.
6. **Idempotencia y recuperación:** PREPARED/COMPLETED preservan plan, timestamp, comprobante, importes y versión originales, incluso al cruzar medianoche, semana/año o cambiar la selección de reporte. No regenerar ID/fecha ni reevaluar una venta parcial con la política nueva. Un plan legado incompatible se conserva en revisión; no se reescribe para forzar salida.
7. **Historial y reversión:** antes de adaptar una fórmula existente, conservar la expresión, sus dependencias, resultados relevantes en un respaldo privado y la condición exacta de restauración. Restaurar código no deshace pagos ni devuelve semántica compatible a filas nuevas. Un rollback requiere identificar operaciones emitidas con cada contrato y conservar journal/colas/recibos. No se promete que el historial financiero sea inmutable sólo porque no se escriben sus filas: sus fórmulas pueden recalcular.

## Lo que falta, separado por responsable

**Agrupación ya resuelta:** evento + proyecto + jornada, conservando fecha/hora reales. No preguntar de nuevo calendario contra jornada.

**Tres reglas mínimas pendientes para Steven:**

| Regla | Opción recomendada para el mínimo | Alternativa y consecuencia |
| --- | --- | --- |
| Alcance de la jornada | Una jornada general de DOMUS compartida por sus estaciones, con varios eventos/proyectos distinguidos en cada movimiento. | Jornadas independientes por evento/proyecto: pueden abrir/cerrar por separado; hay que resolver qué jornada atiende cada estación y cómo comparte la gaveta. |
| Apertura/cierre | Gerencia abre y cierra manualmente; la jornada continúa después de medianoche hasta esa acción. | Caja puede abrir y Gerencia cierra: delega la apertura y requiere definir los operadores autorizados. No se propone un horario automático ni una duración máxima no aprobada. |
| Pendientes al cerrar | Cierre **operativo** con lista explícita de cuentas, transferencias y entregas pendientes. No admite nuevas ventas en esa jornada; conserva vínculos originales y conciliación pendiente. No equivale a cierre financiero definitivo. | Bloquear cierre hasta resolver todos los pendientes: es más restrictivo y puede mantener abierta la jornada mientras existan cuentas autorizadas a crédito. |

No es necesario preguntar otra vez si las cuentas pueden permanecer abiertas: ya está definido en la regla 3. La decisión es qué significa cerrar la jornada cuando existen, sin cancelar ni cobrar automáticamente. Tampoco se necesitan nuevas reglas de precios, reparto o reinicio de inventario para esta separación.

## Preparación técnica independiente de esas decisiones

- Proponer un ID de jornada generado en servidor y estable, separado de nombre/fecha/turno. Es una elección técnica; no pedir a Steven que invente folios. `operationDayId` por fecha del prototipo no basta para esa identidad.
- Mantener evento y proyecto separados: ACTIVIDADES canónica tiene A = actividad/evento y D = proyecto; el POS actual conserva sólo la etiqueta `activity`. No deducir un `projectId` de un organizador legado ni convertir etiquetas históricas ambiguas en IDs. El vínculo duradero necesita un registro/mapeo explícito, con casos duplicados o incompletos en revisión. No se agregan campos a las 35 columnas sin plan compatible.
- Preparar contexto de origen de la venta y contexto del movimiento posterior por separado. Ejemplo: consumo en jornada J1 y pago acreditado en J2 mantienen origen J1 y timestamp/jornada del cobro J2, sin trasladar la venta ni duplicar ingreso. La vista puede desglosar ambos; no sellar un informe financiero de J1 como definitivo si aún depende de pagos pendientes.
- Apertura, selección y cierre deberán pasar por autorización del servidor, lock y journal de la candidata; no se copiarán escrituras directas del prototipo como si ya tuvieran recuperación equivalente.
- Al cerrar, un PREPARED/COMPLETED ya vinculado debe recuperarse con su contexto original. Un pedido offline que nunca llegó al servidor y refiere a una jornada cerrada no se reasigna ni acepta automáticamente; queda para revisión explícita. La regla de tratamiento/roles debe quedar incluida en el flujo de cierre acordado, no resolverse por la hora del navegador.
- Preparar pruebas de dos jornadas el mismo día, múltiples proyectos/eventos, cruce de medianoche, estación equivocada, cierre concurrente con venta, ACK perdido y cobro posterior. No se marcan PASS antes de implementar el contrato aprobado.

**Bloqueo técnico previo a habilitar cobro fuera de SEMANA:** obtener/reutilizar evidencia privada actual de fórmulas y dependencias de SEMANA, LIQUIDAR, CAJA 2 O/T/W/AA/AB/AL, reportes que las consumen e inventario/recetas. Sólo expresiones y estructura necesarias; no clientes, payloads o filas operativas completas. Identificar dónde ya hay filtro de fecha, dónde hay sumas globales/rangos cerrados y qué resultados históricos se consideran cerrados. No se hicieron lecturas remotas nuevas en este tramo.

No se requiere que Steven diseñe estas fórmulas. Con esa evidencia, el integrador prepara un delta de fórmulas/guardas y una simulación sobre el fixture existente; coordinación coteja la compatibilidad real en staging en un tramo autorizado. Hasta entonces se conserva el bloqueo que evita cobros con hoja incompatible.

## Pruebas que debe pasar la implementación, aún no ejecutadas

- Venta nueva con SEMANA antigua, futura, vacía o inválida: timestamp real, pago/comanda correctos, aviso sólo del reporte; ninguna modificación de B7:B8.
- Mismos movimientos, dos ventanas de reporte: cambian sólo los registros incluidos en la vista, no su importe aplicado, saldo, reparto acreditado, estado de entrega ni stock.
- Cuenta con consumos separados por minutos, medianoche y varios turnos: no se marca reutilizada por fecha; otro cliente/proyecto sigue rechazado.
- Recuperación de fallo entre componentes de mixto, transferencia confirmada y fallo al completar REQUESTS después de medianoche/cambio de versión: mismo plan/ID/fecha/recibo, sin segundo cobro.
- KDS bloquea revisión real, pago pendiente y transiciones inválidas; permite la entrega acreditada fuera de la ventana de reporte y registra una sola entrega. Verificar las fórmulas reales con el fixture actualizado; el mock actual no es un motor general de Sheets.
- Fila histórica, plan legado y fórmula inesperada: no se convierten por coincidencia de nombre; se conserva evidencia y se detiene esa migración.
- Cambio de año, fechas futuras y límites de zona horaria sin fecha hardcodeada de vencimiento. Revisar rangos hasta 506/326 como límite técnico separado: no prometer capacidad infinita ni ausencia de cuotas de Apps Script/Sheets.

Las suites verdes de 989 no prueban esta separación todavía. No se crean resultados PASS para un contrato aún pendiente ni se afirma operación indefinida certificada.
