> Historical v3 design reference. For the current isolated v4 UI and audited release protocol, read QA_AUDITED_RELEASE_REVIEW.md and QA_RELEASE_PROTOCOL_V4.md. This document does not authorize publication, installation or a live recovery.

# Recuperación explícita de apertura QA ausente: prototipo aislado

## Estado y límites de autorización

Implementación y simulaciones locales únicamente. No se publicó, instaló ni ejecutó contra Google o el intento real. No se volvió a intentar Chromium ni se cambió de ruta para eludir la restricción de navegador.

Base canónica: commit `db6805886538cd5f59506b17dd04747f4ca57695`, árbol `66583c79c300c48ee3d5f7d094629301160cbbb9` de SadoTechMX/Admin-Domus. Esta copia incorpora la consulta autenticada aislada v2 y añade el protocolo de recuperación v3.

Fuente final: `721a07e65d98b2ef9c55a36904ea349b249dab4dea41e5b3a7985c87a1df2a36`.

Pareja generada:
- Staging: `a70c0800235042e86be9867084a846f4eca59d69503585fe0c696f27d4c357d5`.
- Index: `3f1a89f4fe8e0cbc4518aeef1c40a171a9964fc5354d787e8c4078de78ba6bd3`.

**No está lista para uso real.** Faltan permisos de publicación/instalación/ejecución, prueba de navegador, verificación de barrera real y tiempos/persistencia de Google. La autorización para desarrollar no autoriza ninguno de esos pasos.

## Qué implementa

- `prepararRecuperacionQaAusente`: consulta autenticada CAJA. Verifica ausencia de REQUESTS y journal para la misma intención, identidad original, límite histórico, mapa de estación/ámbito, sesión vigente y proyecto/libros staging. Genera una huella de evidencia que incluye el inventario de valores, fórmulas, identidad y dimensiones de todas las hojas de ambos libros. No habilita recuperación por sí misma.
- `recuperarAperturaQaAusente`: mutación dedicada, fuera del wrapper genérico de idempotencia. Está desactivada si no existe la aprobación específica exacta del servidor. No llama a `turnoAbrir`, `journalCommit_` ni `journalResume_` para recuperar.
- Un preflight puro compartido genera el mismo contrato de apertura de fondo $0; conserva la guarda de custodia histórica del resultado y del marcador. No escribe COBROS, CAJA 2, TURNOS, inventario, cortes ni otras hojas comerciales.
- Procedimiento privado de cliente `qaRecoverAbsentClient_`: requiere consentimiento ligado al intento original y observación de ausencia; usa sesión CAJA existente, conserva primero una tentativa separada y realiza una sola RPC. No está conectado a un botón ni se activa automáticamente.
- La pantalla existente de recuperación mantiene deshabilitado el reenvío de un intento ya documentado. El original UNCONFIRMED, hold, cola y evidencias permanecen intactos.

## Protocolo bajo el mismo lock

1. Revalidar autoridad, destino, build, ausencia, contexto y evidencia. Cualquier registro, PREPARED, duplicado, legado, cambio de hoja, sesión o política impide empezar. Se conservan ID, cuerpo canónico, dispositivo y operador originales.
2. Validar autorización exacta en `DOMUS_QA_ABSENT_RECOVERY_APPROVAL_V1`: evidencia, consentimiento, aprobador permitido, referencia, ventana máxima de 10 minutos, estaciones detenidas y barrera de ejecutores. No hay endpoint para crear esta aprobación.
3. Crear y leer de vuelta un gate de staging en estado CLAIMED. Desde ese momento los consumidores y escritores nuevos protegidos quedan detenidos. Sólo se permiten salud/autenticación y la consulta de evidencia del ID original; esa consulta no modifica registros.
4. Anexar REQUESTS con binding provisional `QA_RECOVERY_FENCE_V1:<digest>`, estado REQUIRES_REVIEW y marcador de custodia. Un ejecutor antiguo compatible del mismo ID rechaza ese binding antes de reanudar un journal.
5. Anexar journal COMPLETED, plan vacío y resultado de apertura. Preparar REQUESTS COMPLETED conservando el binding provisional. Revalidar todas las hojas esperadas y la autoridad.
6. Publicar el hash original del payload en una sola celda, después de verificar ambos registros. Verificar nuevamente inventario y contexto. El prefijo provisional es reconocible por los lectores nuevos, incluso si se pierde la propiedad gate antes de publicar.
7. Registrar gate COMMITTED_REQUIRES_REVIEW y devolver ACK. **El gate permanece bloqueante**, también en éxito. No existe API de liberación, borrado o reparación automática.

Cada escritura verifica preimagen, identidad y dimensiones del destino, aplica sólo el rango esperado, hace flush y comprueba lectura posterior. No se amplían rejillas ni se crean hojas. Un fallo, timeout o resultado incierto no dispara rollback, replay, limpieza ni otro ID.

Esto proporciona verificación y vinculación serializadas para participantes del mismo lock, **no una transacción ACID de Sheets entre varias escrituras**. Los estados intermedios y la incertidumbre son explícitos y permanecen retenidos.

## Resultado y seguimiento

El éxito significa que se observó una apertura administrativa de fondo $0 vinculada al mismo ID y con ACK concordante. No es venta, cobro, conciliación financiera ni permiso para operar:

