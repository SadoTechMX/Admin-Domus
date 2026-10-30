/**
 * ============================================================================
 * DOMUS OS · POINT OF SALE & REGISTER (POS.gs)
 * Lógica transaccional de ventas, caja, cálculo de cobro y despacho de órdenes
 * ============================================================================
 */

'use strict';

const EVENT_30OCT_ACTIVITY = 'Del Crepúsculo al Amanecer';
const EVENT_30OCT_PRICE_SHEET = 'EVENTO_30OCT_PRECIOS';

function posActiveActivity_(m) {
  const settings = m.getSheetByName('DOMUS_SETTINGS');
  return settings ? String(settings.getRange(1, 2).getValue() || '').trim() : '';
}

function posEventPrices_(m, activity) {
  const map = new Map();
  if (String(activity || '').trim() !== EVENT_30OCT_ACTIVITY) return map;
  const sheet = m.getSheetByName(EVENT_30OCT_PRICE_SHEET);
  if (!sheet) throw new Error('EVENT_PRICE_SHEET_MISSING');
  dataRows_(sheet, 4, 9).forEach(r => {
    const key = String(r[2] || '').trim();
    if (!key) return;
    const base = Number(r[5]);
    const eventPrice = Number(r[6]);
    const extra = Number(r[7]);
    if (![base, eventPrice, extra].every(Number.isFinite) || base < 0 || eventPrice < base || Math.abs((eventPrice - base) - extra) > 0.01) {
      throw new Error('EVENT_PRICE_INVALID: ' + key);
    }
    map.set(key, { base: base, price: eventPrice, extra: extra, beneficiary: 'Universidad del Swinger' });
  });
  if (!map.size) throw new Error('EVENT_PRICE_TABLE_EMPTY');
  return map;
}

/**
 * Consulta de datos para la vista de Caja: productos activos, fase y cuentas abiertas
 */
function cajaSimpleDatos() {
  authRequireContext_('cajaSimpleDatos');
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const s = m.getSheetByName('CAJA 2');
  const phase = String(s.getRange('F2').getValue()) || 'Solar';
  const sheetCat = m.getSheetByName('CATALOGO');
  const lastRowCat = sheetCat ? sheetCat.getLastRow() : 6;
  const numRowsCat = Math.max(1, lastRowCat - 6);
  const cat = sheetCat ? sheetCat.getRange(7, 1, numRowsCat, 20).getValues() : [];
  const activeActivity = posActiveActivity_(m);
  const eventPrices = posEventPrices_(m, activeActivity);

  // Filtrar catálogo activo
  const products = [];
  posCatalogRows_(cat).forEach(r => {
    if (r[0] && r[8] === 'Sí') {
      const basePrice = r[15] ? r[phase === 'Solar' ? 16 : 17] : r[2];
      if (typeof basePrice === 'number' && basePrice >= 0) {
        const sku = String(r[6] || '');
        const special = eventPrices.get(sku);
        if (special && Math.abs(Number(basePrice) - special.base) > 0.01) throw new Error('EVENT_BASE_PRICE_MISMATCH: ' + sku);
        const price = special ? special.price : Number(basePrice);
        const provider = String(r[4] || '');
        const isCanna = sku.toUpperCase().indexOf('CT') === 0 || provider.toLowerCase().indexOf('canna') !== -1;
        products.push({
          name: String(r[0]),
          group: String(r[1] || 'General'),
          price: price,
          basePrice: Number(basePrice),
          eventExtra: special ? special.extra : 0,
          eventExtraBeneficiary: special ? special.beneficiary : '',
          priceSolar: r[15] ? Number(r[16]) : Number(r[2]),
          priceLunar: special ? special.price : (r[15] ? Number(r[17]) : Number(r[2])),
          destination: String(r[7] || (isCanna ? 'Cocina' : (r[1] === 'Alimentos' ? 'Cocina' : 'Barra'))),
          sku: sku,
          provider: provider
        });
      }
    }
  });

  // Cuentas abiertas y saldos
  const map = new Map();
  const cashRows = dataRows_(s, 7, 16);
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

  const payments = dataRows_(m.getSheetByName('COBROS'), 7, 14);
  payments.forEach(r => {
    if (r[2] === 'Caja' && map.has(String(r[3]))) {
      map.get(String(r[3])).due -= paymentApplied_(r);
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
    ...dataRows_(m.getSheetByName('ACTIVIDADES'), 7, 2).filter(r => r[0]).map(r => String(r[0]))
  ]));

  const lastPay = payments.filter(r => r[2] === 'Caja' && Number(r[13]) > 0).slice(-1)[0];
  const lastReceipt = lastPay 
    ? 'Último cobro: ' + (map.get(String(lastPay[3])) || { customer: lastPay[3] }).customer + ' · $' + Number(lastPay[13]).toFixed(2) + ' · ' + lastPay[4] 
    : '';

  return {
    phase: ['Solar', 'Lunar'].includes(phase) ? phase : 'Solar',
    products: products,
    accounts: accounts,
    activities: activities,
    activeActivity: activeActivity,
    activityLocked: activeActivity === EVENT_30OCT_ACTIVITY,
    lastReceipt: lastReceipt,
    staff: CONFIG.staff,
    canCourtesy: typeof _authContext !== 'undefined' && !!_authContext && ['ADMIN', 'GERENCIA'].includes(_authContext.role)
  };
}

