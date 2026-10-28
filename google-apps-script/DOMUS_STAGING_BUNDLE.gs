/**
 * ============================================================================
 * DOMUS OS · STAGING UNIFIED BACKEND BUNDLE (DOMUS_STAGING_BUNDLE.gs)
 * Generado para el entorno DOMUS-STAGING (Hotfix Pre-Evento 24 Oct 2026)
 * Main Sheet: 114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg
 * Ops Sheet:  1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE
 * Branch: hotfix/event-2026-10-24
 * ============================================================================
 */

'use strict';


// ==================== START OF Config.gs ====================

/**
 * ============================================================================
 * DOMUS OS · ARCHITECTURE & CONFIGURATION MODULE (Config.gs)
 * Base de configuración centralizada, entornos aislados y políticas de acceso
 * ============================================================================
 */


/**
 * Diccionario Canónico de Entornos (Aislamiento Estricto Staging vs Producción)
 */
const ENVIRONMENTS = Object.freeze({
  PRODUCTION: Object.freeze({
    name: 'PRODUCTION',
    mainSheetId: '1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U', // DOMUS · SISTEMA OPERATIVO (Producción)
    opsSheetId: '1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc'    // DOMUS · BARRA Y RESURTIDO (Producción)
  }),
  STAGING: Object.freeze({
    name: 'STAGING',
    mainSheetId: '114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg', // DOMUS-STAGING · SISTEMA OPERATIVO
    opsSheetId: '1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'    // DOMUS-STAGING · BARRA Y RESURTIDO
  })
});

/**
 * Determina el entorno activo de ejecución garantizando que Staging jamás toque Producción.
 * Prioridad de resolución:
 * 1. ScriptProperties 'DOMUS_ENV' ('PRODUCTION' | 'STAGING')
 * 2. ScriptProperties 'STAGING_MAIN_SHEET_ID' y 'STAGING_OPS_SHEET_ID'
 * 3. Inyección contextual D.env
 * 4. Fallback seguro
 */
function getActiveEnvironment_() {
  try {
    if (typeof PropertiesService !== 'undefined') {
      const props = PropertiesService.getScriptProperties();
      const propEnv = props.getProperty('DOMUS_ENV');
      
      if (propEnv === 'PRODUCTION') {
        return ENVIRONMENTS.STAGING;
      }

      if (propEnv === 'STAGING') {
        const customMain = props.getProperty('STAGING_MAIN_SHEET_ID') || ENVIRONMENTS.STAGING.mainSheetId;
        const customOps = props.getProperty('STAGING_OPS_SHEET_ID') || ENVIRONMENTS.STAGING.opsSheetId;
        return {
          name: 'STAGING',
          mainSheetId: customMain,
          opsSheetId: customOps
        };
      }
    }
  } catch (e) {}

  if (typeof D !== 'undefined' && D.env && ENVIRONMENTS[D.env]) {
    return ENVIRONMENTS[D.env];
  }

  // Por seguridad en branch de aislamiento, si los IDs de Staging están configurados se usa STAGING
  if (ENVIRONMENTS.STAGING.mainSheetId && ENVIRONMENTS.STAGING.opsSheetId) {
    return ENVIRONMENTS.STAGING;
  }

  return ENVIRONMENTS.STAGING;
}

const ACTIVE_ENV = getActiveEnvironment_();

const CONFIG = Object.freeze({
  // Entorno activo
  environment: ACTIVE_ENV.name,
  isStaging: ACTIVE_ENV.name === 'STAGING',
  
  // Identificadores de Google Sheets
  mainSheetId: typeof D !== 'undefined' && D.main ? D.main : ACTIVE_ENV.mainSheetId,
  opsSheetId: typeof D !== 'undefined' && D.ops ? D.ops : ACTIVE_ENV.opsSheetId,
  
  // Lista de Gerencia & Supervisión
  managers: typeof D !== 'undefined' && D.managers ? D.managers : ['direccion@domusccc.net', 'sadotechfet@gmail.com'],
  
  // Operadores Autorizados del Club
  staff: ['René', 'Miguel', 'Mike', 'Taichi Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'],
  
  // Parámetros de Sesión y Seguridad
  sessionDurationHours: 12,
  lockTimeoutMs: 30000,
  
  // Roles de Estación Autorizados (RBAC)
  roles: Object.freeze({
    CAJA: 'CAJA',
    BARRA: 'BARRA',
    COCINA: 'COCINA',
    ACCESOS: 'ACCESOS',
    GERENCIA: 'GERENCIA',
    ADMIN: 'ADMIN'
  })
});

// ==================== END OF Config.gs ====================


// ==================== START OF Auth.gs ====================
/**
 * ============================================================================
 * DOMUS OS · AUTHENTICATION & ZERO-TRUST RBAC (Auth.gs)
 * Validación estricta de sesión, dispositivos y autorización en servidor
 * PRINCIPIO: El servidor NUNCA confía en el rol o deviceId reportados por el cliente.
 * ============================================================================
 */


/**
 * Matriz de Permisos por Acción y Roles Autorizados
 */
const ACTION_PERMISSIONS = Object.freeze({
  // Caja y POS
  cajaSimpleDatos: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimpleRegistrar: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimpleEstado: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimplePreparar: ['CAJA', 'GERENCIA', 'ADMIN'],

  // Comandas y KDS
  comandasSimpleDatos: ['BARRA', 'COCINA', 'CAJA', 'GERENCIA', 'ADMIN'],
  comandasSimpleAccion: ['BARRA', 'COCINA', 'GERENCIA', 'ADMIN'],
  comandasSimpleResolver: ['BARRA', 'COCINA', 'GERENCIA', 'ADMIN'],
  comandasSimpleEntrar: ['BARRA', 'COCINA', 'CAJA', 'ACCESOS', 'GERENCIA', 'ADMIN'],

  // Accesos, Eventos y Guardarropa
  accesoSimpleDatos: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  accesoSimpleRegistrar: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  guardarropaDevolver: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  accesoCambiarActividad: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  registrarNuevoEvento: ['ACCESOS', 'GERENCIA', 'ADMIN'],

  // Operación Solar / Lunar
  operatingProfileDatos: ['CAJA', 'ACCESOS', 'GERENCIA', 'ADMIN'],
  operatingContextsDatos: ['CAJA', 'ACCESOS', 'BARRA', 'COCINA', 'GERENCIA', 'ADMIN'],
  operatingContextValidate: ['CAJA', 'ACCESOS', 'GERENCIA', 'ADMIN'],

  // Catálogo, Administración y Carta
  sincronizarCartaConCatalogoDOMUS: ['ADMIN', 'GERENCIA'],
  registrarNuevoProducto: ['CAJA', 'ADMIN', 'GERENCIA'],
  sincronizarJujutsuShi: ['ADMIN', 'GERENCIA']
});

/**
 * Crea una sesión autenticada en el servidor vinculada a un rol y dispositivo
 */
function authCreateSession(requestedRole, deviceId, operator) {
  const cleanRole = (requestedRole && CONFIG.roles[requestedRole.toUpperCase()]) ? requestedRole.toUpperCase() : 'CAJA';
  const cleanDevice = String(deviceId || 'DEV-ANON').trim();
  const cleanOperator = String(operator || 'Operador').trim();
  const token = 'DOMUS-SES-' + Utilities.getUuid();
  
  const session = {
    token: token,
    role: cleanRole,
    deviceId: cleanDevice,
    operator: cleanOperator,
    created: Date.now(),
    expires: Date.now() + (CONFIG.sessionDurationHours * 3600 * 1000)
  };

  const cache = CacheService.getScriptCache();
  cache.put('ses:' + token, JSON.stringify(session), 21600); // 6 horas en cache rápido
  PropertiesService.getScriptProperties().setProperty('ses:' + token, JSON.stringify(session));

  return session;
}

/**
 * Valida de forma estricta la sesión del servidor (Zero-Trust)
 * REGLA DE ORO: El rol se determina EXCLUSIVAMENTE a partir de la sesión en servidor.
 * Si el cliente manipula el payload para pretender ser 'ADMIN' o 'CAJA'
 * teniendo una sesión de 'BARRA', la solicitud es rechazada inmediatamente.
 */
function authValidateAction(action, sessionToken, clientClaimedRole, clientDeviceId) {
  const allowedRoles = ACTION_PERMISSIONS[action];
  
  // Acciones de consulta abiertas (ping, estado básico)
  if (!allowedRoles || allowedRoles.length === 0) {
    return { ok: true, role: 'PUBLIC', operator: 'Público', deviceId: clientDeviceId };
  }

  // 1. Verificar existencia de token de sesión
  if (!sessionToken || typeof sessionToken !== 'string') {
    // Si no hay token de sesión, rechazar cualquier mutación
    throw new Error(`Acceso denegado: Se requiere un token de sesión activo para ejecutar '${action}'. Inicia sesión en la estación.`);
  }

  // 2. Recuperar la sesión guardada en el servidor (Cache + Properties)
  const cache = CacheService.getScriptCache();
  const rawSession = cache.get('ses:' + sessionToken) || PropertiesService.getScriptProperties().getProperty('ses:' + sessionToken);
  
  if (!rawSession) {
    throw new Error('Sesión inválida o expirada. Por favor autentica nuevamente la estación.');
  }

  let session;
  try {
    session = JSON.parse(rawSession);
  } catch (e) {
    throw new Error('Error de integridad en los datos de sesión del servidor.');
  }

  // 3. Validar expiración de sesión
  if (session.expires && session.expires < Date.now()) {
    throw new Error('La sesión de la estación ha caducado. Vuelve a iniciar sesión.');
  }

  const serverAssignedRole = session.role;

  // 4. Detección de Manipulación en Cliente (Anti-Tampering):
  // Si el cliente envió explícitamente un rol reclamado en el payload (ej. "ADMIN")
  // y no coincide con el rol asignado en la sesión de servidor (ej. "BARRA"), abortar.
  if (clientClaimedRole && String(clientClaimedRole).toUpperCase() !== serverAssignedRole) {
    console.warn(`[SECURITY ALERT] Intento de escalación de privilegios: Dispositivo ${clientDeviceId || session.deviceId} con sesión '${serverAssignedRole}' intentó reclamar rol '${clientClaimedRole}' para la acción '${action}'.`);
    throw new Error(`Violación de seguridad: El rol declarado '${clientClaimedRole}' discrepa del rol autenticado '${serverAssignedRole}'. Petición bloqueada.`);
  }

  // 5. Validar que el rol del servidor tenga autorización para la acción requerida
  if (!allowedRoles.includes(serverAssignedRole)) {
    throw new Error(`Acceso denegado: El rol autenticado '${serverAssignedRole}' no tiene autorización para ejecutar '${action}'. Roles autorizados: [${allowedRoles.join(', ')}].`);
  }

  return {
    ok: true,
    role: serverAssignedRole,
    operator: session.operator || 'Operador',
    deviceId: session.deviceId || clientDeviceId || 'DEV-ESTACION'
  };
}

// ==================== END OF Auth.gs ====================


// ==================== START OF Idempotency.gs ====================

/**
 * ============================================================================
 * DOMUS OS · IDEMPOTENCY & CONCURRENCY CONTROL (Idempotency.gs)
 * Bloqueo atómico con LockService, vinculación estricta de payload y
 * Ledger transaccional persistente (REQUESTS / TRANSACCIONES_API).
 * ============================================================================
 */


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

