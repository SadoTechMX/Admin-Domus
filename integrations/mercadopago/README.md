# ALQUIMIA → archivo Mercado Pago

Módulo Apps Script independiente para mantener **el mismo archivo XLSX de intercambio** a partir del catálogo aprobado de ALQUIMIA. Se incorpora a un proyecto existente y verificado; no crea otro sistema POS ni usa sus sincronizadores históricos.

**Estado de esta entrega: implementado y probado localmente. Falta instalarlo, autorizarlo y verificarlo en el proyecto Apps Script real.** La ejecución actualiza un archivo; no importa productos a Mercado Pago ni acredita su publicación en terminales. La plantilla examinada es para agregar productos y no contiene un identificador de catálogo que permita presumir actualizaciones sin duplicados.

## Archivos

- `DOMUS_MercadoPagoSync.gs`: módulo autocontenido con funciones públicas y handlers exclusivos.
- `appsscript.scopes.fragment.json`: scopes que deben unirse a los existentes; **no reemplaza el manifiesto del proyecto**.
- `tests/run_tests.js` y `tests/bridge.py`: pruebas del código `.gs` exacto con servicios simulados, ZIP/XML y fixtures anónimos; no realizan solicitudes de red.
- `GOVERNANCE.md`: límites e instrucciones pertinentes.

## Contrato de datos

La fuente es la pestaña `Menú & Precios`, datos desde fila 4. Antes de leer, se comprueban los siguientes encabezados exactos de la fila 3. Una permuta de columnas detiene la sincronización.

| Columna | Encabezado | Uso |
|---|---|---|
| A | Código | ID permanente `PROD-` seguido de 3 a 12 dígitos |
| B | Producto | Nombre base |
| D | Categoría | Categoría comercial |
| J | Precio Solar/Eclipse ($) | Precio Solar/Eclipse |
| M | Precio Lunar ($) | Precio Lunar |
| Q | Estado de Revisión | Solo texto `Aprobado`, normalizando espacios exteriores y mayúsculas |

Cada producto aprobado produce dos variantes con identidad interna estable: `PROD-…|SOLAR` y `PROD-…|LUNAR`. Sus nombres terminan en ` - Solar/Eclipse` y ` - Lunar`. La fase no es un evento y el módulo no crea esa dimensión.

El precio debe ser un número finito de 0.01 a 999999999, con máximo dos decimales. Los valores faltantes o expresados como texto se rechazan; no se convierten en cero ni se copian del otro precio. El nombre completo de cada variante debe medir entre 3 y 60 caracteres; no se recorta. Los IDs y los nombres exportados deben ser únicos.

En destino se exige la plantilla `MLM_DEFAULT_DOCUMENT`, versión `1.0.6`, sus tres pestañas, 20 partes ZIP y los encabezados inspeccionados.

| Destino permitido | Valores |
|---|---|
| `Tus productos!B5:B997` | Nombre con fase |
| `Tus productos!C5:C997` | Precio de venta de esa fase |
| `Tus productos!I5:I997` | Categoría |
| `Tus categorías!B6:B205` | Categorías necesarias, añadidas sin borrar las previas |

Hay 993 filas de producto y 200 categorías. Se aborta antes de escribir si no hay capacidad. Las nuevas altas requieren una fila completamente vacía entre B y J; la fórmula de validación K se excluye de ese criterio y se preserva. Una fila con SKU o stock huérfano se bloquea para revisión.

F/SKU permanece sin modificar. Si ya hay SKU manuales no vacíos, se comprueba que no estén duplicados. Esta validación **no significa que el importador de Mercado Pago use SKU como llave de actualización**.

Las columnas de unidad, costo, SKU, inventario, alerta y EAN se conservan. No se exportan proveedores ni sus condiciones, cobros, saldos, cuentas o información contable. Una edición de proveedor en el máster puede disparar una revisión del catálogo y sus fórmulas; solo se exportan los campos permitidos del producto aprobado.

## Instalación en el proyecto existente

