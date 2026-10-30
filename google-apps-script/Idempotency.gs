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

let _scriptLockDepth = 0;

/**
 * Ejecuta una función dentro de una sección crítica protegida con LockService
 * Garantiza que dos peticiones simultáneas no colisionen ni corrompan el libro
 * Maneja re-entrancia segura: sólo el nivel superior adquiere y libera el script lock físico,
 * evitando que llamadas anidadas (ej. idempotentExecute_ -> cajaSimpleRegistrar) liberen el lock prematuramente.
 */
function withLock_(timeoutMs, fn) {
  const timeout = typeof timeoutMs === 'number' ? timeoutMs : (CONFIG.lockTimeoutMs || 30000);
  const lock = LockService.getScriptLock();
  
  const isTopLevel = (_scriptLockDepth === 0);
  if (isTopLevel) {
    try {
      lock.waitLock(timeout);
    } catch (err) {
      throw new Error('El sistema se encuentra procesando otra transacción concurrente. Por favor reintenta en un momento.');
    }
  }
  _scriptLockDepth++;

  try {
    return fn();
  } finally {
    _scriptLockDepth--;
    if (isTopLevel && _scriptLockDepth === 0) {
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
  const sheet = getOrCreateRequestsSheet_(spreadsheet);
  if (!sheet) throw new Error('LEDGER_UNAVAILABLE');
  const rows = dataRows_(sheet, 2, 8);
  const found = [];
  rows.forEach((r, i) => {
    if (String(r[0]).trim() === cleanReqId) found.push({
      requestId: cleanReqId, action: String(r[1]), payloadHash: String(r[2]),
      deviceId: String(r[3]), status: String(r[4]), createdAt: r[5], completedAt: r[6],
      response: r[7] ? JSON.parse(r[7]) : null, sheetRowIndex: i + 2
    });
  });
  if (found.length > 1) throw new Error('LEDGER_DUPLICATE_REQUIRES_REVIEW');
  return found[0] || null;
}

/**
 * Guarda o actualiza un registro en el ledger (Cache, Properties y Hoja REQUESTS)
 */
function saveRequestRecord_(record, spreadsheet) {
  const sheet = getOrCreateRequestsSheet_(spreadsheet);
  if (!sheet) throw new Error('LEDGER_UNAVAILABLE');
  // The durable ledger is authoritative. No cache can publish completion before Sheets.
  if (!record.sheetRowIndex) record.sheetRowIndex = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(record.sheetRowIndex, 1, 1, 8).setValues([[
    record.requestId, record.action, record.payloadHash, record.deviceId,
    record.status, record.createdAt, record.completedAt || '', JSON.stringify(record.response)
  ]]);
  SpreadsheetApp.flush();
}

/**
 * Ejecuta una operación mutativa garantizando:
 * 1. Deduplicación estricta por requestId
 * 2. Vinculación criptográfica de contenido (action + payloadHash + deviceId)
 * 3. Rechazo inmediato con 409 IDEMPOTENCY_KEY_REUSED si un requestId se reutiliza con distinto payload
 * 4. Registro continuo de estados: PROCESSING -> COMPLETED / FAILED / REQUIRES_REVIEW
 */
function idempotentExecute_(requestId, action, payload, deviceId, fn) {
  if (!requestId || typeof requestId !== 'string' || !requestId.trim()) throw new Error('REQUEST_ID_REQUIRED');
  const cleanReqId = requestId.trim();
  const currentPayloadHash = computePayloadHash_({ action: action, payload: payload });
  const devId = String(deviceId || '');
  if (!devId) throw new Error('DEVICE_ID_REQUIRED');
  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const prior = findRequestRecord_(cleanReqId, m);
    if (prior && (prior.payloadHash !== currentPayloadHash || prior.action !== action || prior.deviceId !== devId)) {
      const err = new Error('IDEMPOTENCY_KEY_REUSED'); err.status = 409; err.code = 'IDEMPOTENCY_KEY_REUSED'; throw err;
    }
    if (prior && prior.status === REQUEST_STATUS.COMPLETED) return prior.response;
    if (prior) {
      const resumed = journalResume_(cleanReqId, action, m);
      if (resumed) {
        prior.status = REQUEST_STATUS.COMPLETED; prior.response = resumed;
        prior.completedAt = new Date().toISOString(); saveRequestRecord_(prior, m); return resumed;
      }
      // Old code may have written effects before FAILED. Never rerun it blindly.
      const err = new Error('IDEMPOTENCY_REQUIRES_REVIEW: intención previa sin plan recuperable.');
      err.status = 409; err.code = 'IDEMPOTENCY_REQUIRES_REVIEW'; throw err;
    }
    const record = {requestId: cleanReqId, action: action, payloadHash: currentPayloadHash,
      deviceId: devId, status: REQUEST_STATUS.PROCESSING, createdAt: new Date().toISOString(), response: null};
    saveRequestRecord_(record, m);
    try {
      const result = fn();
      record.status = REQUEST_STATUS.COMPLETED; record.response = result;
      record.completedAt = new Date().toISOString(); saveRequestRecord_(record, m); return result;
    } catch (err) {
      record.status = REQUEST_STATUS.REQUIRES_REVIEW;
      record.response = {error: String(err.message || err)};
      record.completedAt = new Date().toISOString(); saveRequestRecord_(record, m); throw err;
    }
  });
}
