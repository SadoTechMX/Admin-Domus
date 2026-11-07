> **Conexión de jornada, 7 noviembre 2026 UTC — IMPLEMENTED / LOCAL_TESTED:** [Apertura, ventas y corte vinculados](JOURNEY_INTEGRATION_20261107.md), UI `20261107-journey-14`. Mapa explícito de servidor, REQUESTS/journal, cuenta de origen y movimiento posterior separados. 18 casos de operaciones + 8 de transporte + 5 de Chromium pasan. Corte limitado a recibos POS, sin liquidación financiera definitiva; transferencias/entregas pendientes al cortar siguen bloqueadas por decisión pendiente. SEMANA y fórmulas intactas. Ninguna configuración Google, deployment, impresión o dato real modificado. Este avance sustituye la preparación privada descrita abajo.

# Operación continua y periodos de reporte — diseño, 7 noviembre 2026 UTC

> **Decisiones recibidas de Steven, 7 noviembre:** «Será por evento, proyecto y jornada»; cada jornada de evento/proyecto empieza al abrir caja y termina al hacer su corte, aunque cruce medianoche. Se conservan fecha/hora reales. Los eventos de 20:00 a 07:00 son un ejemplo de duración, **no un horario automático de cierre**. La impresión queda exclusivamente con Steven y Antigravity.

**PREPARACIÓN IMPLEMENTADA / LOCAL_TESTED; integración de jornada incompleta. No se habilitó cobro fuera de SEMANA.** El análisis original se hizo sobre `989d59e9d424c659af61784febfa7b184a641fbc`; la preparación siguiente parte de `7b80fb3`. Ramas y coordinación publicadas no mostraron otro editor activo sobre este cambio; esto no prueba ausencia de trabajo privado no comunicado. Se agregó un lector privado de contexto durable y sus pruebas, reutilizando REQUESTS y el journal de la candidata. No abre/cierra jornadas, no está conectado al POS ni publica nuevos RPC. No hubo Google, ventas, PR, merge o despliegue.

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

**Cotejo posterior a la decisión:** la rama de turnos sigue en `881a71c`; la integradora publicada seguía en `7b80fb3` al comprobar GitHub antes de este commit. No apareció otro editor activo en la coordinación visible; no hubo contacto directo con un editor de esa rama ni se afirma coordinación humana completada. Se conservan `Shifts.gs`/`Cuts.gs` como trabajo existente para adaptar en esta integración, sin abrir una segunda implementación de turnos.

| Elemento de la rama de turnos | Compatibilidad con lo solicitado |
| --- | --- |
| `operationDayId = OPDAY-<fecha>` | No distingue dos jornadas abiertas el mismo día. No usar la fecha ni el nombre del evento como identidad única. |
| `shiftId`, `stationId`, `registerId` | Identifican turno/custodia de caja, no evento/proyecto/jornada de DOMUS. Deben poder relacionarse sin sustituirse entre sí. |
| `businessDate` congelada al abrir | Útil como etiqueta de inicio; no reemplaza timestamps reales ni determina por sí sola qué estaciones/eventos comparten jornada. |
| `getActiveShiftForStation_` con fallback `NO_SHIFT` y fecha actual | No acredita una jornada abierta. No usar el fallback para asignar movimientos silenciosamente a otra jornada. |
| `corteZCerrar` | Steven vincula el fin de jornada con el corte. El adaptador debe registrar esa relación explícita; un corte legado de turno no basta para deducir evento/proyecto/jornada. No copiar sus escrituras directas ni su fallback de efectivo declarado igual a esperado. |
| `ensurePhase1Schema_` / consultas de corte | Agregan hojas/columnas; `corteXConsultar` llama a helpers que pueden agregar encabezados. No ejecutar como cotejo de sólo lectura ni trasladar a producción para descubrir el esquema. |

## Contrato propuesto para implementación

