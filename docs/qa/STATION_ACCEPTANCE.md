# Aceptación por equipo real

Crear una fila por computadora/tablet/teléfono real; no asumir que hay sólo un equipo por rol. No registrar IP públicas, secretos ni nombres de clientes. Operador y acceso a evidencias se gestionan por canal restringido.

| Estación | Equipo/OS/navegador/versión | URL/build | Rol servidor | Pruebas locales y cruzadas | Estado |
|---|---|---|---|---|---|
| Caja, cada equipo | Por identificar | Por registrar | CAJA | Venta fixture → recibo único → Barra/Cocina; refresh/reconexión; sesión y Outbox | NOT_TESTED |
| Barra, cada equipo | Por identificar | Por registrar | BARRA | Recibe destino Barra; TOMAR/LISTA/ENTREGAR una vez; dos operadores y pérdida de red | NOT_TESTED |
| Cocina, cada equipo | Por identificar | Por registrar | COCINA | Recibe destino Cocina; transición autorizada y receta; no asumir rol por filtro visual | NOT_TESTED |
| Accesos, cada equipo | Por identificar | Por registrar | ACCESOS | Canales/tarifas, duplicado QR, guardarropa y devolución; reconexión sin duplicar | NOT_TESTED |
| Administración | Por identificar | Por registrar | GERENCIA/ADMIN | Lectura financiera/cuadre y permisos; no privilegio por rol declarado en cliente | NOT_TESTED |

## Secuencia de prueba presencial

1. Registrar identidad exacta de la versión por equipo y acceso legítimo; comprobar reloj/zona y restauración de red. No navegar a producción para crear fixtures.
2. Desde la iMac consultar únicamente `/health` y `/printers/status` del bridge local. Conservar error completo si falla; curl exit 7 no identifica por sí solo la causa. No usar `/test-print` durante este diagnóstico de sólo lectura.
3. Con operador y fixture autorizado, comprobar ticket físico de 80 mm: folio, importes, método, acentos, corte y copia. QUEUED/CUPS exit 0 no certifica salida en papel.
4. Antes del cajón confirmar modelo, puerto y configuración ESC/POS con el operador; no asumir m=0 ni disparar pulsos para descubrirlo. En prueba controlada: un pulso por efectivo confirmado y ninguno por terminal/transferencia/crédito/cortesía/reimpresión. Manual: operador, motivo, confirmación, requestId y cooldown.
5. Apagar/desconectar impresora durante fixture controlado: venta ya confirmada sigue única; aviso claro; recuperación/reimpresión no repite cobro ni abre cajón.
6. Dos equipos y dos pestañas simultáneas: demostrar exclusión Outbox donde corresponde e idempotencia de servidor entre dispositivos. Guardar solicitudes saneadas, IDs y lecturas Sheets antes/después.
7. Reiniciar navegador/equipo y recuperar pendientes; verificar que no hay intención vieja asociada al siguiente cliente. No borrar localStorage para "arreglar" una cola sin conciliar.

Cada ensayo registra inicio/fin, esperado/observado, captura o video, IDs de operación, filas y veredicto. Lo no ejecutado es NOT_TESTED/BLOCKED; no heredar PHYSICALLY_VERIFIED de una versión anterior. El revisor en nube no puede certificar estos equipos por localhost.
