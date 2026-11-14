# Gobernanza aplicable al módulo

Síntesis de las instrucciones leídas en `SadoTechMX/Admin-Domus`, `.agents/rules/domus-governance.md`, `GEMINI.md`, `docs/AI_HANDOFF.md`, `docs/CURRENT_STATE.md` y `docs/OPERATING_RULES.md`, junto con las instrucciones de Dirección para esta tarea.

- Versionar únicamente en una rama aislada. No modificar ni fusionar `main` sin la autorización correspondiente.
- Consultar contexto y estado antes de extender la operación. Código guardado, probado localmente, instalado, desplegado y verificado son estados distintos.
- No publicar credenciales, tokens ni identificadores privados nuevos en el repositorio público. La configuración de este módulo reside en propiedades del proyecto Apps Script.
- La sincronización de catálogo no autoriza modificaciones a registros financieros, inventario físico, reparto de proveedores, cortesías o cierres. Este módulo no realiza esas acciones.
- No ejecutar el sincronizador legado del POS para esta integración: no corresponde a los dos documentos de este módulo y contiene comportamientos históricos ajenos a su alcance.
- Preservar evidencia y trazabilidad. No borrar el diario para desbloquear un error ni reintentar una escritura incierta sin cotejar el resultado previo.
- Conservar cambios ajenos: revisar fuente y destino antes de escribir; detenerse ante conflicto. Un candado del proyecto Apps Script no bloquea ediciones humanas ni otros proyectos.
- Usar `America/Mexico_City` para información operativa; conservar también UTC para auditoría técnica.
- Usar fixtures anónimos para pruebas. No incluir catálogos reales, precios comerciales, proveedores o IDs privados en las pruebas versionadas.
- Ejecutar pruebas significativas antes del commit y actualizar el estado sin afirmar un despliegue que no se haya observado.

Este archivo documenta el alcance del trabajo; no concede permisos nuevos ni reemplaza las instrucciones del repositorio o de Dirección.