// ==================== END OF Idempotency.gs ====================


// ==================== START OF POS.gs ====================
/**
 * ============================================================================
 * DOMUS OS · POINT OF SALE & REGISTER (POS.gs)
 * Lógica transaccional de ventas, caja, cálculo de cobro y despacho de órdenes
 * ============================================================================
 */


/**
 * Consulta de datos para la vista de Caja: productos activos, fase y cuentas abiertas
 */
function cajaSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const s = m.getSheetByName('CAJA 2');
  const defaultPhase = String(s.getRange('F2').getValue()) || 'Solar';
  const sheetCat = m.getSheetByName('CATALOGO');
  const lastRowCat = sheetCat ? sheetCat.getLastRow() : 6;
  const numRowsCat = Math.max(1, lastRowCat - 6);
  const cat = sheetCat ? sheetCat.getRange(7, 1, numRowsCat, 20).getValues() : [];

  // Filtrar catálogo activo
  const products = [];
  posCatalogRows_(cat).forEach(r => {
    if (r[0] && r[8] === 'Sí') {
      const price = r[15] ? r[defaultPhase === 'Solar' ? 16 : 17] : r[2];
      if (typeof price === 'number' && price >= 0) {
        const sku = String(r[6] || '');
        const provider = String(r[4] || '');
        const isCanna = sku.toUpperCase().indexOf('CT') === 0 || provider.toLowerCase().indexOf('canna') !== -1;
        products.push({
          name: String(r[0]),
          group: isCanna ? 'Menú Cannábico' : String(r[1] || 'General'),
          price: price,
          priceSolar: r[15] ? Number(r[16]) : Number(r[2]),
          priceLunar: r[15] ? Number(r[17]) : Number(r[2]),
          destination: String(r[7] || (isCanna ? 'Cocina' : (r[1] === 'Alimentos' ? 'Cocina' : 'Barra'))),
          sku: sku,
          provider: isCanna ? 'Canna Treats' : provider
        });
      }
    }
  });

  // Cuentas abiertas y saldos
  const map = new Map();
  const cashRows = s.getRange(7, 1, 500, 16).getValues();
  cashRows.forEach(r => {
    if (r[1] && r[6] && r[15] !== 'Cancelado') {
      const key = String(r[1]);
      let a = map.get(key);
      if (!a) {
        a = { ticket: key, customer: String(r[4] || ''), activity: String(r[3] || 'Visita general DOMUS'), due: 0 };
        map.set(key, a);
      }
      a.due += Number(r[11]) || 0;
    }
  });

  const payments = m.getSheetByName('COBROS').getRange(7, 1, 500, 14).getValues();
  payments.forEach(r => {
    if (r[2] === 'Caja' && map.has(String(r[3]))) {
      map.get(String(r[3])).due -= Number(r[13]) || 0;
    }
  });

  const accounts = Array.from(map.values())
    .map(a => {
      a.due = Math.round(a.due * 100) / 100;
      return a;
    })
    .filter(a => a.due > 0.01);

  const activities = Array.from(new Set([
    'Visita general DOMUS',
    ...m.getSheetByName('ACTIVIDADES').getRange('A7:B106').getValues().filter(r => r[0]).map(r => String(r[0]))
  ]));

  const lastPay = payments.filter(r => r[2] === 'Caja' && Number(r[13]) > 0).slice(-1)[0];
  const lastReceipt = lastPay 
    ? 'Último cobro: ' + (map.get(String(lastPay[3])) || { customer: lastPay[3] }).customer + ' · $' + Number(lastPay[13]).toFixed(2) + ' · ' + lastPay[4] 
    : '';

  return {
    phase: ['Solar', 'Lunar'].includes(defaultPhase) ? defaultPhase : 'Solar',
    defaultPhase: ['Solar', 'Lunar'].includes(defaultPhase) ? defaultPhase : 'Solar',
    concurrentContexts: true,
    products: products,
    accounts: accounts,
    activities: activities,
    lastReceipt: lastReceipt,
    staff: CONFIG.staff,
    canCourtesy: true
  };
}

/**
 * Registra una venta en Caja (inmediata o a cuenta abierta) con control atómico de concurrencia
 */
function cajaSimpleRegistrar(p) {
  if (!p) throw new Error('Cuerpo de venta vacío.');
  const id = String(p.id || p.requestId || ('POS-' + Date.now())).trim();
  p.id = id;

  return withLock_(CONFIG.lockTimeoutMs, () => {
    return cajaSimpleRegistrarCore_(p);
  });
}

function cajaSimpleRegistrarCore_(p) {
  const who = String(Session.getActiveUser().getEmail() || 'Caja');
  const props = PropertiesService.getScriptProperties();
  const key = 'cajaSimple:' + p.id;
  
  let job = JSON.parse(props.getProperty(key) || 'null');
  const signature = posSignature_(p);

  if (job && posSignature_(JSON.parse(job.signature)) !== signature) {
    throw new Error('Esta referencia ya contiene otro pedido con distinta firma. Inicia una nueva venta.');
  }
  if (job && job.done) {
    return job.result;
  }

  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sCaja = m.getSheetByName('CAJA 2');
  const defaultPhase = String(sCaja.getRange('F2').getValue()) || 'Solar';
  const phase = ['Solar', 'Lunar'].includes(String(p.phase || '').trim())
    ? String(p.phase).trim()
    : (['Solar', 'Lunar'].includes(defaultPhase) ? defaultPhase : 'Solar');
  const activity = String(p.activity || 'Visita general DOMUS').trim();

  // Valida el contexto de ESTA venta. Solar y Lunar pueden coexistir.
  operatingContextValidate_({ phase: phase, activity: activity });

  const sheetCat = m.getSheetByName('CATALOGO');
  const lastRowCat = sheetCat ? sheetCat.getLastRow() : 6;
  const numRowsCat = Math.max(1, lastRowCat - 6);
  const cat = sheetCat ? sheetCat.getRange(7, 1, numRowsCat, 20).getValues() : [];
  const canCourtesy = CONFIG.managers.includes(who.toLowerCase()) || p.courtesyAuthorized;
  const units = posExpandCart_(p.items || [], cat, phase, canCourtesy);

  const customer = String(p.customer || 'Público General').trim();
  let ticket = String(p.ticket || '');

  // Si no hay ticket, generar un folio único para la cuenta
  if (!ticket) {
    ticket = 'CTA-' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd') + '-' + p.id.slice(-6);
  }

  // Calcular totales
  const expectedTotal = posRound_(units.reduce((n, u) => n + (u.courtesy ? 0 : u.price), 0));
  const isPaid = !!p.paid;
  const method = String(p.method || 'Efectivo');

  let math = { sale: expectedTotal, received: null, tip: 0, change: null };
  if (isPaid && expectedTotal > 0) {
    math = posPaymentMath_(expectedTotal, method, p.received, p.tip);
  }

  // 1. Doble verificación a nivel base de datos en COBROS (Idempotencia Fuerte en Sheets):
  // Si la respuesta HTTP se cortó por timeout pero la transacción ya se asentó en COBROS,
  // recuperamos el registro original directamente de las celdas sin crear nada nuevo.
  const sCobros = m.getSheetByName('COBROS');
  if (sCobros) {
    const existingPayments = sCobros.getRange(7, 1, 500, 14).getValues();
    const existingPay = existingPayments.find(r => r[8] === 'CAJA-RAPIDA:' + p.id);
    if (existingPay && existingPay[0]) {
      console.log(`[IDEMPOTENCY EN SHEETS] Transacción previa localizada en COBROS: Folio ${existingPay[0]} para ${p.id}`);
      return {
        ok: true,
        ticket: String(existingPay[3] || ticket),
        receipt: String(existingPay[0]),
        paid: true,
        total: Number(existingPay[5]) || expectedTotal,
        customer: String(existingPay[7] || customer),
        message: `Cobro previamente confirmado (recuperado de COBROS): Folio ${existingPay[0]}`
      };
    }
  }

  // Buscar filas libres en CAJA 2
  const allRows = sCaja.getRange(7, 1, 500, 32).getValues();
  const freeIndices = [];
  for (let i = 0; i < allRows.length; i++) {
    if (!allRows[i][1] && !allRows[i][6]) {
      freeIndices.push(i + 7);
      if (freeIndices.length === units.length) break;
    }
  }

  if (freeIndices.length < units.length) {
    throw new Error('No hay filas libres en la matriz de Caja 2. Se requiere mantenimiento.');
  }

  // Escribir unidades en CAJA 2
  const now = new Date();
  units.forEach((u, idx) => {
    const rowNum = freeIndices[idx];
    const rowData = [
      'U-' + rowNum, ticket, now, activity, customer, u.group, u.name, 1,
      u.courtesy ? 'Cortesía' : 'Normal', u.price, u.courtesy ? 0 : u.price, u.courtesy ? 0 : u.price,
      '', '', '', isPaid ? 'Enviar' : 'Borrador', '', u.share || '', u.beneficiary || '',
      '', u.inventory || '', '', 'LISTO', '', u.destination || 'Barra'
    ];
    sCaja.getRange(rowNum, 1, 1, rowData.length).setValues([rowData]);
    // Columna AK (37): dimensión operativa autoritativa por línea.
    // Solar y Lunar pueden coexistir en la misma jornada y en la misma caja.
    sCaja.getRange(rowNum, 37).setValue(phase);
  });

  // Si fue pagado, asentar en COBROS
  let receiptFolio = '';
  if (isPaid && expectedTotal > 0) {
    const sCobros = m.getSheetByName('COBROS');
    if (sCobros) {
      const cobRowIdx = Math.max(sCobros.getLastRow() + 1, 7);
      receiptFolio = 'REC-' + Date.now().toString(36).toUpperCase();
      const cobRow = [
        receiptFolio, now, 'Caja', ticket, method, math.sale, method === 'Efectivo' ? 0 : '',
        customer, 'CAJA-RAPIDA:' + p.id, '', method === 'Transferencia' ? 'Borrador' : 'Confirmado',
        who, math.sale, math.sale, '', activity, 0, 0, 0, 'SISTEMA-WEB',
        '', '', '', '', '', '', '',
        JSON.stringify(units.map(u => ({ name: u.name, price: u.price }))),
        math.tip, math.received || '', math.change || ''
      ];
      sCobros.getRange(cobRowIdx, 1, 1, cobRow.length).setValues([cobRow]);
    }
  }

  // Enviar a COMANDAS si está pagado o autorizado a crédito
  if (isPaid || ['Amigo', 'Creador de proyecto'].includes(p.credit)) {
    const sComandas = m.getSheetByName('COMANDAS');
    if (sComandas) {
      units.forEach((u, idx) => {
        const rowNum = freeIndices[idx];
        const comandaItem = {
          id: 'C2-' + rowNum,
          row: rowNum,
          ticket: ticket,
          batch: p.id,
          alias: customer,
          product: u.name,
          notes: '',
          destination: u.destination || 'Barra',
          sent: now.toISOString(),
          state: 'Pendiente',
          credit: !isPaid,
          incident: '',
          responsible: '',
          phase: phase,
          activity: activity
        };
        sComandas.getRange(rowNum, 13).setValue(JSON.stringify(comandaItem));
        sComandas.getRange(rowNum, 8).setValue('Recibida');
      });
    }
  }

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    ticket: ticket,
    receipt: receiptFolio,
    paid: isPaid,
    total: expectedTotal,
    customer: customer,
    phase: phase,
    activity: activity,
    message: isPaid 
      ? `Cobro registrado exitosamente: Folio ${receiptFolio || ticket}` 
      : `Pedido guardado en cuenta abierta: ${ticket}`
  };

  props.setProperty(key, JSON.stringify({ done: true, signature, result, at: Date.now() }));
  return result;
}

