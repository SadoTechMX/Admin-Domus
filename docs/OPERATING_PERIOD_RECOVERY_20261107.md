# Periodo operativo y salida de revisión — 7 noviembre 2026 UTC

**IMPLEMENTED / LOCAL_TESTED; esta corrección no está instalada.** Base `8b3439dd0893aec9a7c07622981e76263d4655a3`, misma rama de reparación. UI `20261107-recovery-11`; fuente backend `51ca9a69f6823a547a3968b29fa099defa594471752f01517064d6f6eca4ac46`. Artefactos y huellas en `release-manifest.json`. Sin PR, merge, deployment ni modificación de libros/perfiles reales por este tramo.

## Causa y evidencia recibida

Coordinación reportó una venta ficticia única de $200 en staging 8b: cobro confirmado y comanda vinculada. `SEMANA!B7:B8` era 19–25 octubre; la venta era del 6 noviembre. Al ajustar temporalmente a 2–8 noviembre, la hoja pasó a PAGADO/LISTO; después se restauró el periodo. No se entregó la comanda. Se reutiliza ese resultado: no se repitió la venta, no se consultó Google ni se copiaron IDs/cuerpos reales aquí.

La fórmula de `CAJA 2!W` rechaza la fecha fuera de SEMANA. POS no comprobaba ese calendario antes de registrar el cobro. El simulador anterior tampoco modelaba SEMANA ni calculaba W: su CI verde no demostraba esa compatibilidad.

La pantalla «Cola en revisión» tiene otra causa: 8b conserva una marca local y deliberadamente carecía de salida. Cambiar fechas en Sheets no borra ni resuelve una retención del navegador. No se recibió el contenido/contador de la retención concreta de staging; no se afirma que esté vacía, resuelta o liberada.

## Validación antes de una operación nueva

- `Schema.gs` lee SEMANA y la zona horaria del libro. Exige fechas válidas y ordenadas, y compara días calendario, incluyendo ambos extremos. No depende de la fecha, zona o banderas que envíe el cliente.
- `POS.gs` consulta esa condición bajo el lock, antes del journal comercial y de escrituras de una operación nueva. Rechaza con `SALE_VALIDATION_REJECTED_NO_EFFECTS` / 422 y explica fecha actual, periodo configurado y qué revisar. REQUESTS conserva el rechazo; el cliente lo clasifica REJECTED y puede crear otro ID sólo tras corregir/refrescar y confirmar de nuevo.
- Caja muestra el estado al consultar datos; no abre ni envía el pago si el periodo está inválido o no fue acreditado. El servidor vuelve a comprobarlo aunque la UI tenga un estado anterior. Se conservan carrito e intención rechazada.
- Una intención ya COMPLETED devuelve el mismo recibo. Un journal PREPARED se recupera con su plan y fecha originales, incluso después de cambiar SEMANA; no se transforma una escritura parcial en un rechazo «sin efectos» ni en otra venta.

**Continuidad diaria:** no hay fecha fija de caducidad de esta versión ni retrofechado automático. Se evalúa el periodo que Dirección haya configurado, también para fechas futuras. Si SEMANA queda fuera de fecha, se bloquean nuevas operaciones y se muestra la causa; el código no mueve B7:B8 ni recalcula deliberadamente otros periodos. Separar completamente la ventana de reportes de la operación diaria requeriría otro contrato/migración de fórmulas; no se implementó por inferencia. La semana restaurada de octubre sigue siendo inválida para nuevas ventas de noviembre.

## Cerrar una revisión resuelta sin reenviar

La pantalla presenta la condición de salida y **Cerrar revisión sin pendientes**. Se habilita sólo si la preservación terminó, las copias son legibles, cola y pendiente actuales/finales están vacíos y la evidencia observada coincide con la capturada al terminar la pausa.

Puede cerrar una revisión originalmente vacía. También admite una intención de Caja/confirmación de transferencia creada por este cliente que terminó durante la pausa: exige IDs únicos, cuerpo/acción idénticos y comprobante completo según el contrato existente. Una intención inicial huérfana, registro antiguo, duplicado, ACK incompleto/de otra intención, operación sin contrato de cierre, evidencia cambiada o cola aún poblada **permanece bloqueada**. No se importan ACK del legado, se consulta banco ni se declara conciliada la historia por un recibo local.

