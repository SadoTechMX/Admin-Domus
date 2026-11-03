# DOMUS: entrada común para agentes

El sistema cubre el ecosistema permanente de DOMUS. El trimestre es un escenario de capacidad, no una fecha para borrar historia.

Antes de editar:

1. Leer `docs/ecosistema/CONTEXTO_COMUN_DOMUS_v2.txt`, `INICIO_IA.md`, `MANIFIESTO.json` y `NUBE_Y_CONTINUIDAD.md` en ese directorio.
2. Confirmar con el integrador el SHA vigente, tarea y propiedad de archivos. El tablero v2 es una fotografía; los acuses y asignaciones actuales se conservan en el registro privado de coordinación.
3. Ejecutar `python3 tools/cloud/verify.py`. Una divergencia exige revisar el diff; no actualizar huellas sólo para obtener un resultado verde. Declarar capacidades y bloqueos reales.
4. Trabajar en una rama aislada, conservar cambios ajenos y entregar un diff/PR. Un solo editor por archivo; Antigravity y su IDE representan al mismo agente. Gemini recibe una tarea o archivo por envío.

El comando de verificación sólo comprueba el contexto, sintaxis y pruebas sintéticas de coordinación. No certifica la aplicación, la nube, cuatro puestos, carga ni operación offline.

No ejecutar descubrimiento global de `tests/`: contiene ensayos que pueden llamar al backend. La lista inicial autorizada para nube/CI se limita a `tests/coordination/test_coordination.py`, al verificador de contexto y a `node --check js/app.js`.

No desplegar Apps Script/Pages, modificar datos históricos, reproducir colas de ventas ni cambiar importes, clasificaciones, pagos o inventario sin autorización específica y cotejo. Conservar el ID en cada reintento. Los resultados inciertos necesitan recuperación antes de nuevos efectos.

Este repositorio es público: no subir credenciales, sesiones, datos de clientes, cierres, nómina, contratos ni identificadores privados de infraestructura. La configuración inicial de nube no necesita credenciales ni acceso a hojas.

Cada entrega indica commit, archivos, pruebas ejecutadas, evidencia, límites y siguiente responsable. Un acuse no crea una conexión permanente entre plataformas. La publicación de un PR no equivale a publicar la aplicación.
