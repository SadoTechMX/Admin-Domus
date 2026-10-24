# ADR-001: Modularización de Backend en Google Apps Script

## Estado
**APROBADO** (2026-10-24)

## Contexto
El backend original residía en un archivo único monolítico de más de 6,400 líneas (`Code.gs`), mezclando lógica de POS, KDS, Taquilla, Inventarios, Accesos y autenticación. Esto causaba riesgo extremo de colisión de ediciones, lentitud de análisis para las IAs y dificultad para rastrear dependencias.

## Decisión
Dividir el backend en 11 archivos modulares independientes con responsabilidades estrictamente separadas:
`Config.gs`, `Auth.gs`, `Idempotency.gs`, `Api.gs`, `POS.gs`, `Accounts.gs`, `Payments.gs`, `KDS.gs`, `Access.gs`, `Inventory.gs`, `Events.gs`.

## Consecuencias
* **Positivas:** Reducción dramática del tamaño de contexto por tarea, separación clara de responsabilidades, capacidad de testear módulos aislados.
* **Negativas / Cuidados:** Todos los archivos en Apps Script comparten un scope global; las funciones auxiliares deben nombrarse con sufijo privado `_` para evitar colisiones.
