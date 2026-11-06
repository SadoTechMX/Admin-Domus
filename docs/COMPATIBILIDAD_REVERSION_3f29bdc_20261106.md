# Compatibilidad y reversión — 6 noviembre 2026, Ciudad de México

**PREPARADO; no instalado ni probado en Google.** Candidata funcional `3f29bdc6b39e364c579c2eb6e2cfd925659537a8`, UI `20261106-transfers-09`, backend fuente `98ac440efbc293649ada90054fb9f092c614c099ceb458eb0be4434dc543008c`. Este documento corrige la coordinación y prepara el cambio controlado; no añade código ni autoriza instalación. Se reutilizan las pruebas y la CI ya registradas, sin otra suite ni consulta remota.

## Bloqueo retirado y fuentes exactas

Root confirmó que **no existe un delta privado Data/Events**: hizo revisión estática y conservó evidencia. Las huellas de ambos módulos coinciden con el manifiesto de 3f29bdc. La implementación permanece exclusivamente con el integrador. No se espera otro patch, no se reconstruye trabajo y no se repiten las revisiones desktop aún pendientes de entrega.

Se cotejaron por lectura de objetos Git inmutables los **20 archivos del manifiesto**, sin ejecutar la aplicación. El [inventario de integración](evidence/integration_inventory_3f29bdc_20261106.json) añade las huellas del CSS de Pages y de las referencias anteriores conocidas. Sirve para actualizar el paquete privado existente de root; no crea un segundo paquete ni copia respaldos privados.

| Pieza | Referencia y alcance |
| --- | --- |
| Backend de producción candidato | `google-apps-script/DOMUS_PRODUCTION_BUNDLE.gs`, SHA-256 `d15aa2c7d2ceda303682a5963723ce21ce437eca7fedee525ac0bee5ce0df34d`. Es artefacto preparado, no backend instalado. |
| Backend de staging candidato | `google-apps-script/DOMUS_STAGING_BUNDLE.gs`, SHA-256 `0f6d20b481e85e558f185d9fc30830843cb7e7c75aa34bd3398c97f76e22106e`. Comparte fuente, tiene guarda de entorno STAGING. |
| HTML nativo candidato | `google-apps-script/Index.html`, SHA-256 `abd8986fa1011854e3ed25a26e60dc20546aacc3cb908c2b49a467b7ea31985c`. Debe acompañar al backend compatible. |
| Pages candidato | `index.html`, `js/app.js`, `css/app.css` de 3f29bdc, huellas completas en el inventario. El CSS coincide con la referencia anterior; HTML y JS difieren. Conservar también sus recursos referenciados al preparar el paquete. |
| Referencia del editor anterior | Bundle de `acb47f6`, 97 782 bytes, SHA-256 `0940cf651dbe4ac14e3c967b1063603ca76f4e10edfd89f9d99310981b32fcb2`, coincidente con el respaldo previamente cotejado por root. **No equivale a una exportación inmutable V16.** |
| Frontend anterior publicado | Referencia histórica `2b7ba1f`; no se volvió a consultar la web. El HTML nativo inmutable asociado a V16 sigue sin acreditar. No completar esa pareja con un archivo de Git por inferencia. |

## Compatibilidad: qué está cerrado y qué falta

| Contrato | Estado de evidencia | Condición concreta antes de instalar/operar |
| --- | --- | --- |
| Fuente Data/Events y artefactos | Huellas cotejadas; supuesto delta privado retirado. CI exacta exitosa ya registrada en [transferencias](TRANSFER_CONFIRMATION_20261105.md). | Mantener esta pareja exacta. Cualquier modificación real requiere artefactos y validación del nuevo SHA. |
| Frontend/backend | El cliente exige ACK completos de venta y confirmación de transferencia; ambos pertenecen a la candidata. | No instalar sólo frontend sobre V16 ni copiar módulos sueltos. El `health` candidato debe acreditar entorno, libros y fuente esperados en el tramo autorizado; hoy no se ha instalado ni verificado eso en Google. |
| Sesiones y estación | Confirmación/consulta bancaria requieren GERENCIA/ADMIN con principal autorizado; sesiones anteriores sin principal se renuevan. Outbox exige Web Locks y almacenamiento utilizable. | Verificar sesión real por rol y estación, cierre de clientes antiguos y conservación de intenciones. No exponer credenciales, forzar banderas de verificación o migrar colas por inferencia. |
| Hojas y journal | Encabezados recibidos coinciden para Caja, cobros, comandas y dependencias de inventario. REQUESTS existe según cotejo; DOMUS_JOURNAL no existía en aquel cotejo y la candidata lo crea al preparar una operación. | Cerrar impacto aditivo y comportamiento real de fórmulas/journal en staging autorizado. Encabezados no prueban valores, stock, saldos o ausencia de pendientes. |
| Historia anterior al cambio | Nuevas comandas llevan vínculo financiero `fulfillment`; las antiguas pueden carecer de él. Transferencias aplicadas sin confirmación durable compatible requieren revisión. | Identificar y resolver las operaciones abiertas antes del cambio; no cambiar flags ni importar ACK para liberar entrega. Un journal pendiente puede bloquear otras mutaciones. |
| Transferencias y reportes | El original Borrador permanece con aplicado cero; se agrega un Confirmado vinculado. Saldos candidatos usan aplicado. | Verificar reportes/fórmulas reales por `Cobrado aplicado`/estado. Sumar F sin discriminar Borrador + Confirmado duplicaría el importe. Receptor y movimiento bancario único siguen pendientes de definición privada; no configurar por inferencia. |
| Accesos/Eventos | Mapa de 35 columnas y guardas implementados; contrato operativo literal aún pendiente. Confirmación de Caja no autoriza un cobro/admisión de Accesos. | Mantener estas rutas cerradas hasta definir su contrato y flujo compatible. No es motivo para esperar un delta de root. Tampoco demuestra por sí solo que Caja puede operar: los otros contratos siguen aplicando. |
| Entrega/ticket | Código y fixtures conservan autorización financiera, inventario al entregar y recuperación de recibo. | Probar recorrido real de estación y entrega de ticket en el alcance autorizado. Un archivo descargado o un ACK de impresión no demuestra recepción por el cliente. |