1. **Instante real del movimiento:** conservar timestamp del servidor y zona del libro, sin fecha fija de caducidad, sin backdate enviado por el cliente y sin modificar SEMANA para permitir operar. Es el comportamiento temporal que ya existe al registrar una venta; no requiere inventar una hora de corte.
2. **Agrupación y ciclo aprobados:** evento, proyecto y jornada como dimensiones separadas del timestamp. Cada jornada de evento/proyecto nace en su apertura de caja y termina con su corte explícito. No usar la fecha calendario como identidad ni cambiar de jornada a medianoche, a las 07:00 o por duración transcurrida. Cada movimiento conserva el contexto de origen y su instante real.
3. **Ventana de reporte:** SEMANA sólo selecciona qué movimientos se presentan en un informe. Un periodo vencido o mal formado produce un informe no disponible/aviso, no invalida una venta ni un pago. La habilitación exige que la versión compatible de fórmulas/reportes esté acreditada; no basta cambiar el texto o `allowed` del cliente.
4. **Validación operativa independiente:** la nueva W conserva datos requeridos, cuenta/proyecto/cliente coherentes, categoría, producto activo, reparto autorizado, cortesía y precio. Retira únicamente las dependencias temporales de reporte y la igualdad de timestamps dentro de la misma cuenta. Mantiene prohibición de reutilizar ticket con otro cliente/proyecto. La fórmula exacta se revisa junto con T/AA/AB y los consumidores reales antes de activarla.
5. **Nuevo contrato por versión:** nuevos registros reciben metadatos de contrato/fecha dentro del plan y resultado durable, sin confiar en banderas del navegador. No se añaden columnas por inferencia ni se sobrescribe COBROS. Una migración de fórmulas se prepara con precondiciones y diferencias exactas; las filas históricas y pendientes desconocidos no se convierten automáticamente a la nueva versión.
6. **Idempotencia y recuperación:** PREPARED/COMPLETED preservan plan, timestamp, comprobante, importes y versión originales, incluso al cruzar medianoche, semana/año o cambiar la selección de reporte. No regenerar ID/fecha ni reevaluar una venta parcial con la política nueva. Un plan legado incompatible se conserva en revisión; no se reescribe para forzar salida.
7. **Historial y reversión:** antes de adaptar una fórmula existente, conservar la expresión, sus dependencias, resultados relevantes en un respaldo privado y la condición exacta de restauración. Restaurar código no deshace pagos ni devuelve semántica compatible a filas nuevas. Un rollback requiere identificar operaciones emitidas con cada contrato y conservar journal/colas/recibos. No se promete que el historial financiero sea inmutable sólo porque no se escriben sus filas: sus fórmulas pueden recalcular.

## Lo que falta, separado por responsable

**Resuelto:** evento + proyecto + jornada, apertura de caja → corte explícito, cruce de medianoche permitido y fecha/hora reales. No volver a preguntar por calendario, alcance general de DOMUS ni horario fijo.

**Integración técnica pendiente:** enlazar identificadores durables de evento/proyecto con la apertura, adaptar apertura/corte de la rama existente al lock/journal y rol de servidor, vincular cada nuevo movimiento al contexto y cotejar fórmulas/reportes vigentes. No se agregó autorización nueva ni se asumió una gaveta compartida entre proyectos.

**Regla de cierre por precisar antes de habilitar el botón:** las cuentas pueden seguir vivas entre turnos (regla 3); no se cancelan ni cobran al cortar. Falta concretar si el corte de jornada puede finalizar con una lista declarada de transferencias/entregas pendientes, o debe esperar a resolver esas dos clases de pendientes. Recomendación para revisión: conservar pendientes y su origen, con un corte que muestre la conciliación faltante; no presentarlo como liquidación definitiva. Esta decisión no impide preparar el contexto ni las pruebas sin escrituras. Los roles de apertura/corte se cotejarán con los existentes antes de proponer cualquier ampliación de privilegios.

## Preparación técnica independiente de esas decisiones

- Proponer un ID de jornada generado en servidor y estable, separado de nombre/fecha/turno. Es una elección técnica; no pedir a Steven que invente folios. `operationDayId` por fecha del prototipo no basta para esa identidad.
- Mantener evento y proyecto separados: ACTIVIDADES canónica tiene A = actividad/evento y D = proyecto; el POS actual conserva sólo la etiqueta `activity`. No deducir un `projectId` de un organizador legado ni convertir etiquetas históricas ambiguas en IDs. El vínculo duradero necesita un registro/mapeo explícito, con casos duplicados o incompletos en revisión. No se agregan campos a las 35 columnas sin plan compatible.
- Preparar contexto de origen de la venta y contexto del movimiento posterior por separado. Ejemplo: consumo en jornada J1 y pago acreditado en J2 mantienen origen J1 y timestamp/jornada del cobro J2, sin trasladar la venta ni duplicar ingreso. La vista puede desglosar ambos; no sellar un informe financiero de J1 como definitivo si aún depende de pagos pendientes.
- Apertura, selección y cierre deberán pasar por autorización del servidor, lock y journal de la candidata; no se copiarán escrituras directas del prototipo como si ya tuvieran recuperación equivalente.
- Al cerrar, un PREPARED/COMPLETED ya vinculado debe recuperarse con su contexto original. Un pedido offline que nunca llegó al servidor y refiere a una jornada cerrada no se reasigna ni acepta automáticamente; queda para revisión explícita. La regla de tratamiento/roles debe quedar incluida en el flujo de cierre acordado, no resolverse por la hora del navegador.
- Preparar pruebas de dos jornadas el mismo día, múltiples proyectos/eventos, cruce de medianoche, estación equivocada, cierre concurrente con venta, ACK perdido y cobro posterior. No se marcan PASS antes de implementar el contrato aprobado.

**Bloqueo técnico previo a habilitar cobro fuera de SEMANA:** obtener/reutilizar evidencia privada actual de fórmulas y dependencias de SEMANA, LIQUIDAR, CAJA 2 O/T/W/AA/AB/AL, reportes que las consumen e inventario/recetas. Sólo expresiones y estructura necesarias; no clientes, payloads o filas operativas completas. Identificar dónde ya hay filtro de fecha, dónde hay sumas globales/rangos cerrados y qué resultados históricos se consideran cerrados. No se hicieron lecturas remotas nuevas en este tramo.

