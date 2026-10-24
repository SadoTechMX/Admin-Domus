# ADR-004: Decremento de Inventario Estrictamente en Entrega Física

## Estado
**APROBADO** (2026-10-24)

## Contexto
En un bar/club nocturno de alto volumen, los pedidos capturados en caja pueden ser modificados o cancelados antes de su despacho en barra. Si el stock se descuenta en el momento de crear el ticket en caja, se producen discrepancias entre el inventario teórico y las botellas físicas en las barras.

## Decisión
El inventario de productos terminados e insumos se descuenta **únicamente cuando el personal de Barra o Cocina marca la comanda como "Entregado"** en la interfaz KDS.

## Consecuencias
* **Positivas:** Cero discrepancias por cancelaciones previas al despacho; control exacto de mermas físicas.
* **Negativas:** Requiere disciplina operativa en las estaciones de preparación para marcar la entrega física de cada orden.
