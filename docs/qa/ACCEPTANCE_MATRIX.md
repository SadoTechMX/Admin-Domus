# Matriz de aceptación funcional — DOMUS OS

**NO-GO. 287 escenarios pendientes para el candidato; no son 287 pruebas ejecutadas.**

Cada fila requiere valores/fixture, pasos, build y evidencia propios. Los criterios de módulo están en `acceptance_cases.json` y en el protocolo de revisión. Los resultados históricos no se trasladaron al candidato.

| ID | Módulo | Escenario | Estado actual |
|---|---|---|---|
| REQ-001 | CAJA | Abrir caja | NOT_TESTED |
| REQ-002 | CAJA | Carga inicial | NOT_TESTED |
| REQ-003 | CAJA | Categorías | NOT_TESTED |
| REQ-004 | CAJA | Buscar producto | NOT_TESTED |
| REQ-005 | CAJA | Agregar producto | NOT_TESTED |
| REQ-006 | CAJA | Agregar varios | NOT_TESTED |
| REQ-007 | CAJA | Misma referencia varias veces | NOT_TESTED |
| REQ-008 | CAJA | Modificar cantidad | NOT_TESTED |
| REQ-009 | CAJA | Disminuir cantidad | NOT_TESTED |
| REQ-010 | CAJA | Eliminar línea | NOT_TESTED |
| REQ-011 | CAJA | Nota de producto | NOT_TESTED |
| REQ-012 | CAJA | Producto Barra | NOT_TESTED |
| REQ-013 | CAJA | Producto Cocina | NOT_TESTED |
| REQ-014 | CAJA | Producto propio DOMUS | NOT_TESTED |
| REQ-015 | CAJA | Producto consignado | NOT_TESTED |
| REQ-016 | CAJA | Producto reparto | NOT_TESTED |
| REQ-017 | CAJA | Producto deshabilitado | NOT_TESTED |
| REQ-018 | CAJA | Producto sin precio | NOT_TESTED |
| REQ-019 | CAJA | Producto precio cero | NOT_TESTED |
| REQ-020 | CAJA | Producto no disponible | NOT_TESTED |
| REQ-021 | CAJA | Producto caracteres especiales | NOT_TESTED |
| REQ-022 | CAJA | Cuenta nueva | NOT_TESTED |
| REQ-023 | CAJA | Cuenta existente | NOT_TESTED |
| REQ-024 | CAJA | Cambiar de cuenta | NOT_TESTED |
| REQ-025 | CAJA | Cerrar modal | NOT_TESTED |
| REQ-026 | CAJA | Reabrir modal | NOT_TESTED |
| REQ-027 | CAJA | Refresh | NOT_TESTED |
| REQ-028 | CAJA | Volver atrás | NOT_TESTED |
| REQ-029 | COBRO | Efectivo exacto | NOT_TESTED |
| REQ-030 | COBRO | Efectivo mayor y cambio | NOT_TESTED |
| REQ-031 | COBRO | Efectivo menor | NOT_TESTED |
| REQ-032 | COBRO | Efectivo vacío | NOT_TESTED |
| REQ-033 | COBRO | Propina cero | NOT_TESTED |
| REQ-034 | COBRO | Propina positiva | NOT_TESTED |
| REQ-035 | COBRO | Propina negativa | NOT_TESTED |
| REQ-036 | COBRO | Terminal 1 | NOT_TESTED |
| REQ-037 | COBRO | Terminal 2 | NOT_TESTED |
| REQ-038 | COBRO | Transferencia pendiente | NOT_TESTED |
| REQ-039 | COBRO | Otros medios existentes | NOT_TESTED |
| REQ-040 | COBRO | Medio inválido | NOT_TESTED |
| REQ-041 | COBRO | Doble clic | NOT_TESTED |
| REQ-042 | COBRO | Pulsaciones repetidas | NOT_TESTED |
| REQ-043 | COBRO | Refresh durante cobro | NOT_TESTED |
| REQ-044 | COBRO | Timeout | NOT_TESTED |
| REQ-045 | COBRO | Backend lento | NOT_TESTED |
| REQ-046 | COBRO | Retry | NOT_TESTED |
| REQ-047 | COBRO | Respuesta perdida | NOT_TESTED |
| REQ-048 | COBRO | Segunda pestaña | NOT_TESTED |
| REQ-049 | REQUESTS / OUTBOX | Mismo requestId dos veces | NOT_TESTED |
| REQ-050 | REQUESTS / OUTBOX | Mismo ID payload diferente | NOT_TESTED |
| REQ-051 | REQUESTS / OUTBOX | Mismo ID después de refresh | NOT_TESTED |
| REQ-052 | REQUESTS / OUTBOX | Mismo ID desde Outbox | NOT_TESTED |
| REQ-053 | REQUESTS / OUTBOX | Dos pestañas Outbox | NOT_TESTED |
| REQ-054 | REQUESTS / OUTBOX | Timeout cliente tras éxito backend | NOT_TESTED |
| REQ-055 | REQUESTS / OUTBOX | Respuesta perdida real | NOT_TESTED |
| REQ-056 | REQUESTS / OUTBOX | Una operación financiera | NOT_TESTED |
| REQ-057 | REQUESTS / OUTBOX | Una fila lógica REQUESTS | NOT_TESTED |
| REQ-058 | REQUESTS / OUTBOX | Persistir antes de enviar | NOT_TESTED |
| REQ-059 | REQUESTS / OUTBOX | Limpiar cola con pendientes | NOT_TESTED |
| REQ-060 | CUENTAS | Crear cuenta | NOT_TESTED |
| REQ-061 | CUENTAS | Agregar consumo | NOT_TESTED |
| REQ-062 | CUENTAS | Agregar otro consumo posteriormente | NOT_TESTED |
| REQ-063 | CUENTAS | Varios productos | NOT_TESTED |
| REQ-064 | CUENTAS | Cobrar saldo existente | NOT_TESTED |
| REQ-065 | CUENTAS | Reabrir cuenta | NOT_TESTED |
| REQ-066 | CUENTAS | Cuenta pagada no vuelve a deuda | NOT_TESTED |
| REQ-067 | CUENTAS | Intentar cobrar de nuevo | NOT_TESTED |
| REQ-068 | CUENTAS | Buscar cliente | NOT_TESTED |
| REQ-069 | CUENTAS | Cambiar cliente | NOT_TESTED |
| REQ-070 | CUENTAS | Cuenta sin nombre | NOT_TESTED |
| REQ-071 | CUENTAS | Caracteres especiales cliente | NOT_TESTED |
| REQ-072 | CUENTAS | Cuenta abandonada | NOT_TESTED |
| REQ-073 | CUENTAS | Cuenta sin saldo | NOT_TESTED |
| REQ-074 | CUENTAS | Pago después de fila 500 | NOT_TESTED |
| REQ-075 | CUENTAS | Pago después de fila 4500 | NOT_TESTED |
| REQ-076 | CUENTAS | Cuenta histórica pagada A (referencia privada) | NOT_TESTED |
| REQ-077 | CUENTAS | Cuenta histórica pagada B (referencia privada) | NOT_TESTED |
| REQ-078 | COMANDAS / KDS | Pedido Barra | NOT_TESTED |
| REQ-079 | COMANDAS / KDS | Pedido Cocina | NOT_TESTED |
| REQ-080 | COMANDAS / KDS | Pedido mixto | NOT_TESTED |
| REQ-081 | COMANDAS / KDS | Varios productos | NOT_TESTED |
| REQ-082 | COMANDAS / KDS | Llegada COMANDAS | NOT_TESTED |
| REQ-083 | COMANDAS / KDS | TOMAR | NOT_TESTED |
| REQ-084 | COMANDAS / KDS | EN PREPARACIÓN | NOT_TESTED |
| REQ-085 | COMANDAS / KDS | LISTO | NOT_TESTED |
| REQ-086 | COMANDAS / KDS | ENTREGAR | NOT_TESTED |
| REQ-087 | COMANDAS / KDS | CANCELAR | NOT_TESTED |
| REQ-088 | COMANDAS / KDS | Doble clic | NOT_TESTED |
| REQ-089 | COMANDAS / KDS | Dos operadores | NOT_TESTED |
| REQ-090 | COMANDAS / KDS | Estado inválido | NOT_TESTED |
| REQ-091 | COMANDAS / KDS | LISTO dos veces | NOT_TESTED |
| REQ-092 | COMANDAS / KDS | ENTREGAR dos veces | NOT_TESTED |
| REQ-093 | COMANDAS / KDS | Cancelar después de LISTO | NOT_TESTED |
| REQ-094 | COMANDAS / KDS | Refresh | NOT_TESTED |
| REQ-095 | COMANDAS / KDS | Retry | NOT_TESTED |
| REQ-096 | COMANDAS / KDS | Timeout | NOT_TESTED |
| REQ-097 | COMANDAS / KDS | Salir y volver | NOT_TESTED |
| REQ-098 | COMANDAS / KDS | Payload legacy token/body | NOT_TESTED |
| REQ-099 | COMANDAS / KDS | Payload objeto body | NOT_TESTED |
| REQ-100 | COMANDAS / KDS | Lock anidado | NOT_TESTED |
| REQ-101 | COMANDAS / KDS | Caja y KDS concurrentes | NOT_TESTED |
| REQ-102 | COMANDAS / KDS | Caja y Acceso concurrentes | NOT_TESTED |
| REQ-103 | COMANDAS / KDS | Dos IDs diferentes concurrentes | NOT_TESTED |
| REQ-104 | COMANDAS / KDS | Mismo ID concurrente | NOT_TESTED |
| REQ-105 | COMANDAS / KDS | P95 Caja a KDS | NOT_TESTED |
| REQ-106 | ACCESO | Pantalla completa | NOT_TESTED |
| REQ-107 | ACCESO | Registro individual | NOT_TESTED |
| REQ-108 | ACCESO | Cantidad personas | NOT_TESTED |
| REQ-109 | ACCESO | Tarifa oficial | NOT_TESTED |
| REQ-110 | ACCESO | Guardarropa | NOT_TESTED |
| REQ-111 | ACCESO | Prendas múltiples | NOT_TESTED |
| REQ-112 | ACCESO | Método de pago | NOT_TESTED |
| REQ-113 | ACCESO | Confirmación | NOT_TESTED |
| REQ-114 | ACCESO | Folio | NOT_TESTED |
| REQ-115 | ACCESO | Búsqueda | NOT_TESTED |
| REQ-116 | ACCESO | Duplicado QR | NOT_TESTED |
| REQ-117 | ACCESO | Doble clic | NOT_TESTED |
| REQ-118 | ACCESO | Retry | NOT_TESTED |
| REQ-119 | ACCESO | Refresh | NOT_TESTED |
| REQ-120 | ACCESO | Acceso ya registrado | NOT_TESTED |
| REQ-121 | ACCESO | Reingreso | BLOCKED |
| REQ-122 | ACCESO | Salida | BLOCKED |
| REQ-123 | ACCESO | Aforo real | BLOCKED |
| REQ-124 | ACCESO | Conteo acumulado | NOT_TESTED |
| REQ-125 | ACCESO | Guardarropa devolver una vez | NOT_TESTED |
| REQ-126 | ACCESO | Guardarropa doble devolución | NOT_TESTED |
| REQ-127 | ACCESO | Taquilla DOMUS | NOT_TESTED |
| REQ-128 | ACCESO | Preventa DOMUS | NOT_TESTED |
| REQ-129 | ACCESO | Boletera externa | NOT_TESTED |
| REQ-130 | ACCESO | Lista | NOT_TESTED |
| REQ-131 | ACCESO | Cortesía autorizada | NOT_TESTED |
| REQ-132 | ACCESO | Transferencia pendiente | NOT_TESTED |
| REQ-133 | ACCESO | Verificación explícita | BLOCKED |
| REQ-134 | ACCESO | Editar acceso | NOT_TESTED |
| REQ-135 | ACCESO | Eliminar acceso | NOT_TESTED |
| REQ-136 | ACCESO | Nuevo evento | NOT_TESTED |
| REQ-137 | ACCESO | Cambiar evento | NOT_TESTED |
| REQ-138 | ACCESO | Lectura de acceso posterior a 500 | NOT_TESTED |
| REQ-139 | TICKETS / PRINT BRIDGE | Efectivo ticket y cajón | NOT_TESTED |
| REQ-140 | TICKETS / PRINT BRIDGE | Terminal 1 ticket sin cajón | NOT_TESTED |
| REQ-141 | TICKETS / PRINT BRIDGE | Terminal 2 ticket sin cajón | NOT_TESTED |
| REQ-142 | TICKETS / PRINT BRIDGE | Transferencia ticket sin cajón | NOT_TESTED |
| REQ-143 | TICKETS / PRINT BRIDGE | Pendiente de verificación en ticket | NOT_TESTED |
| REQ-144 | TICKETS / PRINT BRIDGE | 127.0.0.1:17321 real iMac | NOT_TESTED |
| REQ-145 | TICKETS / PRINT BRIDGE | Impresora DOMUS_TICKETS real | NOT_TESTED |
| REQ-146 | TICKETS / PRINT BRIDGE | Token no hardcodeado | NOT_TESTED |
| REQ-147 | TICKETS / PRINT BRIDGE | Sin DEFAULT_PRINT_TOKEN | NOT_TESTED |
| REQ-148 | TICKETS / PRINT BRIDGE | CORS restringido | NOT_TESTED |
| REQ-149 | TICKETS / PRINT BRIDGE | Máximo 64 KB | NOT_TESTED |
| REQ-150 | TICKETS / PRINT BRIDGE | shell no activado | NOT_TESTED |
| REQ-151 | TICKETS / PRINT BRIDGE | Nombre de impresora fijo | NOT_TESTED |
| REQ-152 | TICKETS / PRINT BRIDGE | Sin comandos arbitrarios | NOT_TESTED |
| REQ-153 | TICKETS / PRINT BRIDGE | Sin paths arbitrarios | NOT_TESTED |
| REQ-154 | TICKETS / PRINT BRIDGE | Texto sin ESC/POS arbitrario | NOT_TESTED |
| REQ-155 | TICKETS / PRINT BRIDGE | Idempotencia printId | NOT_TESTED |
| REQ-156 | TICKETS / PRINT BRIDGE | Reprint explícito | NOT_TESTED |
| REQ-157 | TICKETS / PRINT BRIDGE | Logs sin token | NOT_TESTED |
| REQ-158 | TICKETS / PRINT BRIDGE | Semántica QUEUED | NOT_TESTED |
| REQ-159 | TICKETS / PRINT BRIDGE | No certificar impresión por lp exit 0 | NOT_TESTED |
| REQ-160 | CASH DRAWER | Confirmación humana EPOS NOW m=0 | NOT_TESTED |
| REQ-161 | CASH DRAWER | Bytes 1B 70 00 19 FA | NOT_TESTED |
| REQ-162 | CASH DRAWER | Autoabrir efectivo confirmado con recibo | NOT_TESTED |
| REQ-163 | CASH DRAWER | No abrir Terminal 1 | NOT_TESTED |
| REQ-164 | CASH DRAWER | No abrir Terminal 2 | NOT_TESTED |
| REQ-165 | CASH DRAWER | No abrir Transferencia | NOT_TESTED |
| REQ-166 | CASH DRAWER | No abrir Cortesía | NOT_TESTED |
| REQ-167 | CASH DRAWER | No abrir Crédito | NOT_TESTED |
| REQ-168 | CASH DRAWER | No abrir cuenta abierta | NOT_TESTED |
| REQ-169 | CASH DRAWER | No abrir reimpresión | NOT_TESTED |
| REQ-170 | CASH DRAWER | Botón manual operador | NOT_TESTED |
| REQ-171 | CASH DRAWER | Botón manual confirmación | NOT_TESTED |
| REQ-172 | CASH DRAWER | Botón manual requestId único | NOT_TESTED |
| REQ-173 | CASH DRAWER | Botón manual cooldown | NOT_TESTED |
| REQ-174 | CASH DRAWER | Botón manual auditoría | NOT_TESTED |
| REQ-175 | INVENTARIO / RECETAS | Esquema A:P 16 columnas | NOT_TESTED |
| REQ-176 | INVENTARIO / RECETAS | Auditar todos los writes | NOT_TESTED |
| REQ-177 | INVENTARIO / RECETAS | Alta producto | NOT_TESTED |
| REQ-178 | INVENTARIO / RECETAS | Sincronizar catálogo | NOT_TESTED |
| REQ-179 | INVENTARIO / RECETAS | Existencia inicial | NOT_TESTED |
| REQ-180 | INVENTARIO / RECETAS | Entrada | NOT_TESTED |
| REQ-181 | INVENTARIO / RECETAS | Venta | NOT_TESTED |
| REQ-182 | INVENTARIO / RECETAS | Comanda | NOT_TESTED |
| REQ-183 | INVENTARIO / RECETAS | Entrega | NOT_TESTED |
| REQ-184 | INVENTARIO / RECETAS | Consumo de receta | NOT_TESTED |
| REQ-185 | INVENTARIO / RECETAS | Merma | NOT_TESTED |
| REQ-186 | INVENTARIO / RECETAS | Cancelación | NOT_TESTED |
| REQ-187 | INVENTARIO / RECETAS | Conteo físico | NOT_TESTED |
| REQ-188 | INVENTARIO / RECETAS | Diferencia | NOT_TESTED |
| REQ-189 | INVENTARIO / RECETAS | Producto agotado | NOT_TESTED |
| REQ-190 | INVENTARIO / RECETAS | Cantidad negativa | NOT_TESTED |
| REQ-191 | INVENTARIO / RECETAS | No consumo al carrito | NOT_TESTED |
| REQ-192 | INVENTARIO / RECETAS | No consumo al abrir cuenta | NOT_TESTED |
| REQ-193 | INVENTARIO / RECETAS | No consumo al cobrar antes de entrega | NOT_TESTED |
| REQ-194 | INVENTARIO / RECETAS | Cancelación antes de entregar | NOT_TESTED |
| REQ-195 | INVENTARIO / RECETAS | Cancelación después de entregar | NOT_TESTED |
| REQ-196 | INVENTARIO / RECETAS | Producto sin receta | NOT_TESTED |
| REQ-197 | INVENTARIO / RECETAS | Insumo insuficiente | NOT_TESTED |
| REQ-198 | PROVEEDORES | Jujutsu-shi precio 100 | NOT_TESTED |
| REQ-199 | PROVEEDORES | DOMUS 30 proveedor 70 | NOT_TESTED |
| REQ-200 | PROVEEDORES | Solo pagadas | NOT_TESTED |
| REQ-201 | PROVEEDORES | Solo entregadas | NOT_TESTED |
| REQ-202 | PROVEEDORES | Excluir anuladas | NOT_TESTED |
| REQ-203 | PROVEEDORES | Excluir devueltas | NOT_TESTED |
| REQ-204 | PROVEEDORES | LIQUIDAR contra CAJA 2 | NOT_TESTED |
| REQ-205 | PROVEEDORES | LIQUIDAR contra COBROS | NOT_TESTED |
| REQ-206 | PROVEEDORES | LIQUIDAR contra DEVOLUCIONES | NOT_TESTED |
| REQ-207 | PROVEEDORES | LIQUIDAR contra MOVIMIENTOS | NOT_TESTED |
| REQ-208 | PROVEEDORES | Canna Treats | NOT_TESTED |
| REQ-209 | PROVEEDORES | Onírica | NOT_TESTED |
| REQ-210 | PROVEEDORES | Felssloschen | NOT_TESTED |
| REQ-211 | PROVEEDORES | Otros proveedores activos | NOT_TESTED |
| REQ-212 | PROVEEDORES | No pagar | NOT_TESTED |
| REQ-213 | DEVOLUCIONES | Parcial | BLOCKED |
| REQ-214 | DEVOLUCIONES | Total | BLOCKED |
| REQ-215 | DEVOLUCIONES | Doble devolución | BLOCKED |
| REQ-216 | DEVOLUCIONES | Más de lo pagado | BLOCKED |
| REQ-217 | DEVOLUCIONES | Cuenta ya devuelta | BLOCKED |
| REQ-218 | DEVOLUCIONES | Venta anulada | BLOCKED |
| REQ-219 | DEVOLUCIONES | Cancelar pedido no devuelve dinero | BLOCKED |
| REQ-220 | DEVOLUCIONES | Preservar cobro original | BLOCKED |
| REQ-221 | DEVOLUCIONES | Trazabilidad de devolución | BLOCKED |
| REQ-222 | MOVIMIENTOS / FINANZAS | Ingreso | NOT_TESTED |
| REQ-223 | MOVIMIENTOS / FINANZAS | Gasto | NOT_TESTED |
| REQ-224 | MOVIMIENTOS / FINANZAS | Pago pendiente | NOT_TESTED |
| REQ-225 | MOVIMIENTOS / FINANZAS | Liquidación semana | NOT_TESTED |
| REQ-226 | MOVIMIENTOS / FINANZAS | Transferencia entre cuentas | NOT_TESTED |
| REQ-227 | MOVIMIENTOS / FINANZAS | Fondo de compra | NOT_TESTED |
| REQ-228 | MOVIMIENTOS / FINANZAS | Gasto de fondo | NOT_TESTED |
| REQ-229 | MOVIMIENTOS / FINANZAS | Devolución de fondo | NOT_TESTED |
| REQ-230 | MOVIMIENTOS / FINANZAS | Validaciones | NOT_TESTED |
| REQ-231 | MOVIMIENTOS / FINANZAS | Cuenta origen | NOT_TESTED |
| REQ-232 | MOVIMIENTOS / FINANZAS | Cuenta destino | NOT_TESTED |
| REQ-233 | MOVIMIENTOS / FINANZAS | Importe aplicado | NOT_TESTED |
| REQ-234 | MOVIMIENTOS / FINANZAS | No doble conteo venta y transferencia | NOT_TESTED |
| REQ-235 | RECOVERY / AUTH / UI | Backend offline | NOT_TESTED |
| REQ-236 | RECOVERY / AUTH / UI | Internet lento controlado | NOT_TESTED |
| REQ-237 | RECOVERY / AUTH / UI | Timeout real | NOT_TESTED |
| REQ-238 | RECOVERY / AUTH / UI | Respuesta 500 | NOT_TESTED |
| REQ-239 | RECOVERY / AUTH / UI | Refresh | NOT_TESTED |
| REQ-240 | RECOVERY / AUTH / UI | Cerrar pestaña | NOT_TESTED |
| REQ-241 | RECOVERY / AUTH / UI | Reabrir navegador | NOT_TESTED |
| REQ-242 | RECOVERY / AUTH / UI | Outbox pendiente | NOT_TESTED |
| REQ-243 | RECOVERY / AUTH / UI | Bridge offline | NOT_TESTED |
| REQ-244 | RECOVERY / AUTH / UI | Impresora offline | NOT_TESTED |
| REQ-245 | RECOVERY / AUTH / UI | KDS offline | NOT_TESTED |
| REQ-246 | RECOVERY / AUTH / UI | Reconexión | NOT_TESTED |
| REQ-247 | RECOVERY / AUTH / UI | Backend confirmó, no duplicar después | NOT_TESTED |
| REQ-248 | RECOVERY / AUTH / UI | Sin sesión | NOT_TESTED |
| REQ-249 | RECOVERY / AUTH / UI | Sesión válida | NOT_TESTED |
| REQ-250 | RECOVERY / AUTH / UI | Sesión inválida | NOT_TESTED |
| REQ-251 | RECOVERY / AUTH / UI | Sesión expirada real | NOT_TESTED |
| REQ-252 | RECOVERY / AUTH / UI | Refresh de sesión | NOT_TESTED |
| REQ-253 | RECOVERY / AUTH / UI | Segunda pestaña sesión | NOT_TESTED |
| REQ-254 | RECOVERY / AUTH / UI | Cerrar y reabrir sesión | NOT_TESTED |
| REQ-255 | RECOVERY / AUTH / UI | Native dispatch | NOT_TESTED |
| REQ-256 | RECOVERY / AUTH / UI | Auth antes de native dispatch | NOT_TESTED |
| REQ-257 | RECOVERY / AUTH / UI | Carga inicial Caja | NOT_TESTED |
| REQ-258 | RECOVERY / AUTH / UI | Carga inicial Comandas | NOT_TESTED |
| REQ-259 | RECOVERY / AUTH / UI | Carga inicial Acceso | NOT_TESTED |
| REQ-260 | RECOVERY / AUTH / UI | Feedback de operación | NOT_TESTED |
| REQ-261 | RECOVERY / AUTH / UI | Botón bloqueado durante proceso | NOT_TESTED |
| REQ-262 | RECOVERY / AUTH / UI | No doble cobro | NOT_TESTED |
| REQ-263 | RECOVERY / AUTH / UI | Escoger método | NOT_TESTED |
| REQ-264 | RECOVERY / AUTH / UI | Error claro | NOT_TESTED |
| REQ-265 | RECOVERY / AUTH / UI | Recuperación bajo presión | NOT_TESTED |
| REQ-266 | RECOVERY / AUTH / UI | Desktop iMac | NOT_TESTED |
| REQ-267 | RECOVERY / AUTH / UI | Laptop | NOT_TESTED |
| REQ-268 | RECOVERY / AUTH / UI | Móvil | NOT_TESTED |
| REQ-269 | DESPLIEGUE / SEGURIDAD | HEAD main | NOT_TESTED |
| REQ-270 | DESPLIEGUE / SEGURIDAD | HEAD hotfix | NOT_TESTED |
| REQ-271 | DESPLIEGUE / SEGURIDAD | Pages index.html | NOT_TESTED |
| REQ-272 | DESPLIEGUE / SEGURIDAD | Pages js/app.js | NOT_TESTED |
| REQ-273 | DESPLIEGUE / SEGURIDAD | Apps Script versión desplegada | NOT_TESTED |
| REQ-274 | DESPLIEGUE / SEGURIDAD | UI version | NOT_TESTED |
| REQ-275 | DESPLIEGUE / SEGURIDAD | Cache bust | NOT_TESTED |
| REQ-276 | DESPLIEGUE / SEGURIDAD | RequestId | NOT_TESTED |
| REQ-277 | DESPLIEGUE / SEGURIDAD | Outbox | NOT_TESTED |
| REQ-278 | DESPLIEGUE / SEGURIDAD | Native transport | NOT_TESTED |
| REQ-279 | DESPLIEGUE / SEGURIDAD | KDS | NOT_TESTED |
| REQ-280 | DESPLIEGUE / SEGURIDAD | Transferencia | NOT_TESTED |
| REQ-281 | DESPLIEGUE / SEGURIDAD | Print Bridge | NOT_TESTED |
| REQ-282 | DESPLIEGUE / SEGURIDAD | Cajón | NOT_TESTED |
| REQ-283 | DESPLIEGUE / SEGURIDAD | Endpoint producción | NOT_TESTED |
| REQ-284 | DESPLIEGUE / SEGURIDAD | Auth | NOT_TESTED |
| REQ-285 | DESPLIEGUE / SEGURIDAD | Sin STAGING_BUNDLE en producción | NOT_TESTED |
| REQ-286 | DESPLIEGUE / SEGURIDAD | Smoke final producción UI | NOT_TESTED |
| REQ-287 | DESPLIEGUE / SEGURIDAD | Cobros recientes >4500 visibles en app | NOT_TESTED |