El cierre adquiere lock exclusivo de tráfico y lock de almacenamiento; guarda un archivo local completo antes de retirar sólo las claves activas de revisión. No borra Outbox, intención o recibos. Si falla cuota/archivo, conserva la retención. Si falla a mitad de la limpieza, `RELEASE_READY` mantiene el bloqueo y permite terminar explícitamente desde el mismo archivo tras recarga, sin fabricar otra copia inicial.

No se inicia tráfico al cerrar: la pantalla sigue detenida hasta **Abrir la app**. El enlace conserva el origen estático o el endpoint nativo del entorno acreditado y elimina `revision=cola`; entorno nativo desconocido no redirige a producción. Otras pestañas retenidas siguen paradas hasta navegación explícita. La exportación privada incluye archivos cerrados y conserva incluso marcas ilegibles. Clientes antiguos, otras estaciones y peticiones ya enviadas siguen siendo límites de la pausa local.

## Pruebas específicas y regresiones

| Suite | Resultado local |
| --- | --- |
| `operating_period_regressions.js` | **11 PASS**: caso octubre/noviembre, límites de medianoche y zona del libro, configuración inválida, métodos/crédito/cortesía, fechas futuras, replay completo/parcial, cliente adulterado, fecha real, bloqueo antes de intención y corrección tras rechazo sin efectos. |
| `outbox_release_regressions.js` | **8 PASS**: cierre vacío, 15 registros desconocidos/huérfano bloqueados, ACK durante pausa, recibo inválido, cambios/duplicados/corrupción, cuota, limpieza interrumpida y dos cierres concurrentes. |
| `browser_operating_recovery.js` | **4 PASS**: UI con periodo inválido; una venta de fixture tras corregir su configuración; cierre/exportación; regreso explícito a la comanda existente sin otra venta, manteniendo nuevos cobros bloqueados al restaurar el periodo inválido. |
| `browser_outbox_review.js` | **8 PASS**: regresiones de preservación ampliadas con cierre estático/nativo, entorno desconocido, exportación de marca corrupta y cierre después de ACK entre dos pestañas. |
| Regresiones existentes | Backend 27; cliente 12; reconciliación 17; revisión 16; recarga 8; transporte 13; cutover 9; ACTIVIDADES 20; registro externo 9; recibo 4; transferencias 20; preservación 8; navegador 21 / concurrencia 1 / transferencias 5; evento/canal, v13 12, KDS 11, guardrails 4 y harness 3. |

Código real con servicios en memoria y tráfico de navegador interceptado. El fixture ahora tiene SEMANA y formatea fechas por zona; **no es un motor de fórmulas de Sheets**. Los primeros intentos detectaron dos errores del arnés: expectativa de estado REJECTED en REQUESTS (el ledger conserva REQUIRES_REVIEW + código 422) y sesión de estación ausente en el navegador. Se corrigieron las expectativas/credenciales ficticias del arnés, sin relajar el código. Hay solapamiento entre suites; ninguna acredita producción, banco, impresora o entrega física. La CI del nuevo SHA se verifica por separado; no reutilizar la de 8b como aprobación de esta modificación.

## Paso mínimo y límites pendientes

1. Coordinar revisión complementaria del delta: Gemini puede revisar POS/Schema y el rechazo previo a efectos; IDE puede revisar archivo/cierre/navegación de Outbox. No atribuirles revisión de este SHA antes de recibirla. Data, Events, Payments, Auth, Idempotency y KDS no se editaron en este tramo.
2. En un tramo autorizado, instalar la pareja nueva sólo en el staging existente y acreditar sus huellas. Preservar primero la evidencia local de la retención; el mensaje de la pantalla determina si cumple condiciones de cierre. No editar localStorage ni agregar marcas de contrato para forzar salida.
3. Si la revisión está resuelta, cerrar y abrir explícitamente; comprobar la misma comanda/recibo, sin otra venta. Si no cumple, conservar el bloqueo y conciliar la intención concreta antes de diseñar otra salida.
4. La brecha general entre revisión W y autorización KDS de órdenes históricas no queda cerrada por este parche: no se añadió una migración ni se liberó la comanda existente. Mantener el control operativo de no preparar/entregar ante revisión pendiente. Entrega, inventario, ticket físico, pago mixto, política bancaria y compatibilidad productiva siguen pendientes de sus tramos.

Reversión no equivale a deshacer operaciones. Los archivos de revisión cerrada permanecen locales; volver a 8b elimina la nueva guarda de periodo. No restaurar código antiguo como forma de permitir un cobro bloqueado. No se declara la caja lista para operar.
