# ADR-003: Exclusión Mutua Multi-Pestaña de Outbox con Web Locks API

## Estado
**APROBADO** (2026-10-24)

## Contexto
Un mutex implementado mediante `localStorage.getItem()` -> verificación -> `localStorage.setItem()` es susceptible a condiciones de carrera ("Time-of-Check to Time-of-Use" / TOCTOU), permitiendo que dos pestañas del navegador abiertas en la misma terminal crean haber adquirido el lock y sincronicen concurrentemente hacia Apps Script.

## Decisión
1. Adoptar la **Web Locks API** del W3C (`navigator.locks.request('domus-outbox-sync', { ifAvailable: true }, ...)`) como mecanismo de exclusión mutua primario.
2. Mantener un lease temporal en `localStorage` exclusivamente como fallback para navegadores antiguos.
3. Utilizar `BroadcastChannel` y eventos `storage` para coordinar en tiempo real la UI entre pestañas.

## Consecuencias
* **Positivas:** El navegador garantiza a nivel de proceso del sistema operativo que ninguna otra pestaña obtenga el lock hasta que la sincronización en curso termine o libere.
* **Negativas:** Web Locks API requiere contexto seguro (HTTPS), lo cual se cumple al 100% en GitHub Pages y localhost.