/**
 * Consulta de confirmación rápida (solo lectura) para reconectar operaciones interrumpidas
 */
function cajaSimpleEstado(id) {
  if (!id) throw new Error('Referencia de operación requerida.');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('cajaSimple:' + id) || props.getProperty('idemp:' + id);
  if (raw) {
    try {
      const record = JSON.parse(raw);
      if (record.done) return { done: true, result: record.result || record };
    } catch (e) {}
  }
  return { done: false, message: 'Operación en proceso de confirmación…' };
}

function cajaSimplePreparar(id) {
  return { pending: false };
}

// --- FUNCIONES MATEMÁTICAS PURAS Y HELPERS ---

function posRound_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function posSignature_(value) {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((r, k) => { r[k] = canonical(v[k]); return r; }, {}) : v);
  return JSON.stringify(canonical(value));
}

function posCatalogRows_(cat) {
  const rows = new Map();
  for (const r of cat) {
    if (r[0] && r[8] === 'Sí' && (r[15] ? r[18] === 'Sí' : r[1] === 'Cannábicos')) {
      rows.set(String(r[1]) + '|' + String(r[15] || r[0]), r);
    }
  }
  return Array.from(rows.values());
}

function posPaymentMath_(due, method, received, tip) {
  due = posRound_(due);
  if (!Number.isFinite(due) || due < 0) throw new Error('Saldo inválido.');
  if (!['Efectivo', 'Terminal 1', 'Terminal 2', 'Transferencia'].includes(method)) {
    throw new Error('Elige un medio de pago válido.');
  }
  if (method !== 'Efectivo') {
    return { sale: due, received: null, tip: 0, change: null };
  }
  if (received === '' || received === null || received === undefined || !Number.isFinite(Number(received))) {
    throw new Error('Escribe el efectivo recibido.');
  }
  received = posRound_(received);
  tip = posRound_(tip || 0);
  if (!Number.isFinite(tip) || tip < 0 || received < 0) {
    throw new Error('Revisa el efectivo recibido y la propina.');
  }
  if (received + 0.001 < due + tip) {
    throw new Error('Efectivo insuficiente: faltan $' + posRound_(due + tip - received).toFixed(2) + '.');
  }
  return { sale: due, received: received, tip: tip, change: posRound_(received - due - tip) };
}

function posExpandCart_(items, cat, phase, canCourtesy) {
  if (!Array.isArray(items)) throw new Error('Pedido inválido.');
  const units = [];
  const catalogRows = posCatalogRows_(cat);

  for (const item of items) {
    let c = catalogRows.find(r => r[0] === item.name);
    if (!c) {
      c = [item.name, item.group || 'General', item.price, 0, item.provider || 'DOMUS', '', item.sku || '', item.destination || 'Barra', 'Sí'];
    }
    const price = c[15] ? (phase === 'Solar' ? Number(c[16]) : Number(c[17])) : Number(c[2] || item.price);
    const qty = parseInt(item.qty, 10) || 1;
    if (qty < 1 || qty > 20) throw new Error('Cantidad debe estar entre 1 y 20 por producto.');

    for (let j = 0; j < qty; j++) {
      units.push({
        name: c[0],
        group: c[1] || 'General',
        price: price,
        courtesy: !!item.courtesy,
        share: c[3] || 0,
        beneficiary: c[4] || 'DOMUS',
        inventory: c[6] || '',
        destination: c[7] || (c[1] === 'Alimentos' ? 'Cocina' : 'Barra')
      });
    }
  }
  if (units.length > 50) throw new Error('Máximo 50 unidades por operación.');
  return units;
}

// ==================== END OF POS.gs ====================


// ==================== START OF KDS.gs ====================

/**
 * ============================================================================
 * DOMUS OS · KITCHEN & BAR DISPLAY SYSTEM (KDS.gs)
 * Gestión de comandas en tiempo real, lotes de preparación y resurtido
 * ============================================================================
 */


/**
 * Consulta de comandas activas, historial reciente y solicitudes de resurtido
 */
function comandasSimpleDatos(token) {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
  const sComandas = m.getSheetByName('COMANDAS');
  const oResurtido = o ? o.getSheetByName('RESURTIDO') : null;

  // 1. Leer comandas activas desde la columna M (JSON maestro)
  const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();
  const orders = [];
  masterRaw.forEach((row, i) => {
    if (row[0]) {
      try {
        const item = JSON.parse(row[0]);
        if (item && item.state !== 'Entregada' && item.state !== 'Cancelada') {
          orders.push({
            key: 'DCS-' + item.row + '-' + (item.batch || item.id),
            version: String(item.version || '1'),
            id: item.id || ('C2-' + item.row),
            ticket: item.ticket,
            batch: item.batch || item.id,
            alias: item.alias || 'Cliente',
            product: item.product,
            notes: item.notes || '',
            destination: item.destination || 'Barra',
            state: item.state || 'Pendiente',
            responsible: item.responsible || item.preparedBy || '',
            sent: item.sent ? new Date(item.sent).getTime() : Date.now(),
            credit: !!item.credit,
            incident: item.incident || '',
            phase: item.phase || '',
            activity: item.activity || ''
          });
        }
      } catch (err) {}
    }
  });

  // 2. Leer resurtidos abiertos
  const requests = [];
  if (oResurtido) {
    const resRows = oResurtido.getRange(7, 1, 100, 8).getValues();
    resRows.forEach(r => {
      if (r[0] && r[5] !== true && r[7] !== 'Resuelto') {
        requests.push({
          id: String(r[0]),
          product: String(r[2]),
          type: String(r[3] || 'Reposición'),
          created: r[1] instanceof Date ? r[1].getTime() : Date.now()
        });
      }
    });
  }

  return {
    version: 'Comandas Simple 2.0',
    at: Date.now(),
    mirrorSync: 'Conectado a Google Sheets',
    team: CONFIG.staff,
    orders: orders,
    history: [],
    requests: requests,
    issues: []
  };
}

/**
 * Aplica una acción sobre una comanda (TOMAR, LISTA, ENTREGAR, ALMACEN, AGOTADO)
 */
function comandasSimpleAccion(token, body) {
  if (!body || !body.key || !body.action) {
    throw new Error('Parámetros de acción de comanda incompletos.');
  }

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sComandas = m.getSheetByName('COMANDAS');
    const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();

    let targetRow = -1;
    let targetItem = null;

    for (let i = 0; i < masterRaw.length; i++) {
      if (masterRaw[i][0]) {
        try {
          const item = JSON.parse(masterRaw[i][0]);
          const key = 'DCS-' + item.row + '-' + (item.batch || item.id);
          if (key === body.key) {
            targetRow = i + 7;
            targetItem = item;
            break;
          }
        } catch (e) {}
      }
    }

    if (!targetItem || targetRow < 7) {
      throw new Error(`Comanda con clave '${body.key}' no encontrada en la matriz activa.`);
    }

    const action = String(body.action).toUpperCase();
    const operator = String(body.operator || 'Operador').trim();

    if (action === 'TOMAR') {
      // Reclamar lote completo
      const batchId = targetItem.batch;
      for (let i = 0; i < masterRaw.length; i++) {
        if (masterRaw[i][0]) {
          try {
            const it = JSON.parse(masterRaw[i][0]);
            if (it.batch === batchId && it.state === 'Pendiente') {
              it.state = 'En preparación';
              it.responsible = operator;
              it.version = String(Number(it.version || 1) + 1);
              sComandas.getRange(i + 7, 13).setValue(JSON.stringify(it));
              sComandas.getRange(i + 7, 14).setValue('En preparación (' + operator + ')');
            }
          } catch (e) {}
        }
      }
    } else if (action === 'LISTA') {
      targetItem.state = 'Lista';
      targetItem.version = String(Number(targetItem.version || 1) + 1);
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 14).setValue('Lista para entrega');
    } else if (action === 'ENTREGAR') {
      if (targetItem.state === 'Entregada') {
        throw new Error(`La comanda '${body.key}' (${targetItem.product}) ya fue entregada previamente.`);
      }
      targetItem.state = 'Entregada';
      targetItem.delivered = new Date().toISOString();
      targetItem.deliveredBy = operator;
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 8).setValue('Entregada');
      sComandas.getRange(targetRow, 14).setValue('Entregada por ' + operator);

      // Decremento físico de inventario en hoja INVENTARIO (ADR-004)
      let invMovement = null;
      const sInv = m.getSheetByName('INVENTARIO');
      if (sInv) {
        const lastRow = sInv.getLastRow();
        const numRows = Math.max(1, lastRow - 6);
        const invValues = sInv.getRange(7, 1, numRows, 9).getValues();

        const targetSkuRaw = String(targetItem.sku || '').trim().toUpperCase();
        const targetProdRaw = String(targetItem.product || '').trim();

        // 1. Alias de SKU explícitamente autorizados (bidireccionales)
        const SKU_ALIASES = {
          'VICTORIA-473': 'CARTA-VICTORIA-473',
          'CARTA-VICTORIA-473': 'VICTORIA-473',
          'MODELO-473': 'CARTA-MODELO-473',
          'CARTA-MODELO-473': 'MODELO-473',
          'BAR-CB-LATA': 'CARTA-BAR-CB-LATA',
          'CARTA-BAR-CB-LATA': 'BAR-CB-LATA'
        };
        const targetAlias = SKU_ALIASES[targetSkuRaw] || '';

        // Función de normalización estricta de nombres para descarte de colisiones
        const normalizeStr = s => String(s || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[·—–-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const targetNorm = normalizeStr(targetProdRaw);

        let matchRowIdx = -1;
        let matchedInvRow = null;

        // Prioridad 1: SKU exacto
        if (targetSkuRaw) {
          for (let j = 0; j < invValues.length; j++) {
            const invSku = String(invValues[j][0] || '').trim().toUpperCase();
            if (invSku && invSku === targetSkuRaw) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Prioridad 2: Alias de SKU explícitamente autorizado
        if (matchRowIdx === -1 && targetAlias) {
          for (let j = 0; j < invValues.length; j++) {
            const invSku = String(invValues[j][0] || '').trim().toUpperCase();
            if (invSku && invSku === targetAlias) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Prioridad 3: Nombre exacto normalizado (coincidencia idéntica completa, NUNCA substring laxo)
        if (matchRowIdx === -1 && targetNorm) {
          for (let j = 0; j < invValues.length; j++) {
            const invNameNorm = normalizeStr(invValues[j][1]);
            if (invNameNorm && invNameNorm === targetNorm) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Si se localizó la fila inequívoca:
        if (matchRowIdx !== -1 && matchedInvRow) {
          const invSku = String(matchedInvRow[0] || '').trim();
          const invName = String(matchedInvRow[1] || '').trim();
          const currentInitial = Number(matchedInvRow[5]) || 0;
          const currentOut = Number(matchedInvRow[6]) || 0;
          const qty = Number(targetItem.qty || 1);
          const newOut = currentOut + qty;
          const newDisp = Math.max(0, currentInitial - newOut);
          sInv.getRange(matchRowIdx, 7).setValue(newOut);
          sInv.getRange(matchRowIdx, 8).setValue(newDisp);
          invMovement = {
            sku: invSku,
            product: invName,
            row: matchRowIdx,
            qty: qty,
            previousOut: currentOut,
            newOut: newOut,
            available: newDisp
          };
        } else {
          // Prioridad 4: Si no existe coincidencia inequívoca, INVENTORY_ITEM_NOT_FOUND y NO descontar nada
          console.warn(`[KDS INVENTARIO] Item no localizado en INVENTARIO: SKU='${targetSkuRaw}', Producto='${targetProdRaw}'. No se descontó ninguna fila.`);
          invMovement = {
            status: 'INVENTORY_ITEM_NOT_FOUND',
            sku: targetSkuRaw,
            product: targetProdRaw,
            discounted: false
          };
        }
      }

      SpreadsheetApp.flush();
      return {
        ok: true,
        message: `Acción '${action}' aplicada exitosamente a ${targetItem.product}.`,
        key: body.key,
        product: targetItem.product,
        state: 'Entregada',
        deliveredBy: operator,
        inventory: invMovement
      };
    } else if (action === 'ALMACEN' || action === 'AGOTADO') {
      const incidentType = action === 'ALMACEN' ? 'Reponer de almacén' : 'Agotado en DOMUS';
      targetItem.incident = incidentType;
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 14).setValue(incidentType);

      // Crear aviso en RESURTIDO
      const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
      if (o) {
        const sRes = o.getSheetByName('RESURTIDO');
        if (sRes) {
          const resRowIdx = Math.max(sRes.getLastRow() + 1, 7);
          const reqId = 'RS-' + Utilities.getUuid().slice(0, 8).toUpperCase();
          sRes.getRange(resRowIdx, 1, 1, 8).setValues([[
            reqId, new Date(), targetItem.product, incidentType, 1, false, '', incidentType === 'Agotado en DOMUS' ? 'Compra pendiente' : 'Resurtido pendiente'
          ]]);
        }
      }
    }

    SpreadsheetApp.flush();
    return { ok: true, message: `Acción '${action}' aplicada exitosamente a ${targetItem.product}.` };
  });
}

/**
 * Resuelve una incidencia de resurtido
 */
function comandasSimpleResolver(token, body) {
  if (!body || !body.id) throw new Error('ID de solicitud de resurtido no especificado.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
    if (!o) throw new Error('Libro operativo no encontrado.');
    const sRes = o.getSheetByName('RESURTIDO');
    if (!sRes) throw new Error('Hoja RESURTIDO no encontrada.');

    const values = sRes.getRange(7, 1, 100, 8).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toUpperCase() === String(body.id).trim().toUpperCase()) {
        const row = i + 7;
        sRes.getRange(row, 6).setValue(true);
        sRes.getRange(row, 7).setValue(new Date());
        sRes.getRange(row, 8).setValue('Resuelto');
        SpreadsheetApp.flush();
        return { ok: true, message: 'Disponibilidad confirmada para ' + body.id };
      }
    }

    throw new Error('Solicitud ' + body.id + ' no encontrada.');
  });
}

