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
    } else if (action === 'sincronizarCartaConCatalogoDOMUS') {
      result = sincronizarCartaConCatalogoDOMUS();
    } else if (action === 'registrarNuevoProducto') {
      result = registrarNuevoProducto(args[0]);
    } else if (action === 'sincronizarJujutsuShi') {
      result = sincronizarJujutsuShi();
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

/**
 * Sincroniza la Carta Oficial Definitiva (120 productos con precios Solar y Lunar)
 * desde la hoja '1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ'
 * directamente hacia las hojas 'CATALOGO' e 'INVENTARIO' del libro maestro '1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U'
 */
function sincronizarCartaConCatalogoDOMUS() {
  const sourceId = '1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ';
  const targetId = CONFIG.mainSheetId; // 1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U

  const sSource = SpreadsheetApp.openById(sourceId);
  const sTarget = SpreadsheetApp.openById(targetId);

  // Leer la pestaña de Carta Oficial
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

  rows.forEach(r => {
    const cat = String(r[0] || '').trim();
    const name = String(r[1] || '').trim();
    if (!name) return;

    const rawSolar = String(r[2] || '').replace(/[$,]/g, '').trim();
    const rawLunar = String(r[3] || '').replace(/[$,]/g, '').trim();
    const priceSolar = parseFloat(rawSolar) || 0;
    const priceLunar = parseFloat(rawLunar) || priceSolar;
    const provider = String(r[4] || 'DOMUS').trim();
    const sku = String(r[5] || '').trim();

    const dest = (cat.includes('ALIMENTOS') || cat.includes('CANNA') || cat.includes('COMIDA')) ? 'Cocina' : 'Barra';

    // Fila para CATALOGO (columnas A a S)
    const catRow = [
      name, cat, priceSolar, 0, provider, '', sku, dest, 'Sí',
      '', '', '', '', '', '', 'Sí', priceSolar, priceLunar, 'Sí'
    ];
    catalogRows.push(catRow);

    // Fila para INVENTARIO: SKU, Nombre, Categoria, Proveedor, Unidad, Stock Inicial, Reservado, Disponible, Destino
    inventoryRows.push([
      sku, name, cat, provider, 'Unidad', 50, 0, 50, dest
    ]);
  });

  // Garantizar integración de rollos de sushi del proveedor JujuTsu-shi
  const jujutsuList = [
    { name: 'Rollo Nobara', desc: 'Zanahoria, aguacate, queso Philadelphia, surimi', sku: 'JJ01' },
    { name: 'Rollo Itadori', desc: 'Aguacate, Tampico, pollo', sku: 'JJ02' },
    { name: 'Rollo Megumi', desc: 'Zanahoria, queso Philadelphia, surimi, pepino', sku: 'JJ03' },
    { name: 'Rollo Maki', desc: 'Tampico, aguacate, queso Philadelphia, pepino', sku: 'JJ04' },
    { name: 'Rollo Todo', desc: 'Pepino, pollo, queso Philadelphia, surimi', sku: 'JJ05' },
    { name: 'Rollo Choso', desc: 'Zanahoria, aguacate, queso Philadelphia, surimi, Tampico por fuera', sku: 'JJ06' },
    { name: 'Rollo Gojo', desc: 'Aguacate, pollo, zanahoria, por fuera queso Philadelphia', sku: 'JJ07' },
    { name: 'Rollo Sasaki', desc: 'Pepino, zanahoria, aguacate, surimi, por fuera Tampico', sku: 'JJ08' },
    { name: 'Rollo Rika', desc: 'Pollo, aguacate, surimi, Tampico', sku: 'JJ09' }
  ];

  const existingCatalogNames = new Set(catalogRows.map(r => String(r[0]).toUpperCase()));
  jujutsuList.forEach(j => {
    if (!existingCatalogNames.has(j.name.toUpperCase())) {
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
    message: 'Se sincronizaron con éxito ' + catalogRows.length + ' productos en CATALOGO e INVENTARIO de DOMUS.'
  };
}

/**
 * Registra un nuevo producto individual en CATALOGO e INVENTARIO del libro maestro
 */
function registrarNuevoProducto(prod) {
  if (!prod || !prod.name) throw new Error('El nombre del producto es obligatorio.');
  const targetId = CONFIG.mainSheetId;
  const sTarget = SpreadsheetApp.openById(targetId);

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
    message: 'Producto "' + name + '" registrado en CATALOGO e INVENTARIO.',
    product: {
      name: name,
      group: cat,
      price: priceSolar,
      priceSolar: priceSolar,
      priceLunar: priceLunar,
      destination: dest,
      sku: sku,
      provider: provider
    }
  };
}

/**
 * Registra o sincroniza en lote los rollos de sushi de JujuTsu-shi
 */
function sincronizarJujutsuShi() {
  const jujutsuProducts = [
    { name: 'Rollo Nobara', desc: 'Zanahoria, aguacate, queso Philadelphia, surimi', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ01', provider: 'JujuTsu-shi' },
    { name: 'Rollo Itadori', desc: 'Aguacate, Tampico, pollo', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ02', provider: 'JujuTsu-shi' },
    { name: 'Rollo Megumi', desc: 'Zanahoria, queso Philadelphia, surimi, pepino', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ03', provider: 'JujuTsu-shi' },
    { name: 'Rollo Maki', desc: 'Tampico, aguacate, queso Philadelphia, pepino', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ04', provider: 'JujuTsu-shi' },
    { name: 'Rollo Todo', desc: 'Pepino, pollo, queso Philadelphia, surimi', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ05', provider: 'JujuTsu-shi' },
    { name: 'Rollo Choso', desc: 'Zanahoria, aguacate, queso Philadelphia, surimi, Tampico por fuera', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ06', provider: 'JujuTsu-shi' },
    { name: 'Rollo Gojo', desc: 'Aguacate, pollo, zanahoria, por fuera queso Philadelphia', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ07', provider: 'JujuTsu-shi' },
    { name: 'Rollo Sasaki', desc: 'Pepino, zanahoria, aguacate, surimi, por fuera Tampico', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ08', provider: 'JujuTsu-shi' },
    { name: 'Rollo Rika', desc: 'Pollo, aguacate, surimi, Tampico', group: 'Sushi', priceSolar: 100, priceLunar: 100, destination: 'Cocina', sku: 'JJ09', provider: 'JujuTsu-shi' }
  ];

  let added = 0;
  jujutsuProducts.forEach(p => {
    try {
      registrarNuevoProducto(p);
      added++;
    } catch (e) {}
  });

  return {
    ok: true,
    total: added,
    message: 'Se integraron exitosamente ' + added + ' rollos de sushi de JujuTsu-shi en CATALOGO e INVENTARIO.'
  };
}


