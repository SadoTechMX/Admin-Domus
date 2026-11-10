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
  requestRows_(s).forEach(r=>{const id=r[0];if(!id)return;const list=index.get(id)||[];list.push(r);index.set(id,list);});
  return index;
}

function paymentRequest_(index,id) {
  const rows=index.get(String(id)) || [];
  if(rows.length>1)throw transferError_('PAYMENT_EVIDENCE_REQUIRES_REVIEW','Vínculo financiero duplicado.');
  if(!rows.length)return null;
  const row=rows[0];let result;
  try { result=row[7]?JSON.parse(row[7]):null; } catch(_) { throw transferError_('PAYMENT_EVIDENCE_REQUIRES_REVIEW','Resultado financiero ilegible.'); }
  return {id:row[0],action:String(row[1]),status:String(row[4]),result:result};
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
  historyGuard_(m,p.sourceRequestId,'transferSource');
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
  let policy;try {policy=transferPolicy_();}catch(e){if(e.code!=='TRANSFER_POLICY_REQUIRED')throw e;policy={receivers:[]};}
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),index=paymentRequestIndex_(m),cancelled=transferCancellationRecords_(m,index);
  const linked=transferExistingPaymentRecords_(m,index);
  const confirmed=transferConfirmedRecords_(m,index),done=new Set(confirmed.map(p=>p.sourceReceipt).concat(cancelled.map(p=>p.sourceReceipt),linked.map(p=>p.sourceReceipt))),pending=[];
  dataRows_(transferSheet_(m),7,31).forEach(r=>{
    if(r[2]!=='Caja' || r[4]!=='Transferencia' || r[10]!=='Borrador' || done.has(r[0]))return;
    const sourceRequestId=String(r[8]).startsWith('CAJA-RAPIDA:')?String(r[8]).slice('CAJA-RAPIDA:'.length):'';
    const item={sourceRequestId:sourceRequestId,sourceReceipt:r[0],ticket:r[3],amount:Number(r[5])};
    try { const source=transferSource_(m,index,item);pending.push(Object.assign(item,{customer:source.customer,requiresReview:false})); }
    catch(_) { pending.push(Object.assign(item,{requiresReview:true})); }
  });
  return {ok:true,currency:'MXN',verificationMode:'MANUAL_BANK_REVIEW',receivers:policy.receivers,pending:pending,
    cancelled:cancelled.map(c=>({requestId:c.cancellationRequestId,sourceReceipt:c.sourceReceipt,ticket:c.ticket,wasteStatus:c.wasteReview.status,closureBlocked:c.closureBlocked})),
    linked:linked.map(c=>({requestId:c.linkRequestId,sourceReceipt:c.sourceReceipt,ticket:c.ticket,existingPaymentReceipt:c.existingPaymentReceipt,linkedAmount:c.linkedAmount,newCharge:0}))};
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

// Read-only preparation; approved administrative resolutions use separate actions.
// Bank non-receipt is a human review requirement, never inferred from Borrador.
function prepararResolucionTransferencia(p) {
  authRequireContext_('prepararResolucionTransferencia');
  if(!CONFIG.managers.includes(_authContext.principal))throw transferError_('AUTH_PRINCIPAL_REQUIRED','Renueva la identidad de Gerencia.',401);
  if(!p || !['sourceRequestId','sourceReceipt','ticket'].every(k=>typeof p[k]==='string' && p[k].trim()===p[k] && p[k].length>0 && p[k].length<=200)) {
    throw transferError_('TRANSFER_RESOLUTION_INPUT_REQUIRED','Indica la intención, recibo y cuenta originales.',422);
  }
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),context=transferResolutionContext_(m,p),source=context.source,snapshot=context.snapshot;
    const delivered=snapshot.units.filter(u=>u.deliveryEvidence).length;
    const pending=snapshot.units.filter(u=>!['Entregada','Cancelada'].includes(u.state)).length;
    const cancelled=snapshot.units.filter(u=>u.state==='Cancelada').length;
    const decision=delivered?'DELIVERY_OR_CONSUMPTION_REVIEW':snapshot.balance.paid>0?'OTHER_PAYMENT_RECONCILIATION':
      cancelled===snapshot.units.length && snapshot.units.length>0?'CANCELLED_ORDER_RECONCILIATION':'NO_RECORDED_DELIVERY_DECISION';
    return {ok:true,kind:'TRANSFER_RESOLUTION_PROPOSAL',version:1,readOnly:true,executable:false,
      sourceRequestId:p.sourceRequestId,sourceReceipt:source.receipt,ticket:source.ticket,amount:source.total,currency:'MXN',
      bankObservation:'NOT_VERIFIED_BY_SYSTEM',requiresBankReview:true,requiresDeliveryReview:true,decision:decision,
      account:{total:snapshot.balance.total,paid:snapshot.balance.paid,due:snapshot.balance.due},
      fulfillment:{scope:'WHOLE_ACCOUNT',observation:'RECORDED_EVIDENCE_ONLY',total:snapshot.units.length,deliveryEvidence:delivered,pending:pending,cancelled:cancelled,units:snapshot.units},
      sourceJourney:source.journey || null,originJourney:source.originJourney || null,
      // JSON converts native Sheets Dates to ISO strings before canonical hashing.
      snapshotHash:context.snapshotHash,
      observedAt:new Date().toISOString(),preparedBy:_authContext.operator,preparedRole:_authContext.role,preparedPrincipal:_authContext.principal,
      policyRequired:true,canConfirm:false,canCancel:false,canReplacePayment:false,canDeliver:false,canCloseJourney:false,
      policy:{managerCancellationApproved:true,preparedOrdersIncluded:true,paymentSubstitutionApproved:true},
      proposedEffects:{paymentApplied:0,refund:0,inventoryMovement:0,writes:0},
      message:'Propuesta de conciliación. Conserva el pendiente y la deuda; no acredita banco, anula, cobra, entrega ni habilita el cierre.'};
  });
}