function comandasSimpleEntrar(token) {
  return { ok: true, token: token || 'SES-' + Utilities.getUuid(), team: CONFIG.staff };
}

// ==================== END OF KDS.gs ====================


// ==================== START OF Inventory.gs ====================

/**
 * ============================================================================
 * DOMUS OS · INVENTORY & CATALOG MODULE (Inventory.gs)
 * Catálogo de productos, recetas, inventario y homologación con la Carta Oficial
 * ============================================================================
 */


/**
 * Sincroniza la Carta Oficial Definitiva hacia CATALOGO e INVENTARIO
 * Protege contra sobreescritura ciega y colisión de claves SKU
 */
function sincronizarCartaConCatalogoDOMUS() {
  const sourceId = '1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ';
  const targetId = CONFIG.mainSheetId;

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const sSource = SpreadsheetApp.openById(sourceId);
    const sTarget = SpreadsheetApp.openById(targetId);

    // 1. Localizar pestaña de Carta Oficial
    let sheetSource = null;
    const sheets = sSource.getSheets();
    for (let s of sheets) {
      if (s.getName().toUpperCase().includes('CARTA') || s.getSheetId() === 926692473) {
        sheetSource = s;
        break;
      }
    }
    if (!sheetSource) sheetSource = sheets[0];

    const raw = sheetSource.getDataRange().getValues();
    let headerIndex = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i][1] && String(raw[i][1]).toUpperCase().includes('PRODUCTO')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex < 0) throw new Error('No se encontró la cabecera de productos en la Carta Oficial.');

    const rows = raw.slice(headerIndex + 1);
    const catalogRows = [];
    const inventoryRows = [];
    const seenSkus = new Set();
    let skuCounter = 1;

    rows.forEach(r => {
      const cat = String(r[0] || '').trim();
      const name = String(r[1] || '').trim();
      if (!name) return;

      const rawSolar = String(r[2] || '').replace(/[$,]/g, '').trim();
      const rawLunar = String(r[3] || '').replace(/[$,]/g, '').trim();
      const priceSolar = parseFloat(rawSolar) || 0;
      const priceLunar = parseFloat(rawLunar) || priceSolar;
      const provider = String(r[4] || 'DOMUS').trim();
      let sku = String(r[5] || '').trim();

      // Resolver colisión de SKUs si están vacíos o repetidos
      if (!sku || seenSkus.has(sku)) {
        sku = (sku ? sku + '-' : 'SKU-') + String(skuCounter++).padStart(3, '0');
      }
      seenSkus.add(sku);

      const dest = (cat.includes('ALIMENTOS') || cat.includes('CANNA') || cat.includes('COMIDA')) ? 'Cocina' : 'Barra';

      // Fila para CATALOGO (A - S)
      catalogRows.push([
        name, cat, priceSolar, 0, provider, '', sku, dest, 'Sí',
        '', '', '', '', '', '', 'Sí', priceSolar, priceLunar, 'Sí'
      ]);

      // Fila para INVENTARIO: SKU, Nombre, Categoria, Proveedor, Unidad, Stock Inicial, Reservado, Disponible, Destino
      inventoryRows.push([
        sku, name, cat, provider, 'Unidad', 50, 0, 50, dest
      ]);
    });

    // Garantizar integración de rollos de sushi JujuTsu-shi
    const jujutsuList = [
      { name: 'Rollo Nobara', sku: 'JJ01' },
      { name: 'Rollo Itadori', sku: 'JJ02' },
      { name: 'Rollo Megumi', sku: 'JJ03' },
      { name: 'Rollo Maki', sku: 'JJ04' },
      { name: 'Rollo Todo', sku: 'JJ05' },
      { name: 'Rollo Choso', sku: 'JJ06' },
      { name: 'Rollo Gojo', sku: 'JJ07' },
      { name: 'Rollo Sasaki', sku: 'JJ08' },
      { name: 'Rollo Rika', sku: 'JJ09' }
    ];

    const existingNames = new Set(catalogRows.map(r => String(r[0]).toUpperCase()));
    jujutsuList.forEach(j => {
      if (!existingNames.has(j.name.toUpperCase())) {
        catalogRows.push([
          j.name, 'Sushi', 100, 0, 'JujuTsu-shi', '', j.sku, 'Cocina', 'Sí',
          '', '', '', '', '', '', 'Sí', 100, 100, 'Sí'
        ]);
        inventoryRows.push([
          j.sku, j.name, 'Sushi', 'JujuTsu-shi', 'Unidad', 50, 0, 50, 'Cocina'
        ]);
      }
    });

    // Escribir en CATALOGO a partir de fila 7
    const sheetCat = sTarget.getSheetByName('CATALOGO');
    if (sheetCat) {
      sheetCat.getRange(7, 1, catalogRows.length, catalogRows[0].length).setValues(catalogRows);
    }

    // Escribir en INVENTARIO a partir de fila 7
    const sheetInv = sTarget.getSheetByName('INVENTARIO');
    if (sheetInv) {
      sheetInv.getRange(7, 1, inventoryRows.length, inventoryRows[0].length).setValues(inventoryRows);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      total: catalogRows.length,
      message: `Se sincronizaron con éxito ${catalogRows.length} productos en CATALOGO e INVENTARIO sin colisiones de SKU.`
    };
  });
}

/**
 * Registra un producto individual en CATALOGO e INVENTARIO bajo candado
 */
function registrarNuevoProducto(prod) {
  if (!prod || !prod.name) throw new Error('El nombre del producto es obligatorio.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const sTarget = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const name = String(prod.name).trim();
    const cat = String(prod.group || 'General').trim();
    const priceSolar = parseFloat(prod.priceSolar) || parseFloat(prod.price) || 0;
    const priceLunar = parseFloat(prod.priceLunar) || priceSolar;
    const provider = String(prod.provider || 'DOMUS').trim();
    const sku = String(prod.sku || ('PRD-' + Date.now().toString(36).toUpperCase())).trim();
    const dest = String(prod.destination || (cat.includes('ALIMENTOS') || cat.includes('CANNA') || cat.includes('COMIDA') || cat.includes('SUSHI') ? 'Cocina' : 'Barra')).trim();
    const stock = parseInt(prod.stock, 10) || 50;

    // 1. Insertar en CATALOGO
    const sheetCat = sTarget.getSheetByName('CATALOGO');
    if (sheetCat) {
      const lastRow = Math.max(sheetCat.getLastRow(), 6);
      const row = [
        name, cat, priceSolar, 0, provider, '', sku, dest, 'Sí',
        '', '', '', '', '', '', 'Sí', priceSolar, priceLunar, 'Sí'
      ];
      sheetCat.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
    }

    // 2. Insertar en INVENTARIO
    const sheetInv = sTarget.getSheetByName('INVENTARIO');
    if (sheetInv) {
      const lastRow = Math.max(sheetInv.getLastRow(), 6);
      const invRow = [sku, name, cat, provider, 'Unidad', stock, 0, stock, dest];
      sheetInv.getRange(lastRow + 1, 1, 1, invRow.length).setValues([invRow]);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      message: `Producto "${name}" registrado en CATALOGO e INVENTARIO.`,
      product: { name, group: cat, priceSolar, priceLunar, destination: dest, sku, provider }
    };
  });
}

function sincronizarJujutsuShi() {
  return sincronizarCartaConCatalogoDOMUS();
}

// ==================== END OF Inventory.gs ====================


// ==================== START OF Access.gs ====================
/**
 * ============================================================================
 * DOMUS OS · ADMISSIONS, TICKETING & WARDROBE SYSTEM (Access.gs)
 * Fase 0.5: Modelo Comercial Integral de Accesos, Taquilla, Boleteras y Aforo (ADR-005)
 * ============================================================================
 */


/**
 * Canales de Venta de Boletos
 */
