# Cotejo del dossier de Antigravity — 30 octubre 2026

**NO-GO. El material sirve como inventario inicial; no acredita operación integral ni debe ejecutarse sin corregir sus referencias.**

Se revisaron el resumen pegado por Dirección, el TXT adjunto, los scripts del repositorio y las evidencias previas de despliegue. La ruta `file:///Users/.../.gemini/.../DOMUS_MASTER_TESTING_DOSSIER.md` apunta a otra computadora; no se afirma haber leído ese archivo completo.

## Hallazgos del cotejo

| Prioridad | Afirmación o instrucción | Evidencia y corrección |
|---|---|---|
| P0 | `AKfycbysBaRA...` como STAGING autorizado | El historial de auditoría lo detectó conectado a Producción; el guardrail de la rama lo deniega explícitamente. No ejecutar mutaciones allí. El preflight GET reciente verificó `AKfycbwgLRDIvZ3rdl-dl3g_YtwexjYE7TBdGkxTfVdzBABb-58nKt-G7179bL163V5nTut2` con ambos libros exactos. No se repitió ahora una prueba de escritura ni el diagnóstico del endpoint antiguo. |
| P0 | TXT adjunto como posible código para instalar | Es idéntico byte por byte a DOMUS_PRODUCTION_BUNDLE.gs del baseline `ebf5697a4f5cd5cae281e51ecd1c0857c7e4c30b`, y difiere del candidato de reparación. No es el dossier ni el bundle STAGING. No instalarlo como candidato reparado. |
| P0 | Supuesta seguridad integral del código adjunto | En el archivo: fallback a PRODUCTION, override D.main/D.ops, sesión creada para el rol solicitado sin credencial, acciones desconocidas públicas, lectura REQUESTS limitada a 200 filas, comparación de payload sin comparar el dispositivo y escrituras parciales amplias. Son observaciones estáticas del adjunto, no una nueva prueba del despliegue activo. |
| P0 | Ejecutar funciones del bundle desde editor | Incluye `conciliarVentaSinteticaGate2`, que deliberadamente exige Producción, modifica fila 30 de CAJA/COMANDAS y agrega una reversa de COBROS. No se ejecutó ni se autoriza por esta revisión. Requiere conciliación independiente de datos actuales. |
| P1 | Suite STAGING de 14 casos | El script contiene escenarios numerados 1, 2, 3, 7 y 11: cinco, no catorce. Compara folios en respuestas sin leer filas/fórmulas; eso no prueba ausencia de duplicados. Antes de este cambio importaba verify_write_target sin invocarlo y verificaba sólo Main antes del primer POST; también imprimía el token. |
| P1 | Contrato vigente y SLA certificados | El harness usa autenticación sin credencial, `paymentMethod`, `total`, productos sin SKU y dispositivos inconsistentes con la sesión. Necesita adaptación antes de probar el candidato. Mezcla reintentos y concurrencia para p95 y sólo avisaba al exceder 5 s. No es un gate de rendimiento suficiente. |
| P1 | `test_hotfix_v13.py` prueba mutex real | Su caso 10 sólo busca el texto de navigator.locks en la fuente. No inicia dos pestañas ni observa solicitudes concurrentes. El mensaje se corrigió para indicar alcance estructural. |
| P1 | Gates Forza A–N validan KDS real | Hacen preflight real, pero parte central del inventario es emulación Python sobre listas. No ejecutan necesariamente las funciones GAS ni comprueban fórmulas de Sheets. Su modelo SKU/nombre/stock no certifica el esquema actual A:P. |
| P1 | Print Bridge falló: alcance del diagnóstico | Exit 7 de curl indica fallo de conexión al destino desde el equipo donde corrió. Si fue en la iMac de Caja, investigar el servicio local; no atribuirlo automáticamente a la nube. Si fue en nube, localhost no es la iMac. Sin salida completa no se conoce la causa. Las 11 pruebas actuales simulan CUPS; no imprimen ni abren el cajón físico. |
| P1 | Smoke productivo exit 1 | Sólo acredita ejecución fallida. Sin stdout/stderr no distingue red, permisos, endpoint, contrato o defecto. No equivale a caída confirmada de todo DOMUS. No se ejecutaron pruebas mutativas para investigarlo. |
| P2 | Selectores del dossier | `#searchProduct` → `#catalogSearchInput`; `#accountName` → `#customerNameInput`; `#accessName` → `#accessCustomerName`. `#btnManualOpenDrawer` no existe en el HTML cotejado. Debe inventariarse la interfaz de la versión exacta probada. |
| P1 | Reglas universales de precios/acceso | No fijar 73 productos ni $50 de guardarropa para todos los eventos. El precio vigente debe salir de la actividad y preservar gratuidad autorizada. Editar canal/personas o eliminar acceso no puede sobrescribir ingresos históricos; el candidato rechaza cambios comerciales sin conciliación. Debounce no demuestra anti-duplicación de servidor. |

SHA256 del adjunto: `e0dbaefa039d014b2017df4251921f08f1ae4120cb6204db3c9b081edcc815e2` (100478 bytes). No se copió el adjunto completo al repositorio ni se ejecutó.

## Correcciones realizadas en la rama de reparación

- El cliente del harness verifica URL, entorno y ambos libros mediante el guardrail común antes del primer POST, incluida autenticación; el punto de entrada general también lo exige antes de consultas o sesiones.
- Se retiró el token de la salida de autenticación.
- La cabecera reconoce cinco escenarios legacy; el resultado global devuelve NO-GO por cobertura incompleta, sin proclamar catorce casos aprobados.
- La prueba v13 identifica su comprobación de Web Locks como presencia de fuente, no concurrencia observada.
- Se añadieron tres pruebas sin red que demuestran bloqueo de URLs productiva/legacy antes de cualquier solicitud, rechazo ante fallo de verificación y aborto de la suite antes de autenticación/catálogo. Incluidas en CI.

Esto protege la ejecución futura; no adapta todavía todo el harness legacy al contrato nuevo ni instala las reparaciones.

## Evidencia y siguiente paso

PR #18: https://github.com/SadoTechMX/Admin-Domus/pull/18

El commit de código anterior `d60b10e` pasó CI `41118210859`: backend 26, cliente 12, bridge simulado 11, guardrails 4 y Chromium con red interceptada 15. La nueva protección del harness pasó 3 pruebas locales, v13 pasó sus comprobaciones estructurales y bridge pasó 11 casos simulados. No sumar estas comprobaciones solapadas como porcentaje de cobertura del sistema.

La instalación sigue pendiente: respaldo de código/datos STAGING, bundle correcto más Index.html, credenciales de estación seguras y despliegue con hash verificable. Después, probar los flujos reales con lectura antes/después de Sheets y pruebas físicas en las estaciones. No merge ni despliegue productivo sin la autorización de la versión concreta.
