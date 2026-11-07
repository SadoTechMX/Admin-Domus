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

// Manual bank review for Caja only. No provider/bank API and no inferred approval.
// Configure only after the owner approves the receiver aliases and review policy.
function transferError_(code, message, status) {
  const err=new Error(code+': '+message);err.code=code;err.status=status || 409;return err;
}

function transferPolicy_() {
  let policy;
  try { policy=JSON.parse(PropertiesService.getScriptProperties().getProperty('DOMUS_TRANSFER_REVIEW_POLICY') || 'null'); } catch(_) {}
  if(!policy || policy.version!==1 || policy.approved!==true || !Array.isArray(policy.receivers) || !policy.receivers.length ||
      policy.receivers.some(v=>typeof v!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) || new Set(policy.receivers).size!==policy.receivers.length) {
    throw transferError_('TRANSFER_POLICY_REQUIRED','Configurar cuentas receptoras y revisión bancaria aprobadas.');
  }
  return policy;
}

function transferSheet_(m) {
  const s=m.getSheetByName('COBROS'),expected={'Folio cobro':1,'Puesto / origen':3,'TICKET / referencia BOL':4,'Medio':5,'IMPORTE COBRADO':6,'Folio terminal / evidencia':9,'Cuenta receptora':10,'Estado':11,'Quién cobró':12,'Cobrado aplicado':14};
  const columns=schemaColumns_(s,Object.keys(expected));
  if(Object.keys(expected).some(k=>columns[k]!==expected[k]))throw transferError_('TRANSFER_SCHEMA_REQUIRES_REVIEW','Columnas de cobro incompatibles.');
  return s;
}

// Read-only index: querying delivery permissions must not create a ledger/sheet.
function paymentRequestIndex_(m) {
  const s=m.getSheetByName('REQUESTS') || m.getSheetByName('TRANSACCIONES_API'),index=new Map();
  if(s)dataRows_(s,2,8).forEach(r=>{const id=String(r[0]);if(!id)return;const list=index.get(id)||[];list.push(r);index.set(id,list);});
  return index;
}

function paymentRequest_(index,id) {
  const rows=index.get(String(id)) || [];
  if(rows.length>1)throw transferError_('PAYMENT_EVIDENCE_REQUIRES_REVIEW','Vínculo financiero duplicado.');
  if(!rows.length)return null;
  const row=rows[0];let result;
  try { result=row[7]?JSON.parse(row[7]):null; } catch(_) { throw transferError_('PAYMENT_EVIDENCE_REQUIRES_REVIEW','Resultado financiero ilegible.'); }
  return {id:String(row[0]),action:String(row[1]),status:String(row[4]),result:result};
}

function transferBankKey_(receiver,reference) {
  return computePayloadHash_({receiver:receiver,bankTransactionId:reference});
}

// Every applied transfer must have a matching durable confirmation. Unknown
// historical transfers require reconciliation; do not silently import their keys.
function transferConfirmedRecords_(m,index) {
  const records=[],sources=new Set(),bankKeys=new Set();
  dataRows_(transferSheet_(m),7,31).forEach(r=>{
    if(r[4]!=='Transferencia' || (String(r[10]).toLowerCase()==='borrador' && !String(r[8]).startsWith('DOMUS_TRANSFER_CONFIRMATION:')))return;
    let meta;try { if(String(r[8]).startsWith('DOMUS_TRANSFER_CONFIRMATION:'))meta=JSON.parse(String(r[8]).slice('DOMUS_TRANSFER_CONFIRMATION:'.length)); } catch(_) {}
    const record=meta && paymentRequest_(index,meta.confirmationRequestId),p=record && record.result;
    if(!meta || meta.version!==1 || !record || record.action!=='confirmarTransferencia' || record.status!=='COMPLETED' || !p || p.ok!==true || p.kind!=='TRANSFER_CONFIRMATION' ||
        p.confirmationRequestId!==record.id || p.receipt!==r[0] || p.ticket!==r[3] || p.method!=='Transferencia' || p.paymentStatus!=='CONFIRMADA' || p.paid!==true || p.verified!==true ||
        p.verificationMode!=='MANUAL_BANK_REVIEW' || !['ADMIN','GERENCIA'].includes(p.verifiedRole) || typeof p.verifiedPrincipal!=='string' || !p.verifiedPrincipal || r[10]!=='Confirmado' ||
        typeof p.amountApplied!=='number' || p.amountApplied<=0 || Number(r[5])!==p.amountApplied || paymentApplied_(r)!==p.amountApplied ||
        p.receiver!==r[9] || p.sourceRequestId!==meta.sourceRequestId || p.sourceReceipt!==meta.sourceReceipt || p.bankKey!==meta.bankKey ||
        p.bankKey!==transferBankKey_(p.receiver,p.bankTransactionId)) {
      throw transferError_('TRANSFER_HISTORY_REQUIRES_REVIEW','Transferencia sin confirmación durable compatible; conciliar sin importar ni duplicar cobros.');
    }
    if(sources.has(p.sourceReceipt) || bankKeys.has(p.bankKey))throw transferError_('TRANSFER_HISTORY_REQUIRES_REVIEW','Confirmación bancaria duplicada.');
    sources.add(p.sourceReceipt);bankKeys.add(p.bankKey);records.push(p);
  });
  return records;
}