function transferResolutionContext_(m,p,ownId) {
  const index=historyOperationalIndex_(m),journal=m.getSheetByName('DOMUS_JOURNAL'),journalRows=journal?dataRows_(journal,2,6):[];
  const own=ownId && index.get(ownId);
  if(own && own.length===1 && ['cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(own[0][1]) && own[0][4]==='PROCESSING' && !journalFind_(ownId,m))index.delete(ownId);
  if(journalRows.some(r=>r[0] && r[2]!=='COMPLETED'))throw transferError_('TRANSFER_RESOLUTION_REQUIRES_REVIEW','Existe un plan incompleto. Conservar su intención; esta consulta no lo reanuda.');
  index.forEach(rows=>{
    if(rows.length!==1 || (rows[0][4]!=='COMPLETED' && !journeyKnownNoEffects_(m,rows)))throw transferError_('TRANSFER_RESOLUTION_REQUIRES_REVIEW','REQUESTS contiene una intención incierta o duplicada.');
  });
  const source=transferSource_(m,index,p),confirmed=transferConfirmedRecords_(m,index);
  if(confirmed.some(r=>r.sourceRequestId===p.sourceRequestId || r.sourceReceipt===p.sourceReceipt))throw transferError_('TRANSFER_ALREADY_CONFIRMED','Ya existe ingreso acreditado; no cancelar como no recibido.');
  if(transferCancellationRecords_(m,index).some(r=>r.sourceRequestId===p.sourceRequestId))throw transferError_('TRANSFER_ALREADY_CANCELLED','La cancelación ya tiene resolución; recuperar su ID original.');
  if(transferExistingPaymentRecords_(m,index).some(r=>r.sourceRequestId===p.sourceRequestId))throw transferError_('TRANSFER_ALREADY_LINKED','Ya existe un vínculo. Recupera su ID original, sin nuevo cobro.');
  const snapshot=transferResolutionSnapshot_(m,index,source,p.sourceRequestId);
  return {index:index,source:source,snapshot:snapshot,snapshotHash:computePayloadHash_(JSON.parse(JSON.stringify({version:1,book:m.getId(),environment:CONFIG.environment,
    sourceRequestId:p.sourceRequestId,snapshot:snapshot,ledger:Array.from(index.values()),journal:journalRows})))};
}

function transferResolutionSnapshot_(m,index,source,sourceRequestId) {
  const schemas={'CAJA 2':{'Folio línea':1,'CUENTA AUTOMÁTICA':2,'Producto':7,'Cantidad':8,'TOTAL':12,'ACCIÓN DEL PEDIDO':16,'Unidades consumidas':22,'Preparación / entrega':24,'Destino':25},
    COMANDAS:{'Folio línea':1,'Ticket / mesa':2,'PREPARACIÓN / ENTREGA':8,'Registro de sincronización':13}};
  Object.keys(schemas).forEach(name=>{
    const cols=schemaColumns_(m.getSheetByName(name),Object.keys(schemas[name]));
    if(Object.keys(schemas[name]).some(k=>cols[k]!==schemas[name][k]))throw transferError_('TRANSFER_SCHEMA_REQUIRES_REVIEW','Columnas de cuenta o comanda incompatibles.');
  });
  const cash=dataRows_(m.getSheetByName('CAJA 2'),7,32).map((r,i)=>({row:i+7,values:r})).filter(x=>x.values[1]===source.ticket);
  const payments=dataRows_(transferSheet_(m),7,31).filter(r=>r[3]===source.ticket && r[2]==='Caja');
  const records=[],units=[],seen=new Set(),allCommands=[];
  const reject=()=>{throw transferError_('TRANSFER_RESOLUTION_REQUIRES_REVIEW','Cuenta o entrega sin vínculo completo y único. Conservar el historial.');};
  // A formula error or text amount must not become zero through legacy readers.
  const money=n=>typeof n==='number' && Number.isFinite(n) && n>=0;
  if(cash.some(c=>!money(c.values[11])) || payments.some(r=>!money(r[5]) || r[5]===0 || !money(r[13]) || r[13]>r[5]))reject();
  // Inspect the whole account, including deliveries before an empty-items abono.
  index.forEach((_,id)=>{
    const record=paymentRequest_(index,id),r=record && record.result;
    if(record.action==='cajaSimpleRegistrar' && r && r.ticket===source.ticket) {
      const f=r.fulfillment;
      const binding=index.get(id)[0];
      if(record.status!=='COMPLETED' || !/^[a-f0-9]{64}$/.test(String(binding[2])) || !binding[3] || r.ok!==true || !f || f.version!==1 || f.sourceRequestId!==id || !Array.isArray(f.units))reject();
      records.push(record);
      f.units.forEach(u=>{
        if(!u || typeof u.id!=='string' || !u.id || !Number.isInteger(u.row) || u.row<7 || typeof u.qty!=='number' || !Number.isFinite(u.qty) || u.qty<=0 ||
          !['sku','product','destination'].every(k=>typeof u[k]==='string' && u[k]) || seen.has(u.id))reject();
        seen.add(u.id);units.push({unit:u,batch:id});
      });
    }
  });
  if(!records.some(r=>r.id===sourceRequestId) || !units.length || cash.length!==units.length)reject();
  dataRows_(m.getSheetByName('COMANDAS'),7,14).forEach((r,i)=>{
    if(!r[12]){if(seen.has(r[0]) || r[1]===source.ticket)reject();return;}
    let item;try{item=JSON.parse(r[12]);}catch(_){reject();}
    if(!item || typeof item!=='object' || Array.isArray(item))reject();
    if(item.ticket===source.ticket || seen.has(item.id) || r[1]===source.ticket || seen.has(r[0]))allCommands.push({row:i+7,values:r,item:item});
  });
  if(allCommands.length!==units.length)reject();
  const observations=units.map(({unit:u,batch})=>{
    const found=allCommands.filter(c=>c.item.id===u.id),cashRows=cash.filter(c=>c.values[0]===u.id);
    if(found.length!==1 || cashRows.length!==1)reject();
    const c=found[0],it=c.item,a=cashRows[0];
    if(c.row!==u.row || a.row!==u.row || c.values[0]!==u.id || c.values[1]!==source.ticket || it.batch!==batch || it.ticket!==source.ticket ||
      ['id','row','sku','product','qty','destination'].some(k=>it[k]!==u[k]) ||
      a.values[6]!==u.product || a.values[7]!==u.qty || a.values[24]!==u.destination ||
      !['Pendiente','En preparación','Lista','Entregada','Cancelada'].includes(it.state))reject();
    const deliveryEvidence=it.state==='Entregada' || !!it.delivered || !!it.deliveredBy || c.values[7]==='Entregada' ||
      a.values[23]==='Entregada' || Number(a.values[21])>0;
    if((it.state==='Cancelada')!==(a.values[15]==='Cancelado') && !deliveryEvidence)reject();
    return {id:u.id,sourceRequestId:batch,state:it.state,qty:u.qty,deliveryEvidence:deliveryEvidence};
  });
  const balance=posBalanceFast_({m:m},source.ticket);
  if(![balance.total,balance.paid,balance.due].every(n=>typeof n==='number' && Number.isFinite(n)) || balance.due<0)reject();
  return {balance:{total:balance.total,paid:balance.paid,due:balance.due},units:observations,cash:cash,payments:payments,commands:allCommands,records:records};
}

function transferCancellationReject_(message) {
  return transferError_('TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS',message,422);
}
function transferCancellationSourceHash_(m,index,p) {
  const rows=dataRows_(transferSheet_(m),7,31).filter(r=>r[0]===p.sourceReceipt);
  return computePayloadHash_(JSON.parse(JSON.stringify({request:index.get(p.sourceRequestId),payment:rows})));
}

function transferCancellationJournal_(m,id) {
  const s=m.getSheetByName('DOMUS_JOURNAL');
  if(s && dataRows_(s,2,6).filter(r=>r[0]===id).length>1)throw transferError_('TRANSFER_CANCELLATION_REQUIRES_REVIEW','Journal de cancelación duplicado. Conservar originales sin reanudar ni liberar.');
  return journalFind_(id,m);
}

// An administrative cancellation is distinct from a bank confirmation. Readers
// require its completed journal, original source and current cancelled commands.
function transferCancellationRecords_(m,index) {
  const found=[],sources=new Set();index=index || paymentRequestIndex_(m);
  index.forEach((rows,id)=>{
    if(!rows.some(r=>r[1]==='cancelarTransferenciaNoRecibida') || journeyKnownNoEffects_(m,rows))return;
    const record=paymentRequest_(index,id),p=record && record.result,plan=transferCancellationJournal_(m,id);
    const fail=()=>{throw transferError_('TRANSFER_CANCELLATION_REQUIRES_REVIEW','Cancelación incompleta o incompatible. Recuperar su misma intención; no cobrar ni cerrar.');};
    if(!record || record.status!=='COMPLETED' || !p || p.ok!==true || p.kind!=='TRANSFER_CANCELLATION' || p.version!==1 ||
      p.cancellationRequestId!==id || p.status!=='CANCELLED_NO_RECEIPT' || p.amountApplied!==0 || p.refund!==0 || p.inventoryMovement!==0 ||
      !['GERENCIA','ADMIN'].includes(p.authorizedRole) || !CONFIG.managers.includes(p.authorizedPrincipal) ||
      !p.journey || !p.review || p.review.noDeliveryConfirmed!==true || p.review.noBankReceiptConfirmed!==true ||
      !p.wasteReview || !['NO_WASTE_OBSERVED','WASTE_OBSERVED','PENDING_REVIEW'].includes(p.wasteReview.status) || p.wasteReview.inventoryApplied!==false ||
      !Array.isArray(p.units) || !p.units.length || !plan || plan.data[1]!=='cancelarTransferenciaNoRecibida' || plan.data[2]!=='COMPLETED')fail();
    let result;try {result=JSON.parse(plan.data[4]);}catch(_){fail();}
    if(canonicalJsonStringify_(result)!==canonicalJsonStringify_(p) || p.sourceEvidenceHash!==transferCancellationSourceHash_(m,index,p) || sources.has(p.sourceRequestId))fail();
    const source=transferSource_(m,index,p),units=source.fulfillment && source.fulfillment.units;
    if(!units || units.length!==p.units.length || new Set(p.units.map(u=>u.id)).size!==units.length || source.total!==p.cancelledAmount || !source.journey || source.journey.journeyId!==p.journey.journeyId)fail();
    const board=dataRows_(m.getSheetByName('COMANDAS'),7,14),cash=dataRows_(m.getSheetByName('CAJA 2'),7,32);
    p.units.forEach(u=>{
      if(!units.some(x=>x.id===u.id && x.row===u.row && x.qty===u.qty))fail();
      const c=board.filter(r=>r[0]===u.id),a=cash.filter(r=>r[0]===u.id);let item;
      try {item=c.length===1 && JSON.parse(c[0][12]);}catch(_){fail();}
      if(!item || item.ticket!==p.ticket || item.batch!==p.sourceRequestId || item.state!=='Cancelada' || item.cancellationRequestId!==id ||
        item.delivered || item.deliveredBy || c[0][7]!=='Cancelada' || a.length!==1 || a[0][1]!==p.ticket || a[0][15]!=='Cancelado' || Number(a[0][21])>0 || a[0][23]==='Entregada')fail();
    });
    sources.add(p.sourceRequestId);found.push(p);
  });
  return found;
}

function transferAssertNotCancelled_(m,p) {
  const records=transferCancellationRecords_(m);
  if(p && records.some(r=>r.sourceRequestId===p.sourceRequestId || r.sourceReceipt===p.sourceReceipt)) {
    throw transferError_('TRANSFER_CANCELLED_REQUIRES_RECONCILIATION','Pendiente cancelado. Un ingreso posterior requiere conciliación; no aplicarlo automáticamente.');
  }
  if(p && transferExistingPaymentRecords_(m).some(r=>r.sourceRequestId===p.sourceRequestId || r.sourceReceipt===p.sourceReceipt)) {
    throw transferError_('TRANSFER_LINKED_REQUIRES_RECONCILIATION','Pendiente resuelto con otro pago. Un ingreso posterior requiere conciliación; no aplicarlo otra vez.');
  }
}

function transferCancellationReplayGuard_(m,id) {
  const plan=transferCancellationJournal_(m,id);if(!plan)return;
  const p=JSON.parse(plan.data[4]),index=paymentRequestIndex_(m);
  const fail=()=>{throw transferError_('TRANSFER_CANCELLATION_REQUIRES_REVIEW','Cambió la evidencia durante la cancelación. Conservar el plan sin reanudar efectos.');};
  if(plan.data[1]!=='cancelarTransferenciaNoRecibida' || !p || p.kind!=='TRANSFER_CANCELLATION' || p.cancellationRequestId!==id ||
    p.sourceEvidenceHash!==transferCancellationSourceHash_(m,index,p))fail();
  transferSource_(m,index,p);
  const payments=dataRows_(transferSheet_(m),7,31).filter(r=>r[2]==='Caja' && r[3]===p.ticket);
  if(payments.length!==1 || payments[0][0]!==p.sourceReceipt || payments[0][13]!==0)fail();
  const board=dataRows_(m.getSheetByName('COMANDAS'),7,14),cash=dataRows_(m.getSheetByName('CAJA 2'),7,32);
  p.units.forEach(u=>{
    const c=board.filter(r=>r[0]===u.id),a=cash.filter(r=>r[0]===u.id);let item;
    try {item=c.length===1 && JSON.parse(c[0][12]);}catch(_){fail();}
    if(!item || item.batch!==p.sourceRequestId || item.ticket!==p.ticket || item.state==='Entregada' || item.delivered || item.deliveredBy || c[0][7]==='Entregada' ||
      a.length!==1 || Number(a[0][21])>0 || a[0][23]==='Entregada')fail();
  });
}

function cancelarTransferenciaNoRecibida(p) {
  authRequireContext_('cancelarTransferenciaNoRecibida');
  if(!CONFIG.managers.includes(_authContext.principal))throw transferError_('AUTH_PRINCIPAL_REQUIRED','Renueva la identidad de Gerencia.',401);
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    transferCancellationReplayGuard_(m,id);
    const resumed=journalResume_(id,'cancelarTransferenciaNoRecibida',m);if(resumed)return resumed;
    let context,journey,review,waste;
    try {
      const text=v=>typeof v==='string' && !!v.trim() && v.length<=300 && v[0]!=='=';
      if(!p || !['sourceRequestId','sourceReceipt','ticket','openingRequestId','reason'].every(k=>text(p[k])) || !/^[a-f0-9]{64}$/.test(p.snapshotHash || '') ||
        !p.review || p.review.noDeliveryConfirmed!==true || p.review.noBankReceiptConfirmed!==true || !text(p.review.evidenceReference) ||
        !p.wasteReview || !['NO_WASTE_OBSERVED','WASTE_OBSERVED','PENDING_REVIEW'].includes(p.wasteReview.status) || !text(p.wasteReview.note)) {
        throw transferCancellationReject_('Revisa banco, ausencia de entrega, motivo y estado de merma; ningún campo se presume.');
      }
      context=transferResolutionContext_(m,p,id);
      const s=context.snapshot;
      if(context.snapshotHash!==p.snapshotHash)throw transferCancellationReject_('La cuenta cambió. Consulta otra propuesta antes de crear una intención nueva.');
      if(p.expectedAmount!==context.source.total || !Array.isArray(p.expectedUnitIds) ||
        canonicalJsonStringify_(p.expectedUnitIds.slice().sort())!==canonicalJsonStringify_(s.units.map(u=>u.id).sort()))throw transferCancellationReject_('Importe o unidades diferentes de la propuesta revisada.');
      if(s.units.some(u=>u.deliveryEvidence))throw transferCancellationReject_('Hay entrega o consumo registrado. No cancelar ni devolver inventario.');
      if(s.records.length!==1 || s.records[0].id!==p.sourceRequestId || s.payments.length!==1 || s.balance.paid!==0)throw transferCancellationReject_('La cuenta tiene otros movimientos. Revisa el pago existente por separado; no cancelar ni recobrar.');
      journey=journeyForMovement_(m,p,new Date());
      if(!journey || !context.source.journey || journey.journeyId!==context.source.journey.journeyId)throw transferCancellationReject_('Se requiere la misma jornada de origen abierta; no adoptar historia ni reasignarla.');
      review={noDeliveryConfirmed:true,noBankReceiptConfirmed:true,evidenceReference:p.review.evidenceReference.trim()};
      waste={status:p.wasteReview.status,note:p.wasteReview.note.trim(),inventoryApplied:false};
    } catch(e) {
      if(['TRANSFER_RESOLUTION_REQUIRES_REVIEW','TRANSFER_ALREADY_CANCELLED','TRANSFER_ALREADY_CONFIRMED','TRANSFER_ALREADY_LINKED','TRANSFER_SOURCE_REQUIRES_REVIEW','TRANSFER_SCHEMA_REQUIRES_REVIEW','TRANSFER_HISTORY_REQUIRES_REVIEW',
        'JOURNEY_REQUIRES_REVIEW','JOURNEY_VALIDATION_NO_EFFECTS'].includes(e.code))throw transferCancellationReject_(e.message);
      throw e;
    }
    // All changes are prepared in one existing journal. Original COBROS/REQUESTS,
    // stock and preparation evidence remain intact; no replacement collection.
    const now=new Date().toISOString(),writes=[],units=[],s=context.snapshot;
    s.commands.forEach(c=>{
      const item=Object.assign({},c.item),u=context.source.fulfillment.units.find(x=>x.id===item.id);
      units.push({...u,previousState:item.state});
      item.cancellationRequestId=id;item.cancelled=item.cancelled || now;item.cancelledBy=_authContext.operator;
      item.cancelledPrincipal=_authContext.principal;item.cancellationReason=p.reason.trim();item.wasteReview=waste;
      item.state='Cancelada';item.version=String(Number(item.version || 1)+1);
      writes.push(cellWrite_(m.getSheetByName('CAJA 2'),c.row,16,'Cancelado'),cellWrite_(m.getSheetByName('COMANDAS'),c.row,8,'Cancelada'),
        cellWrite_(m.getSheetByName('COMANDAS'),c.row,13,JSON.stringify(item)),cellWrite_(m.getSheetByName('COMANDAS'),c.row,14,'Cancelada · '+_authContext.operator));
    });
    const result={ok:true,kind:'TRANSFER_CANCELLATION',version:1,status:'CANCELLED_NO_RECEIPT',cancellationRequestId:id,
      sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,cancelledAmount:context.source.total,currency:'MXN',
      amountApplied:0,refund:0,inventoryMovement:0,reason:p.reason.trim(),review:review,wasteReview:waste,units:units,
      authorizedRole:_authContext.role,authorizedPrincipal:_authContext.principal,authorizedBy:_authContext.operator,cancelledAt:now,
      snapshotHash:p.snapshotHash,sourceEvidenceHash:transferCancellationSourceHash_(m,context.index,p),journey:journey,
      closureBlocked:waste.status!=='NO_WASTE_OBSERVED',message:'Pedido y pendiente cancelados sin ingreso ni devolución. Originales conservados; merma '+waste.status+'.'};
    return journalCommit_(id,'cancelarTransferenciaNoRecibida',m,writes,result);
  });
}

