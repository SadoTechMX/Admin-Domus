/**
 * ============================================================================
 * DOMUS OS · API ROUTER & DISPATCHER (Api.gs)
 * Enrutamiento REST (GET / POST) y entrega de interfaz HTML para Apps Script
 * ============================================================================
 */

'use strict';

/**
 * Enrutador GET: Sirve la aplicación Web o responde consultas de lectura REST
 */
function doGet(e) {
  return domusHandleDoGet_(e);
}

/**
 * Compatibilidad hacia atrás con extensiones heredadas de Apps Script (ej. ComandasSimple)
 * Desactiva recursión si ComandasSimple define doGet delegando a domusCajaDoGetOriginal_
 */
function domusCajaDoGetOriginal_(e) {
  return domusHandleDoGet_(e);
}

function domusHandleDoGet_(e) {
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
    } else if (action === 'financeLedgerPreview') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = financeLedgerPreview_(params);
    } else if (action === 'financeSummaryPreview') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = financeSummaryPreview_(params);
    } else if (action === 'financeDailyPreview') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = financeDailyPreview_(params);
    } else if (action === 'financeDashboardPreview') {
      authValidateAction(action, params.token || '', params.role || '', params.deviceId || '');
      data = financeDashboardPreview_(params);
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