function transferSource_(m,index,p) {
  const record=paymentRequest_(index,p.sourceRequestId),source=record && record.result;
  if(!record || record.action!=='cajaSimpleRegistrar' || record.status!=='COMPLETED' || !source || source.ok!==true ||
      source.receipt!==p.sourceReceipt || source.ticket!==p.ticket || source.method!=='Transferencia' || source.paymentStatus!=='PENDIENTE_VERIFICACION' || source.paid!==false || source.verified!==false ||
      typeof source.total!=='number' || source.total<=0)throw transferError_('TRANSFER_SOURCE_REQUIRES_REVIEW','Se requiere el recibo pendiente original de Caja vinculado a REQUESTS.');
  const rows=dataRows_(transferSheet_(m),7,31).filter(r=>r[0]===source.receipt);
  if(rows.length!==1 || rows[0][2]!=='Caja' || rows[0][3]!==source.ticket || rows[0][4]!=='Transferencia' || rows[0][10]!=='Borrador' ||
      Number(rows[0][5])!==source.total || typeof rows[0][13]!=='number' || rows[0][13]!==0 || rows[0][8]!=='CAJA-RAPIDA:'+record.id) {
    throw transferError_('TRANSFER_SOURCE_REQUIRES_REVIEW','El cobro pendiente cambió o no tiene un vínculo único.');
  }
  return source;
}

function transferenciasPendientes() {
  authRequireContext_('transferenciasPendientes');
  const policy=transferPolicy_(),m=SpreadsheetApp.openById(CONFIG.mainSheetId),index=paymentRequestIndex_(m);
  const confirmed=transferConfirmedRecords_(m,index),done=new Set(confirmed.map(p=>p.sourceReceipt)),pending=[];
  dataRows_(transferSheet_(m),7,31).forEach(r=>{
    if(r[2]!=='Caja' || r[4]!=='Transferencia' || r[10]!=='Borrador' || done.has(r[0]))return;
    const sourceRequestId=String(r[8]).startsWith('CAJA-RAPIDA:')?String(r[8]).slice('CAJA-RAPIDA:'.length):'';
    const item={sourceRequestId:sourceRequestId,sourceReceipt:r[0],ticket:r[3],amount:Number(r[5])};
    try { const source=transferSource_(m,index,item);pending.push(Object.assign(item,{customer:source.customer,requiresReview:false})); }
    catch(_) { pending.push(Object.assign(item,{requiresReview:true})); }
  });
  return {ok:true,currency:'MXN',verificationMode:'MANUAL_BANK_REVIEW',receivers:policy.receivers,pending:pending};
}

