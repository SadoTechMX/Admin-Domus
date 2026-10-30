# Revisión independiente y aceptación — DOMUS OS

**NO-GO. Este paquete prepara validación y registra defectos; no instala ni certifica el sistema.**

Referencia revisada: PR #18, commit `f0c24ea032d72eb2847d62455d866bbf4c3b52a0`. Main continúa en `ebf5697a4f5cd5cae281e51ecd1c0857c7e4c30b`. Su CI `41119351840` terminó correctamente. No había comentarios/entrega nueva en la conversación del PR al cotejar. Esto no permite saber qué cambios conserva Antigravity sin publicar en su IDE.

## Entregables y alcance

| Archivo | Uso |
|---|---|
| ACCEPTANCE_MATRIX.md | 287 escenarios solicitados, cada uno con ID y estado pendiente/bloqueado |
| acceptance_cases.json | Contrato de aceptación por módulo, datos a contrastar, prerrequisitos y campos de ejecución/evidencia por escenario |
| control_inventory.json | 146 declaraciones estáticas por representación Pages/native, más 12 familias onclick dinámicas; no botones observados funcionando |
| reviewer_recovery_observations.json | Dos defectos reproducidos ejecutando funciones reales del cliente en VM, sin red |
| FINANCIAL_RECONCILIATION.md | Comprobaciones de importes, filas, fórmulas, saldos y stock antes/después |
| STATION_ACCEPTANCE.md | Protocolo por equipo físico y evidencias de impresora/cajón |

Los 146 controles de Pages y los 146 nativos representan las mismas funciones en dos superficies; no sumarlos como 292 funciones independientes. El inventario omite por diseño valores de inputs/credenciales. Incluye controles ocultos en modales como declaraciones; su visibilidad y permiso se comprueban en ejecución. Las 12 familias inline no cubren todos los eventos delegados: tarjetas, chips, pestañas y listeners programáticos se inventarían al abrir cada vista. Los antiguos 543 registros corresponden a varias fuentes/versiones, no a 543 botones únicos.

Los 287 escenarios contienen 274 NOT_TESTED y 13 BLOCKED por flujos de salida/reingreso/aforo, devoluciones o verificación bancaria no certificados. Hay **cero PASS de aceptación real del candidato**. Los contratos de módulo deben concretarse con pasos y valores de fixture por caso antes de ejecutarlo; el listado no sustituye una especificación aprobada de funciones aún no implementadas.

## Hallazgos que debe resolver Antigravity

### REV-001 · P1 · Recuperación de venta tras sincronización en segundo plano

Ejecución de `sincronizarOutboxCore_` con una venta pendiente y respuesta confirmada controlada: la cola queda vacía, `domus_pending_sale` permanece y el recibo devuelto no se conserva en el almacenamiento persistente observado. La próxima confirmación usa esa intención anterior en vez de construir una venta nueva. No se demostró un segundo cobro: el mismo ID debería deduplicarlo en el servidor. Sí queda pendiente demostrar recuperación clara del comprobante y protección del siguiente carrito.

Corregir el cierre de la intención que corresponda al requestId confirmado y ofrecer recuperación durable del recibo. No borrar una venta pendiente distinta ni limpiar un carrito nuevo. Probar cierre/reapertura, sincronización desde otra pestaña y fallo de almacenamiento posterior al commit, sin reenviar la operación con otro ID ni repetir cajón/impresión.

### REV-002 · P1 · Reautenticación tras sesión vencida

Ejecución real de `ensureSessionToken` y `callBackend` con token existente y rechazo 401 controlado: dos intentos de lectura produjeron dos errores y cero solicitudes de autenticación. La ruta observada reutiliza el token vencido sin ofrecer renovación en ese flujo.

Distinguir sesión inválida/expirada de permiso insuficiente. Invalidar sólo la sesión afectada y ofrecer autenticación legítima sin bucle. Si se reintenta una mutación, mantener ID y contenido originales. Probar expiración efectiva de GAS, no sólo el rechazo inyectado. No registrar secretos ni tratar cualquier 403 como sesión expirada.

### Reproducción y límites

Desde la raíz: `node tests/reviewer_recovery_observations.js`. La salida JSON contiene el hash exacto de js/app.js y estados de hallazgo. Un exit 0 indica que el sondeo pudo ejecutarse, **no que los hallazgos pasaron**; leer observations[].status. No está agregado a CI como una supuesta regresión verde. Al corregir cada defecto, añadir una prueba de regresión con aserciones y validar en navegador/STAGING.

Estos dos resultados son ejecución de fuente en VM, sin navegador, sin sesión real, sin hardware ni escritura operativa. No son nueva observación de fallos en Producción.

## Reglas de aprobación

- Antigravity conserva la instalación de STAGING; el revisor mantiene este paquete aislado, sin tocar su despliegue.
- Cada ejecución registra commit, hash de frontend/backend, versión GAS, endpoint, Main/Ops exactos, fecha, equipo, rol y datos controlados.
- PASS requiere pasos/resultado, comprobación de efectos y evidencia. Campos vacíos significan pendiente. Una captura de interfaz no prueba el asiento financiero; un JSON HEALTHY no prueba la interfaz.
- Repetir casos afectados tras un cambio. No extrapolar PASS entre versiones, roles, Pages/native o equipos.
- P0/P1 abiertos y BLOCKED críticos mantienen NO-GO. Funciones inexistentes requieren implementación o decisión explícita de alcance, nunca PASS ni exclusión silenciosa.
- P95 <5 s es el gate documental: medir operaciones iniciales separadas de replays, por flujo, incluyendo tiempo hasta visualización en KDS. Guardar muestras y errores; no mezclar reintentos rápidos para ocultar latencia inicial.
- Cualquier paso físico requiere operador presencial. Localhost desde nube no representa la iMac.
- Producción permanece en solo lectura; merge/despliegue, históricos y pagos requieren autorización concreta posterior.

## Entrega que esperamos de Antigravity

1. Commit/PR y release manifest de la versión instalada, respaldo/rollback, endpoint y prueba de ambos libros.
2. Resultados por ID de esta matriz y controles nuevos encontrados, con referencias a request/receipt/fila y capturas sin secretos.
3. Diferencias de fórmulas/validación, latencias y conciliaciones; defectos corregidos/reabiertos y lo no ejecutado.
4. Resolución de REV-001/REV-002 y evidencia de equipos reales. El revisor contrasta los artefactos; no se presume validación por ausencia de errores declarados.

CI de la versión revisada: https://github.com/SadoTechMX/Admin-Domus/actions/runs/41119351840
