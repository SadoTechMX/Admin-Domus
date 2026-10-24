# ADR-002: Control de Concurrencia con LockService e Idempotencia con Payload Binding

## Estado
**APROBADO** (2026-10-24)

## Contexto
Google Sheets no ofrece aislamiento transaccional ACID nativo; múltiples peticiones concurrentes pueden leer las mismas celdas y sobrescribir cobros o folios. Además, reintentos de red automáticos pueden duplicar cargos si un cliente retransmite con el mismo ID pero con un contenido modificado.

## Decisión
1. Proteger todas las operaciones mutativas con `LockService.getScriptLock()` con timeout de 30 segundos (`withLock_`).
2. Vincular cada `requestId` criptográficamente con `action + payloadHash + deviceId` usando SHA-256 canónico.
3. Si un `requestId` reaparece con el mismo payload, se devuelve el comprobante anterior. Si el payload difiere, se rechaza inmediatamente con `409 Conflict: IDEMPOTENCY_KEY_REUSED`.
4. Persistir los estados (`PROCESSING`, `COMPLETED`, `FAILED`, `REQUIRES_REVIEW`) en una hoja dedicada `REQUESTS`.

## Consecuencias
* **Positivas:** Cero duplicación de transacciones ante cortes de red; protección total contra colisión de escrituras.
* **Negativas:** La contención de locks puede aumentar la latencia si la concurrencia es muy elevada. Mitigado por lecturas en cache de <5ms antes de pedir el lock.