/**
 * Registra una venta en Caja (inmediata o a cuenta abierta) con control atómico de concurrencia
 */
function cajaSimpleRegistrar(p) {
  authRequireContext_('cajaSimpleRegistrar');
  if (!p) throw new Error('Cuerpo de venta vacío.');
  const id = String(p.requestId || p.id || '').trim();
  if (!id) throw new Error('REQUEST_ID_REQUIRED');
  p.id = id;

  return withLock_(CONFIG.lockTimeoutMs, () => {
    return cajaSimpleRegistrarCore_(p);
  });
}

function cajaSimpleRegistrarCore_(p) {
  authRequireContext_('cajaSimpleRegistrar');
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const replay = journalResume_(p.id, 'cajaSimpleRegistrar', m);
  if (replay) return replay;
  const sCaja = m.getSheetByName('CAJA 2');
  const sCobros = m.getSheetByName('COBROS');
  const sComandas = m.getSheetByName('COMANDAS');
  schemaColumns_(sCaja, ['CUENTA AUTOMÁTICA','Producto','TOTAL','PAGADO','SALDO','Preparación / entrega','Extra evento autorizado','Beneficiario extra','Extra evento cobrado']);
  schemaColumns_(sComandas, ['Registro de sincronización','PREPARACIÓN / ENTREGA']);
  const phase = String(sCaja.getRange('F2').getValue());
  if (!['Solar','Lunar'].includes(phase) || p.phase !== phase) throw new Error('Cambió la carta. Actualiza antes de cobrar.');
  const who = _authContext.operator;
  const canCourtesy = ['ADMIN','GERENCIA'].includes(_authContext.role);
  const ticket = String(p.ticket || ('CTA-' + Utilities.getUuid())).trim();
  const oldBalance = p.ticket ? posBalanceFast_({m:m,c:sCaja}, ticket) : {total:0,paid:0,due:0,rows:[]};
  if (p.ticket && !oldBalance.rows.length) throw new Error('Cuenta no encontrada.');
  const customer = String(p.ticket ? oldBalance.rows[0][4] : p.customer || 'Público General').trim();
  const activity = String(p.ticket ? oldBalance.rows[0][3] : p.activity || 'Visita general DOMUS').trim();
  const activeActivity = posActiveActivity_(m);
  if (p.items && p.items.length && activeActivity === EVENT_30OCT_ACTIVITY && activity !== activeActivity) {
    throw new Error('ACTIVE_EVENT_MISMATCH: actualiza Caja y usa el evento activo.');
  }
  const cat = dataRows_(m.getSheetByName('CATALOGO'), 7, 20);
  const eventPrices = posEventPrices_(m, activity);
  const units = p.items && p.items.length ? posExpandCart_(p.items, cat, phase, canCourtesy, eventPrices) : [];
  if (!units.length && (!p.ticket || !p.paid)) throw new Error('Pedido vacío.');
  const added = posRound_(units.reduce((n,u) => n + (u.courtesy ? 0 : u.price),0));
  const due = posRound_(Math.max(0, oldBalance.due) + added);
  if (p.paid && due <= 0.01) throw new Error('Cuenta sin saldo pendiente. No repetir cobro.');
  if (!p.paid && !['Amigo','Creador de proyecto'].includes(p.credit)) throw new Error('Autorización de crédito requerida.');
  const method = String(p.method || '');
  const math = p.paid ? posPaymentMath_(due, method, p.received, p.tip) : {sale:0,tip:0,received:null,change:null};
  if (p.paid && p.expectedTotal != null && Math.abs(Number(p.expectedTotal)-due)>0.01) throw new Error('Saldo cambió. Actualiza la cuenta antes de confirmar.');
  const pending = !!p.paid && method === 'Transferencia';
  const confirmed = !!p.paid && !pending;
  const rows = dataRows_(sCaja,7,32);
  const free = [];
  rows.forEach((r,i) => { if (!r[1] && !r[6] && free.length < units.length) free.push(i+7); });
  let nextRow=Math.max(sCaja.getLastRow()+1,7);
  while (free.length < units.length) free.push(nextRow++);
  const writes = [];
  const now = new Date();
  units.forEach((u,i) => {
    const row = free[i];
    const inputs = {1:'U-'+row,2:ticket,3:now,4:activity,5:customer,6:u.group,7:u.name,8:1,
      9:u.courtesy?'Cortesía':'Normal',10:u.basePrice,11:u.price !== u.basePrice ? u.price : '',16:'Enviar',17:u.notes,
      18:u.share,19:u.beneficiary,21:u.inventory,25:u.destination,
      48:u.eventExtra || 0,49:u.eventExtra ? u.extraBeneficiary : ''};
    if (u.courtesy) inputs[31] = who;
    Object.keys(inputs).forEach(c => writes.push(cellWrite_(sCaja,row,Number(c),inputs[c])));
    writes.push(...cashFormulaWrites_(sCaja,row));
    const item = {id:'U-'+row,row:row,ticket:ticket,batch:p.id,alias:customer,product:u.name,
      sku:u.sku,qty:1,notes:u.notes,destination:u.destination,sent:now.toISOString(),
      state:'Pendiente',credit:!confirmed,incident:'',responsible:''};
    const com = {1:'U-'+row,2:ticket,3:now,4:u.destination,5:u.name,6:1,7:u.notes,8:'Recibida',13:JSON.stringify(item)};
    Object.keys(com).forEach(c => writes.push(cellWrite_(sComandas,row,Number(c),com[c])));
  });
  let receipt = '';
  if (p.paid) {
    receipt = 'REC-'+Utilities.getUuid();
    writes.push(...paymentWrites_(sCobros, {
      folio:receipt, origin:'Caja',ticket:ticket, method:method,amount:due,tag:'CAJA-RAPIDA:'+p.id,
      operator:who,activity:activity,tip:math.tip,received:math.received,change:math.change
    }));
  }
  const result = {ok:true,ticket:ticket,receipt:receipt,paid:confirmed,verified:confirmed,
    paymentStatus:pending?'PENDIENTE_VERIFICACION':(confirmed?'CONFIRMADA':'CUENTA_ABIERTA'),
    method:method,total:due,customer:customer,received:math.received,tip:math.tip,change:math.change,
    items: units.map(u=>({name:u.name,qty:1,price:u.courtesy?0:u.price,basePrice:u.basePrice,eventExtra:u.courtesy?0:u.eventExtra,eventExtraBeneficiary:u.eventExtra?u.extraBeneficiary:''})),
    message:pending?'PAGO POR TRANSFERENCIA PENDIENTE DE VERIFICACIÓN':(confirmed?'Cobro confirmado.':'Pedido enviado a cuenta abierta.')};
  return journalCommit_(p.id,'cajaSimpleRegistrar',m,writes,result);
}