- `canRelease=false`, `canRetry=false`, `resolved=false`, `financialFinal=false`.
- Cliente separado: SENT → CONFIRMED_HELD, o UNCONFIRMED si no puede acreditar el resultado.
- Intento original: no cambia.
- Gate global: no se retira.
- Si existe cualquier gate o tentativa nueva, repetir el procedimiento se rechaza, incluso con la misma aprobación.
- Una consulta posterior puede observar ACK durable del ID original; no repara ni libera nada.

Una futura liberación requiere otro diseño y autorización explícita. No se incluye en esta entrega. Tampoco se incluye el ensayo de cobro de $70, impresión o cajón.

## Ejecutores tardíos: garantía acotada

Se ensayaron los backends exactos f24 (V20/base db680588) y 2412 (consulta v2). Comparan acción, payloadHash y dispositivo antes del ACK/replay. En los puntos simulados, una llegada anterior crea como máximo la apertura original y hace que la nueva recuperación rechace ausencia; una llegada con fence rechaza; una llegada tras publicación devuelve el mismo ACK sin duplicar filas.

Si falla **antes de persistir el primer gate o binding**, este procedimiento no ha instalado una barrera durable. La solicitud original todavía puede terminar por su propia ejecución. No se declara ausencia de efectos por ese fallo. El hold local original permanece.

El gate nuevo no controla código antiguo que lo ignore, otros proyectos, ediciones manuales o escrituras remotas ya pendientes. Un flag o hash de evidencia **no prueba** que esos ejecutores estén detenidos. Es una precondición administrativa que debe verificarse fuera de esta simulación antes de autorizar uso real.

La eliminación manual del gate después de publicación completa es una intervención administrativa no soportada, fuera de las garantías. No se afirma resistencia a administradores que alteren controles o evidencias. El código no realiza esa eliminación.

## Autorización específica necesaria antes de uso

Son pasos distintos, todavía no autorizados por este desarrollo:

1. Publicar los archivos completos nuevos/modificados en una rama de trabajo, incluidos bundles y fixtures de versiones anteriores. Revisar permisos y contenido antes de hacerlo.
2. Instalar la pareja exacta en el proyecto staging canónico, sin producción. Verificar hashes, autenticación y navegador sobre esa pareja.
3. Verificar y documentar la barrera de ejecutores: estaciones retenidas, ejecución original terminada, versiones/escritores incompatibles detenidos y ausencia de vías que ignoren el protocolo. No reemplazar esto con un temporizador o con borrar la cola.
4. Obtener autorización expresa para **esa única apertura QA**: requestId original, hash del cuerpo original, dispositivo, operador, ámbito, fondo $0, proyecto/libros staging, huella de propuesta vigente y creación de los registros administrativos/barrera. Explicar que un error puede dejar la recuperación retenida y no autoriza otro intento.
5. Sólo entonces configurar la aprobación exacta con plazo de hasta 10 minutos. La configuración del servidor es una acción separada; no hay setter público ni aprobación por defecto.
6. Obtener el consentimiento explícito del operador para la misma identidad y evidencia. La propuesta y una aprobación antigua no autorizan cambios de ID/cuerpo/destino.

La aprobación debe aclarar que NO incluye cobros, producción, periféricos, levantar hold/gate, cambiar datos históricos ni resolver efectos financieros. No se exige por este prototipo un respaldo nuevo: puede reutilizarse el respaldo previamente verificado si sigue siendo pertinente; cualquier diferencia material debe revisarse.

## Pruebas sintéticas y revisión

Los resultados exactos finales están en `validation-summary.json` y logs.

- Servidor: 92 casos. Incluyen fallos antes y después de las 10 operaciones de persistencia/flush, prefijos parciales de cada escritura, readback incierto, dos contextos de ejecución, ejecutores tardíos, revocación/expiración, evidencia cambiada, conflicto de preimagen, gate, IDs malformados y referencias históricas retenidas.
- Cliente: 19 casos. Un único envío, consentimiento incompleto, sesión ausente, cuota antes/después de persistir, ACK con campos extra, timeout y respuesta tardía, dos pestañas y cambios del intento original.
- Consulta autenticada previa: 101 casos sobre la pareja final.
- Regresiones seleccionadas: 246 casos de recuperación, conciliación, apertura retenida, polling/prioridad, límites, aislamiento y lecturas operativas.
- Paridad generada y 24 hashes de manifiesto comprobados; sintaxis de app y bundles comprobada.
- Revisión independiente detectó y ayudó a cerrar acceso de consulta a otro ID con gate, sesión revocada durante propuesta, whitelist incompleta del ACK y consumo de apertura provisional. La última revisión incluye la guarda canónica de custodia histórica antes de preparación/publicación.

Estas pruebas no son una demostración formal de todos los estados posibles. Los mocks modelan el lock y los fallos de escritura, pero no acreditan buffers, persistencia, latencia ni límites de ejecución reales de Google. La captura completa tiene un límite de 4 millones de celdas por libro y debe medirse antes de uso; no se promete evitar el timeout real de seis minutos.

## Reproducción

Aplicar el overlay a una copia limpia de la base canónica exacta. Fixtures de backend legado incluidos y sin datos reales:

- `node tests/absent_recovery_regressions.js`
- `node tests/absent_recovery_client_regressions.js`
- `node tests/unconfirmed_observation_regressions.js`
- `python3 scripts/build_release.py --check`

No ejecutar el procedimiento contra un proyecto real como parte de estas pruebas. No utilizar las aprobaciones sintéticas como autorizaciones reales. El diff de fuente y las huellas acompañan la entrega.
