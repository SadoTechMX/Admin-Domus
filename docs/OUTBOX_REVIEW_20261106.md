> **Continuación del 7 de noviembre:** [Salida de revisión y periodo](OPERATING_PERIOD_RECOVERY_20261107.md) añade cierre explícito condicionado y archivo durable. Este documento conserva el contrato original de 8b, que no tenía salida. La cola real no se modificó.

# Preservación de Outbox para revisión — 6 noviembre 2026

**IMPLEMENTED / LOCAL_TESTED; no instalado ni aplicado a colas reales.** Misma rama `repair/reconcile-pr18-main-20261105`, sobre `57fb2e5` / funcional `3f29bdc`. UI `20261106-review-10`, fuente backend `f9c2cfa84348fa6c380454549909b9984143c5e10c914699e764936e1eb2ccd9`. Huellas de la pareja generada en `release-manifest.json`. El SHA de entrega y su CI se verifican después del commit; la CI de 3f no acredita este cambio.

## Evidencia recibida y brecha anterior

Coordinación informó de 15 IDs de la estación: tres con cobros/comandas vinculadas, doce indeterminados y cuatro coincidentes con FAILED históricos. No se consultaron ni copiaron aquí esos IDs o cuerpos. Los fixtures son ficticios. FAILED no prueba ausencia de efectos; un vínculo tampoco prueba efectos completos ni autoriza fabricar un ACK.

3f conserva `REQUIRES_REVIEW`, pero arranca migración y reintento automático de `RETRY` / `LOCAL_PENDING`. No ofrecía una pausa general anterior a sesiones, migración y transporte. Su apertura normal no era inspección pasiva.

## Contrato nuevo

| Condición | Comportamiento |
| --- | --- |
| Cola anterior, formato ilegible o intención pendiente huérfana | Arranca sólo revisión, antes de sesiones, consultas, migración, reintentos y monitor de impresión. |
| Entrada creada por este cliente | Metadato local `clientContract: domus-outbox-v2`. Conserva recuperación con el mismo ID/cuerpo y validación de ACK. Identifica compatibilidad del escritor; **no demuestra pago**. No añadirlo manualmente a una cola antigua para liberarla. |
| Revisión solicitada en cliente nuevo | `revision=cola`, bandera nativa `DOMUS_NATIVE_BOOT.queueReview`, o botón **Revisar sin reenviar**. La marca persistente prevalece después de recargar y en otras pestañas de esta versión. |
| Preservación | Bajo Web Lock de almacenamiento, guarda marca pequeña `DRAINING` y copia inicial de las cadenas originales: cola, pendiente, deviceId, puntero de recibo y confirmaciones. No normaliza ni deduplica. |
| Solicitud ya iniciada | Transporte compartido y barrera exclusiva permiten terminar su manejo local antes de otra copia y estado `REQUIRES_REVIEW`. Conserva evidencia inicial y posterior, incluido el ACK válido que llegue. No inicia otra solicitud. |
| Revisión completada | Bloquea transporte y escrituras normales de Outbox. Pantalla sin cobro, reintento, borrado ni liberación. Exporta JSON local con marca, copias y estado observado, sin enviar el archivo a un servidor. |
| Fallo de almacenamiento | Si cupo la marca pero no la copia, mantiene pausa y bloquea escritores; conserva originales y muestra preservación incompleta. Si ni la marca pudo escribirse, sólo esta página se detiene en memoria: **no promete bloqueo durable en otras pestañas/recargas**. Una copia final dañada/ausente se denuncia, sin reconstruirla silenciosamente. |

Copias: `domus_outbox_review_initial_v1` y `domus_outbox_review_settled_v1`; marca: `domus_outbox_review_hold_v1`. `settled` significa barrera local terminada, **no conciliación financiera**. La descarga puede incluir datos personales de cuerpos/recibos: conservarla privada. Omite claves independientes de sesión y Print Bridge; no altera los cuerpos originales para simular un respaldo completo.

Requiere Web Locks y almacenamiento utilizable. Clientes antiguos no conocen la pausa. No cancela peticiones enviadas ni detiene otras estaciones; tampoco prueba que terminó una operación en servidor tras desconexión/cierre. Cerrar clientes antiguos sigue siendo necesario. No es un interruptor global ni resuelve las 15 intenciones.