1. Verificar el proyecto Apps Script que administra el máster, sus propietarios, código vigente y disparadores. No pegar este módulo en el proyecto de producción POS por su nombre o por un script ID histórico. No reemplazar bundles, `Config.gs`, `onEdit`, `onOpen`, `doGet` o `doPost` existentes.
2. Añadir `DOMUS_MercadoPagoSync.gs` como archivo nuevo del proyecto verificado. Unir los scopes de `appsscript.scopes.fragment.json` a los ya existentes y conservar el resto del manifiesto. La operación usa Drive API mediante `UrlFetchApp`; no requiere habilitar el servicio avanzado de Drive. El proyecto de Google Cloud debe permitir Drive API. Si devuelve un error de acceso/configuración, resolverlo antes de continuar.
3. Crear las propiedades del script `DOMUS_MP_SOURCE_ID` y `DOMUS_MP_TARGET_ID` con los IDs privados correctos. El primero identifica el Google Sheets maestro; el segundo, el **XLSX existente**. Sin ambos valores válidos no se ejecuta ninguna sincronización. No introducirlos en código versionado.
4. Ejecutar `DOMUS_MP_Simular`. Es solo lectura, incluida la ruta de error. Verificar conteos y cambios propuestos. El bootstrap relaciona cada ID+fase con una fila existente únicamente si nombre, precio y categoría coinciden exactamente. Una coincidencia de nombre con distinto precio o categoría, o una ambigüedad, bloquea el proceso.
5. Ejecutar `DOMUS_MP_Instalar` con la cuenta responsable que conservará los disparadores. Realiza de nuevo todo el preflight y relee fuente/destino. Crea la pestaña visible `MP_SYNC_CONTROL`, guarda la correspondencia inicial y crea tres disparadores exclusivos: edición del maestro, cambio del maestro y recuperación cada 5 minutos. **La primera instalación queda pausada y no modifica el XLSX.** Repetirla con la misma cuenta no duplica esos disparadores ni toca los del POS. Otra cuenta se bloquea para evitar disparadores invisibles de propietarios distintos.
6. Ejecutar manualmente `DOMUS_MP_Ejecutar` con la misma cuenta instaladora. Comprueba que los tres disparadores registrados existan y correspondan al maestro; una instalación parcial exige repetir `Instalar` y conserva la pausa. Si hace cambios, prepara el diario, relee ambos documentos, escribe el binario en el mismo ID por Drive API, verifica su SHA-256 mediante lectura posterior y confirma el diario. Solo al terminar correctamente, tras verificar otra vez los disparadores, habilita la automatización. Si no hay cambios, verifica la correspondencia sin hacer PATCH y habilita igualmente los disparadores.
7. Revisar el resultado de la ejecución, el diario del maestro y el archivo resultante. La importación de Mercado Pago y la verificación en cada terminal son pasos separados que requieren evidencia propia.

`DOMUS_MP_Pausar` deshabilita únicamente este módulo y conserva sus disparadores, correspondencias y diario. La bandera se revisa dentro del candado antes de cualquier operación automática.

Los disparadores se ejecutan bajo la cuenta que los creó. Un solo responsable debe instalarlos. Los cambios realizados por scripts o APIs no generan normalmente eventos `onEdit`; la comprobación cada 5 minutos cubre ese caso y también fórmulas que se recalculan después de la edición. Es una frecuencia de revisión, no una garantía de latencia ni monitoreo infalible: depende de permisos, cuotas y disponibilidad de Google.

## Identidad, conflictos y bajas

El manifiesto reside en `MP_SYNC_CONTROL`, dentro del maestro, separado del XLSX. Guarda ID+fase, fila de destino y los últimos valores verificados de nombre, precio y categoría. El diario contiene snapshots sellados con SHA-256 y preserva los valores anteriores. No es un catálogo alterno editable.

- Un cambio de nombre o precio en un ID aprobado actualiza la misma fila.
- Un producto nuevo aprobado ocupa una fila vacía y agrega las categorías faltantes.
- Un producto que desaparece del maestro se retiene con `HOLD_MISSING`.
- Un producto que pierde la aprobación se retiene con `HOLD_NOT_APPROVED`, sin actualizar sus valores. Los nuevos no aprobados no se exportan.
- No se borra ni desactiva automáticamente un artículo en el XLSX. Una baja operativa y su publicación requieren revisión independiente.
- Si `heldVariants` es mayor que cero, el archivo conserva productos retirados o sin aprobación actual. Resolver esos pendientes antes de una publicación; conservar filas previas no acredita que todo el archivo corresponda al catálogo activo.
- Si alguien modifica manualmente un campo administrado del XLSX, mueve las filas vinculadas o cambia/elimina una categoría registrada, se bloquea la ejecución. Los valores del maestro no pisan esa edición.
- Si desaparece o se vacía el manifiesto después de una instalación, se bloquea el bootstrap. Reinstalar no reasigna IDs silenciosamente por nombre. Restaurar la evidencia o resolver la correspondencia con revisión antes de continuar.

Los cambios se hacen mediante sustitución de los elementos XML de las celdas autorizadas. No se reserializa la hoja completa ni se altera el resto de sus bytes. Las demás partes ZIP conservan sus bytes descomprimidos; la compresión y las fechas internas del contenedor pueden cambiar. Hojas ocultas, estilos, fórmulas, validaciones, imágenes, relaciones y metadatos permanecen intactos.

## Escritura incierta y recuperación