// Administrative linkage only: no new COBROS, command, balance or stock write.
function existingPaymentError_(message, noEffects) {
  return transferError_(noEffects?'EXISTING_PAYMENT_VALIDATION_NO_EFFECTS':'EXISTING_PAYMENT_REQUIRES_REVIEW',message,noEffects?422:409);
}

function existingPaymentJournal_(m,id,action,completed) {
  const s=m.getSheetByName('DOMUS_JOURNAL'),rows=s?dataRows_(s,2,6).filter(r=>r[0]===id):[];
  if(rows.length!==1 || rows[0][1]!==action || (completed?rows[0][2]!=='COMPLETED':!['PREPARED','COMPLETED'].includes(rows[0][2])))throw existingPaymentError_('Journal inexistente, duplicado o incompleto.');
  return rows[0];
}

function existingPaymentSale_(m,index,id) {
  const r=paymentRequest_(index,id),row=index.get(id),j=existingPaymentJournal_(m,id,'cajaSimpleRegistrar',true);
  let result;try {result=JSON.parse(j[4]);}catch(_){throw existingPaymentError_('Resultado ilegible.');}
  if(!r || r.status!=='COMPLETED' || r.action!=='cajaSimpleRegistrar' || !r.result || !row || row.length!==1 ||
      !/^[a-f0-9]{64}$/.test(String(row[0][2])) || !row[0][3] || canonicalJsonStringify_(result)!==canonicalJsonStringify_(r.result))throw existingPaymentError_('Venta y journal sin correspondencia única.');
  return r.result;
}

