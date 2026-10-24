/**
 * ============================================================================
 * DOMUS OS · POINT OF SALE & REGISTER (POS.gs)
 * Lógica transaccional de ventas, caja, cálculo de cobro y despacho de órdenes
 * ============================================================================
 */

'use strict';

/**
 * Consulta de datos para la vista de Caja: productos activos, fase y cuentas abiertas
 */
function cajaSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const s = m.getSheetByName('CAJA 2');
  const phase = String(s.getRange('F2').getValue()) || 'Solar';
  const cat = m.getSheetByName('CATALOGO').getRange('A7:T306').getValues();

  // Filtrar catálogo activo
  const products = [];
  posCatalogRows_(cat).forEach(r => {
    if (r[0] && r[8] === 'Sí') {
      const price = r[15] ? r[phase === 'Solar' ? 16 : 17] : r[2];
      if (typeof price === 'number' && price >= 0) {
        products.push({
          name: String(r[0]),
          group: String(r[1] || 'General'),
          price: price,
          priceSolar: r[15] ? Number(r[16]) : Number(r[2]),
          priceLunar: r[15] ? Number(r[17]) : Number(r[2]),
          destination: String(r[7] || (r[1] === 'Alimentos' ? 'Cocina' : 'Barra')),
          sku: String(r[6] || '')
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
  const phase = String(sCaja.getRange('F2').getValue()) || 'Solar';
  if (p.phase && p.phase !== phase) {
    throw new Error('Cambió la carta a Fase ' + phase + '. Por favor actualiza antes de cobrar.');
  }

  const cat = m.getSheetByName('CATALOGO').getRange('A7:T306').getValues();
  const canCourtesy = CONFIG.managers.includes(who.toLowerCase()) || p.courtesyAuthorized;
  const units = posExpandCart_(p.items || [], cat, phase, canCourtesy);

  const customer = String(p.customer || 'Público General').trim();
  let ticket = String(p.ticket || '');
  let activity = String(p.activity || 'Visita general DOMUS');

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
    try {
      sCaja.getRange(rowNum, 7).setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList([u.name], true)
          .setAllowInvalid(true)
          .build()
      );
    } catch (eVal) {
      try { sCaja.getRange(rowNum, 7).clearDataValidations(); } catch (eClear) {}
    }
    const rowData = [
      'U-' + rowNum, ticket, now, activity, customer, u.group, u.name, 1,
      u.courtesy ? 'Cortesía' : 'Normal', u.price, u.courtesy ? 0 : u.price, u.courtesy ? 0 : u.price,
      '', '', '', isPaid ? 'Enviar' : 'Borrador', '', u.share || '', u.beneficiary || '',
      '', u.inventory || '', '', 'LISTO', '', u.destination || 'Barra'
    ];
    sCaja.getRange(rowNum, 1, 1, rowData.length).setValues([rowData]);
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
          responsible: ''
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
