/**
 * ============================================================================
 * DOMUS OS · IDEMPOTENCY & CONCURRENCY CONTROL (Idempotency.gs)
 * Bloqueo atómico con LockService, vinculación estricta de payload y
 * Ledger transaccional persistente (REQUESTS / TRANSACCIONES_API).
 * ============================================================================
 */

'use strict';

/**
 * Estados del ciclo de vida de una solicitud transaccional
 */
const REQUEST_STATUS = Object.freeze({
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW'
});

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
 * Genera una representación canónica y determinista de un objeto (JSON con claves ordenadas)
 */
function canonicalJsonStringify_(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify_).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify_(obj[k]));
  return '{' + parts.join(',') + '}';
}

/**
 * Calcula un hash criptográfico SHA-256 determinista del contenido de la petición
 */
function computePayloadHash_(payload) {
  try {
    const canonicalStr = canonicalJsonStringify_(payload !== undefined ? payload : null);
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
      const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonicalStr, Utilities.Charset.UTF_8);
      let hashHex = '';
      for (let i = 0; i < rawHash.length; i++) {
        let b = rawHash[i];
        if (b < 0) b += 256;
        let s = b.toString(16);
        if (s.length === 1) s = '0' + s;
        hashHex += s;
      }
      return hashHex;
    }
    // Fallback simple para tests unitarios locales sin objeto Utilities
    let hash = 0;
    for (let i = 0; i < canonicalStr.length; i++) {
      hash = ((hash << 5) - hash) + canonicalStr.charCodeAt(i);
      hash |= 0;
    }
    return 'sha256-fallback-' + Math.abs(hash).toString(16);
  } catch (e) {
    return 'hash-error-' + Date.now();
  }
}

/**
 * Obtiene o crea la hoja de auditoría de peticiones (REQUESTS / TRANSACCIONES_API)
 */
