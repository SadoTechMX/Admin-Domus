# QA — DOMUS Economic OS v15

## Gate P0

Ningún release financiero pasa a producción si falla uno.

1. Venta efectivo.
2. Venta Mercado Pago.
3. Venta multi-producto.
4. Propina separada.
5. Cortesía.
6. Cancelación antes de entrega.
7. Entrega e impacto correcto en inventario.
8. Devolución con reversa.
9. Gasto de caja.
10. Retiro de caja no clasificado como gasto.
11. Fondo para compra y devolución de cambio.
12. CxP creada y pago parcial.
13. CxC creada y cobro sin nueva venta.
14. Reparto multi-beneficiario.
15. Artista con consignación.
16. Proyecto con costos e ingresos.
17. Cierre de día inmutable.
18. Ajuste posterior al cierre.
19. Apertura nuevo día en cero.
20. Offline/reconexión sin duplicado.
21. Reintento idempotente.
22. Reversa de cobro.
23. Comisión de terminal separada.
24. Dashboard muestra REAL/ESTIMADO correctamente.
25. Acceso/Forza no recibe escrituras por cambios de Caja/Finanzas.

## Invariantes

- Sum(allocations) <= net distributable amount.
- Ledger nunca borra entries.
- Reversal referencia entry original.
- COGS sólo nace de consumo/entrega válida.
- Cash expected = opening + cash inflows - cash outflows.
- Obligation balance = original - applied settlements.
- Closed day cannot accept normal sale mutations.
- Estimated metric never renders as real.
