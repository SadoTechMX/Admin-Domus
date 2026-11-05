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

    const boot={view:e && e.parameter && e.parameter.vista || 'caja',environment:CONFIG.environment};
    output.setContent(output.getContent().replace('</head>','<script>window.DOMUS_NATIVE_BOOT='+JSON.stringify(boot).replace(/</g,'\\u003c')+';</script></head>'));
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
 * Ejecutor centralizado de acciones DOMUS con validación RBAC e Idempotencia
 * Compartido por doPost (HTTP REST / GitHub Pages) y dispatchNativeAction (google.script.run / Apps Script UI)
 */
function executeDomusActionCore_(action, payload, params) {
  const p = payload || {};
  const args = p.args || [];
  const sessionToken = p.sessionToken || (params && params.token) || '';
  const role = p.role || (params && params.role) || '';
  const deviceId = p.deviceId || (params && params.deviceId) || '';
  const requestId = p.requestId || (args && args[0] && (args[0].id || args[0].requestId)) || (args && args[1] && (args[1].id || args[1].requestId)) || '';
  // Normalize transport envelopes before hashing. Never replace business ids (e.g. restock id).
  args.forEach(body => {
    if(body && typeof body === 'object' && !Array.isArray(body)) {
      body.requestId=requestId;
      if(['cajaSimpleRegistrar','accesoSimpleRegistrar'].includes(action) && !body.id) body.id=requestId;
    }
  });

  if (!action) {
    throw new Error('Parámetro "action" no especificado en la solicitud.');
  }

  // 1. Validación de Roles y Seguridad del Servidor (RBAC)
  const authContext = authValidateAction(action, sessionToken, role, deviceId);

  // 2. Enrutamiento con Idempotencia y Candado para Operaciones Mutativas
  let result;

  switch (action) {
    case 'health':
    case 'ping':
      result = {status:'HEALTHY',environment:CONFIG.environment,mainSheetId:CONFIG.mainSheetId,opsSheetId:CONFIG.opsSheetId,
        build:typeof BACKEND_BUILD !== 'undefined'?BACKEND_BUILD:null};
      break;
    case 'cambiarFase':
    case 'solicitarResurtido':
    case 'editarAcceso':
    case 'anularAcceso': {
      const actions={cambiarFase:cambiarFase,solicitarResurtido:solicitarResurtido,editarAcceso:editarAcceso,anularAcceso:anularAcceso};
      const body=Object.assign({},args[0],{requestId:requestId});
      result=idempotentExecute_(requestId,action,body,deviceId,()=>actions[action](body));
      break;
    }
    // --- AUTENTICACIÓN ---
    case 'authCrearSesion':
      result = authCreateSession(args[0] || role, deviceId, args[1] || '', args[3]);
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
    case 'comandasSimpleAccion': {
      const kdsBody = (args[0] && typeof args[0] === 'object') ? args[0] : args[1];
      result = idempotentExecute_(requestId, action, kdsBody, deviceId, () => comandasSimpleAccion(sessionToken, kdsBody));
      break;
    }
    case 'comandasSimpleResolver': {
      const kdsBody = (args[0] && typeof args[0] === 'object') ? args[0] : args[1];
      result = idempotentExecute_(requestId, action, kdsBody, deviceId, () => comandasSimpleResolver(sessionToken, kdsBody));
      break;
    }
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

  return {
    result: result,
    requestId: requestId,
    role: authContext.role
  };
}

/**
 * Enrutador POST: Recepción de mutaciones transaccionales y RPC (HTTP / GitHub Pages)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = (e && e.parameter && e.parameter.action) || payload.action;
    const res = executeDomusAction_(action, payload, e && e.parameter);

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      data: res.result,
      requestId: res.requestId,
      role: res.role
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
 * Dispatcher canónico común para ejecuciones nativas de Apps Script (google.script.run)
 * Garantiza que Apps Script y GitHub Pages ejecuten exactamente el mismo pipeline:
 * authValidateAction -> RBAC -> idempotentExecute_ -> función operativa
 */
function dispatchNativeAction(payload) {
  try {
    const pl = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
    const action = pl.action;
    const res = executeDomusAction_(action, pl, null);
    return {
      ok: true,
      data: res.result,
      requestId: res.requestId,
      role: res.role
    };
  } catch (err) {
    console.error('[NATIVE DISPATCH ERROR]', err);
    const statusCode = err.status || (err.message && err.message.includes('IDEMPOTENCY_KEY_REUSED') ? 409 : 500);
    const errorCode = err.code || (statusCode === 409 ? 'IDEMPOTENCY_KEY_REUSED' : 'SERVER_ERROR');
    return {
      ok: false,
      status: statusCode,
      code: errorCode,
      error: err.message || String(err)
    };
  }
}

/**
 * Enrutador GET para consultas de solo lectura
 */
function handleApiGetRequest_(action, params) {
  try {
    let data;
    if (['cajaSimpleDatos','comandasSimpleDatos','accesoSimpleDatos','cajaSimpleEstado'].includes(action)) {
      throw new Error('Acceso denegado: consulta privada requiere dispatcher autenticado POST.');
    } else if (action === 'ping' || action === 'health') {
      data = {
        status: 'HEALTHY',
        environment: CONFIG.environment,
        mainSheetId: CONFIG.mainSheetId,
        opsSheetId: CONFIG.opsSheetId,
        build: typeof BACKEND_BUILD !== 'undefined' ? BACKEND_BUILD : null,
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

function executeDomusAction_(action, payload, params) {
  const p = payload || {};
  const previous = _authContext;
  _authContext = authValidateAction(action, p.sessionToken || '', p.role || '', p.deviceId || '');
  _authContext.requestId=p.requestId || (p.args && p.args[0] && (p.args[0].requestId || p.args[0].id)) || '';
  try { return executeDomusActionCore_(action, p, params); }
  finally { _authContext = previous; }
}