function existingPaymentEvidence_(m,index,p) {
  const fail=()=>{throw existingPaymentError_('Pago existente sin identidad, importe o estado confirmado compatibles. No cobrar otra vez.');};
  const source=transferSource_(m,index,p),original=existingPaymentSale_(m,index,p.sourceRequestId);
  const payment=existingPaymentSale_(m,index,p.existingPaymentRequestId),f=payment.fulfillment,sf=source.fulfillment;
  if(original!==source && canonicalJsonStringify_(original)!==canonicalJsonStringify_(source))fail();
  if(p.sourceRequestId===p.existingPaymentRequestId || payment.ok!==true || payment.sourceRequestId!==p.existingPaymentRequestId ||
      payment.ticket!==source.ticket || payment.receipt!==p.existingPaymentReceipt || !payment.receipt || payment.receipt===source.receipt ||
      payment.paid!==true || payment.verified!==true || payment.paymentStatus!=='CONFIRMADA' || !['Efectivo','Terminal 1','Terminal 2','Mixto'].includes(payment.method) ||
      !journeyMoney_(source.total) || source.total<=0 || payment.total!==source.total || !Array.isArray(payment.items) || payment.items.length ||
      !f || f.version!==1 || f.sourceRequestId!==p.existingPaymentRequestId || f.kind!=='PAYMENT_CONFIRMED' || !Array.isArray(f.units) || f.units.length ||
      !['CAJA','GERENCIA','ADMIN'].includes(f.authorizedRole) || !f.authorizedBy ||
      !sf || sf.version!==1 || sf.sourceRequestId!==p.sourceRequestId || sf.kind!=='PENDING_TRANSFER' || !Array.isArray(sf.units) || !sf.units.length)fail();
  const contexts=[source.journey,source.originJourney,payment.journey,payment.originJourney];
  if(contexts.some(c=>!c || c.version!==1 || !c.scope || !c.openingRequestId || c.journeyId!=='JOR-'+c.openingRequestId ||
      c.journeyId!==source.journey.journeyId || c.scope.projectId!==source.journey.scope.projectId || c.scope.eventId!==source.journey.scope.eventId))fail();
  const created=journeyTimestamp_(index.get(p.sourceRequestId)[0][5]),paidAt=journeyTimestamp_(index.get(p.existingPaymentRequestId)[0][5]);
  if(created===null || paidAt===null || paidAt<created)fail();
  const rows=dataRows_(transferSheet_(m),7,31),tag='CAJA-RAPIDA:'+p.existingPaymentRequestId;
  const parts=payment.method==='Mixto'?payment.payments:[{receipt:payment.receipt,method:payment.method,amount:payment.total}];
  if(!Array.isArray(parts) || !parts.length || (payment.method==='Mixto' && !kdsMixedPaymentEvidence_(payment,p.existingPaymentRequestId,rows)) ||
      rows.filter(r=>r[8]===tag).length!==parts.length)fail();
  const paymentRows=parts.map(part=>{
    const found=rows.filter(r=>r[0]===part.receipt),r=found[0];
    if(found.length!==1 || r[2]!=='Caja' || r[3]!==source.ticket || r[4]!==part.method || r[5]!==part.amount || r[8]!==tag ||
        r[10]!=='Confirmado' || r[11]!==f.authorizedBy || r[13]!==part.amount || r[15]!==payment.journey.activity || !journeyMoney_(part.amount) || part.amount<=0)fail();
    return r;
  });
  if(posRound_(parts.reduce((sum,part)=>sum+part.amount,0))!==source.total)fail();
  const evidence={sourceRequest:index.get(p.sourceRequestId),paymentRequest:index.get(p.existingPaymentRequestId),
    sourceJournal:existingPaymentJournal_(m,p.sourceRequestId,'cajaSimpleRegistrar',true),paymentJournal:existingPaymentJournal_(m,p.existingPaymentRequestId,'cajaSimpleRegistrar',true),
    sourceRows:rows.filter(r=>r[0]===source.receipt),paymentRows:paymentRows};
  return {source:source,payment:payment,parts:parts,recordedAt:new Date(paidAt).toISOString(),
    evidenceHash:computePayloadHash_(JSON.parse(JSON.stringify(evidence)))};
}