**No abrir producción antigua con `?revision=cola`: ignora el parámetro y podría reenviar.** Debe cargarse esta fuente de forma controlada en el mismo origen/perfil del almacenamiento. Localhost, otro perfil o UI nativa de otro origen no leen la cola de Pages. Instalar sólo frontend sobre V16 tampoco acredita compatibilidad para operar. Este tramo no instala nada ni modifica el perfil real.

## Delta y coordinación

- `js/app.js` / `index.html`: puerta de arranque, preservación/exportación, bloqueo de transporte/periféricos y coordinación entre pestañas. Las entradas nuevas tienen marca de contrato local.
- `Api.gs`: sólo pasa `queueReview` al HTML nativo; se regeneran Build, bundles, Index y manifiesto. Auth, Payments, POS, Idempotency, KDS, Access, Data y Events no cambian respecto de 3f.
- El mock de Web Locks ahora admite modos compartido/exclusivo; se comprueba también con dos pestañas Chromium reales.
- No existe patch privado Data/Events de root. Coordinación entregó revisión estática Gemini de Auth/Payments y Antigravity IDE de KDS/lectores Payments de **3f**, sin defecto concreto nuevo. No revisaron este modo de Outbox, journal, atomicidad, banco o instalación. No se repitieron sus encargos.

## Validación aislada ejecutada

| Prueba | Resultado |
| --- | --- |
| `node tests/outbox_quarantine_regressions.js` | **8 PASS**: 15 registros ficticios, duplicados/campos opacos/recibos, recarga, bloqueo de envío/escritura, cuota, marca imposible, formato/copia dañados, pendiente huérfano, recuperación nueva con mismo ID y petición en curso. Funciones reales con servicios simulados. |
| `node tests/browser_outbox_review.js` | **7 PASS**: app Chromium, arranque legado sin API/sesión/health/impresora, descarga exacta, recarga/segunda pestaña/online, parámetro y bandera nativa, cuota y dos pestañas activas con ACK retenido. Red externa interceptada. |
| Cliente / reconciliación / revisión / recarga / transporte | **12 / 17 / 16 / 8 / 13 PASS**. Pendiente huérfano se conserva para revisión; entradas nuevas mantienen recuperación. |
| Backend / transferencias | **27 / 20 PASS**, servicios simulados. |
| Navegador existente / carrera de pestañas / transferencias | **21 / 1 / 5 PASS**, transporte interceptado. |
| v13 / KDS / guardrails / seguridad de harness | **12 / 11 / 4 / 3 PASS**. Build, sintaxis y diff verificados. |

Hay solapamiento entre suites; no certifican operación. Ambas suites nuevas se agregaron al workflow existente. Sin nuevas pruebas/lecturas Google, auditorías desktop repetidas, banco/hardware, ventas reales, cambios de hojas, PR, merge o deployment.

## Camino mínimo de staging, preparado y no ejecutado

1. Con autorización específica, usar **el staging canónico existente**, pareja exacta y libros aislados identificados. No otro motor/ensayo ni IntegratedStore. Conservar referencias anteriores; la pareja HTML/V16 productiva inmutable sigue sin acreditar.
2. En perfil aislado, sembrar sólo las 15 entradas ficticias de esta suite antes de cargar candidata. Verificar revisión, cero llamadas operativas, copia exacta, recarga, segunda pestaña y descarga privada. **No importar cola real.** Este perfil permanece retenido sin botón de liberación.
3. En otro perfil de prueba limpio, verificar identidad staging, sesiones reales por rol y recorrido de efectivo/terminal: una intención, cobro, comanda, ticket recibido y recuperación del mismo ID tras respuesta perdida. Entrega/inventario sólo en staging, sin dinero real. Terminal es registro manual del medio; no integración bancaria acreditada.
4. Accesos/ACTIVIDADES continúan cerrados por sus guardas. Confirmación de transferencias cerrada sin configuración bancaria aprobada; **captura de pendiente sigue posible**, sin autorizar entrega. No afirmar que existe un modo general «sólo efectivo/terminal» ya activado.
5. Antes del cambio productivo, conciliar cada ID real y cerrar compatibilidad/reversión/estación. La pausa no resuelve historial, reportes, stock ni banco. No hay estimación sustentada de GO en una hora con estos resultados pendientes.

La [matriz de reversión](COMPATIBILIDAD_REVERSION_3f29bdc_20261106.md) mantiene sus límites: restaurar código no deshace dinero; V16 no está acreditada para recuperar journals candidatos. Con efectos previos, conservar evidencia y recuperación compatible, sin borrar cola ni restaurar legado a ciegas.
