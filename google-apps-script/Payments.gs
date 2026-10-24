/**
 * ============================================================================
 * DOMUS OS · PAYMENTS & CONCILIATION (Payments.gs)
 * Registro de transacciones en COBROS, validación de medios de pago y folios
 * ============================================================================
 */

'use strict';

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

  const shiftId = payload.shiftId || '';
  const businessDate = payload.businessDate || (typeof getBusinessDateNow_ === 'function' ? getBusinessDateNow_() : Utilities.formatDate(now, 'America/Mexico_City', 'yyyy-MM-dd'));
  const colCobShift = typeof getOrAddColumnIndex_ === 'function' ? getOrAddColumnIndex_(sCobros, 'shiftId', 6) : 0;
  const colCobBizDate = typeof getOrAddColumnIndex_ === 'function' ? getOrAddColumnIndex_(sCobros, 'businessDate', 6) : 0;
  if (colCobShift) sCobros.getRange(nextRow, colCobShift).setValue(shiftId);
  if (colCobBizDate) sCobros.getRange(nextRow, colCobBizDate).setValue(businessDate);

  SpreadsheetApp.flush();

  return {
    folio: folio,
    amount: Number(payload.amount) || 0,
    method: payload.method,
    date: now,
    shiftId: shiftId,
    businessDate: businessDate
  };
}