function existingPaymentLinkResult_(m,index,id,p,journal) {
  const fail=()=>{throw existingPaymentError_('Vínculo sin evidencia íntegra. Mantener pendiente y conservar originales.');};
  if(!p || p.ok!==true || p.kind!=='TRANSFER_EXISTING_PAYMENT_LINK' || p.version!==1 || p.status!=='LINKED_EXISTING_PAYMENT' || p.linkRequestId!==id ||
      p.newCharge!==0 || p.amountApplied!==0 || p.refund!==0 || p.inventoryMovement!==0 || p.confirmExistingPayment!==true ||
      !['GERENCIA','ADMIN'].includes(p.authorizedRole) || !CONFIG.managers.includes(p.authorizedPrincipal) || !p.authorizedBy ||
      !p.reason || !p.evidenceReference || !Number.isFinite(Date.parse(p.linkedAt)) || !/^[a-f0-9]{64}$/.test(p.snapshotHash || ''))fail();
  let result,plan;try {result=JSON.parse(journal[4]);plan=JSON.parse(journal[3]);}catch(_){fail();}
  // This action can never replay a commercial-cell plan, even if the journal is altered.
  if(!plan || Array.isArray(plan) || Object.keys(plan).length!==1 || plan.parts!==0 || canonicalJsonStringify_(p)!==canonicalJsonStringify_(result))fail();
  const e=existingPaymentEvidence_(m,index,p);
  if(p.sourceEvidenceHash!==e.evidenceHash || p.linkedAmount!==e.source.total || p.currency!=='MXN' || p.existingPaymentMethod!==e.payment.method ||
      !p.journey || p.journey.journeyId!==e.source.journey.journeyId || p.journey.openingRequestId!==e.source.journey.openingRequestId ||
      canonicalJsonStringify_(p.units)!==canonicalJsonStringify_(e.source.fulfillment.units) || canonicalJsonStringify_(p.paymentParts)!==canonicalJsonStringify_(e.parts))fail();
  return p;
}