const ACCESS_SALES_CHANNELS = Object.freeze({
  TAQUILLA_DOMUS: 'TAQUILLA_DOMUS',
  PREVENTA_DOMUS: 'PREVENTA_DOMUS',
  BOLETERA_EXTERNA: 'BOLETERA_EXTERNA',
  TRANSFERENCIA_DIRECTA: 'TRANSFERENCIA_DIRECTA',
  LISTA: 'LISTA',
  CORTESIA: 'CORTESIA',
  MEMBRESIA: 'MEMBRESIA'
});

/**
 * Estados de Pago de la Entrada
 */
const ACCESS_PAYMENT_STATUS = Object.freeze({
  CONFIRMADA: 'CONFIRMADA',
  PAGADO_EXTERNAMENTE: 'PAGADO_EXTERNAMENTE',
  PENDIENTE_VERIFICACION: 'PENDIENTE_VERIFICACION',
  RECHAZADA: 'RECHAZADA'
});

/**
 * Consulta de eventos activos y registros de acceso en vivo
 */
function accesoSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sAcc = m.getSheetByName('ACCESO');
  const props = PropertiesService.getScriptProperties();

  // 1. Obtener actividades / eventos y sus tipos de boletos
  const rawActs = sAct ? sAct.getRange('A7:M106').getValues() : [];
  const activities = [];
  rawActs.forEach(r => {
    if (r[0]) {
      const pGen = typeof r[4] === 'number' ? r[4] : (parseFloat(r[4]) || 0);
      const pPar = typeof r[5] === 'number' ? r[5] : (parseFloat(r[5]) || 0);
      const pTrio = typeof r[6] === 'number' ? r[6] : (parseFloat(r[6]) || 0);
      let pGua = 50;
      if (typeof r[7] === 'number') {
        pGua = r[7];
      } else if (r[7] !== '' && r[7] !== null && r[7] !== undefined) {
        const parsed = parseFloat(r[7]);
        pGua = isNaN(parsed) ? 50 : parsed;
      }

      // Tipos de boletos del evento (estándar + personalizados en notas col M)
      let customTicketTypes = [];
      try {
        if (r[12] && String(r[12]).trim().startsWith('[')) {
          customTicketTypes = JSON.parse(r[12]);
        }
      } catch (e) {}

      const ticketTypes = [
        { id: 'General', name: 'General (1 Asistente)', price: pGen, persons: 1 },
        { id: 'Pareja', name: 'Pareja (2 Asistentes)', price: pPar, persons: 2 },
        { id: 'Trío', name: 'Trío (3 Asistentes)', price: pTrio, persons: 3 },
        ...customTicketTypes
      ];

      activities.push({
        name: String(r[0]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        type: String(r[2] || 'CLUB_NOCTURNO'),
        organizer: String(r[3] || 'DOMUS'),
        priceGeneral: pGen,
        pricePareja: pPar,
        priceTrio: pTrio,
        priceGuardarropa: pGua,
        capacity: Number(r[8]) || 150,
        status: String(r[11] || 'Confirmado'),
        ticketTypes: ticketTypes
      });
    }
  });

  // Actividad activa configurada
  let activeActivity = props.getProperty('actividadAcceso') || '';
  if (!activeActivity && activities.length > 0) {
    activeActivity = activities[0].name;
  }

  // 2. Obtener accesos registrados con modelo comercial integral (22 campos)
  const rawAcc = sAcc ? sAcc.getRange('A7:AF506').getValues() : [];
  const recentAccess = [];
  let totalAttendance = 0;
  let activeWardrobe = 0;
  let totalDoorRevenue = 0;
  let totalCommercialGross = 0;
  let presalesCount = 0;
  let courtesiesCount = 0;
  const metricsByActivity = {};

  rawAcc.forEach((r, idx) => {
    if (r[0] || r[3]) {
      const rowId = String(r[0] || ('A-' + String(idx + 7).padStart(4, '0')));
      const dateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd HH:mm') : String(r[1] || '');
      const activity = String(r[2] || activeActivity);
      const customer = String(r[3] || 'Anónimo');
      const email = String(r[4] || '');
      const phone = String(r[5] || '');
      const ticketTypeId = String(r[6] || 'General');
      const persons = Number(r[7]) || (ticketTypeId === 'Pareja' ? 2 : (ticketTypeId === 'Trío' ? 3 : 1));
      const wardrobeQty = Number(r[8]) || 0;
      const faceValue = Number(r[9]) || 0;
      const wardrobeAmount = Number(r[12]) || 0;
      const totalCommercial = Number(r[13]) || (faceValue + wardrobeAmount);
      const amountPaidAtDoor = Number(r[14]) || 0;
      const amountDueAtDoor = Number(r[15]) || 0;
      const paymentStatus = String(r[16] || 'CONFIRMADA');
      const externalTicketId = String(r[17] || '');
      const courtesyAuth = String(r[18] || '');
      const salesChannel = String(r[19] || (externalTicketId ? 'BOLETERA_EXTERNA' : 'TAQUILLA_DOMUS'));
      const ticketProvider = String(r[20] || 'DOMUS');
      const method = String(r[26] || 'Efectivo');
      const ticketGuardarropa = String(r[30] || (wardrobeQty > 0 ? ('GUA-' + rowId) : ''));
      const wardrobeReturned = String(r[31] || '').toUpperCase().includes('DEVUELTO') || r[31] === true;

      totalAttendance += persons;
      totalDoorRevenue += amountPaidAtDoor;
      totalCommercialGross += totalCommercial;
      if (!metricsByActivity[activity]) {
        metricsByActivity[activity] = {
          attendance: 0,
          doorRevenue: 0,
          commercialGross: 0,
          activeWardrobe: 0
        };
      }
      metricsByActivity[activity].attendance += persons;
      metricsByActivity[activity].doorRevenue += amountPaidAtDoor;
      metricsByActivity[activity].commercialGross += totalCommercial;
      if (salesChannel === 'BOLETERA_EXTERNA' || salesChannel === 'PREVENTA_DOMUS') presalesCount++;
      if (salesChannel === 'CORTESIA') courtesiesCount++;
      if (wardrobeQty > 0 && !wardrobeReturned) {
        activeWardrobe += wardrobeQty;
        metricsByActivity[activity].activeWardrobe += wardrobeQty;
      }

      recentAccess.unshift({
        id: rowId,
        date: dateStr,
        activity: activity,
        customer: customer,
        email: email,
        phone: phone,
        ticketTypeId: ticketTypeId,
        persons: persons,
        salesChannel: salesChannel,
        ticketProvider: ticketProvider,
        externalTicketId: externalTicketId,
        faceValue: faceValue,
        wardrobeQty: wardrobeQty,
        wardrobeAmount: wardrobeAmount,
        totalCommercial: totalCommercial,
        amountPaidAtDoor: amountPaidAtDoor,
        amountDueAtDoor: amountDueAtDoor,
        paymentStatus: paymentStatus,
        paymentMethod: method,
        courtesyAuth: courtesyAuth,
        ticketGuardarropa: ticketGuardarropa,
        wardrobeReturned: wardrobeReturned
      });
    }
  });

  return {
    activeActivity: activeActivity,
    activities: activities,
    recentAccess: recentAccess,
    activeActivities: activities.filter(a => String(a.status || '').toLowerCase() === 'confirmado'),
    metricsByActivity: metricsByActivity,
    metrics: {
      totalAttendance: totalAttendance,
      activeWardrobe: activeWardrobe,
      totalDoorRevenue: totalDoorRevenue,
      totalCommercialGross: totalCommercialGross,
      presalesCount: presalesCount,
      courtesiesCount: courtesiesCount
    }
  };
}

/**
 * Registra un acceso/asistencia y su cobro en ACCESO y COBROS bajo candado estricto
 * Fase 0.5: Atribución correcta de ingresos (Boleteras vs Taquilla vs Guardarropa)
 */
