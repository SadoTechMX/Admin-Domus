/**
 * ============================================================================
 * DOMUS OS · IDEMPOTENCY & CONCURRENCY CONTROL (Idempotency.gs)
 * Bloqueo atómico con LockService y deduplicación estricta por requestId
 * ============================================================================
 */

'use strict';

/**
 * Ejecuta una función dentro de una sección crítica protegida con LockService
 * Garantiza que dos peticiones simultáneas no colisionen ni corrompan el libro
 */
function withLock_(timeoutMs, fn) {
  const timeout = typeof timeoutMs === 'number' ? timeoutMs : (CONFIG.lockTimeoutMs || 30000);
  const lock = LockService.getScriptLock();
  
  let acquired = false;
  try {
    lock.waitLock(timeout);
    acquired = true;
    return fn();
  } catch (err) {
    if (!acquired) {
      throw new Error('El sistema se encuentra procesando otra transacción concurrente. Por favor reintenta en un momento.');
    }
    throw err;
  } finally {
    if (acquired) {
      try {
        lock.releaseLock();
      } catch (e) {
        console.warn('Error al liberar candado de Apps Script:', e);
      }
    }
  }
}

/**
 * Ejecuta una operación mutativa garantizando idempotencia estricta por requestId
 * Si una petición se reintenta 2, 5 o 10 veces por fallas de conexión,
 * se ejecuta exactamente UNA vez y los reintentos devuelven el mismo comprobante.
 */
function idempotentExecute_(requestId, fn) {
  if (!requestId || typeof requestId !== 'string') {
    // Si no se proporcionó requestId, ejecutar con candado directamente
    return withLock_(CONFIG.lockTimeoutMs, fn);
  }

  const cleanReqId = requestId.trim();
  const cacheKey = 'idemp:' + cleanReqId;
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();

  // 1. Verificar si la operación ya fue confirmada previamente
  const cachedJson = cache.get(cacheKey) || props.getProperty(cacheKey);
  if (cachedJson) {
    try {
      const record = JSON.parse(cachedJson);
      if (record && record.done) {
        console.log(`[IDEMPOTENCY] Solicitud duplicada detectada para requestId: ${cleanReqId}. Devolviendo resultado original.`);
        return record.result;
      }
    } catch (e) {
      console.warn('Error al parsear registro de idempotencia:', e);
    }
  }

  // 2. Ejecutar de forma atómica bajo candado de script
  return withLock_(CONFIG.lockTimeoutMs, () => {
    // Doble verificación dentro de la sección crítica
    const recheckJson = cache.get(cacheKey) || props.getProperty(cacheKey);
    if (recheckJson) {
      try {
        const record = JSON.parse(recheckJson);
        if (record && record.done) {
          return record.result;
        }
      } catch (e) {}
    }

    // Marcar como en proceso
    const inProgressToken = JSON.stringify({ done: false, startedAt: Date.now() });
    cache.put(cacheKey, inProgressToken, 120);

    // Ejecutar función de negocio
    const result = fn();

    // Guardar resultado final de forma duradera
    const finishedRecord = JSON.stringify({
      done: true,
      requestId: cleanReqId,
      result: result,
      completedAt: Date.now()
    });

    cache.put(cacheKey, finishedRecord, 21600); // 6 horas en cache rápido
    try {
      props.setProperty(cacheKey, finishedRecord);
    } catch (e) {}

    return result;
  });
}
