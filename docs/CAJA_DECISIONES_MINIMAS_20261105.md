# Decisiones mínimas para Caja — 5 noviembre 2026, Ciudad de México

**Propuesta histórica; leer primero la actualización de alcance.** Steven priorizó Caja/comandas con ticket impreso o digital y aclaró que cada proyecto usa su propia boletera; DOMUS sólo registra. La instrucción posterior conserva transferencias incluidas, pendientes de verificación: no se aplicó su exclusión. Se prepararon captura externa y ticket descargable; siguen sin instalar/certificar. Evidencia, límites y decisiones aún pendientes en [BOLETERA_REGISTRO_20261105.md](BOLETERA_REGISTRO_20261105.md).

La propuesta original siguiente corresponde a la revisión local de `69aeb07f620dcdc1f38a1614a122a242d14c0b69`, anterior a esas aclaraciones. No debe interpretarse como autorización de instalación ni como configuración vigente.

**Recomendación: habilitar primero el alcance de consumos Caja + KDS, sujeto a validación técnica.** El contrato pendiente de ACTIVIDADES no impide por sí solo ese flujo. Puede conservarse bloqueada la creación/selección de eventos y el registro de nuevas admisiones mientras se resuelven sus reglas. Elegir este alcance no autoriza desplegar ni permite omitir conciliación o pruebas.

## Tres decisiones para Steven

| Decisión concreta | Opción propuesta | Alternativa y consecuencia |
| --- | --- | --- |
| **1. ¿Abrimos primero consumos en Caja + KDS, dejando Accesos/Eventos bloqueados?** | **Sí, recomendado para avanzar.** Cobrar consumos, consultar/liquidar cuentas y despachar. Conservar las reglas ya aprobadas de cuentas abiertas y cortesías. Usar la atribución de actividad/proyecto existente de Caja, sin crear ni activar eventos desde Accesos. | **Necesitamos también taquilla/eventos desde el primer turno.** Además de los gates de Caja, requiere definir U/L, reparto y aforo; no adoptar los ejemplos de IDE como aprobación. |
| **2. ¿Las transferencias son indispensables para el primer turno?** | **No, recomendado:** efectivo y únicamente las terminales cuya operación externa y registro se hayan validado. Dejar transferencias fuera del alcance inicial. | **Sí:** completar y validar primero el flujo que comprueba el ingreso bancario, identifica al responsable autorizado y aplica una sola vez el pago. Hoy Transferencia permanece pendiente y no liquida deuda. No basta elegir un nuevo texto de estado. |
| **3. ¿Podemos arrancar con comprobante en la app y apertura manual del cajón si el hardware sigue pendiente?** | **Aceptar ese alcance temporal**, si satisface la operación de Steven; verificarlo en la estación. El recibo confirmado se conserva y no se vuelve a cobrar por un fallo de impresión. | **Papel y cajón automático son obligatorios desde el primer turno:** la prueba física de impresora/bridge/cajón pasa a ser condición de apertura. Un ACK “encolado” no prueba que salió papel. |

Estas opciones son de alcance operativo, no estados nuevos del sistema. **Todavía no existe un modo configurado que deshabilite Transferencia u otras funciones excluidas de la apertura.** Si se elige una restricción, habrá que hacerla efectiva donde corresponda y comprobarla; una instrucción verbal o esconder un botón no sustituye el control servidor. Terminal 1/2 registran el medio en la ruta actual; no procesan por sí mismas la autorización del terminal bancario.

## Lo que ya está resuelto y no hay que volver a decidir

