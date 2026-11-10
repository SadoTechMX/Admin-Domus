# Custodia acotada de aperturas de prueba en staging

Implementado y probado con servicios en memoria; **sin instalar ni activar**. Base `464cbc2eee17d2a04d643e5e708de043d9d46215`; frontend conservado en `20261110-station-routing-19`. No se consultó Google en este tramo, no se ejecutó el harness histórico ni se reenviaron intenciones. La revisión de Gemini/Antigravity de versiones anteriores no acredita este cambio.

## Evidencia y alcance

Coordinación comunicó que los hashes de las nueve solicitudes REQUESTS 131–139 coinciden con `tests/test_phase1_shifts_cuts.py` de `881a71c9f705ebe8ef4772273c9ed0a7a1b0d8fd`. La evidencia anterior identifica COMPLETED en 131/134, siete FAILED y dos TURNOS OPEN en filas 2/3, con alias de request distintos. No se acreditó ausencia de efectos no etiquetados.

Se extrajeron los cuatro cuerpos públicos del harness mediante AST, sin importarlo/ejecutarlo, y los encabezados del módulo Shifts de ese SHA. [Fixture de contrato](../tests/fixtures/phase1_opening_contract.json) conserva SHA-256 de ambos archivos, cuerpos y hashes independientes. No contiene IDs, filas ni personas del libro compartido. El fixture de pruebas sólo reproduce la forma del incidente; el hash del inventario real aún debe obtenerse en una consulta autorizada.

El límite histórico existente **no basta**: rechaza aperturas antiguas y su exclusión cubre todo el prefijo y las colas inventariadas. No se relajó ese comportamiento. Se añadió un modo explícito `STAGING_PHASE1_OPENINGS_881A71C_V1` en las mismas rutas administrativas, sin otro motor ni libro.

## Contrato implementado

- Sólo proyecto canónico de staging, `DOMUS_ENV=STAGING`, ambos libros canónicos y MAIN efectivo coincidente. Ausencia de `ScriptApp.getScriptId`, otro proyecto/libro o producción impiden el modo. No hay fallback.
- Sólo nueve solicitudes literales en 131–139: ID único, acción `turnoAbrir`, dispositivo del harness, payload hash permitido, estados exactos. No se clasifican otros FAILED por fecha, error de texto o ausencia de jornada.
- Sólo dos turnos inventariados en TURNOS, con encabezados exactos y vínculo literal de respuesta/estación/gaveta/importe/hora/estado; sin corte, counting ni cierre. Las identidades no se normalizan ni se asignan a un evento moderno. Diferencias de tipos, esquema, filas o valores requieren revisión; no se corrigen por inferencia.
- Se requieren estaciones QA sin cola pendiente declarada, mapa explícito y referencia privada de evidencia. El servidor no puede certificar que el navegador esté detenido: la retención de estaciones y desactivación de escritores antiguos es una condición operativa que debe comprobarse antes de autorizar.
- Se rechazan referencias a los IDs/turnos/alias en otras solicitudes, journal, COBROS, CAJA 2, COMANDAS, ACCESO y CORTES_Z; también en MOVIMIENTOS, DEVOLUCIONES y AJUSTES_Z si existen. Se revisan valores y fórmulas, incluidos JSON escapados. Una referencia es motivo para detener, no para excluir el movimiento. Esta búsqueda **no descarta movimientos sin referencia**, otras hojas o sistemas externos.
- La propuesta es sólo lectura. Incluye inventario y hash de REQUESTS/journal, TURNOS/CORTES_Z, mapa, nueve IDs, dos turnos y dos alias. Debe conservarse privada. Los hashes cubren valores/fórmulas; no sustituyen un respaldo completo con notas, validaciones y formatos.
- Activación mediante Gerencia efectiva, propiedad **separada** `DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1`, hash exacto y aceptación explícita de incertidumbre. La propiedad general `DOMUS_HISTORY_BOUNDARY_APPROVAL_V1` no autoriza este modo.
- Registro durable `STAGING_TEST_OPENING_ISOLATION`, con actor/hora/aprobación/hash, `resolved:false`, `financialFinal:false`, `newCharge:0`, `inventoryMovement:0`, REQUESTS nuevo y journal administrativo vacío (`parts:0`). Originales intactos; TURNOS continúa OPEN. No se fabrica cierre, saldo inicial operativo, ingreso, confirmación bancaria o entrega.
- Se retienen nueve IDs y sus dos alias/turnos antes de ACK, nueva vinculación y replay; referencias con un ID nuevo también se rechazan. La exclusión operativa sólo elimina esas nueve solicitudes. Los otros registros y duplicados siguen visibles y conservan sus bloqueos.
- La propuesta, el registro y las mutaciones modernas usan el mismo ScriptLock. Preparación parcial bloquea otros flujos; sólo su mismo ID puede recuperar el registro vacío. No se promete atomicidad frente a editores manuales u otro proyecto Apps Script: deben estar detenidos.
- Cambiar el prefijo inventariado, el mapa o TURNOS/CORTES_Z, agregar duplicados/alias, descubrir vínculos o corromper REQUESTS/journal bloquea el uso posterior. No se recalcula el límite ni se acepta uno segundo.