function transferExistingPaymentRecords_(m,index,skipId) {
  index=index || paymentRequestIndex_(m);
  const found=[],sources=new Set(),payments=new Set(),receipts=new Set();
  index.forEach((rows,id)=>{
    if(id===skipId || !rows.some(r=>r[1]==='vincularPagoExistente') || journeyKnownNoEffects_(m,rows))return;
    const r=paymentRequest_(index,id);
    if(!r || r.status!=='COMPLETED')throw existingPaymentError_('Vínculo incierto. Recuperar su mismo ID antes de entregar, confirmar o cerrar.');
    const p=existingPaymentLinkResult_(m,index,id,r.result,existingPaymentJournal_(m,id,'vincularPagoExistente',true));
    if(sources.has(p.sourceRequestId) || payments.has(p.existingPaymentRequestId) || p.paymentParts.some(part=>receipts.has(part.receipt)))throw existingPaymentError_('Pago o pendiente reutilizado.');
    sources.add(p.sourceRequestId);payments.add(p.existingPaymentRequestId);p.paymentParts.forEach(part=>receipts.add(part.receipt));found.push(p);
  });
  if(found.length) {
    const confirmed=transferConfirmedRecords_(m,index),cancelled=transferCancellationRecords_(m,index);
    if(found.some(p=>confirmed.concat(cancelled).some(r=>r.sourceRequestId===p.sourceRequestId)))throw existingPaymentError_('Hay resoluciones incompatibles para el mismo pendiente.');
  }
  return found;
}

