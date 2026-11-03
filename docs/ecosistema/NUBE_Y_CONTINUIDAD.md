# Desarrollo portable y continuidad de DOMUS

Este complemento conserva intacto el paquete v2 y su hash. Describe preparación técnica; no acredita conexiones, despliegues ni operación offline.

## Arranque común

Requisitos iniciales: Git, Python 3.10 o superior y Node 18 o superior. No se necesitan paquetes Python/Node externos, credenciales ni acceso a Sheets para estas verificaciones.

Clonar el repositorio oficial y seleccionar la rama/commit de coordinación comunicado por el integrador. Hasta integrar el PR, usar `coord/domus-ecosistema-20261103`, no asumir que `main` contiene estos archivos. Ejecutar desde la raíz:

```sh
python3 tools/cloud/verify.py
```

El comando valida contexto y huellas, ejecuta exclusivamente pruebas sintéticas de coordinación y comprueba sintaxis de `js/app.js` sin ejecutarlo. No importar suites históricas ni ejecutar `unittest discover` sobre todo el repositorio: algunas llaman al backend.

## Codex Cloud

Crear un entorno para el repositorio DOMUS desde la cuenta y espacio autorizados. Seleccionar y verificar la referencia de coordinación. En el asistente de preparación indicar:

> Leer AGENTS.md. Preparar Python >=3.10, Node >=18 y Git. Ejecutar solamente python3 tools/cloud/verify.py. No se necesitan secretos, hojas, API operativa ni despliegues. No iniciar la aplicación contra el backend productivo. Informar SHA real, versiones, comprobaciones y límites antes de publicar el entorno.

Verificar el informe y la referencia real antes de publicar el entorno de desarrollo. Un entorno publicado requiere una tarea cloud para ejecutar trabajo; no convierte este chat local ni las sesiones de otras plataformas en procesos cloud.

## Codespaces / contenedor

`.devcontainer` prepara las mismas herramientas y ejecuta el verificador al crear el contenedor. La imagen y paquetes del sistema reciben actualizaciones: registrar sus versiones al preparar cada entorno. Este contenedor no inicia servicios ni despliega DOMUS. Su construcción real debe verificarse por separado; un resultado local de Python no certifica el contenedor.

## Integración continua

GitHub Actions comprueba esta preparación en PR y en la rama de coordinación. Tiene permiso de lectura del repositorio, no usa secretos y no despliega. Un resultado verde certifica sólo contexto/sintaxis/pruebas sintéticas. Las pruebas de negocio, carga y recuperación se incorporan tras revisar sus efectos y su aislamiento.

## Coordinación entre IAs

GitHub contiene las entregas técnicas públicas. Drive restringido conserva acuses, contexto privado y evidencias internas; sus enlaces se comunican por el integrador. Antes/después de cada tarea se comprueban versión, SHA, responsabilidad y diff. Codex integra; las otras IAs entregan una revisión o propuesta con su acceso real declarado. Las sesiones sin conector reciben una entrega breve por el puente de coordinación. La configuración de herramientas no hace automática la distribución de memoria entre chats.

## Pendientes de continuidad operativa

Prioridad U04/U03: persistir antes de confirmar, detectar fallo de almacenamiento, recuperar solicitudes inciertas y conservar IDs legados al integrar POS2. Ensayar reinicio, corte de red, expiración de sesión y pérdida de confirmación con datos sintéticos.

Luego preparar aplicación instalable y servicio local por LAN para cuatro puestos. La nube recibe sincronización y muestra hora del último dato confirmado. Sin comunicación no se garantiza unicidad global de boletos/aforo/inventario entre dispositivos. Un pago guardado localmente no confirma tarjeta/transferencia. Ni el hub ni este modo offline están implementados por estos archivos.

Para habilitar operación: cuatro ventas distintas concurrentes, arranque tras reinicio sin internet, envío de comandas en LAN, recuperación sin duplicados y restauración desde respaldo. Presentar evidencia y reversión antes de proponer publicación operativa. Conservar el histórico y la autorización sobre movimientos económicos.