Cada operación guarda `PREPARE` antes de hacer PATCH, con hash anterior, hash esperado y manifiesto siguiente. Se verifica la escritura del diario antes de enviar el XLSX. Los fragmentos JSON llevan un prefijo fijo `JSON:` para evitar que Sheets los interprete como fórmulas.

Si ocurre un timeout, error HTTP o fallo de lectura posterior, **no se repite el PATCH a ciegas**. La siguiente ejecución revisa el archivo:

| SHA-256 observado | Acción |
|---|---|
| Igual al esperado después de escribir | Confirma el manifiesto sin repetir la escritura |
| Igual al anterior | Registra que no se aplicó; vuelve a planificar con los datos actuales |
| Distinto de ambos | Bloquea por resultado incierto; conserva el diario y el archivo para revisión |

La misma regla cubre el fallo entre el PATCH y el registro de confirmación. Un diario incompleto, con hash incorrecto o con una secuencia inválida detiene el proceso. No se borra ni “reinicia” para resolver una alerta. Una caída durante la creación de la hoja de control que deje cabeceras incompletas también exige revisar/restaurar esa evidencia; no se atribuye automáticamente una hoja desconocida al módulo.

Si falta un disparador y también existe una operación pendiente, `Ejecutar` puede confirmar/abortar esa operación por sus hashes antes de exigir repetir `Instalar`. No envía un nuevo PATCH ni habilita la automatización con la instalación incompleta. Así se conserva una ruta de recuperación sin borrar el diario.

El candado serializa ejecuciones de este proyecto. Se releen fuente y destino inmediatamente antes de escribir, pero **no existe compare-and-swap atómico entre Google Sheets y Drive**. Una edición externa en el intervalo final puede todavía competir. Para la primera verificación y los cambios masivos debe evitarse editar simultáneamente el XLSX; después, conservarlo como archivo de intercambio administrado desde el maestro. Una edición posterior se detectará por el manifiesto o por el diario pendiente.

## Observabilidad y límites

El último resultado conciso queda en `DOMUS_MP_LAST_STATUS`, con UTC y hora de Ciudad de México. Contiene conteos, código de error y fila cuando corresponde, sin nombres, precios, proveedores ni cuerpos HTTP. Los estados siempre distinguen archivo, importación de Mercado Pago y terminal. La consola no imprime tokens ni payloads de Drive.

Se usan pocas propiedades pequeñas: IDs de configuración, habilitación, hash del instalador, IDs de los disparadores y último estado. Los manifiestos y transacciones se guardan en la hoja, no en PropertiesService. El diario es append-only; al llegar a 45000 filas de datos, se detiene para una archivación revisada. No se implementa borrado automático ni compactación silenciosa. El límite de archivo del módulo es 5 MiB, coherente con su modalidad de carga simple.

No se ha probado aquí la autorización OAuth real, el proyecto Apps Script remoto, sus tiempos/cuotas ni la publicación en Mercado Pago. Las pruebas locales verifican lógica, estructura y rutas de fallo con adaptadores simulados. Para declarar `DEPLOYED`/`PROD_VERIFIED` faltan instalación, ejecución autorizada, lectura posterior real y comprobación del mecanismo de importación/terminales por separado.

## Pruebas

Requieren Node.js y Python 3, sin paquetes de terceros:

```bash
node tests/run_tests.js
```

Opcionalmente se puede comprobar compatibilidad con un snapshot privado sin copiarlo al proyecto:

```bash
node tests/run_tests.js /ruta/privada/source_catalog.json /ruta/privada/plantilla.xlsx
```

El JSON privado debe contener `products` con campos `code`, `name`, `category`, `solar`, `lunar`, `status`. Esa comprobación es de solo lectura y exige bootstrap sin cambios. No versionar esos archivos.

La suite comprueba altas, modificaciones, renombres, IDs duplicados, nombres ambiguos, bajas retenidas, pérdida de aprobación, límites, conflictos manuales, conservación de las 20 partes, celdas excluidas, bootstrap, pausa, instalación idempotente y recuperación antes/después de una escritura incierta. Los datos utilizados por defecto son anónimos.

## Fuentes técnicas

- [Drive API: actualización de archivos](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
- [Drive API: cargas simples y actualización de contenido](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Apps Script: disparadores instalables y restricciones](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script: Utilities ZIP y digest](https://developers.google.com/apps-script/reference/utilities/utilities)
- [Apps Script: XML Service](https://developers.google.com/apps-script/reference/xml-service)
- [Apps Script: Range.setValues e interpretación de fórmulas](https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluesvalues)

Contrato del archivo y encabezados: inspección de la plantilla autorizada durante esta tarea. La revisión futura de esos encabezados o de su versión debe producir un cambio deliberado del adaptador, no una relajación automática de las guardias.