function existingPaymentContext_(m,p,ownId) {
  const c=transferResolutionContext_(m,p,ownId),s=c.snapshot;
  const candidates=s.records.filter(r=>r.id!==p.sourceRequestId);
  if(candidates.length!==1 || s.records.length!==2 || s.units.some(u=>u.state==='Cancelada') ||
      s.balance.total!==c.source.total || s.balance.paid!==c.source.total || s.balance.due!==0)throw existingPaymentError_('Se requiere una cuenta íntegra y un único pago completo. Diferencias requieren conciliación.');
  const candidate=candidates[0];
  const e=existingPaymentEvidence_(m,c.index,{...p,existingPaymentRequestId:candidate.id,existingPaymentReceipt:candidate.result.receipt});
  if(s.payments.length!==e.parts.length+1)throw existingPaymentError_('Hay pagos adicionales o sin vínculo.');
  if(transferExistingPaymentRecords_(m,c.index).some(r=>r.existingPaymentRequestId===candidate.id || r.paymentParts.some(a=>e.parts.some(b=>a.receipt===b.receipt))))throw existingPaymentError_('El pago ya se usó en otra resolución.');
  return {...c,evidence:e};
}

function prepararVinculoPagoExistente(p) {
  authRequireContext_('prepararVinculoPagoExistente');
  if(!CONFIG.managers.includes(_authContext.principal))throw transferError_('AUTH_PRINCIPAL_REQUIRED','Renueva la identidad de Gerencia.',401);
  if(!p || !['sourceRequestId','sourceReceipt','ticket'].every(k=>typeof p[k]==='string' && p[k].trim()===p[k] && p[k] && p[k].length<=200))throw existingPaymentError_('Indica pendiente, recibo y cuenta originales.');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),c=existingPaymentContext_(m,p),e=c.evidence;
    return {ok:true,kind:'TRANSFER_EXISTING_PAYMENT_PROPOSAL',version:1,readOnly:true,sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,
      amount:e.source.total,currency:'MXN',newCharge:0,snapshotHash:c.snapshotHash,sourceJourney:e.source.journey,unitIds:e.source.fulfillment.units.map(u=>u.id),
      existingPayment:{requestId:e.payment.sourceRequestId,receipt:e.payment.receipt,ticket:e.payment.ticket,amount:e.payment.total,method:e.payment.method,parts:e.parts,
        recordedAt:e.recordedAt,recordedBy:e.payment.fulfillment.authorizedBy,paymentStatus:'CONFIRMADA'},
      message:'Usar pago existente. Nuevo cobro: $0. Requiere confirmación explícita de Gerencia; no marca entrega.'};
  });
}