## Reversión preparada por estado, no ejecutada

La reversión de código no revierte dinero, inventario ni efectos ya escritos. Conservar siempre Outbox, REQUESTS, journal, recibos, cuentas y comandas con sus IDs/cuerpos. No borrar hojas, editar cobros, cambiar IDs ni emitir ventas inversas para simular rollback.

| Situación al detener el cambio | Acción preparada | Requisito/límite |
| --- | --- | --- |
| Candidata sólo en Git, como ahora | No hay instalación candidata que revertir. Mantener evidencias y referencias del paquete existente. | Producción continúa sin cambios por este trabajo. |
| Pareja instalada, ausencia de nuevas intenciones y efectos **demostrada** | Detener nuevos envíos y reintentos mediante el procedimiento operativo autorizado; conservar colas. Restaurar únicamente la pareja anterior exacta y verificada, y cotejar sus destinos/versiones. | No basta mirar un contador vacío ni el editor. La referencia inmutable HTML/V16 aún falta; sin ella no se declara esta opción lista. |
| Aparece una intención REQUESTS, journal PREPARED, resultado incierto o fila parcialmente escrita | Detener nuevas operaciones; preservar el camino de recuperación de la candidata y recuperar/revisar la intención original. Preferir corrección compatible hacia delante antes de considerar volver al legado. | V16 no queda acreditada como lectora/recuperadora de ese journal. Restaurar código mientras queda pendiente puede repetir efectos o perder la autorización de entrega. |
| Operaciones candidatas COMPLETED, incluidas transferencias confirmadas | Conservar Borrador + Confirmado, evidencia bancaria vinculada y unidades autorizadas; conciliar saldos/reportes/entregas. Evaluar explícitamente compatibilidad con el código al que se pretenda volver. | COMPLETED no prueba compatibilidad hacia atrás. V16 no queda autorizada para operar sobre el nuevo historial ni para sustituir los controles de entrega. No hay una migración inversa automática acreditada. |
| Fallo sólo de ticket o estación después del cobro | Recuperar el mismo recibo y entregar/reenviar el comprobante por el canal autorizado; resolver la estación. | No repetir venta ni confirmación bancaria. El fallo del periférico no deshace el cobro. |

Antes del ensayo de reversión debe fijarse quién detiene estaciones, clientes abiertos y reintentos, cómo preserva su evidencia y cómo acredita que cesaron los envíos. **No se ha acreditado un modo de mantenimiento o interruptor global** que permita reemplazar ese procedimiento. Este documento no cambia permisos ni configuración para improvisarlo.

## Trabajo preparado y bloqueos reales

Quedaron preparados el inventario de la pareja, la matriz de contratos, las ramas de reversión y la secuencia de aceptación de [Caja/transferencias](TRANSFER_CONFIRMATION_20261105.md). Se actualiza el paquete existente, no otro ensayo. No hace falta volver a preguntar las cuatro reglas provisionales aprobadas.

Faltan evidencia de la pareja anterior inmutable, revisiones desktop ya asignadas, configuración bancaria aprobada, comprobación de fórmulas/historia/stock y validación de staging/estación en un tramo autorizado. El trabajo documental/offline no depende de la iMac; esos resultados no pueden sustituirse con más documentos o fixtures. PR/merge/deployment siguen fuera de este tramo y sujetos a sus bloqueos previos.
