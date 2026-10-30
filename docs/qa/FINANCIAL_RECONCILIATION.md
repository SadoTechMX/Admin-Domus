# Protocolo de conciliación de pruebas

Sólo fixtures en STAGING con identidad exacta y respaldo. Este documento no autoriza reparar históricos ni pagar a clientes/proveedores. No contiene saldos reales.

Antes de cada caso guardar valores, fórmulas y validaciones de filas afectadas, conteos y último folio. Después repetir la lectura y relacionar requestId → journal → ticket → receipt → comanda. En fallos parciales revisar todas las hojas, no sólo la respuesta de API. Conservar evidencias con acceso restringido y datos personales minimizados.

| ID | Fixture/acción | Igualdad o efecto que se debe demostrar |
|---|---|---|
| FIN-01 | Venta de 2 unidades a $40 de producto activo autorizado | Consumo $80; unidades y precio de fase servidor coinciden en CAJA/comanda/recibo. No inventar precios en cliente. |
| FIN-02 | Efectivo recibido $100, venta $80, propina $10 | Cambio $10; ingreso de venta, propina y recibido/cambio identificables sin sumar efectivo recibido como venta. |
| FIN-03 | Terminal 1 y Terminal 2 por separado | Venta $80; método/terminal correctos; comisión según acuerdo vigente; bruto, comisión y neto distinguidos. Confirmación del POS no demuestra conciliación bancaria. Cero cajón. |
| FIN-04 | Transferencia pendiente por $80 | Aplicado $0 hasta verificación explícita; deuda $80; ticket pendiente; sin bandera cliente que cierre deuda. La verificación definitiva permanece bloqueada hasta implementar/probar el flujo. |
| FIN-05 | Cuenta previa $60, nuevo consumo $40, abono confirmado $30 | Saldo $70 considerando toda la historia. Probar también pago situado después de filas 500 y 4500. |
| FIN-06 | Liquidar esos $70 sin productos nuevos | Saldo $0; no duplicar consumo ni generar comanda nueva por saldo; un comprobante del abono. |
| FIN-07 | Repetir mismo ID/payload/dispositivo | Mismo resultado/folio; no otra venta, cobro, comanda, consumo o impresión automática. Revisar filas, no sólo folio retornado. |
| FIN-08 | Mismo ID con payload o dispositivo distinto | Conflicto de idempotencia; cero efectos adicionales. Comparar también historial tras expirar caches. |
| FIN-09 | Pedido abierto/crédito autorizado | Comanda/consumo conforme contrato; ningún cobro ficticio; ningún aplicado hasta pago; inventario intacto antes de entrega. |
| FIN-10 | Entrega con receta aprobada de 50 ml, 2 unidades | Consumo 100 ml en unidad compatible. Fórmulas A:P, RECETAS CARTA e INSUMOS conservadas; stock inicial no supuesto. Repetir entrega no vuelve a consumir. |
| FIN-11 | Cancelar antes/después de entrega | Antes: sin consumo ni devolución ficticia. Después: no reponer físicamente por una bandera; registrar resolución autorizada y trazable. |
| FIN-12 | Boletera externa con guardarropa separado | Entrada cobrada en puerta $0; guardarropa usa tarifa del evento, incluso $0; valor comercial no se suma como efectivo recibido. |
| FIN-13 | Devolución autorizada parcial/total | Flujo pendiente de implementación/certificación: compensación nueva referenciada, original intacto, no exceder pagado y no duplicar al reintentar. No ejecutar reversas de Producción. |
| FIN-14 | Fixture Jujutsu $100, pagado y entregado | Reparto $30 DOMUS/$70 proveedor sólo para condiciones/periodo válidos. Excluir anulado/devuelto/no pagado/no entregado y restar pagos previos. No convertir conteo parcial en saldo por pagar. |
| FIN-15 | Transferencia interna de fondos | Salida/origen = entrada/destino; cero incremento artificial de ingreso/gasto consolidado; no duplicar con COBROS. |
| FIN-16 | Fallo tras escritura parcial y recuperación | Snapshot/journal muestran resultado único y completo o bloqueo explícito de revisión. Nunca éxito visual con datos parciales ni segunda intención creada automáticamente. |

Las cantidades son fixtures propuestos, no instrucciones para alterar catálogo ni bases reales. Seleccionar productos y eventos controlados y registrar su configuración vigente. Comparar importes con unidades monetarias y redondeo explícitos; diferencias de centavos se investigan, no se ocultan con tolerancias amplias.
