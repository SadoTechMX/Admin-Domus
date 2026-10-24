/**
 * ============================================================================
 * DOMUS OS · SISTEMA INTEGRADO DE CAJA Y COMANDAS (APPS SCRIPT BACKEND)
 * Compatible con ejecución nativa Web App y API REST (GitHub Pages)
 * ============================================================================
 */

const CONFIG = Object.freeze({
  mainSheetId: typeof D !== 'undefined' && D.main ? D.main : '1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U',
  opsSheetId: typeof D !== 'undefined' && D.ops ? D.ops : '1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc',
  managers: typeof D !== 'undefined' && D.managers ? D.managers : ['direccion@domusccc.net', 'sadotechfet@gmail.com'],
  staff: ['René', 'Miguel', 'Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'],
  sessionSeconds: 21600
});

/**
 * Enrutador GET: Sirve la aplicación Web unificada o responde consultas REST
 */
function doGet(e) {
  // 1. Manejo de peticiones API (GET) para GitHub Pages o clientes externos
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e.parameter.action, e.parameter);
  }

  // 2. Renderizado de la Interfaz Web Unificada (Caja y Comandas)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('DOMUS · Administración, Caja y Comandas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/**
 * Enrutador POST: Soporte para llamadas API desde GitHub Pages u otros clientes
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    const action = (e && e.parameter && e.parameter.action) || payload.action;
    const args = payload.args || [];

    let result;
    if (action === 'cajaSimpleDatos') {
      result = cajaSimpleDatos();
    } else if (action === 'cajaSimpleRegistrar') {
      result = cajaSimpleRegistrar(args[0]);
    } else if (action === 'comandasSimpleDatos') {
      result = comandasSimpleDatos(args[0]);
    } else if (action === 'comandasSimpleAccion') {
      result = comandasSimpleAccion(args[0], args[1]);
    } else if (action === 'comandasSimpleResolver') {
      result = comandasSimpleResolver(args[0], args[1]);
    } else if (action === 'comandasSimpleEntrar') {
      result = comandasSimpleEntrar(args[0]);
    } else {
      throw new Error('Acción no soportada: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiRequest_(action, params) {
  try {
    let data;
    if (action === 'cajaSimpleDatos') {
      data = cajaSimpleDatos();
    } else if (action === 'comandasSimpleDatos') {
      data = comandasSimpleDatos(params.token || '');
    } else {
      data = { status: 'DOMUS API activa', timestamp: new Date().toISOString() };
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- FUNCIONES EXPUESTAS PARA GOOGLE.SCRIPT.RUN ---

/**
 * Datos para la vista de Caja: carta de productos, fase solar/lunar, cuentas abiertas
 */
function cajaSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const s = m.getSheetByName('CAJA 2');
  const phase = String(s.getRange('F2').getValue()) || 'Solar';
  const cat = m.getSheetByName('CATALOGO').getRange('A7:T306').getValues();

  // Filtrar catálogo activo
  const products = [];
  cat.forEach(r => {
    if (r[0] && r[8] === 'Sí') {
      const price = r[15] ? r[phase === 'Solar' ? 16 : 17] : r[2];
      if (typeof price === 'number' && price >= 0) {
        products.push({
          name: String(r[0]),
          group: String(r[1] || 'General'),
          price: price,
          priceSolar: r[15] ? Number(r[16]) : Number(r[2]),
          priceLunar: r[15] ? Number(r[17]) : Number(r[2]),
          destination: String(r[7] || (r[1] === 'Alimentos' ? 'Cocina' : 'Barra'))
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

  const activities = Array.from(new Set(['Visita general DOMUS', ...m.getSheetByName('ACTIVIDADES').getRange('A7:B106').getValues().filter(r => r[0]).map(r => String(r[0]))]));

  const lastPay = payments.filter(r => r[2] === 'Caja' && Number(r[13]) > 0).slice(-1)[0];
  const lastReceipt = lastPay ? 'Último cobro: ' + (map.get(String(lastPay[3])) || { customer: lastPay[3] }).customer + ' · $' + Number(lastPay[13]).toFixed(2) + ' · ' + lastPay[4] : '';

  return {
    phase: ['Solar', 'Lunar'].includes(phase) ? phase : 'Solar',
    products: products,
    accounts: accounts,
    activities: activities,
    lastReceipt: lastReceipt,
    staff: CONFIG.staff,
    canCourtesy: true
  };
}

/**
 * Datos para la vista de Comandas (KDS): pedidos pendientes, listos, entregados y resurtido
 */
function comandasSimpleDatos(token) {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
  const sComandas = m.getSheetByName('COMANDAS');
  const oComandas = o.getSheetByName('COMANDAS');
  const oHistorial = o.getSheetByName('HISTORIAL');
  const oResurtido = o.getSheetByName('RESURTIDO');

  // Leer registros JSON maestros de COMANDAS columna M (13)
  const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();
  const orders = [];
  masterRaw.forEach((row, i) => {
    if (row[0]) {
      try {
        const item = JSON.parse(row[0]);
        if (item && item.state !== 'Entregada' && item.state !== 'Cancelada') {
          orders.push({
            key: 'DCS-' + item.row + '-' + (item.batch || item.id),
            version: '1',
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
            incident: item.incident || ''
          });
        }
      } catch (err) {}
    }
  });

  // Leer resurtidos abiertos
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
