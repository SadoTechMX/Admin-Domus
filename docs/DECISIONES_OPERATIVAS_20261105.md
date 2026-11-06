# Decisiones mínimas para Steven — 5 noviembre 2026, Ciudad de México

**Propuesta para responder, no reglas aprobadas.** Base de código local `739a40a97abb1ef77195bfb74ef8c12b167608d8`, CI `42164620785` ya verificada success. Esta preparación sólo usa documentación/código local y evidencia recibida; sin nuevas suites, Google, datos reales, instalación o despliegue. El delta preventivo Data/Events comunicado por root no se considera política operativa aprobada ni se vuelve a editar aquí.

Steven puede responder **«1A, 2A, 3A, 4A, 5A»** o cambiar una opción. Las A son recomendaciones; no se aplican por silencio.

| Decisión | A — recomendada para empezar | B — alternativa y consecuencia | Qué bloquea |
| --- | --- | --- | --- |
| **1. Habilitación de eventos** | Usar inicialmente **eventos existentes**. Sólo admitir con U = `Confirmado`, L = `Sí` y acuerdo de reparto completo, validado por Dirección/Gerencia. Cualquier otro valor queda sin habilitar; no convertir filas existentes automáticamente. | Necesitar altas nuevas o admisiones con acuerdos todavía pendientes: definir primero sus estados, facultades y tratamiento de liquidación. No abrirlos con valores inventados. | Accesos/taquilla/Boletera sobre ACTIVIDADES35. **No bloquea por sí solo Caja de consumos.** Las altas nuevas pueden esperar. |
| **2. Aforo** | Control manual por un responsable de puerta, usando un límite definido para cada evento fuera de la app. La app informa asistencia acumulada, sin afirmar que conoce ocupación o disponibilidad. | Aforo automático indispensable: definir almacenamiento, entradas/salidas, reingreso y paquetes antes de habilitarlo. | Operación de puerta. El contador automático puede posponerse; el límite y responsable reales no se inventan ni desaparecen por usar control manual. |
| **3. Boletos de cada proyecto** | Accesos coteja lista/comprobante proporcionado por el proyecto; discrepancias a Gerencia. Una referencia se registra una sola vez, con todos sus integrantes juntos y cantidad acreditada. | Permitir llegadas separadas con una orden grupal: hace falta saldo de lugares y reserva/consumo idempotente por orden. La guarda actual no soporta ese caso. | Admisión externa, no consumos en Caja. Las referencias iguales entre proveedores se remiten a revisión mientras no exista una clave/migración inequívoca; no se cambia el folio para evitar la guarda. |
| **4. Dinero de proyectos** | Dirección/Gerencia concilia manualmente según el acuerdo: si recibió un tercero, se registra lo reportado y se liquida aparte; si recibió DOMUS, se vincula el cobro original verificado, sin sumarlo otra vez. | Liquidación automática desde la apertura: requiere reglas y evidencia de porcentaje/base, comisiones, receptor y pagos por evento, además de implementación/verificación. | Liquidación del evento y cierre conciliado. La automatización puede esperar; registrar un pago externo no prueba que DOMUS recibió ese dinero. |
| **5. Transferencias y entrega** | Dirección/Gerencia confirma el ingreso bancario antes de aplicarlo y entregar por ese pago. Se conservan separadas las cuentas abiertas autorizadas existentes. | Entregar antes sólo mediante **crédito explícitamente autorizado**, manteniendo deuda y transferencia pendiente; nunca llamar pagada a la cuenta por una captura o screenshot. No convierte a todos los clientes en elegibles para crédito. | Servicio con transferencias. Ambas opciones requieren resolver la aplicación/verificación del pago y los vínculos con cuenta/comanda; elegir A no significa que ese control ya esté implementado. |

Los valores `Confirmado` y `Sí` de la opción 1 son una **propuesta explícita de contrato** para que Steven la acepte o cambie; no se deducen de los encabezados ni de los ejemplos de IDE. Si las validaciones/valores existentes usan otro vocabulario, hace falta un mapeo aprobado antes de cualquier escritura. Tampoco se propone un porcentaje fijo: el acuerdo real de cada evento determina I/J/K. El formato interno del porcentaje y su compatibilidad con fórmulas son verificaciones técnicas, no preguntas que Steven deba resolver como programador.