No se requiere que Steven diseñe estas fórmulas. Con esa evidencia, el integrador prepara un delta de fórmulas/guardas y una simulación sobre el fixture existente; coordinación coteja la compatibilidad real en staging en un tramo autorizado. Hasta entonces se conserva el bloqueo que evita cobros con hoja incompatible.

## Preparación implementada y pruebas ejecutadas

`Journeys.gs` incorpora `journeyContext_`, un lector privado de REQUESTS que exige apertura COMPLETED con contrato `domus-journey-v1`, identidad `JOR-<requestId de apertura>`, evento/proyecto explícitos y timestamp real canónico. La identidad deriva de una petición durable y vinculada, no del día o de etiquetas. Rechaza aperturas duplicadas, parciales o legadas; sólo un corte COMPLETED ligado a esa apertura y turno puede cerrarla. Un corte incierto/legado bloquea la resolución: REQUESTS no conserva cuerpo confiable de cortes fallidos para acotar su alcance, por lo que no se adivina a qué jornada pertenece.

El lector no crea hojas ni escribe celdas. Su snapshot no autoriza futuras ventas; el adaptador deberá releer dentro del mismo lock que prepare el movimiento. Un plan PREPARED ya vinculado conserva el contexto original al recuperarse, incluso después del corte. No hay importación automática de turnos históricos ni nuevos campos en ACTIVIDADES/COBROS.

`node tests/journey_context_regressions.js`: **9 casos PASS** con módulos reales y libros simulados: ausencia de apertura sin crear hojas; 20:00/medianoche/07:00/días siguientes sin corte automático; dos proyectos y proyecto sin evento; cierre vinculado; rechazo de legado/duplicados/parciales; tiempos inválidos; recuperación de un plan preparado tras el corte; ausencia de nuevos RPC autorizados. El caso de journal es un fixture de contexto, **no una venta integrada a jornada**. La primera ejecución detectó una comparación de prototipos entre VM/host en el arnés; se normalizó la comparación JSON y los nueve casos pasaron.

Regresiones relevantes: recuperación **27**, reconciliación **17**, transición histórica **9**, periodo operativo **11**, transferencias **20**, mixto **17**: todas PASS. La compilación determinista y su comprobación de paridad pasan. No se editaron app/Index, configuración de impresión, fórmulas, POS, Auth ni API. El bundle incorpora el módulo privado y cambia su hash; la UI conserva `20261107-print-token-13`. La CI remota del nuevo commit debe comprobarse por SHA después del push.

Guardas de producción **4/4** y seguridad del arnés staging **3/3** pasan localmente. Fuente backend resultante: `9b6f7b0e5f2e9d3968cf0d6a5430988260d6706469719a0aeaf2856dbe922d78`. Esta preparación no produce registros de jornada y no requiere migración de hojas: su reversión de código consiste en retirar el módulo del build y regenerar artefactos desde la base. Una futura integración que sí escriba aperturas/cortes necesitará otra revisión de reversión que preserve esos registros; esta comprobación no la sustituye.

## Pruebas de la integración completa, aún no ejecutadas

- Venta nueva con SEMANA antigua, futura, vacía o inválida: timestamp real, pago/comanda correctos, aviso sólo del reporte; ninguna modificación de B7:B8.
- Mismos movimientos, dos ventanas de reporte: cambian sólo los registros incluidos en la vista, no su importe aplicado, saldo, reparto acreditado, estado de entrega ni stock.
- Cuenta con consumos separados por minutos, medianoche y varios turnos: no se marca reutilizada por fecha; otro cliente/proyecto sigue rechazado.
- Recuperación de fallo entre componentes de mixto, transferencia confirmada y fallo al completar REQUESTS después de medianoche/cambio de versión: mismo plan/ID/fecha/recibo, sin segundo cobro.
- KDS bloquea revisión real, pago pendiente y transiciones inválidas; permite la entrega acreditada fuera de la ventana de reporte y registra una sola entrega. Verificar las fórmulas reales con el fixture actualizado; el mock actual no es un motor general de Sheets.
- Fila histórica, plan legado y fórmula inesperada: no se convierten por coincidencia de nombre; se conserva evidencia y se detiene esa migración.
- Cambio de año, fechas futuras y límites de zona horaria sin fecha hardcodeada de vencimiento. Revisar rangos hasta 506/326 como límite técnico separado: no prometer capacidad infinita ni ausencia de cuotas de Apps Script/Sheets.

Ni las suites de 989 ni las nueve pruebas del lector privado acreditan la separación completa de operación/reportes. Siguen pendientes apertura/corte autenticados, asociación real con POS y concurrencia venta/corte, fórmulas evaluadas en Sheets y recorrido autorizado en staging. No se afirma operación indefinida certificada.
