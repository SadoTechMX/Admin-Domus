# Integración en la app maestra — 6 noviembre 2026

**IMPLEMENTED / LOCAL_TESTED · integración bloqueada.** Continuación de `28b2de4d6b6535dc4a62ffaca6202ed8bb7c22b9` en `repair/reconcile-pr18-main-20261105`. La candidata no está instalada. No hubo PR nuevo, merge, deployment, mutaciones Google ni otro motor de ensayo. IntegratedStore queda fuera de este trabajo.

## Identidad comprobada y límites

| Componente | Evidencia y límite |
| --- | --- |
| Git | `origin/main` permanece en `2b7ba1f4030b1013555b93cb96cfcb594141fdcb`; esta rama conserva selección de evento/proyecto, canal de taquilla, sesiones por rol y progresión de comandas de main. |
| Entrada de Caja | `https://sadotechmx.github.io/Admin-Domus/?vista=caja`. JS público UI `20261029-06`, endpoint oficial `AKfycbzy…I1WRGJGL`; coordinación cotejó activos con main. Esto no prueba equivalencia con el backend. |
| Deployment productivo | Coordinación/ARIADNA confirmó por panel de la sesión existente de Dirección: proyecto `1A45kAhlpaHC_9Rq5kT0rvkNjA_bCBhVRIIxpC20YUypWBAY9yH0PXjdj`, deployment oficial activo versión **16**, 29/oct 16:20, ejecutar como Dirección y acceso Cualquiera. Este hilo recibió la evidencia; no abrió otra sesión ni cambió permisos. |
| Código actual del editor | Coordinación confirmó coincidencia exacta de Código.gs, 97 782 bytes, con el bundle público de `acb47f6`, SHA-256 `0940cf651dbe4ac14e3c967b1063603ca76f4e10edfd89f9d99310981b32fcb2`. Aquí se verificó esa huella desde Git (blob `4ebf1ad2818aa4ed42c7063354a61dc4a0249b9b`). **Editor actual no equivale a exportación inmutable V16.** Index privado difiere de la candidata y no tiene vínculo inmutable V16 demostrado. |
| Destino declarado | El GET health público anterior confirmó PRODUCTION y ambos IDs canónicos de libros; no expone build ni versión. Evidencia en [master_public_identity_20261106.json](evidence/master_public_identity_20261106.json). No certifica saldos, fórmulas ni transacciones. |
| Staging existente | Proyecto canónico `1sh5fyAaa0onlNsNZ40EokGumubebYEMisTGZ8rNj75gBiOsYPkA-rV4O`, deployment `AKfycbyIHD…S7RVgZ`. Health declara STAGING, ambos libros aislados y fuente `c40b71de…` de PR #18, no esta candidata. Versión 6 es referencia aportada, no exportación verificada aquí. [Evidencia](evidence/canonical_staging_health_20261106.json). |

Root conserva los respaldos privados del editor, encabezados y paquete `maestra_28b2de4` en su propio entorno. No se copiaron ni publicaron aquí. Ese paquete necesita actualizar su candidata después de este commit. Se mantiene la reserva de `js/app.js`, Index generado, POS e Idempotency; no se editan las ramas de otros agentes. El endpoint productivo no cambió; el staging por defecto ya fue alineado en 28b2. Un override local todavía puede apuntar a otro destino y debe cotejarse antes de uso.

## Corrección posterior a 28b2

La revisión independiente encontró que `{ok:true,data:{}}` superaba la validación del sobre y liberaba una intención sin resultado de venta. Se reprodujo con fuente real y mocks, sin Google. `transport_` ahora valida el contrato específico de `cajaSimpleRegistrar`, tanto nativo como REST: objeto con resultado exitoso, ticket, total finito, `requestId` del sobre igual al enviado, cuenta existente igual a la solicitada, total esperado cuando se cobra y combinación coherente de recibo/método/estado/paid/verified. Objetos vacíos, booleanos, cadenas, arrays o confirmaciones de otra intención no liberan la cola.

Cuenta abierta y cortesía total autorizada permiten recibo vacío; transferencia conserva PENDIENTE_VERIFICACION y no se anuncia pagada. No se agregó una exigencia de recibo para resultados que legítimamente lo omiten. La correlación usa el ID del sobre autenticado y el contrato de la intención; no es una verificación bancaria independiente del folio.

Una respuesta incompleta produce `TRANSPORT_INVALID_RESPONSE`/502: quedan carrito, cliente/cuenta, ID/cuerpo y Outbox RETRY, sin confirmación persistida. La recarga reintenta el mismo ID y recupera el resultado del backend. No sustituye la intención ni convierte incertidumbre en rechazo sin efectos.