function confirmarTransferencia(p) {
  authRequireContext_('confirmarTransferencia');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=String(p && p.requestId || '');
    const resumed=journalResume_(id,'confirmarTransferencia',m);if(resumed)return resumed;
    let policy;
    try { policy=transferPolicy_(); }
    catch(err) {
      if(err.code==='TRANSFER_POLICY_REQUIRED')throw transferError_('TRANSFER_POLICY_REQUIRED_NO_EFFECTS','Configurar revisión bancaria aprobada antes de crear otra intención.',422);
      throw err;
    }
    if(!p || !['sourceRequestId','sourceReceipt','ticket','receiver','bankTransactionId','receivedDate','evidenceReference'].every(k=>typeof p[k]==='string' && p[k].trim() && p[k].length<=200)) {
      throw transferError_('TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS','Indica recibo original, cuenta receptora, referencia bancaria, fecha y evidencia.',422);
    }
    const proof={sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,receiver:p.receiver,
      bankTransactionId:p.bankTransactionId.trim().toUpperCase().replace(/\s+/g,''),receivedDate:p.receivedDate,evidenceReference:p.evidenceReference.trim(),amount:p.amount,currency:p.currency};
    const date=new Date(proof.receivedDate+'T00:00:00Z');
    if(!policy.receivers.includes(proof.receiver) || proof.currency!=='MXN' || !/^[A-Z0-9][A-Z0-9._:/-]{5,127}$/.test(proof.bankTransactionId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(proof.receivedDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==proof.receivedDate || proof.receivedDate>new Date().toISOString().slice(0,10) ||
        typeof proof.amount!=='number' || proof.amount<=0 || !Number.isSafeInteger(Math.round(proof.amount*100)) || Math.abs(proof.amount*100-Math.round(proof.amount*100))>0.00001) {
      throw transferError_('TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS','Revisa cuenta autorizada, importe MXN, fecha y referencia única del banco.',422);
    }
    const index=paymentRequestIndex_(m),source=transferSource_(m,index,proof),confirmed=transferConfirmedRecords_(m,index);
    const bankKey=transferBankKey_(proof.receiver,proof.bankTransactionId),evidenceHash=computePayloadHash_(proof);
    const previous=confirmed.find(r=>r.sourceReceipt===proof.sourceReceipt);
    if(previous) {
      if(previous.evidenceHash!==evidenceHash)throw transferError_('TRANSFER_ALREADY_CONFIRMED','Ese recibo ya tiene otra confirmación; revisar sin repetir cobro.');
      if(previous.journey && p.openingRequestId!==previous.journey.openingRequestId)throw journeyReject_('Transferencia ya confirmada en otra jornada. Recupera su intención original.');
      return previous;
    }
    if(confirmed.some(r=>r.bankKey===bankKey))throw transferError_('TRANSFER_BANK_REFERENCE_USED','Ese movimiento bancario ya fue aplicado.');
    if(proof.amount!==source.total)throw transferError_('TRANSFER_AMOUNT_REQUIRES_REVIEW','Sólo se admite el importe completo del pendiente original; diferencias requieren conciliación.',422);
    const balance=posBalanceFast_({m:m},source.ticket);
    if(!balance.rows.length || balance.due+0.001<proof.amount)throw transferError_('TRANSFER_BALANCE_REQUIRES_REVIEW','La cuenta cambió o ya fue pagada; no aplicar otro cobro.');
    const now=new Date(),journey=journeyForMovement_(m,p,now);
    const originJourney=journey && journeyAccountOrigin_(m,source.ticket,journey,false);
    const receipt='REC-TRF-'+Utilities.getUuid(),verifiedAt=now.toISOString();
    const result={ok:true,kind:'TRANSFER_CONFIRMATION',confirmationRequestId:id,sourceRequestId:proof.sourceRequestId,sourceReceipt:source.receipt,ticket:source.ticket,
      receipt:receipt,total:proof.amount,amountApplied:proof.amount,currency:'MXN',method:'Transferencia',paymentStatus:'CONFIRMADA',paid:true,verified:true,
      verificationMode:'MANUAL_BANK_REVIEW',verifiedBy:_authContext.operator,verifiedRole:_authContext.role,verifiedPrincipal:_authContext.principal,verifiedAt:verifiedAt,
      receiver:proof.receiver,bankTransactionId:proof.bankTransactionId,bankKey:bankKey,receivedDate:proof.receivedDate,evidenceReference:proof.evidenceReference,evidenceHash:evidenceHash,
      customer:source.customer,items:source.items || [],tip:0,received:null,change:null};
    if(journey)Object.assign(result,{journey:journey,originJourney:originJourney});
    const s=transferSheet_(m),row=Math.max(7,s.getLastRow()+1);
    const metadata={version:1,confirmationRequestId:id,sourceRequestId:proof.sourceRequestId,sourceReceipt:source.receipt,bankKey:bankKey};
    const writes=paymentWrites_(s,{row:row,folio:receipt,origin:'Caja',ticket:source.ticket,method:'Transferencia',amount:proof.amount,
      tag:'DOMUS_TRANSFER_CONFIRMATION:'+JSON.stringify(metadata),operator:_authContext.operator,activity:balance.rows[0][3]});
    // Append a new confirmed movement; the original Borrador stays immutable.
    writes.find(w=>w.column===11).value='Confirmado';writes.push(cellWrite_(s,row,10,proof.receiver));
    return journalCommit_(id,'confirmarTransferencia',m,writes,result);
  });
}