function accesoSimpleRegistrar(payload) {
  if (!payload) throw new Error('Datos de acceso no proporcionados.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    const sCob = m.getSheetByName('COBROS');

    const customer = String(payload.customer || 'Asistente').trim();
    const phone = String(payload.phone || '').trim();
    const email = String(payload.email || '').trim();
    const activity = String(payload.activity || 'Operación diaria').trim();
    const salesChannel = String(payload.salesChannel || ACCESS_SALES_CHANNELS.TAQUILLA_DOMUS).trim();
    const ticketTypeId = String(payload.ticketTypeId || payload.entryType || 'General').trim();
    const persons = Number(payload.persons) || (ticketTypeId === 'Pareja' ? 2 : (ticketTypeId === 'Trío' ? 3 : 1));
    const faceValue = parseFloat(payload.faceValue || payload.entryPrice) || 0;
    
    const wardrobeQty = Math.max(0, parseInt(payload.wardrobeQty, 10) || 0);
    const wardrobeNotes = String(payload.wardrobeNotes || '').trim();
    const wardrobeUnitPrice = (payload.wardrobeUnitPrice !== undefined && payload.wardrobeUnitPrice !== null && payload.wardrobeUnitPrice !== '') ? Number(payload.wardrobeUnitPrice) : 50;
    const wardrobeAmount = wardrobeQty * wardrobeUnitPrice;

    const ticketProvider = String(payload.ticketProvider || (salesChannel === ACCESS_SALES_CHANNELS.BOLETERA_EXTERNA ? 'Boletera' : 'DOMUS')).trim();
    const externalTicketId = String(payload.externalTicketId || payload.presaleFolio || payload.folio || '').trim();
    const courtesyAuth = String(payload.courtesyAuth || '').trim();
    const paymentMethod = String(payload.paymentMethod || payload.method || 'Efectivo').trim();
    const paymentReference = String(payload.paymentReference || '').trim();

    // Verificación Anti pass-back: si se proporciona un folio/código QR, validar que no haya ingresado previamente
    if (externalTicketId && sAcc) {
      const lastRow = sAcc.getLastRow();
      if (lastRow >= 7) {
        const existingExternalTickets = sAcc.getRange(7, 18, lastRow - 6, 1).getValues();
        const alreadyUsed = existingExternalTickets.some(r => String(r[0]).trim() === externalTicketId);
        if (alreadyUsed) {
          throw new Error('Boleto ya utilizado previamente. Folio: ' + externalTicketId);
        }
      }
    }

    // Guardrail pre-evento: Validación de tarifa y acuerdo comercial autorizado (ADR-005)
    const requiresDoorAdmissionCharge = (salesChannel === ACCESS_SALES_CHANNELS.TAQUILLA_DOMUS || salesChannel === ACCESS_SALES_CHANNELS.TRANSFERENCIA_DIRECTA) && ticketTypeId !== 'SOLO_GUARDARROPA' && ticketTypeId !== 'GUARDARROPA';

    if (requiresDoorAdmissionCharge) {
      const sAct = m.getSheetByName('ACTIVIDADES');
      let matchedAct = null;
      if (sAct && sAct.getLastRow() >= 7) {
        const rawActs = sAct.getRange('A7:M' + sAct.getLastRow()).getValues();
        matchedAct = rawActs.find(r => String(r[0] || '').trim().toLowerCase() === activity.toLowerCase());
      }

      if (!matchedAct) {
        const err = new Error(`EVENT_PRICING_NOT_CONFIRMED: El evento "${activity}" no existe en ACTIVIDADES o no cuenta con programación oficial.`);
        err.status = 400;
        err.code = 'EVENT_PRICING_NOT_CONFIRMED';
        throw err;
      }

      const actStatus = String(matchedAct[11] || '').trim().toLowerCase();
      if (actStatus === 'por validar' || actStatus === 'pendiente' || actStatus === 'no confirmado') {
        const err = new Error(`EVENT_PRICING_NOT_CONFIRMED: El acuerdo comercial del evento "${activity}" está "${matchedAct[11]}". No se pueden cobrar entradas en taquilla hasta que Dirección apruebe las tarifas oficiales.`);
        err.status = 400;
        err.code = 'EVENT_PRICING_NOT_CONFIRMED';
        throw err;
      }

      // Validar precio oficial del tipo de boleto
      let officialPrice = 0;
      if (ticketTypeId === 'General') officialPrice = parseFloat(matchedAct[4]) || 0;
      else if (ticketTypeId === 'Pareja') officialPrice = parseFloat(matchedAct[5]) || 0;
      else if (ticketTypeId === 'Trío') officialPrice = parseFloat(matchedAct[6]) || 0;
      else {
        try {
          if (matchedAct[12] && String(matchedAct[12]).trim().startsWith('[')) {
            const customs = JSON.parse(matchedAct[12]);
            const foundCustom = customs.find(c => c.id === ticketTypeId || c.name === ticketTypeId);
            if (foundCustom) officialPrice = parseFloat(foundCustom.price) || 0;
          }
        } catch (e) {}
      }

      if (officialPrice <= 0 && faceValue <= 0) {
        const err = new Error(`EVENT_PRICING_NOT_CONFIRMED: El tipo de boleto "${ticketTypeId}" para el evento "${activity}" no tiene una tarifa válida autorizada.`);
        err.status = 400;
        err.code = 'EVENT_PRICING_NOT_CONFIRMED';
        throw err;
      }
    }

    // 1. Cálculo financiero estricto de puerta:
    let ticketDoorCharge = 0;
    let paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;

    if (salesChannel === ACCESS_SALES_CHANNELS.BOLETERA_EXTERNA) {
      ticketDoorCharge = 0;
      paymentStatus = ACCESS_PAYMENT_STATUS.PAGADO_EXTERNAMENTE;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.PREVENTA_DOMUS) {
      ticketDoorCharge = 0; // Ya cobrada con anterioridad en DOMUS
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.CORTESIA || salesChannel === ACCESS_SALES_CHANNELS.LISTA) {
      ticketDoorCharge = 0;
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.TRANSFERENCIA_DIRECTA) {
      const isVerified = payload.isTransferVerified === true || payload.paymentStatus === ACCESS_PAYMENT_STATUS.CONFIRMADA;
      paymentStatus = isVerified ? ACCESS_PAYMENT_STATUS.CONFIRMADA : ACCESS_PAYMENT_STATUS.PENDIENTE_VERIFICACION;
      ticketDoorCharge = isVerified ? faceValue : 0;
    } else {
      // TAQUILLA_DOMUS
      ticketDoorCharge = faceValue;
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    }

    // El cobro en puerta es la suma del boleto de taquilla + guardarropa
    const doorCollectedTotal = ticketDoorCharge + wardrobeAmount;
    const commercialTotal = faceValue + wardrobeAmount;
    const dueAtDoor = (salesChannel === ACCESS_SALES_CHANNELS.TAQUILLA_DOMUS ? faceValue : 0) + wardrobeAmount - doorCollectedTotal;

    const reqKey = String(payload.id || payload.requestId || '').trim();

    // 2. Doble verificación a nivel base de datos en COBROS (Idempotencia Fuerte):
    if (reqKey && sCob) {
      const existingPayments = sCob.getRange(7, 1, 500, 14).getValues();
      const existingPay = existingPayments.find(r => r[8] === 'ACCESO-WEB:' + reqKey);
      if (existingPay && existingPay[0]) {
        console.log(`[IDEMPOTENCY EN SHEETS] Acceso previo localizado en COBROS: Folio ${existingPay[0]} para ${reqKey}`);
        return {
          ok: true,
          ticket: String(existingPay[3] || reqKey),
          rowId: String(existingPay[3] || reqKey),
          customer: String(existingPay[7] || customer),
          total: Number(existingPay[5]) || doorCollectedTotal,
          doorCollected: Number(existingPay[5]) || doorCollectedTotal,
          paid: true,
          date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
          message: `Acceso previamente confirmado (recuperado de COBROS): Folio ${existingPay[3] || existingPay[0]}`
        };
      }
    }

    // Generar Folio Atómico Inmutable de Acceso
    const rowIdx = Math.max(sAcc.getLastRow() + 1, 7);
    const rowId = 'A-' + String(rowIdx).padStart(4, '0');
    const guaTicket = wardrobeQty > 0 ? ('GUA-' + rowId) : '';

    // Escribir en ACCESO (22 campos según ADR-005)
    const rowData = [
      rowId,                          // Col 1: accessId
      new Date(),                     // Col 2: checkedInAt
      activity,                       // Col 3: eventId / activity
      customer,                       // Col 4: customer
      email,                          // Col 5: email
      phone,                          // Col 6: phone
      ticketTypeId,                   // Col 7: ticketTypeId
      persons,                        // Col 8: persons (aforo)
      wardrobeQty,                    // Col 9: wardrobeQty
      faceValue,                      // Col 10: faceValue
      faceValue,                      // Col 11: precio base
      faceValue,                      // Col 12: precio catálogo
      wardrobeAmount,                 // Col 13: wardrobeAmount
      commercialTotal,                // Col 14: valor comercial total
      doorCollectedTotal,             // Col 15: cobrado en puerta DOMUS
      dueAtDoor,                      // Col 16: saldo por cobrar
      paymentStatus,                  // Col 17: paymentStatus
      externalTicketId,               // Col 18: externalTicketId / QR
      courtesyAuth,                   // Col 19: courtesyAuth
      salesChannel,                   // Col 20: salesChannel
      ticketProvider,                 // Col 21: ticketProvider
      paymentReference,               // Col 22: paymentReference
      'Registrado',                   // Col 23: estado checkin
      '', '', persons,                // Col 24-26
      paymentMethod,                  // Col 27: paymentMethod
      doorCollectedTotal,             // Col 28: cobrado
      true,                           // Col 29: activo
      guaTicket ? ('TICKETS FÍSICOS · ' + guaTicket + (wardrobeNotes ? ' · ' + wardrobeNotes : '')) : 'CONFIRMADO',
      guaTicket,                      // Col 31: ticketGuardarropa
      false                           // Col 32: devuelto
    ];

    sAcc.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);

    // 3. Asentar en COBROS ÚNICAMENTE lo que DOMUS cobra en puerta:
    // A. Cobro de Entrada de Taquilla
    if (ticketDoorCharge > 0 && sCob) {
      const cobIdx = Math.max(sCob.getLastRow() + 1, 7);
      const cobFolio = 'REC-TAQ-' + Date.now().toString(36).toUpperCase();
      const cobRow = [
        cobFolio, new Date(), 'Acceso', rowId, paymentMethod, ticketDoorCharge,
        paymentMethod === 'Efectivo' ? 0 : '', customer, 'ACCESO-WEB:' + rowId,
        '', 'Confirmado', 'Taquilla', ticketDoorCharge, ticketDoorCharge, '',
        activity, 0, 0, 0, 'SISTEMA-WEB'
      ];
      sCob.getRange(cobIdx, 1, 1, cobRow.length).setValues([cobRow]);
    }

    // B. Cobro de Guardarropa independiente
    if (wardrobeAmount > 0 && sCob) {
      const cobIdxGua = Math.max(sCob.getLastRow() + 1, 7);
      const cobFolioGua = 'REC-GUA-' + Date.now().toString(36).toUpperCase();
      const cobRowGua = [
        cobFolioGua, new Date(), 'Acceso', guaTicket, paymentMethod, wardrobeAmount,
        paymentMethod === 'Efectivo' ? 0 : '', customer, 'ACCESO-GUA:' + guaTicket,
        '', 'Confirmado', 'Guardarropa', wardrobeAmount, wardrobeAmount, '',
        activity, 0, 0, 0, 'SISTEMA-WEB'
      ];
      sCob.getRange(cobIdxGua, 1, 1, cobRowGua.length).setValues([cobRowGua]);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      ticket: rowId,
      rowId: rowId,
      ticketGuardarropa: guaTicket,
      customer: customer,
      activity: activity,
      ticketTypeId: ticketTypeId,
      salesChannel: salesChannel,
      ticketProvider: ticketProvider,
      persons: persons,
      faceValue: faceValue,
      wardrobeQty: wardrobeQty,
      wardrobeAmount: wardrobeAmount,
      totalCommercial: commercialTotal,
      doorCollected: doorCollectedTotal,
      paymentStatus: paymentStatus,
      paymentMethod: paymentMethod,
      date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
      message: `Acceso registrado con éxito. Folio: ${rowId}${guaTicket ? ' · ' + guaTicket : ''}`
    };
  });
}

/**
 * Devuelve una prenda de guardarropa
 */
function guardarropaDevolver(payload) {
  if (!payload || !payload.ticket) throw new Error('Ticket de guardarropa requerido.');
  const ticket = String(payload.ticket).trim();

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    if (!sAcc) throw new Error('Hoja ACCESO no encontrada.');

    const lastRow = Math.max(sAcc.getLastRow(), 7);
    const rows = sAcc.getRange(7, 1, lastRow - 6, 32).getValues();
    let foundRow = -1;
    let alreadyReturned = false;

    for (let i = 0; i < rows.length; i++) {
      const rowTicketGuardarropa = String(rows[i][30]).trim();
      const rowAccessId = String(rows[i][0]).trim();
      if (rowTicketGuardarropa === ticket || rowAccessId === ticket) {
        foundRow = i + 7;
        const valCol32 = rows[i][31];
        if (valCol32 === true || String(valCol32).toUpperCase().includes('DEVUELTO') || String(rows[i][28]).toUpperCase().includes('DEVUELTO')) {
          alreadyReturned = true;
        }
        break;
      }
    }

    if (foundRow === -1) {
      throw new Error(`Ticket de guardarropa "${ticket}" no encontrado.`);
    }

    if (alreadyReturned) {
      throw new Error(`Prenda del ticket "${ticket}" ya fue devuelta previamente.`);
    }

    sAcc.getRange(foundRow, 32).setValue(true);
    sAcc.getRange(foundRow, 29).setValue('DEVUELTO');
    SpreadsheetApp.flush();

    return {
      ok: true,
      ticket: ticket,
      message: `Prenda del ticket "${ticket}" devuelta exitosamente.`
    };
  });
}

/**
 * Cambia la actividad / evento activo en el sistema
 */
function accesoCambiarActividad(payload) {
  if (!payload || !payload.activity) throw new Error('Actividad no especificada.');
  const act = String(payload.activity).trim();
  operatingActivityValidate_(act);
  PropertiesService.getScriptProperties().setProperty('actividadAcceso', act);
  return { ok: true, activeActivity: act };
}

// ==================== END OF Access.gs ====================


// ==================== START OF Payments.gs ====================

/**
 * ============================================================================
 * DOMUS OS · PAYMENTS & CONCILIATION (Payments.gs)
 * Registro de transacciones en COBROS, validación de medios de pago y folios
 * ============================================================================
 */