El cotejo del código público que coincide con el editor también mostró que el escritor legado `saveRequestRecord_` ignoraba fallos de persistencia en REQUESTS después de escribir cache/Properties. Se añadió `assertNoUnboundHistory_` bajo el mismo lock y antes de crear un nuevo vínculo: si falta REQUESTS pero existen evidencia en cache/Properties, journal huérfano, tag de COBROS o batch de COMANDAS, falla cerrado con `IDEMPOTENCY_REQUIRES_REVIEW`. Los IDs POS antiguos con timestamp sin vínculo durable también se retienen: una pestaña antigua nunca enviada y una venta parcial sin trazas no son distinguibles con seguridad. No se importa un recibo antiguo como ACK ni se reescribe historia. REQUESTS válido conserva payload/device binding y recuperación PREPARED.

**Límite:** esta guarda detecta las señales descritas, no demuestra ausencia universal de efectos en operaciones históricas sin trazas o de otras acciones. Requiere conciliar pendientes antes del cambio. Lee columnas completas de histórico para IDs nuevos; latencia/cuotas reales no medidas. Un resultado COMPLETED legado con contrato insuficiente queda sin confirmación automática en el cliente, aunque se devuelva desde REQUESTS; necesita revisión, nunca inventar sus campos.

UI `20261106-master-05`; backend fuente SHA-256 `19639ee1f15ef0c76d259a99e5d1747a2698c29ec2e1ccec38dc68b4ffec89ee`. `release-manifest.json` contiene huellas de módulos y archivos generados. POS/Access/Events no se modificaron en este seguimiento.

## Compatibilidad de hojas: bloqueo concreto

Cotejo de ARIADNA comunicado a este hilo, sólo metadata/encabezados, sin registros operativos:

- CAJA 2, COBROS, COMANDAS, ACCESO y CATALOGO fila 6 coinciden con fixture 28b2; REQUESTS fila 1 coincide en sus 8 campos.
- MAIN INVENTARIO A6:P6 y RECETAS CARTA A1:J1 coinciden. INSUMOS fila 6 y OPS RESURTIDO fila 6 corresponden a nombres/índices de KDS, sin duplicados. INVENTARIO/RECETAS en MAIN es correcto para Inventory/KDS; su ausencia en Ops **no es bloqueo**. No se comprobaron fórmulas, existencias o movimientos.
- DOMUS_JOURNAL y TRANSACCIONES_API ausentes en Main. REQUESTS existente es suficiente para el ledger; la candidata crearía DOMUS_JOURNAL al preparar la primera operación. Es un cambio aditivo de esquema pendiente de integración deliberada, no una migración ejecutada aquí.
- **ACTIVIDADES real tiene 35 columnas y el fixture 13.** I es `% DOMUS entradas`; L es `Acuerdo validado`; `ESTADO DEL EVENTO` está en U (21). Access lee capacidad de I y estado de L, y exige `event[11] == confirmado` al cambiar/registrar accesos. Events construye 13 valores y los escribe en A:M: colocaría capacidad, beneficiario/estado y otros valores en campos de significado distinto. El riesgo posicional preexiste en el código legado; la candidata añade validaciones/recuperación sobre esa suposición y no lo resuelve.

**Adaptación requerida, todavía no implementada:** definir un mapa semántico explícito y aprobado para los 35 encabezados, en Access y Events, que distinga acuerdo validado de estado del evento y preserve porcentajes/beneficiarios. Usar columnas por nombre para lecturas y escrituras estrechas, sin deducir capacidad u otros campos por posición ni por una etiqueta parecida. Si falta un campo requerido, hay duplicados o no existe mapeo aprobado, rechazar antes de preparar el journal o escribir datos de negocio. Probar el fixture de 35 columnas, rechazo de schema ambiguo y preservación de campos ajenos. No renombrar/mover hojas, inferir estados/precios ni migrar filas reales. Un fixture de 13 columnas verde no acredita compatibilidad productiva.

## Pruebas acotadas