/**
 * Consulta de confirmación rápida (solo lectura) para reconectar operaciones interrumpidas
 */
function cajaSimpleEstado(id) {
  authRequireContext_('cajaSimpleEstado');
  if (!id) throw new Error('Referencia de operación requerida.');
  const prior = findRequestRecord_(String(id));
  if (prior && prior.status === REQUEST_STATUS.COMPLETED) return {done:true,result:prior.response};
  const journal = journalFind_(String(id),SpreadsheetApp.openById(CONFIG.mainSheetId));
  if (journal && journal.data[2] === 'COMPLETED') return {done:true,result:JSON.parse(journal.data[4])};
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

function posExpandCart_(items, cat, phase, canCourtesy, eventPrices) {
  if (!Array.isArray(items) || !items.length) throw new Error('Pedido vacío o inválido.');
  const units = [];
  const catalogRows = posCatalogRows_(cat);

  for (const item of items) {
    if (!item || typeof item !== 'object') throw new Error('Producto inválido.');
    const matches = catalogRows.filter(r => item.sku ? String(r[6]) === String(item.sku) : r[0] === item.name);
    if (matches.length !== 1) throw new Error('PRODUCT_NOT_FOUND: referencia inexistente, inactiva o ambigua.');
    const c = matches[0];
    const rawPrice = c[15] ? c[phase === 'Solar' ? 16 : 17] : c[2];
    const basePrice = Number(rawPrice);
    const special = eventPrices && eventPrices.get(String(c[6] || ''));
    if (special && Math.abs(basePrice - special.base) > 0.01) throw new Error('EVENT_BASE_PRICE_MISMATCH: ' + String(c[6] || ''));
    const price = special ? special.price : basePrice;
    const qty = Number(item.qty);
    if (rawPrice === '' || rawPrice == null || !Number.isFinite(basePrice) || basePrice < 0 || !Number.isFinite(price) || price < basePrice) throw new Error('Precio de catálogo/evento inválido.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('Cantidad debe ser entera entre 1 y 20.');
    if (item.courtesy && !canCourtesy) throw new Error('Acceso denegado: cortesía requiere Gerencia.');

    for (let j = 0; j < qty; j++) {
      units.push({
        name: c[0],
        group: c[1] || 'General',
        price: price,
        basePrice: basePrice,
        eventExtra: special ? special.extra : 0,
        extraBeneficiary: special ? special.beneficiary : '',
        courtesy: !!item.courtesy,
        share: c[3] || 0,
        beneficiary: c[4] || 'DOMUS',
        inventory: c[6] || '',
        sku: c[6] || '',
        notes: String(item.notes || '').slice(0, 500),
        destination: c[7] || (c[1] === 'Alimentos' ? 'Cocina' : 'Barra')
      });
    }
  }
  if (units.length > 50) throw new Error('Máximo 50 unidades por operación.');
  return units;
}