- **Cuentas abiertas:** pueden acumular consumos y conservar saldo entre turnos; se recalculan desde CAJA 2/COBROS. No hace falta pedir aprobación nueva para esa regla. La igualdad de `expectedTotal` al cobrar no debe trasladarse mecánicamente a todo pedido a crédito: la regla de acumulación no define por sí sola qué hacer ante un cambio de tarifa de los productos nuevos. Esa precisión funcional sigue pendiente de revisión, sin alterar la regla existente. [Reglas 3 y 5](OPERATING_RULES.md), [POS](../google-apps-script/POS.gs#L126).
- **Cortesías:** requieren autoridad real de Gerencia/Dirección, no una bandera del navegador. [Regla 7](OPERATING_RULES.md), [Auth](../google-apps-script/Auth.gs#L45).
- **Inventario:** descontar al entregar físicamente mediante KDS; nunca al cobrar. [ADR-004 aprobado](adrs/ADR-004-inventario-entrega-fisica.md).
- **Precios/fase:** proceden de catálogo y CAJA 2!F2 Solar/Lunar; el cliente no decide el precio autorizado. No se propone inventar tarifas o cambiar de fase para superar un rechazo. [Contexto](DOMUS_CONTEXT.md), [POS](../google-apps-script/POS.gs#L120).
- **Reintento incierto:** conservar ID/cuerpo y recuperar resultado original; no borrar la cola, el ledger ni cobrar de nuevo. No es una opción de negocio relajar este control. [Reglas 1/5](OPERATING_RULES.md), [ADR-006](adrs/ADR-006-outbox-storage-transactions.md).
- **Transferencias:** la separación entre pendiente y confirmado ya existe; falta acreditar el flujo completo de verificación/aplicación. Los estados de pago de [ADR-005](adrs/ADR-005-modelo-comercial-accesos.md) no definen el estado del evento en U.

La mención antigua de fallback localStorage en OPERATING_RULES/ADR-003 no describe esta candidata: ADR-006 lo desactiva. La estación debe disponer de Web Locks; no corresponde pedir a Steven que autorice un escritor concurrente inseguro.

## Qué sí puede impedir cobrar o completar el servicio

| Condición técnica | Efecto y evidencia actual |
| --- | --- |
| **Frontend y backend compatibles realmente instalados** | La candidata no está instalada. Su contrato de ACK exige campos que el legado puede omitir; no instalar sólo el frontend. Falta cerrar la referencia recuperable del conjunto anterior, incluido HTML/V16, y verificar la pareja nueva. Un push no actualiza Apps Script. [Integración](MASTER_INTEGRATION_20261106.md). |
| **Sesión, entorno y libros correctos; almacenamiento de cliente utilizable** | El servidor exige autenticación; el cliente compara entorno y ambos libros. Navegador sin Web Locks, cuota/corrupción de almacenamiento o credenciales ausentes bloquean. Configuración y pruebas del equipo deben resolverlo, sin secretos en chat. [Auth](../google-apps-script/Auth.gs#L45), [transporte](../js/app.js#L2397), [ADR-006](adrs/ADR-006-outbox-storage-transactions.md). |
| **Intenciones y journals pendientes conciliados** | Un POS incierto bloquea otra venta en el mismo almacenamiento. Además, `journalCommit_` rechaza cualquier operación nueva si hay un journal sin terminar, **aunque sea de Eventos**. Separar Caja de Accesos no evita este bloqueo global. No se ha consultado su existencia actual; no afirmar que está vacío. Conservar y resolver evidencia, nunca borrar para liberar Caja. [Data](../google-apps-script/Data.gs#L93), [Idempotency](../google-apps-script/Idempotency.gs#L164). |
| **Catálogo, fase, saldos, fórmulas y persistencia financiera válidos** | El cotejo recibido acredita encabezados, no fórmulas ni valores. Se necesita evidencia del recorrido completo en Google sobre la candidata y esquema representativo: cobro, ACK perdido, recarga/mismo ID, saldo y comanda únicos. No usar ventas ficticias productivas. [POS](../google-apps-script/POS.gs#L111), [pruebas y límites](ACTIVITY_CANONICAL35_20261105.md). |
| **KDS, existencias y recetas verificables** | Caja puede registrar un pago antes de que KDS detecte stock/conteo/fórmula faltante al entregar. Eso no convierte el servicio completo en operable. Validar la entrega y su consumo real para el catálogo habilitado; no inventar conteos. [KDS](../google-apps-script/KDS.gs#L154), [ADR-004](adrs/ADR-004-inventario-entrega-fisica.md). |
| **Terminales y hardware según el alcance elegido** | Son gates físicos sólo donde el alcance los exige. Fallo de impresión/cajón ocurre después de confirmar el cobro y no debe provocar otra venta. La autorización bancaria externa debe comprobarse antes de registrar un pago de terminal. [Cliente](../js/app.js#L3030), [POS](../google-apps-script/POS.gs#L236). |

Ninguna respuesta de Steven reemplaza estos resultados técnicos. Las 20 pruebas de esquema y demás regresiones ya comunicadas son locales/con mocks; no se repitieron para redactar esta propuesta. Reembolsos automáticos, verificación bancaria y una anulación que devuelva dinero no están acreditados: no presentarlos como capacidades terminadas del alcance inicial.

## Accesos/Eventos: decisiones que pueden esperar si se elige 1 = Sí

La búsqueda local encontró `Confirmado / En Venta / Finalizado` en [DATA_MODEL.md](DATA_MODEL.md#L80), pero corresponde a la antigua estructura de 13 columnas, con estado en L y capacidad en I. **No autoriza trasladar esos valores a U ni convertir L en estado operativo.** No se encontró contrato aprobado aplicable a U/L/IJK del esquema recibido. La revisión de IDE aporta propuestas, no aprobación del dueño.

Para habilitar esas rutas más adelante hacen falta cuatro definiciones concretas:

1. **U:** valores permitidos y cuáles autorizan selección/admisión/cierre. Opciones para decidir: adoptar explícitamente un catálogo mínimo documentado o especificar otro; mientras tanto sólo lectura.
2. **L:** valores válidos y si el acuerdo habilita, condiciona o no interviene en la venta. No asumir que “Confirmado” significa acuerdo validado.
3. **I/J/K:** exigir reparto completo al crear, o crear sin habilitar venta hasta completarlo; definir quién lo llena y la representación del porcentaje. No usar DOMUS/Bruto por defecto.
4. **Aforo:** mantenerlo fuera de ACTIVIDADES con control operativo explícito, o diseñar almacenamiento dedicado. Notas/JSON no está aprobado; tampoco existe modelo acreditado de salidas/reingresos. No inventar un número ni identificar admisiones acumuladas con ocupación actual.

No se implementó ninguna de esas opciones en este documento.

## Siguiente paso propuesto, aún sin autorización de ejecución

Con las tres decisiones de alcance, preparar una validación concreta de la candidata `69aeb07` en el staging canónico existente, con respaldo, destino/libros exactos y personal de Caja/KDS/Gerencia para el recorrido elegido. La autorización de esa validación debe ser específica; no implica autorización de producción. Después, presentar el resultado y el paquete exacto para la decisión separada de integración/despliegue. No saltar los bloqueos de PR/deployment ni volver a un ensayo distinto.