| Suite local, fuente real y servicios simulados | Resultado |
| --- | --- |
| master_transport_regressions.js | **13 PASS**: 15 variantes inválidas en cada transporte conservan ID/borrador/Outbox y ninguna confirmación, COBROS queda sólo con encabezados; tras recarga, el mismo ID/cuerpo crea un solo cobro. También respuesta perdida después de escritura y resultados legítimos de efectivo/terminales/transferencia/crédito/cortesía/cuenta existente. Las nuevas pruebas de ACK fallaban en ambos transportes antes de corregir. |
| legacy_cutover_regressions.js | **9 PASS**: evidencia histórica sin ledger, cache/Properties malformados, pago fuera de fila 500, comanda sin cobro, ID antiguo, journal huérfano, binding durable y recuperación de venta nueva. Antes de la guarda: 7 FAIL / 2 PASS. Bloqueos no cambian hojas simuladas ni Properties; la suite prepara previamente el encabezado REQUESTS. |
| recovery / client / reconciliation / review / reload-rejection | **27 / 12 / 17 / 16 / 8 PASS**. |
| Chromium UI / dos pestañas con Web Locks reales | **18 / 1 PASS**; transporte interceptado, recarga y recuperación mismo ID. |
| Evento/canal, v13, KDS, write guardrails, harness safety | PASS; **12 / 11 / 4 / 3** en las cuatro últimas suites. |
| Build / sintaxis / diff | Generación determinista, fuentes JS y scripts de HTML nativo verificadas; sin whitespace inválido. |

Las suites se solapan; no son certificación operativa, prueba de Google ni de hardware. No se ejecuta descubrimiento global de tests que pueda alcanzar producción. CI de **28b2** fue verificada por coordinación como `completed/success`, run [42155303813](https://github.com/SadoTechMX/Admin-Domus/actions/runs/42155303813), pero omitía el P1. Ese resultado no acredita este nuevo commit. CI exacta del nuevo SHA se informa aparte al entregar; la nueva suite de cutover está incluida en el workflow.

## Delta mínimo e integración pendiente

1. Root conserva la referencia del deployment V16 y el respaldo del editor actual; **no dispone de una exportación inmutable V16 recién obtenida**. Obtener y cotejar esa exportación sigue pendiente. El match de Código.gs actual con acb47f6 permite comparar, pero no reemplaza el vínculo pendiente de HTML/V16. No compartir secretos ni hacer otra exportación privada a un tercero.
2. Resolver el mapa/guardas de ACTIVIDADES en los mismos módulos antes de habilitar sus escrituras. Cotejar fórmulas y estado operativo sólo en un tramo autorizado; los encabezados no los acreditan. Mantener inventario al entregar y los contratos de fase/evento/canal/sesión/KDS.
3. Integrar como pareja frontend y backend legado revisado. **No instalar sólo este frontend sobre V16:** los ACK viejos omiten campos y se conservarían como inciertos. Tampoco copiar sólo POS/Idempotency: dependen de Data/Schema, Auth/Api, Payments/Accounts y rutas KDS/Access/Events. El bundle generado agrupa ese conjunto; no se debe reemplazar ciegamente por ser un único archivo. Conservar sólo los cambios compatibles tras cerrar schema/cutover; nunca introducir IntegratedStore.
4. Antes de instalar, inventariar y conciliar intenciones/recibos pendientes, conservar IDs/cuerpos y cerrar clientes antiguos. Validar el conjunto en el staging canónico existente, mismo código y esquema representativo, con autorización y sin ventas ficticias productivas. Evidencia de Google, rendimiento y hardware sigue pendiente. Este tramo no autoriza nuevas pruebas Google.
5. PR, merge y deployment requieren autorización específica y los gates de compatibilidad; este trabajo no los ejecuta. Push de la rama o copia al editor no equivale a instalación.

## Reversión propuesta, no ejecutada

- Conservar referencia inmutable V16 y pareja frontend/backend anterior, aparte del editor actual. Root ya prepara el paquete privado; debe actualizar candidata/manifest al SHA entregado, sin sustituir respaldos.
- Si la candidata aún no efectuó ninguna mutación, detener nuevas peticiones y restaurar la pareja anterior revisada mediante el procedimiento autorizado; verificar destino y versión. Conservar Outbox y evidencia aun en ese caso.
- Si ya existen nuevas operaciones/REQUESTS/journals, **no reactivar V16 a ciegas**: el legado no interpreta PREPARED y puede repetir efectos. Pausar nuevas mutaciones, conservar el camino de recuperación de la candidata y conciliar cada intención antes de volver al código anterior. No borrar journals, reetiquetar IDs, restaurar hojas sobre ventas ni ejecutar ventas inversas como rollback.

## Acciones detenidas

La revisión automática denegó previamente abrir PR por falta de autorización humana específica y denegó inspeccionar el editor privado mediante TinyFish por transmitir código a un tercero no autorizado. Ambas acciones quedaron sin ejecutar y no se reintentaron. El cotejo autorizado de ARIADNA aporta evidencia sin eludir esos bloqueos. No se solicita más acceso ni otra lectura Google en este tramo.
