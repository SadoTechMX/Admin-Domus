# Coordinación del ecosistema DOMUS

Leer `CONTEXTO_COMUN_DOMUS_v2.txt` antes de trabajar. Verificar `MANIFIESTO.json`; el hash identifica una copia, no demuestra que sea la versión más reciente en el servidor.

Consultar el commit de coordinación comunicado por el integrador, `TABLERO.json` y su evidencia de acuses. Comparar contexto y código después de cada entrega. Ninguna herramienta se considera sincronizada por estar abierta.

Desde una copia local: `python3 herramientas/coord.py status --repo /ruta/al/repositorio`. El comando sólo lee archivos y Git. No hace pull, no ejecuta código del repositorio ni despliega. Los cambios de referencia se revisan antes de editar.

Para registrar un acuse propio: `python3 herramientas/coord.py ack --repo /ruta/al/repositorio --actor codex --task U00 --context-sha HASH --outdir /ruta/privada/acuses`. Genera una entrega nueva; no sobrescribe anteriores. El acuse no es una firma de identidad ni crea una conexión entre aplicaciones.

Los enlaces privados y acuses completos viven en el registro de coordinación autorizado. Este directorio no contiene datos operativos reales.
