# MP009 · Cambio preparado, sin despliegue

Fecha: 2026-11-13, America/Mexico_City.

El archivo `patches/MP009_access_ticket_availability.patch` contiene únicamente el delta de disponibilidad de tipos de entrada, las pruebas sintéticas y su documentación. La aplicación de esta rama conserva el baseline de main; el parche aún no está aplicado a esos archivos.

## Evidencia

- Base del delta: `2b7ba1f4030b1013555b93cb96cfcb594141fdcb`.
- Candidato completo ejecutado localmente: 20/20 pruebas sin red, repetidas en revisión independiente.
- Estados: candidato `LOCAL_TESTED`; no `STAGING_VERIFIED`, no `PROD_DEPLOYED` ni `PROD_VERIFIED`.
- No se probaron ventas ni se cambiaron eventos activos en producción.

## Publicación bloqueada y alternativa

La revisión automática rechazó transferir los archivos completos porque arrastraban una credencial de impresión preexistente y configuración operativa sensible. Este artefacto transmite sólo el diff: se verificó que no contiene la credencial ni los identificadores operativos presentes en los archivos completos. No es una autorización para publicar secretos ni para modificar su configuración.

La gobernanza de `.agents/rules/domus-governance.md`, `GEMINI.md` y `docs/AI_HANDOFF.md` exige desarrollo aislado y validación antes de integrar. Los despliegues históricos descritos en `docs/CURRENT_STATE.md` no verifican este cambio nuevo.

## Siguiente paso

Reconciliar la gestión de la credencial con su responsable sin interrumpir impresión; aplicar el parche en un entorno autorizado; validar en DOMUS-STAGING y obtener el gate de integración vigente. Publicar frontend y backend por separado y comprobar ambos. Activar el marcador de disponibilidad sólo después de verificar los clientes: la interfaz anterior puede seguir mostrando e incluso duplicar tipos deshabilitados. Conservar el valor previo y sus notas como historial.

El detalle del contrato queda dentro del parche, en `docs/ACCESS_TICKET_AVAILABILITY.md`. La suite se ejecuta después de aplicar el candidato con `node tests/access-ticket-availability.test.js`.