## Qué está resuelto y no debe preguntarse otra vez

- DOMUS registra boletos de proveedores de cada proyecto; no se integra Shopify ni se construye otra boletera.
- Transferencias siguen incluidas como pendientes. La propuesta anterior de excluirlas no fue aplicada.
- Entregar ticket impreso o digital es obligatorio. Se preparó descarga del recibo original; falta comprobar entrega real en estación, no volver a preguntar si se puede omitir.
- Inventario al entregar, crédito autorizado, cortesías por autoridad real, conservación del cobro y reintento con el mismo ID ya son reglas existentes. No se proponen nuevas excepciones.

## Bloqueos técnicos que una respuesta de negocio no resuelve

1. **Transferencia ≠ entrega bloqueada.** Lectura estática de `739a40a`: POS crea comanda con `credit: !(confirmed || freeCourtesy)` y la transferencia queda pendiente. `KDS.gs`, rama ENTREGAR, comprueba estado Lista e inventario; no consulta confirmación bancaria ni distingue transferencia pendiente de crédito autorizado. No se ha probado aquí una explotación ni operación real. Hace falta preservar ese origen financiero y aplicar la política aprobada sin bloquear las cuentas abiertas legítimas. No basta cambiar un texto o marcar `verified` en el cliente.
2. **No hay acción candidata acreditada para confirmar/aplicar transferencias después del registro.** Hace falta autoridad real, evidencia del depósito, vínculo al cobro/cuenta original y aplicación exactamente una vez, conservando el historial financiero. La declaración de receptor externo no cumple ese requisito.
3. **La pareja frontend/backend candidata no está instalada.** Falta cerrar reversión/identidad compatible y validar el conjunto en el staging canónico existente con autorización específica. Push y CI no son deployment ni certificación de Sheets.
4. **Estado operativo real:** sesiones/almacenamiento, intenciones y journals pendientes, catálogo/fase/saldos/fórmulas, stock/recetas/entrega y ticket/terminales deben acreditarse para el alcance que se vaya a operar. Encabezados coincidentes no prueban esos datos. Un journal pendiente de cualquier acción puede bloquear nuevas operaciones.

## Trabajo preparado que no necesita decidir esas reglas

Se conserva un único paquete/candidata de referencia y se deja esta secuencia de integración para coordinación; no se crea otra rama, laboratorio ni paquete paralelo al que mantiene root.

| Paso preparado | Responsable/límite | Resultado que debe conservarse |
| --- | --- | --- |
| Integrar el delta preventivo de root por SHA explícito | Root conserva Data/Events; este hilo no los modifica ni supone que el delta ya está en 739. | Distinguir código candidato, delta de root y deployment. No atribuir la CI de 739 al resultado combinado. |
| Usar `release-manifest.json` y la revisión del recibo ya recibida | Codex: app/Index/POS/Idempotency/Access. Root: paquete privado/reversión. IDE: revisión estática acotada del recibo. | Misma pareja de artefactos; la descarga local no llama backend ni modifica Outbox. Gemini sigue sin dictamen exacto válido mientras su rectificación no llegue. |
| Protocolo de validación en el staging canónico, pendiente de autorización | Reutilizar las regresiones y destinos existentes; no repetir ahora suites ni crear otro motor. | Cobro efectivo/terminal → cuenta/comanda/recibo únicos; ACK perdido/recarga → mismo ID y recibo; entrega → inventario una vez; ticket impreso o archivo realmente recibido. |
| Criterios de aceptación para futuras transferencias | Preparación de requisitos, sin implementar una política no elegida. | Pendiente no liquida; comprobante de otra cuenta/referencia no aplica; confirmación repetida no duplica; reintento parcial recupera; entrega respeta origen financiero y crédito autorizado; fallo de impresión no recobra. |
| Incorporar las respuestas en un único contrato | Las decisiones no modifican por sí mismas Sheets ni permisos. | Autoridad, condiciones, valores y excepciones explícitos antes de levantar ACTIVITY_POLICY_REQUIRED. No migrar por inferencia. |

No se pide a Steven que apruebe los defectos técnicos o que acepte pruebas sintéticas como certificación. Primero se define el comportamiento; después se corrige, verifica e integra con la autorización que corresponda.
