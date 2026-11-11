# Vía acotada para la activación staging autorizada

IMPLEMENTED / LOCAL_TESTED / NOT_INSTALLED / NOT_EXECUTED. Coordinación transmitió autorización de Steven para activar **sólo** el snapshot `5c0b3a75ba2653d8255ff05159c5d6a679696d189db9cc3e57455fee0c31cd90` y realizar un ensayo posterior. Este encargo prepara código y pruebas aisladas; no ejecuta la activación ni el ensayo. No hubo Google, versiones, despliegues, datos reales o reenvío de colas.

Base cotejada local/remota: `8cdd000708c488c130e81b813a937ee1ca4993d6`, sin otro delta publicado conocido. Se reutilizan los auxiliares de identidad, errores y lectura consistente de esa base. Backend, Index, manifiesto y puente 708c conservan sus bytes. La aprobación 708c y todas las propiedades preexistentes ajenas a la nueva aprobación permanecen intactas.

## Alcance y controles

Los tres archivos nuevos están fuera del bundle y del manifiesto de aplicación:

- [StagingFreshStartAdmin.gs](../scripts/apps-script-admin/StagingFreshStartAdmin.gs): contrato privado, creación de la aprobación específica, activación y verificación durable.
- [StagingFreshStartBridge.gs](../scripts/apps-script-admin/StagingFreshStartBridge.gs): dos entradas temporales sin argumentos: `domusAprobarInicioNuevoTemporal` y `domusActivarInicioNuevoTemporal`. Configuración deshabilitada por defecto.
- [StagingFreshStartRead.gs](../scripts/apps-script-admin/StagingFreshStartRead.gs): `domusVerificarInicioNuevoTemporal`, sólo lectura, disponible después de retirar el escritor.

**Las funciones públicas son accesibles por `/dev`; no son editor-only.** Se exigen identidad Google activa/efectiva coincidente y autorizada en Gerencia, el proyecto/libros staging canónicos, build reconocido, operador fijado y ventana UTC absoluta de hasta diez minutos. La ventana se congela por invocación y se comprueba antes de cada inicio de escritura/dispatch. No se cancela a mitad de una transacción ya iniciada por vencer después. No se aceptan tokens, roles, IDs, payloads o hashes de cliente.

ID fijo de intención: `STAGING-FRESH-5c0b3a75ba2653d8255ff05159c5d6a679696d189db9cc3e57455fee0c31cd90`. Dispositivo administrativo fijo: `STAGING-ADMIN-5c0b3a75ba2653d8`. El payload se deriva del artefacto original y las confirmaciones expresas; su huella queda vinculada a ambos IDs. No se elige otro ID ante errores.

La aprobación se crea únicamente si `DOMUS_STAGING_FRESH_START_APPROVAL_V1` está ausente y la revalidación completa coincide con el snapshot autorizado. Todo valor preexistente se preserva en esta fase, incluso vacío o malformado. Sólo una aprobación creada por este auxiliar, con su identidad y vinculación exactas, puede avanzar. Al activar, se añade **en esa misma propiedad** una marca durable de intento antes de autenticar o llamar al dispatcher. No se borra ni se restablece automáticamente.

La autenticación usa el login normal de Gerencia derivado de su identidad Google y `executeDomusAction_`. No se construye un `_authContext` ficticio ni se amplían roles. **El login crea una nueva entrada normal `ses:` de sesión**, además de la propiedad de aprobación; su token permanece en el servidor y caduca conforme a la política existente. No se enumera, sobrescribe o borra ninguna otra propiedad. No pegar credenciales en código, formularios, chat o evidencias.

## Cómo se evita repetir el timeout después de PROCESSING

V16 escribe REQUESTS `PROCESSING` antes de recalcular el snapshot. Repetir su recorrido lento puede dejar una intención parcial. El auxiliar interpone un adaptador **sólo durante esa llamada autenticada, bajo el mismo lock**, que entrega la vista consistente al `historySnapshot_` original y ejecuta su comprobación final de contenido. Exige el ID/rol/snapshot exactos. Restaura la función original en `finally`; no modifica el código guardado del proyecto.

El dispatcher, RBAC, vinculación `requestId/action/payloadHash/deviceId`, el registrador original, la aprobación y `journalCommit_`/`journalResume_` siguen ejecutándose. No se sustituye el resultado por el artefacto descargado ni se salta un validador. El plan administrativo original permanece vacío, sin venta, entrega, inventario, apertura o corte. Este adaptador temporal forma parte del delta que debe revisarse; no está acreditado por el hash del backend V16.

