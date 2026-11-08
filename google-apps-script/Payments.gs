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

// Read-only preparation for an unreceived transfer. The disposition policy has
// not been approved: this result can neither settle a payment nor permit a cut.
// Bank non-receipt is a human review requirement, never inferred from Borrador.
function prepararResolucionTransferencia(p) {
  authRequireContext_('prepararResolucionTransferencia');
  if(!CONFIG.managers.includes(_authContext.principal))throw transferError_('AUTH_PRINCIPAL_REQUIRED','Renueva la identidad de Gerencia.',401);
  if(!p || !['sourceRequestId','sourceReceipt','ticket'].every(k=>typeof p[k]==='string' && p[k].trim()===p[k] && p[k].length>0 && p[k].length<=200)) {
    throw transferError_('TRANSFER_RESOLUTION_INPUT_REQUIRED','Indica la intención, recibo y cuenta originales.',422);
  }
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),index=paymentRequestIndex_(m);
    const journal=m.getSheetByName('DOMUS_JOURNAL'),journalRows=journal?dataRows_(journal,2,6):[];
    if(journalRows.some(r=>r[0] && r[2]!=='COMPLETED'))throw transferError_('TRANSFER_RESOLUTION_REQUIRES_REVIEW','Existe un plan incompleto. Conservar su intención; esta consulta no lo reanuda.');
    index.forEach(rows=>{
      if(rows.length!==1 || (rows[0][4]!=='COMPLETED' && !journeyKnownNoEffects_(m,rows))) {
        throw transferError_('TRANSFER_RESOLUTION_REQUIRES_REVIEW','REQUESTS contiene una intención incierta o duplicada. No inferir ausencia de efectos.');
      }
    });
    const source=transferSource_(m,index,p),confirmed=transferConfirmedRecords_(m,index);
    if(confirmed.some(r=>r.sourceRequestId===p.sourceRequestId || r.sourceReceipt===p.sourceReceipt)) {
      throw transferError_('TRANSFER_ALREADY_CONFIRMED','Ya existe ingreso acreditado. No corresponde resolverlo como no recibido.');
    }
    const snapshot=transferResolutionSnapshot_(m,index,source,p.sourceRequestId);
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
      snapshotHash:computePayloadHash_(JSON.parse(JSON.stringify({version:1,book:m.getId(),environment:CONFIG.environment,sourceRequestId:p.sourceRequestId,
        snapshot:snapshot,ledger:Array.from(index.values()),journal:journalRows}))),
      observedAt:new Date().toISOString(),preparedBy:_authContext.operator,preparedRole:_authContext.role,preparedPrincipal:_authContext.principal,
      policyRequired:true,canConfirm:false,canCancel:false,canReplacePayment:false,canDeliver:false,canCloseJourney:false,
      proposedEffects:{paymentApplied:0,refund:0,inventoryMovement:0,writes:0},
      message:'Propuesta de conciliación. Conserva el pendiente y la deuda; no acredita banco, anula, cobra, entrega ni habilita el cierre.'};
  });
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