/**
 * Registra un cobro asentado en la hoja maestra COBROS
 */
function recordPaymentTransaction_(m, payload) {
  const sCobros = m.getSheetByName('COBROS');
  if (!sCobros) throw new Error('Hoja COBROS no encontrada.');

  const folio = payload.folio || ('REC-' + Date.now().toString(36).toUpperCase());
  const now = new Date();
  const nextRow = Math.max(sCobros.getLastRow() + 1, 7);

  const rowData = [
    folio,
    now,
    payload.origin || 'Caja',
    payload.ticket || '',
    payload.method || 'Efectivo',
    Number(payload.amount) || 0,
    payload.method === 'Efectivo' ? 0 : '',
    payload.customer || 'Público General',
    payload.tag || ('PAGO:' + folio),
    '',
    payload.method === 'Transferencia' ? 'Borrador' : 'Confirmado',
    payload.operator || 'Caja',
    Number(payload.amount) || 0,
    Number(payload.amount) || 0,
    '',
    payload.activity || 'Visita general DOMUS',
    0, 0, 0, 'SISTEMA-WEB',
    '', '', '', '', '', '', '',
    payload.detailsJson || '',
    Number(payload.tip) || 0,
    payload.received !== undefined && payload.received !== null ? Number(payload.received) : '',
    payload.change !== undefined && payload.change !== null ? Number(payload.change) : ''
  ];

  sCobros.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);
  SpreadsheetApp.flush();

  return {
    folio: folio,
    amount: Number(payload.amount) || 0,
    method: payload.method,
    date: now
  };
}

// ==================== END OF Payments.gs ====================


// ==================== START OF Accounts.gs ====================

/**
 * ============================================================================
 * DOMUS OS · CUSTOMER ACCOUNTS & BALANCES (Accounts.gs)
 * Gestión de saldos de cuentas abiertas, aperturas, autorizaciones y cierres
 * ============================================================================
 */


function accountKey_(ticket) {
  return 'cuenta:' + Utilities.base64EncodeWebSafe(String(ticket));
}

function account_(ticket) {
  const raw = PropertiesService.getScriptProperties().getProperty(accountKey_(ticket));
  return JSON.parse(raw || '{}');
}

function putAccount_(ticket, a) {
  PropertiesService.getScriptProperties().setProperty(accountKey_(ticket), JSON.stringify(a));
}

function posBalanceFast_(x, ticket) {
  const sCaja = x.c || x.m.getSheetByName('CAJA 2');
  const sCobros = x.m.getSheetByName('COBROS');

  const rows = sCaja.getRange(7, 1, 500, 32).getValues()
    .filter(r => String(r[1]) === String(ticket) && r[6] && r[15] !== 'Cancelado');

  const total = rows.reduce((n, r) => n + (Number(r[11]) || 0), 0);

  const paid = sCobros.getRange(7, 1, 500, 14).getValues()
    .filter(r => r[2] === 'Caja' && String(r[3]) === String(ticket))
    .reduce((n, r) => n + (Number(r[13]) || 0), 0);

  return {
    rows: rows,
    total: posRound_(total),
    paid: posRound_(paid),
    due: posRound_(total - paid)
  };
}

function closeCashAccount_(x, ticket, who) {
  const b = posBalanceFast_(x, ticket);
  if (b.due > 0.01) {
    throw new Error(`No se puede cerrar la cuenta '${ticket}'. Presenta un saldo pendiente de $${b.due.toFixed(2)}.`);
  }

  const a = account_(ticket);
  a.closed = true;
  a.closedBy = who;
  a.closedAt = new Date().toISOString();
  putAccount_(ticket, a);

  return { ok: true, ticket: ticket, message: `Cuenta '${ticket}' cerrada formalmente por ${who}.` };
}

function reopenCashAccount_(ticket, who, reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('El motivo de reapertura es obligatorio para auditoría.');
  }

  const a = account_(ticket);
  a.closed = false;
  a.events = a.events || [];
  a.events.push({
    action: 'Reabrir',
    who: who,
    reason: String(reason).trim(),
    at: new Date().toISOString()
  });
  putAccount_(ticket, a);

  return { ok: true, ticket: ticket, message: `Cuenta '${ticket}' reabierta con éxito.` };
}

// ==================== END OF Accounts.gs ====================


// ==================== START OF Events.gs ====================

/**
 * ============================================================================
 * DOMUS OS · EVENTS & CALENDAR MANAGEMENT (Events.gs)
 * Programación de eventos en ACTIVIDADES y definición de tarifas de admisión
 * ============================================================================
 */


/**
 * Registra una nueva actividad o evento con su estructura tarifaria autorizada
 */
function registrarNuevoEvento(evento) {
  if (!evento || !evento.name) throw new Error('El nombre del evento es requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAct = m.getSheetByName('ACTIVIDADES');
    if (!sAct) throw new Error('Hoja ACTIVIDADES no encontrada.');

    const rowIdx = Math.max(sAct.getLastRow() + 1, 7);
    
    // Serializar tipos de boletos personalizados si se proporcionan
    let notesVal = evento.notes || '';
    if (Array.isArray(evento.ticketTypes) && evento.ticketTypes.length > 0) {
      notesVal = JSON.stringify(evento.ticketTypes);
    }

    const rowData = [
      evento.name,
      evento.date ? new Date(evento.date + 'T12:00:00') : new Date(),
      evento.type || 'CLUB_NOCTURNO',
      evento.organizer || 'DOMUS',
      parseFloat(evento.priceGeneral) || 0,
      parseFloat(evento.pricePareja) || 0,
      parseFloat(evento.priceTrio) || 0,
      parseFloat(evento.priceGuardarropa) || 50,
      parseInt(evento.capacity, 10) || 150,
      'DOMUS',
      'Bruto',
      'Confirmado',
      notesVal
    ];

    sAct.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: `Evento "${evento.name}" programado con éxito en ACTIVIDADES.`
    };
  });
}

// ==================== END OF Events.gs ====================


// ==================== START OF OperatingProfiles.gs ====================
/**
 * DOMUS OS · SOLAR / LUNAR OPERATING PROFILES
 * Operational control for POS phase + active access activity.
 * Does not alter historical sales or ACCESO rows.
 */


const DOMUS_OPERATING_PROFILES = Object.freeze({
  Solar: Object.freeze({
    id: 'Solar',
    phase: 'Solar',
    label: 'DOMUS Solar',
    intendedWindow: '14:00–21:00',
    priceField: 'priceSolar'
  }),
  Lunar: Object.freeze({
    id: 'Lunar',
    phase: 'Lunar',
    label: 'DOMUS Lunar',
    intendedWindow: '21:00–cierre / según programación',
    priceField: 'priceLunar'
  })
});

function operatingProfileDatos_() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sCaja = m.getSheetByName('CAJA 2');
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sCat = m.getSheetByName('CATALOGO');
  const sApertura = m.getSheetByName('APERTURA');
  const props = PropertiesService.getScriptProperties();

  const phaseRaw = sCaja ? String(sCaja.getRange('F2').getValue() || 'Solar').trim() : 'Solar';
  const phase = DOMUS_OPERATING_PROFILES[phaseRaw] ? phaseRaw : 'Solar';
  const activeActivity = String(props.getProperty('actividadAcceso') || '').trim();

  const activities = [];
  if (sAct && sAct.getLastRow() >= 7) {
    const rows = sAct.getRange(7, 1, Math.min(sAct.getLastRow() - 6, 100), 13).getValues();
    rows.forEach(r => {
      if (!r[0]) return;
      activities.push({
        name: String(r[0] || '').trim(),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        area: String(r[2] || '').trim(),
        organizer: String(r[3] || '').trim(),
        priceGeneral: Number(r[4]) || 0,
        pricePareja: Number(r[5]) || 0,
        priceTrio: Number(r[6]) || 0,
        priceGuardarropa: (r[7] === '' || r[7] === null || r[7] === undefined) ? null : Number(r[7]),
        status: String(r[11] || '').trim()
      });
    });
  }

  const selectedActivity = activities.find(a => a.name === activeActivity) || null;
  const confirmedActivities = activities.filter(a => a.status.toLowerCase() === 'confirmado');

  let activeProducts = 0;
  let invalidDestination = 0;
  let phasePricedProducts = 0;
  if (sCat && sCat.getLastRow() >= 7) {
    const rows = sCat.getRange(7, 1, Math.min(sCat.getLastRow() - 6, 500), 20).getValues();
    rows.forEach(r => {
      if (!r[0] || String(r[8] || '').trim() !== 'Sí') return;
      activeProducts++;
      const destination = String(r[7] || '').trim();
      if (!['Barra', 'Cocina'].includes(destination)) invalidDestination++;
      const hasDualPrice = !!r[15];
      const p = hasDualPrice ? Number(r[phase === 'Solar' ? 16 : 17]) : Number(r[2]);
      if (Number.isFinite(p) && p >= 0) phasePricedProducts++;
    });
  }

  let opening = {
    checklistMarked: 0,
    checklistTotal: 8,
    date: '',
    isToday: false
  };
  if (sApertura) {
    const checks = sApertura.getRange('A5:A12').getValues().flat();
    const arrival = sApertura.getRange('B3').getValue();
    const today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
    const openingDate = arrival instanceof Date
      ? Utilities.formatDate(arrival, 'America/Mexico_City', 'yyyy-MM-dd')
      : '';
    opening = {
      checklistMarked: checks.filter(v => v === true).length,
      checklistTotal: checks.length,
      date: openingDate,
      isToday: openingDate === today
    };
  }

  const blockers = [];
  if (!selectedActivity) blockers.push('ACTIVE_ACTIVITY_NOT_FOUND');
  if (selectedActivity && selectedActivity.status.toLowerCase() !== 'confirmado') blockers.push('ACTIVE_ACTIVITY_NOT_CONFIRMED');
  if (activeProducts === 0) blockers.push('NO_ACTIVE_PRODUCTS');
  if (phasePricedProducts < activeProducts) blockers.push('CATALOG_PHASE_PRICE_GAPS');
  if (invalidDestination > 0) blockers.push('INVALID_KDS_DESTINATIONS');
  if (!opening.isToday) blockers.push('OPENING_NOT_TODAY');
  if (opening.checklistMarked < opening.checklistTotal) blockers.push('OPENING_CHECKLIST_INCOMPLETE');

  return {
    environment: CONFIG.environment,
    profile: phase,
    preset: DOMUS_OPERATING_PROFILES[phase],
    activeActivity: activeActivity,
    selectedActivity: selectedActivity,
    confirmedActivities: confirmedActivities,
    catalog: {
      activeProducts: activeProducts,
      phasePricedProducts: phasePricedProducts,
      invalidDestination: invalidDestination
    },
    opening: opening,
    readiness: {
      ready: blockers.length === 0,
      blockers: blockers
    },
    profiles: DOMUS_OPERATING_PROFILES
  };
}