La marca de intento y la restricción de ID pertenecen al auxiliar. No se altera el endpoint general de V16 ni se impide a otro administrador usarlo directamente: mantener su custodia y los demás escritores detenidos. El lock no serializa ediciones manuales ni otros proyectos; la relectura no es una transacción atómica frente a ellos.

## Procedimiento preparado, pendiente de revisión e instalación

1. Cotejar staging, respaldo, escritores detenidos y retirada del puente escritor 708c anterior. Conservar esa aprobación y todos los históricos. Verificar que `StagingRetentionApproval.gs` y `StagingRetentionReadView.gs` corresponden a `8cdd000`; no reemplazar backend/Index ni crear versión/despliegue.
2. Tras revisar esta entrega, añadir los tres archivos nuevos al editor staging. Completar sólo la copia privada de `domusInicioEntrada_` con el artefacto completo `DOMUS_STAGING_FRESH_START_PROPOSAL_V2`, referencia de la autorización y las siete confirmaciones cotejadas. No cambiar snapshot, inventario, respaldo, `input` ni hashes para forzar coincidencia. No publicar el artefacto.
3. Ejecutar `domusVerificarInicioNuevoTemporal`: debe devolver `ABSENT`, sin propiedades/intención propias. Ante un valor existente, otra intención, error o incertidumbre, detenerse; no borrar ni adaptar la evidencia. Esta consulta no recupera journals.
4. Preparar en la copia privada `domusInicioVentana_`: principal Gerencia comprobado y dos fechas UTC ISO con milisegundos, absolutas y con máximo diez minutos. El periodo limita el inicio de las operaciones; no se renueva al invocar.
5. Ejecutar una vez `domusAprobarInicioNuevoTemporal`. Esperar `APPROVED_NOT_STARTED`. Esto sólo crea la aprobación vinculada, no REQUESTS/journal. `EXISTING_PRESERVED` exige inspección; nunca sobrescribir por asumir que el valor es equivalente.
6. Ejecutar una vez `domusActivarInicioNuevoTemporal`. Revalida el snapshot, persiste la marca de intento y usa la sesión/dispatcher normales. El único éxito definitivo es `ACTIVATED_VERIFIED` con `verified:true`, tras cotejar REQUESTS y journal `COMPLETED`, el resultado completo, snapshot y autor. La respuesta en memoria por sí sola no basta.
7. Retirar y guardar **StagingFreshStartBridge.gs** después del intento coordinado o cualquier fallo, sin crear versión/despliegue. No lanzar otro escritor mientras la ejecución siga pendiente. Retirar el archivo no cancela una ejecución ya iniciada.
8. Usar únicamente `domusVerificarInicioNuevoTemporal` para verificar después. Un resultado parcial, `PROCESSING`, `REQUIRES_REVIEW`, journal `PREPARED` o marca de intento sin filas queda en revisión; no se reenvía ni cambia el ID. Si se perdió el ACK pero ambas fuentes durables están completas y coinciden, la lectura puede acreditar el éxito sin replay. Una recuperación pendiente necesita revisión de ese mismo ID/payload; este auxiliar no la autoriza ni automatiza.
9. Sólo tras la verificación independiente del límite se podrá continuar el ensayo staging ya autorizado. Esta herramienta no abre jornada, inicia ventas, concilia dinero ni entrega productos. No acredita operación productiva.

En estados inciertos, los campos de efectos se devuelven `null`: no se presume cargo o movimiento cero. `newCharge:0` e `inventoryMovement:0` se informan únicamente cuando el límite administrativo está verificado. Los históricos conservan `resolved:false` y `financialFinal:false`; no se inventan cierres ni saldos.

## Pruebas y límites

45 casos nuevos con módulos y bundle actuales, más dos con el bundle completo inmutable de Git `2189540` usado como referencia de V16: **47 PASS**. Código real de autenticación, dispatcher, REQUESTS y journal con servicios en memoria. Se prueban éxito y duplicación de clic, lectura tras perder ACK, fallo parcial, bloqueo de reintento, identidad/RBAC/entorno, parámetros rechazados, expiración, huella/payload alterados, evidencia cambiada antes/después de la vinculación, preservación de propiedades existentes, error incierto al escribir la marca, concurrencia, estado corrupto y confidencialidad. Los positivos usan una autorización sintética sólo dentro del fixture; no acreditan el snapshot real 5c0b.

La CI debe cotejarse contra el SHA final. No hay latencia Google medida ni garantía de terminar antes de seis minutos. No hay revisión nueva acreditada de Gemini/Antigravity sobre este delta; queda preparado para esa revisión complementaria. Ante fallo parcial se conserva la evidencia y el bloqueo; no hay reversión destructiva ni otro ID automático.