function existingPaymentReplayGuard_(m,id) {
  const plan=journalFind_(id,m);if(!plan)return;
  const index=historyOperationalIndex_(m),j=existingPaymentJournal_(m,id,'vincularPagoExistente',false);
  let p;try {p=JSON.parse(j[4]);}catch(_){throw existingPaymentError_('Vínculo ilegible.');}
  existingPaymentLinkResult_(m,index,id,p,j);
  const source=transferSource_(m,index,p),snapshot=transferResolutionSnapshot_(m,index,source,p.sourceRequestId);
  if(snapshot.records.length!==2 || !snapshot.records.some(r=>r.id===p.existingPaymentRequestId) || snapshot.payments.length!==p.paymentParts.length+1 ||
      snapshot.units.some(u=>u.state==='Cancelada') || snapshot.balance.total!==p.linkedAmount || snapshot.balance.paid!==p.linkedAmount || snapshot.balance.due!==0)throw existingPaymentError_('La cuenta cambió durante el vínculo. Conservar la intención sin liberar permisos.');
  const others=transferExistingPaymentRecords_(m,index,id);
  if(others.some(r=>r.sourceRequestId===p.sourceRequestId || r.existingPaymentRequestId===p.existingPaymentRequestId || r.paymentParts.some(a=>p.paymentParts.some(b=>a.receipt===b.receipt))))throw existingPaymentError_('Pago o pendiente ya vinculados.');
  if(transferConfirmedRecords_(m,index).concat(transferCancellationRecords_(m,index)).some(r=>r.sourceRequestId===p.sourceRequestId))throw existingPaymentError_('El pendiente tiene otra resolución.');
}

function vincularPagoExistente(p) {
  authRequireContext_('vincularPagoExistente');
  if(!CONFIG.managers.includes(_authContext.principal))throw transferError_('AUTH_PRINCIPAL_REQUIRED','Renueva la identidad de Gerencia.',401);
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    existingPaymentReplayGuard_(m,id);const resumed=journalResume_(id,'vincularPagoExistente',m);if(resumed)return resumed;
    let c,journey;
    try {
      const text=v=>typeof v==='string' && !!v.trim() && v.length<=300 && v[0]!=='=';
      if(!p || p.confirmExistingPayment!==true || p.newCharge!==0 || !['sourceRequestId','sourceReceipt','ticket','existingPaymentRequestId','existingPaymentReceipt','openingRequestId','reason','evidenceReference'].every(k=>text(p[k])) ||
          !/^[a-f0-9]{64}$/.test(p.snapshotHash || ''))throw existingPaymentError_('Confirma expresamente el folio existente y nuevo cobro $0; indica motivo y evidencia.',true);
      c=existingPaymentContext_(m,p,id);const e=c.evidence;
      if(p.snapshotHash!==c.snapshotHash || p.expectedAmount!==e.source.total || p.existingPaymentRequestId!==e.payment.sourceRequestId || p.existingPaymentReceipt!==e.payment.receipt ||
          p.expectedPaymentMethod!==e.payment.method || canonicalJsonStringify_(p.expectedPaymentParts)!==canonicalJsonStringify_(e.parts) ||
          !Array.isArray(p.expectedUnitIds) || canonicalJsonStringify_(p.expectedUnitIds.slice().sort())!==canonicalJsonStringify_(e.source.fulfillment.units.map(u=>u.id).sort()))throw existingPaymentError_('Cambió la cuenta o el pago. Revisa otra propuesta antes de crear una intención nueva.',true);
      journey=journeyForMovement_(m,p,new Date());
      if(!journey || journey.journeyId!==e.source.journey.journeyId)throw existingPaymentError_('Se requiere la misma jornada de origen abierta.',true);
    }catch(e) {
      if(e.status===409 || e.code==='JOURNEY_VALIDATION_NO_EFFECTS')throw existingPaymentError_(e.message,true);
      throw e;
    }
    const e=c.evidence,result={ok:true,kind:'TRANSFER_EXISTING_PAYMENT_LINK',version:1,status:'LINKED_EXISTING_PAYMENT',linkRequestId:id,
      sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,existingPaymentRequestId:p.existingPaymentRequestId,existingPaymentReceipt:p.existingPaymentReceipt,
      existingPaymentMethod:e.payment.method,paymentParts:e.parts,linkedAmount:e.source.total,currency:'MXN',newCharge:0,amountApplied:0,refund:0,inventoryMovement:0,
      confirmExistingPayment:true,reason:p.reason.trim(),evidenceReference:p.evidenceReference.trim(),snapshotHash:p.snapshotHash,sourceEvidenceHash:e.evidenceHash,
      units:e.source.fulfillment.units,journey:journey,authorizedRole:_authContext.role,authorizedPrincipal:_authContext.principal,authorizedBy:_authContext.operator,linkedAt:new Date().toISOString(),
      message:'Pago existente vinculado. Nuevo cobro: $0. Se conserva el recibo original; la entrega requiere su acción normal.'};
    return journalCommit_(id,'vincularPagoExistente',m,[],result);
  });
}