## Qué deberá autorizar Steven

La instrucción de desarrollar esto **no autoriza su activación**. Antes debe existir un respaldo privado vigente, cotejo de instalación/proyecto/libros, escritores antiguos detenidos, perfil QA sin cola y propuesta de sólo lectura revisada. Esa propuesta aportará el hash real; no se inventó ni se obtuvo en este tramo.

Texto concreto para aprobar entonces, completando la referencia y la huella:

> Autorizo exclusivamente en staging registrar la custodia de las nueve solicitudes REQUESTS 131–139 y los dos turnos/alias identificados en la propuesta [referencia privada], SHA-256 [huella exacta]. Confirmo estaciones retenidas y escritor de pruebas antiguo desactivado. Entiendo que los originales seguirán intactos y OPEN, que no se acredita dinero ni ausencia de efectos no etiquetados y que los demás pendientes seguirán bloqueando. Autorizo únicamente el registro administrativo nuevo y su journal vacío; no ventas, cierres heredados, replay ni producción.

Después de esa aprobación específica, el operador autorizado puede configurar la propiedad (version 1, approved true, mode exacto, snapshotHash, approvalReference, confirmLegacyTestWriterDisabled true, acceptUnattributedEffectsUnresolved true). El cuerpo de `registrarLimiteHistorico` debe repetir la propuesta y huella, `acknowledgeUnresolvedHistory:true`, `confirmStationsHeld:true` y ambos flags específicos, usando una intención administrativa nueva. No se proporciona un comando listo para activar ni se escribió una propiedad real.

## Comprobación y límites

[Suite específica](../tests/staging_opening_isolation_regressions.js): **51 casos PASS**, módulos y ambos bundles reales sobre libros en memoria. Incluye autorización ausente/general/obsoleta, identidad de proyecto/libro, procedencia independiente, esquema y tipos, original intacto, bloqueo de 13 identidades/referencias, vínculos antes/después, otros FAILED/duplicados no excluidos, nuevo fallo al cortar, interrupción PREPARED/REQUESTS, recuperación con mismo ID, lock, orfandad/fragmentos y fila vacía legítima. Un nuevo corte vacío sólo se prueba en fixture sin otras intenciones inciertas; no acredita operación real.

Regresiones locales: límite histórico 27, activación legado 8, journal 45, identidad persistida 24, request ID 15, jornada 23, transporte de jornada 21, transporte maestro 13 y recuperación 27 PASS. Guardrails 4 y seguridad de harness 3 PASS. Los errores impresos por escenarios negativos de transporte son esperados; no hay fallos de suite. Build/manifiesto deterministas. CI del commit final debe cotejarse por SHA; no se hereda el resultado verde de la base.

**Esto puede retirar el bloqueo de lectura por las dos aperturas, pero no garantiza abrir caja.** Otros FAILED/duplicados de staging permanecen pendientes y pueden seguir impidiendo apertura/corte. Su resolución necesita evidencia y un cambio independiente revisable. El prefijo completo se conserva congelado: no permite editar esos históricos después ni encadenar otro límite para apartarlos. No activar sólo para forzar una prueba mientras ese bloqueo siga sin plan.

La interfaz actual muestra el aviso general y los conteos de histórico; el resultado administrativo/API conserva el modo y la advertencia específica de pruebas. No se cambiaron impresión, selección de evento/proyecto, autenticación, pagos, fórmulas SEMANA/LIQUIDAR ni reglas de entrega.

Siguiente comprobación indispensable: revisión de este delta, verificar que no haya escritor concurrente, y —sólo tras autorizar instalación en staging— generar la propuesta por lectura para cotejar tipos/encabezados/identidades y pendientes restantes. Ante una diferencia se detiene; no se adapta el libro ni el conjunto automáticamente. No iniciar apertura/venta como diagnóstico.

Reversión: antes de activación se puede retirar esta candidata sin modificar datos. Después de registrar custodia no basta borrar la propiedad ni volver a un runtime antiguo que ignore el registro. Detener clientes/escritores, conservar registro y copias, y revisar un plan de reversión compatible con las nuevas intenciones. No borrar REQUESTS/journal o TURNOS para deshacerla.