function operatingContextValidate_(payload) {
  payload = payload || {};
  const phase = String(payload.phase || payload.profile || '').trim();
  const activity = String(payload.activity || '').trim();

  if (!['Solar', 'Lunar'].includes(phase)) {
    const err = new Error('OPERATING_CONTEXT_INVALID: phase debe ser Solar o Lunar.');
    err.status = 400;
    err.code = 'OPERATING_CONTEXT_INVALID';
    throw err;
  }

  let activityInfo = null;
  if (activity) {
    activityInfo = operatingActivityValidate_(activity);
    const allowedUnits = activityInfo.allowedUnits || ['Solar', 'Lunar'];
    if (!allowedUnits.includes(phase)) {
      const err = new Error('OPERATING_CONTEXT_MISMATCH: la actividad "' + activity + '" no corresponde a ' + phase + '.');
      err.status = 400;
      err.code = 'OPERATING_CONTEXT_MISMATCH';
      throw err;
    }
  }

  return {
    ok: true,
    phase: phase,
    activity: activity,
    activityInfo: activityInfo,
    mode: 'CONCURRENT_TRANSACTION_CONTEXT'
  };
}

function operatingContextsDatos_() {
  const base = operatingProfileDatos_();
  const today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
  const contexts = (base.confirmedActivities || []).filter(a => a.date === today).map(a => {
    const raw = String(a.area || '').toLowerCase();
    let units = [];
    if (raw.includes('solar')) units.push('Solar');
    if (raw.includes('lunar') || raw.includes('club') || raw.includes('nocturno')) units.push('Lunar');
    if (units.length === 0) units = ['Solar', 'Lunar'];
    return {
      activity: a.name,
      date: a.date,
      units: units,
      priceGeneral: a.priceGeneral,
      pricePareja: a.pricePareja,
      priceTrio: a.priceTrio,
      priceGuardarropa: a.priceGuardarropa,
      status: a.status
    };
  });

  const blockers = [];
  if (contexts.length === 0) blockers.push('NO_CONFIRMED_CONTEXT_TODAY');
  if (!base.catalog || base.catalog.activeProducts === 0) blockers.push('NO_ACTIVE_PRODUCTS');
  if (base.catalog && base.catalog.phasePricedProducts < base.catalog.activeProducts) blockers.push('CATALOG_PHASE_PRICE_GAPS');
  if (base.catalog && base.catalog.invalidDestination > 0) blockers.push('INVALID_KDS_DESTINATIONS');
  if (!base.opening || !base.opening.isToday) blockers.push('OPENING_NOT_TODAY');
  if (base.opening && base.opening.checklistMarked < base.opening.checklistTotal) blockers.push('OPENING_CHECKLIST_INCOMPLETE');

  return {
    environment: CONFIG.environment,
    mode: 'CONCURRENT_TRANSACTION_CONTEXT',
    defaultPhase: base.profile,
    contexts: contexts,
    catalog: base.catalog,
    opening: base.opening,
    readiness: {
      ready: blockers.length === 0,
      blockers: blockers
    }
  };
}

function operatingActivityValidate_(activity) {
  const clean = String(activity || '').trim();
  if (!clean) throw new Error('Actividad no especificada.');

  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  if (!sAct) throw new Error('Hoja ACTIVIDADES no encontrada.');

  const lastRow = Math.max(sAct.getLastRow(), 7);
  const rows = sAct.getRange(7, 1, Math.max(lastRow - 6, 1), 13).getValues();
  const match = rows.find(r => String(r[0] || '').trim().toLowerCase() === clean.toLowerCase());

  if (!match) {
    const err = new Error('OPERATING_ACTIVITY_NOT_FOUND: la actividad no existe en ACTIVIDADES.');
    err.status = 400;
    err.code = 'OPERATING_ACTIVITY_NOT_FOUND';
    throw err;
  }

  const status = String(match[11] || '').trim();
  if (status.toLowerCase() !== 'confirmado') {
    const err = new Error('OPERATING_ACTIVITY_NOT_CONFIRMED: la actividad está "' + status + '".');
    err.status = 400;
    err.code = 'OPERATING_ACTIVITY_NOT_CONFIRMED';
    throw err;
  }

  const area = String(match[2] || '').trim();
  const raw = area.toLowerCase();
  let allowedUnits = [];
  if (raw.includes('solar')) allowedUnits.push('Solar');
  if (raw.includes('lunar') || raw.includes('club') || raw.includes('nocturno')) allowedUnits.push('Lunar');
  if (allowedUnits.length === 0) allowedUnits = ['Solar', 'Lunar'];

  return {
    name: clean,
    status: status,
    area: area,
    date: match[1] instanceof Date ? Utilities.formatDate(match[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(match[1] || ''),
    allowedUnits: allowedUnits
  };
}

// ==================== END OF OperatingProfiles.gs ====================

// ==================== START OF Api.gs ====================
/**
 * ============================================================================
 * DOMUS OS · API ROUTER & DISPATCHER (Api.gs)
 * Enrutamiento REST (GET / POST) y entrega de interfaz HTML para Apps Script
 * ============================================================================
 */


/**
 * Enrutador GET: Sirve la aplicación Web o responde consultas de lectura REST
 */
function doGet(e) {
  try {
    // Manejo de peticiones API (GET)
    if (e && e.parameter && e.parameter.action) {
      return handleApiGetRequest_(e.parameter.action, e.parameter);
    }

    // Renderizado de la Interfaz Web Unificada con búsqueda tolerante de nombre
    let output;
    const candidates = ['Index', 'index', 'Index.html', 'index.html'];
    for (let i = 0; i < candidates.length; i++) {
      try {
        output = HtmlService.createHtmlOutputFromFile(candidates[i]);
        if (output) break;
      } catch (err) {}
    }

    if (!output) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        status: 'DOMUS OS API ONLINE',
        environment: CONFIG.environment,
        mainSheetId: CONFIG.mainSheetId,
        opsSheetId: CONFIG.opsSheetId,
        message: 'Backend activo y conectado a Staging. Si deseas ver la interfaz visual en esta URL, crea el archivo HTML llamado "Index" en el editor de Apps Script.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return output
      .setTitle('DOMUS · Administración, Caja, Comandas & Accesos')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: 'Error en doGet: ' + err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Compatibilidad hacia atrás con extensiones heredadas de Apps Script (ej. ComandasSimple)
 * Desactiva el error 'Instalacion incompleta: renombra el doGet original a domusCajaDoGetOriginal_'
 */
function domusCajaDoGetOriginal_(e) {
  return doGet(e);
}

/**
 * Enrutador POST: Recepción de mutaciones transaccionales y RPC
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = (e && e.parameter && e.parameter.action) || payload.action;
    const args = payload.args || [];
    const sessionToken = payload.sessionToken || (e && e.parameter && e.parameter.token) || '';
    const role = payload.role || (e && e.parameter && e.parameter.role) || '';
    const deviceId = payload.deviceId || (e && e.parameter && e.parameter.deviceId) || '';
    const requestId = payload.requestId || (payload.args && payload.args[0] && (payload.args[0].id || payload.args[0].requestId)) || '';

    if (!action) {
      throw new Error('Parámetro "action" no especificado en la solicitud.');
    }

    // 1. Validación de Roles y Seguridad del Servidor (RBAC)
    const authContext = authValidateAction(action, sessionToken, role, deviceId);

    // 2. Enrutamiento con Idempotencia y Candado para Operaciones Mutativas
    let result;

    switch (action) {
      // --- AUTENTICACIÓN ---
      case 'authCrearSesion':
        result = authCreateSession(args[0] || role, deviceId, args[1] || 'Operador');
        break;

      // --- CAJA / POS ---
      case 'cajaSimpleDatos':
        result = cajaSimpleDatos();
        break;
      case 'cajaSimpleRegistrar':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => cajaSimpleRegistrar(args[0]));
        break;
      case 'cajaSimpleEstado':
        result = cajaSimpleEstado(args[0]);
        break;
      case 'cajaSimplePreparar':
        result = cajaSimplePreparar(args[0]);
        break;

      // --- COMANDAS / KDS ---
      case 'comandasSimpleDatos':
        result = comandasSimpleDatos(sessionToken || args[0]);
        break;
      case 'comandasSimpleAccion':
        result = idempotentExecute_(requestId, action, args, deviceId, () => comandasSimpleAccion(sessionToken, args[1] || args[0]));
        break;
      case 'comandasSimpleResolver':
        result = idempotentExecute_(requestId, action, args, deviceId, () => comandasSimpleResolver(sessionToken, args[1] || args[0]));
        break;
      case 'comandasSimpleEntrar':
        result = comandasSimpleEntrar(args[0]);
        break;

      // --- ACCESOS & GUARDARROPA ---
      case 'accesoSimpleDatos':
        result = accesoSimpleDatos();
        break;
      case 'accesoSimpleRegistrar':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => accesoSimpleRegistrar(args[0]));
        break;
      case 'guardarropaDevolver':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => guardarropaDevolver(args[0]));
        break;
      case 'accesoCambiarActividad':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => accesoCambiarActividad(args[0]));
        break;
      case 'registrarNuevoEvento':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => registrarNuevoEvento(args[0]));
        break;

      // --- OPERACIÓN SOLAR / LUNAR ---
      case 'operatingProfileDatos':
        result = operatingProfileDatos_();
        break;
      case 'operatingContextsDatos':
        result = operatingContextsDatos_();
        break;
      case 'operatingContextValidate':
        result = operatingContextValidate_(args[0]);
        break;

      // --- INVENTARIO & CATÁLOGO ---
      case 'sincronizarCartaConCatalogoDOMUS':
        result = idempotentExecute_(requestId, action, null, deviceId, () => sincronizarCartaConCatalogoDOMUS());
        break;
      case 'registrarNuevoProducto':
        result = idempotentExecute_(requestId, action, args[0], deviceId, () => registrarNuevoProducto(args[0]));
        break;
      case 'sincronizarJujutsuShi':
        result = idempotentExecute_(requestId, action, null, deviceId, () => sincronizarJujutsuShi());
        break;

      default:
        throw new Error('Acción no soportada en API DOMUS: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      data: result,
      requestId: requestId,
      role: authContext.role
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('[API ERROR]', err);
    const statusCode = err.status || (err.message && err.message.includes('IDEMPOTENCY_KEY_REUSED') ? 409 : 500);
    const errorCode = err.code || (statusCode === 409 ? 'IDEMPOTENCY_KEY_REUSED' : 'SERVER_ERROR');
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      status: statusCode,
      code: errorCode,
      error: err.message || String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Enrutador GET para consultas de solo lectura
 */
function handleApiGetRequest_(action, params) {
  try {
    let data;
    if (action === 'cajaSimpleDatos') {
      data = cajaSimpleDatos();
    } else if (action === 'comandasSimpleDatos') {
      data = comandasSimpleDatos(params.token || '');
    } else if (action === 'accesoSimpleDatos') {
      data = accesoSimpleDatos();
    } else if (action === 'cajaSimpleEstado') {
      data = cajaSimpleEstado(params.id || '');
    } else if (action === 'operatingProfileDatos') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = operatingProfileDatos_();
    } else if (action === 'operatingContextsDatos') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = operatingContextsDatos_();
    } else if (action === 'ping' || action === 'health') {
      data = {
        status: 'HEALTHY',
        environment: CONFIG.environment,
        mainSheetId: CONFIG.mainSheetId,
        opsSheetId: CONFIG.opsSheetId,
        timestamp: new Date().toISOString()
      };
    } else {
      data = { status: 'DOMUS OS API Activa', environment: CONFIG.environment, timestamp: new Date().toISOString() };
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== END OF Api.gs ====================