function getOrCreateRequestsSheet_(spreadsheet) {
  try {
    const ss = spreadsheet || SpreadsheetApp.openById(CONFIG.mainSheetId);
    let sheet = ss.getSheetByName('REQUESTS') || ss.getSheetByName('TRANSACCIONES_API');
    if (!sheet) {
      sheet = ss.insertSheet('REQUESTS');
      const headers = [
        'REQUEST_ID', 'ACTION', 'PAYLOAD_HASH', 'DEVICE_ID',
        'STATUS', 'CREATED_AT', 'COMPLETED_AT', 'RESPONSE'
      ];
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  } catch (e) {
    console.warn('[IDEMPOTENCY] No se pudo acceder/crear hoja REQUESTS:', e);
    return null;
  }
}

/**
 * Busca un registro previo en las 3 capas:
 * 1) Cache rápida (ScriptCache)
 * 2) Almacén de ScriptProperties
 * 3) Hoja de cálculo REQUESTS
 */
function findRequestRecord_(cleanReqId, spreadsheet) {
  const cacheKey = 'idemp:' + cleanReqId;
  const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  const props = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;

  // 1. Cache rápida
  if (cache) {
    const cachedJson = cache.get(cacheKey);
    if (cachedJson) {
      try {
        return JSON.parse(cachedJson);
      } catch (e) {}
    }
  }

  // 2. ScriptProperties
  if (props) {
    const propJson = props.getProperty(cacheKey);
    if (propJson) {
      try {
        const record = JSON.parse(propJson);
        if (cache) cache.put(cacheKey, propJson, 21600);
        return record;
      } catch (e) {}
    }
  }

  // 3. Hoja REQUESTS
  try {
    const sheet = getOrCreateRequestsSheet_(spreadsheet);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const startRow = Math.max(2, lastRow - 200);
        const numRows = lastRow - startRow + 1;
        const rows = sheet.getRange(startRow, 1, numRows, 8).getValues();
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if (String(r[0]).trim() === cleanReqId) {
            let parsedResp = null;
            try { parsedResp = r[7] ? JSON.parse(r[7]) : null; } catch (e) { parsedResp = r[7]; }
            const record = {
              requestId: cleanReqId,
              action: String(r[1]),
              payloadHash: String(r[2]),
              deviceId: String(r[3]),
              status: String(r[4]),
              createdAt: r[5],
              completedAt: r[6],
              response: parsedResp,
              sheetRowIndex: startRow + i
            };
            if (cache) cache.put(cacheKey, JSON.stringify(record), 21600);
            return record;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[IDEMPOTENCY] Error al buscar en hoja REQUESTS:', e);
  }

  return null;
}

/**
 * Guarda o actualiza un registro en el ledger (Cache, Properties y Hoja REQUESTS)
 */
function saveRequestRecord_(record, spreadsheet) {
  const cleanReqId = record.requestId;
  const cacheKey = 'idemp:' + cleanReqId;
  const serialized = JSON.stringify(record);

  // 1. Cache rápida (6 horas)
  try {
    if (typeof CacheService !== 'undefined') {
      CacheService.getScriptCache().put(cacheKey, serialized, 21600);
    }
  } catch (e) {}

  // 2. ScriptProperties
  try {
    if (typeof PropertiesService !== 'undefined') {
      PropertiesService.getScriptProperties().setProperty(cacheKey, serialized);
    }
  } catch (e) {}

  // 3. Hoja REQUESTS
  try {
    const sheet = getOrCreateRequestsSheet_(spreadsheet);
    if (sheet) {
      const respStr = record.response !== undefined ? (typeof record.response === 'string' ? record.response : JSON.stringify(record.response)) : '';
      if (record.sheetRowIndex && record.sheetRowIndex > 1) {
        // Actualizar fila existente
        sheet.getRange(record.sheetRowIndex, 5, 1, 4).setValues([[
          record.status,
          record.createdAt || '',
          record.completedAt || '',
          respStr
        ]]);
      } else {
        // Nueva fila
        sheet.appendRow([
          record.requestId,
          record.action || '',
          record.payloadHash || '',
          record.deviceId || '',
          record.status,
          record.createdAt || new Date().toISOString(),
          record.completedAt || '',
          respStr
        ]);
        record.sheetRowIndex = sheet.getLastRow();
      }
    }
  } catch (e) {
    console.warn('[IDEMPOTENCY] Error al persistir en hoja REQUESTS:', e);
  }
}

/**
 * Ejecuta una operación mutativa garantizando:
 * 1. Deduplicación estricta por requestId
 * 2. Vinculación criptográfica de contenido (action + payloadHash + deviceId)
 * 3. Rechazo inmediato con 409 IDEMPOTENCY_KEY_REUSED si un requestId se reutiliza con distinto payload
 * 4. Registro continuo de estados: PROCESSING -> COMPLETED / FAILED / REQUIRES_REVIEW
 */
function idempotentExecute_(requestId, action, payload, deviceId, fn) {
  // Soporte retrocompatible si se llama como (requestId, fn)
  if (typeof action === 'function') {
    fn = action;
    action = 'MUTATION';
    payload = null;
    deviceId = '';
  }

  if (!requestId || typeof requestId !== 'string') {
    return withLock_(CONFIG.lockTimeoutMs, fn);
  }

  const cleanReqId = requestId.trim();
  const currentPayloadHash = computePayloadHash_({ action: action, payload: payload });
  const devId = String(deviceId || '');
  const actName = String(action || 'MUTATION');

  // 1. Verificación rápida antes de solicitar el lock
  const existingRecord = findRequestRecord_(cleanReqId);
  if (existingRecord) {
    // Si el requestId ya existe pero con distinto contenido/acción:
    if (existingRecord.payloadHash && existingRecord.payloadHash !== currentPayloadHash) {
      const err = new Error(`IDEMPOTENCY_KEY_REUSED: El requestId "${cleanReqId}" ya fue utilizado previamente con una acción o payload diferente.`);
      err.status = 409;
      err.code = 'IDEMPOTENCY_KEY_REUSED';
      throw err;
    }

    // Si ya completó exitosamente con el mismo payload exacto, devolver el resultado original
    if (existingRecord.status === REQUEST_STATUS.COMPLETED) {
      console.log(`[IDEMPOTENCY] Deduplicación exitosa para requestId: ${cleanReqId}. Devolviendo comprobante original.`);
      return existingRecord.response;
    }

    // Si está en revisión o falló permanentemente
    if (existingRecord.status === REQUEST_STATUS.REQUIRES_REVIEW) {
      const err = new Error(`IDEMPOTENCY_REQUIRES_REVIEW: La transacción con requestId "${cleanReqId}" se encuentra en revisión manual.`);
      err.status = 409;
      err.code = 'IDEMPOTENCY_REQUIRES_REVIEW';
      throw err;
    }
  }

  // 2. Ejecutar de forma atómica bajo candado de script
  return withLock_(CONFIG.lockTimeoutMs, () => {
    // Doble verificación dentro de la sección crítica
    const lockedRecord = findRequestRecord_(cleanReqId);
    if (lockedRecord) {
      if (lockedRecord.payloadHash && lockedRecord.payloadHash !== currentPayloadHash) {
        const err = new Error(`IDEMPOTENCY_KEY_REUSED: El requestId "${cleanReqId}" ya fue utilizado previamente con una acción o payload diferente.`);
        err.status = 409;
        err.code = 'IDEMPOTENCY_KEY_REUSED';
        throw err;
      }
      if (lockedRecord.status === REQUEST_STATUS.COMPLETED) {
        return lockedRecord.response;
      }
      if (lockedRecord.status === REQUEST_STATUS.REQUIRES_REVIEW) {
        const err = new Error(`IDEMPOTENCY_REQUIRES_REVIEW: La transacción con requestId "${cleanReqId}" se encuentra en revisión manual.`);
        err.status = 409;
        err.code = 'IDEMPOTENCY_REQUIRES_REVIEW';
        throw err;
      }
    }

    // Registrar inicio en estado PROCESSING
    const record = lockedRecord || {
      requestId: cleanReqId,
      action: actName,
      payloadHash: currentPayloadHash,
      deviceId: devId,
      status: REQUEST_STATUS.PROCESSING,
      createdAt: new Date().toISOString(),
      completedAt: '',
      response: null
    };
    record.status = REQUEST_STATUS.PROCESSING;
    saveRequestRecord_(record);

    let result;
    try {
      result = fn();
      
      // Marcar como COMPLETED
      record.status = REQUEST_STATUS.COMPLETED;
      record.completedAt = new Date().toISOString();
      record.response = result;
      saveRequestRecord_(record);
      
      return result;
    } catch (err) {
      // Marcar como FAILED
      record.status = REQUEST_STATUS.FAILED;
      record.completedAt = new Date().toISOString();
      record.response = { error: err.message || String(err) };
      saveRequestRecord_(record);
      throw err;
    }
  });
}
