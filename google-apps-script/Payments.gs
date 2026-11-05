/**
 * ============================================================================
 * DOMUS OS · PAYMENTS & CONCILIATION (Payments.gs)
 * Registro de transacciones en COBROS, validación de medios de pago y folios
 * ============================================================================
 */

'use strict';

function paymentWrites_(sheet, p) {
  schemaColumns_(sheet, ['Folio cobro','Puesto / origen','TICKET / referencia BOL','IMPORTE COBRADO','Revisión','Cobrado aplicado']);
  if (!Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) throw new Error('Importe inválido.');
  const row = p.row || Math.max(sheet.getLastRow()+1, 7);
  const inputs = {1:p.folio,2:new Date(),3:p.origin,4:p.ticket,5:p.method,6:p.amount,
    7:p.method==='Efectivo'?0:'',9:p.tag,11:p.method==='Transferencia'?'Borrador':'Confirmado',
    12:p.operator,16:p.activity,29:p.tip||0,30:p.received==null?'':p.received,31:p.change==null?'':p.change};
  // Keep semantic columns: H net, M review, N applied, O net applied, never customer/amount shifted.
  inputs[8] = '=F'+row+'-N(G'+row+')';
  inputs[13] = '=IF(K'+row+'="Borrador","TRANSFERENCIA POR VERIFICAR","LISTO")';
  inputs[14] = '=IF(K'+row+'="Confirmado",F'+row+',0)';
  inputs[15] = '=IF(N'+row+'>0,N'+row+'-N(G'+row+'),0)';
  return Object.keys(inputs).map(c => cellWrite_(sheet,row,Number(c),inputs[c],[8,13,14,15].includes(Number(c))));
}

/**
 * Registra un cobro asentado en la hoja maestra COBROS
 */
function recordPaymentTransaction_(m, payload) {
  authRequireContext_('cajaSimpleRegistrar');
  const id=String(payload.requestId || '');
  const folio=payload.folio || 'REC-'+Utilities.getUuid();
  const values=paymentWrites_(m.getSheetByName('COBROS'),Object.assign({},payload,{folio:folio}));
  return journalCommit_(id,'recordPaymentTransaction',m,values,{folio:folio,amount:payload.amount,method:payload.method});
}
