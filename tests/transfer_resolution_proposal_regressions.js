'use strict';
// Actual auth/router/payment/KDS/journey modules; in-memory fixtures only.
// The proposal never attests bank non-receipt or executes a disposition.
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
const clone=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(n,f){f();passed++;console.log('PASS',n);}
function fixture({credit=false,qty=1}={}) {
 const t=setup();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify({version:1,
  scopes:[{id:'A',projectId:'P-A',projectName:'QA project',eventId:'E-A',eventName:'QA event',activity:'QA event'}],
  stations:[{deviceId:'fixture-device',stationId:'QA_CAJA',registerId:'QA_DRAWER',scopeIds:['A']}]}));
 t.manager();const manager=t.login('GERENCIA');t.request('turnoAbrir',[{scopeId:'A',openingFloat:100}],'open');
 const body=t.sale({id:'pending-sale',openingRequestId:'open',method:'Transferencia',items:[{sku:'QA-01',qty}],expectedTotal:40*qty,...(credit?{paid:false,credit:'Amigo'}:{})});
 const first=t.request('cajaSimpleRegistrar',[body],body.id);
 const source=credit?t.request('cajaSimpleRegistrar',[t.sale({id:'pending-abono',openingRequestId:'open',ticket:first.ticket,items:[],method:'Transferencia'})],'pending-abono'):first;
 const sourceId=credit?'pending-abono':body.id;
 return Object.assign(t,{source,sourceId,managerToken:manager,
  params:()=>({sourceRequestId:sourceId,sourceReceipt:source.receipt,ticket:source.ticket}),
  plan:(extra={},id='query-only')=>t.request('prepararResolucionTransferencia',[{sourceRequestId:sourceId,sourceReceipt:source.receipt,ticket:source.ticket,...extra}],id,'GERENCIA',manager)});
}
const snapshot=t=>JSON.stringify({books:[t.main,t.ops].map(b=>[b.id,[...b.sheets].map(([n,s])=>[n,[...s.cells]])]),props:[...t.props]});
function readonly(t,fn){
 const before=snapshot(t),restore=[],blocked=()=>{throw Error('QUERY_ATTEMPTED_WRITE_OR_REPLAY');};
 const swap=(o,k)=>{const v=o[k];restore.push(()=>o[k]=v);o[k]=blocked;};
 for(const b of [t.main,t.ops]){swap(b,'insertSheet');for(const s of b.sheets.values()){swap(s,'put');swap(s,'insertRowsAfter');}}
 for(const k of ['journalResume_','journalCommit_','idempotentExecute_','saveRequestRecord_'])swap(t.ctx,k);
 try{return fn();}finally{restore.reverse().forEach(f=>f());assert.equal(snapshot(t),before);assert.equal(t.locks().held,false);}
}
function item(t,row=7){return JSON.parse(t.main.getSheetByName('COMANDAS').raw(row,13));}
function stateFixture(t,state,row=7,extra={}){
 const c=t.main.getSheetByName('COMANDAS'),it={...item(t,row),state,...extra};c.put(row,13,JSON.stringify(it));c.put(row,8,state);
 if(state==='Cancelada')t.main.getSheetByName('CAJA 2').put(row,16,'Cancelado');
}
function bank(t){t.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['QA_RECEIVER']}));return {
 openingRequestId:'open',...t.params(),receiver:'QA_RECEIVER',bankTransactionId:'QA-BANK-EXAMPLE',receivedDate:'2026-11-05',evidenceReference:'Synthetic only',amount:t.source.total,currency:'MXN'};}
function assertHeld(p){assert.equal(p.kind,'TRANSFER_RESOLUTION_PROPOSAL');assert.equal(p.readOnly,true);assert.equal(p.executable,false);assert.equal(p.bankObservation,'NOT_VERIFIED_BY_SYSTEM');assert.equal(p.requiresDeliveryReview,true);assert.equal(p.policyRequired,true);
 for(const k of ['canConfirm','canCancel','canReplacePayment','canDeliver','canCloseJourney'])assert.equal(p[k],false);
 assert.deepEqual(clone(p.proposedEffects),{paymentApplied:0,refund:0,inventoryMovement:0,writes:0});assert(!('receipt' in p));assert(!('paid' in p));assert(!('verified' in p));}

test('unreceived proposal preserves exact source, debt, inventory, journal and ledger; requires bank review',()=>{
 const t=fixture(),p=readonly(t,()=>t.plan());assertHeld(p);assert.equal(p.decision,'NO_RECORDED_DELIVERY_DECISION');assert.equal(p.account.due,40);assert.equal(p.account.paid,0);
 assert.equal(p.fulfillment.pending,1);assert.equal(p.fulfillment.deliveryEvidence,0);assert.equal(p.sourceJourney.openingRequestId,'open');assert.match(p.snapshotHash,/^[a-f0-9]{64}$/);
});
test('repeated query with same or different transport ID creates no REQUESTS or ACK and returns same state fingerprint',()=>{
 const t=fixture();readonly(t,()=>{const a=t.plan(),b=t.plan(),c=t.plan({},'other-query');assert.equal(a.snapshotHash,b.snapshotHash);assert.equal(a.snapshotHash,c.snapshotHash);});
 assert.equal(t.ctx.paymentRequest_(t.ctx.paymentRequestIndex_(t.main),'query-only'),null);
});
test('read-only proposal works without receiver policy but never asserts bank non-receipt',()=>{
 const t=fixture();assert.equal(t.props.has('DOMUS_TRANSFER_REVIEW_POLICY'),false);assert.equal(readonly(t,()=>t.plan()).requiresBankReview,true);
});
test('cashier, forged manager role, absent auth context and legacy manager principal cannot prepare resolution',()=>{
 const t=fixture(),cashier=t.login('CAJA');readonly(t,()=>{
  assert.throws(()=>t.request('prepararResolucionTransferencia',[t.params()],'bad-role'),/Acceso denegado/);
  assert.throws(()=>t.ctx.executeDomusAction_('prepararResolucionTransferencia',{args:[t.params()],role:'GERENCIA',deviceId:'fixture-device',sessionToken:cashier}),/discrepa/);
  assert.throws(()=>t.ctx.prepararResolucionTransferencia(t.params()),/dispatcher/);
 });
 const session=JSON.parse(t.props.get('ses:'+t.managerToken));delete session.principal;
 t.props.set('ses:'+t.managerToken,JSON.stringify(session));t.ctx.CacheService.getScriptCache().put('ses:'+t.managerToken,JSON.stringify(session));
 readonly(t,()=>assert.throws(()=>t.plan(),e=>e.code==='AUTH_PRINCIPAL_REQUIRED'));
});
test('source mismatch, malformed input and incomplete historic ACK cannot be adopted',()=>{
 for(const patch of [{sourceRequestId:'OTHER'},{sourceReceipt:'OTHER'},{ticket:'OTHER'},{sourceReceipt:''},{sourceRequestId:' pending-sale'}]){
  const t=fixture();readonly(t,()=>assert.throws(()=>t.plan(patch)));
 }
 const t=fixture(),ledger=t.main.getSheetByName('REQUESTS'),rows=t.ctx.dataRows_(ledger,2,8),n=rows.findIndex(r=>r[0]===t.sourceId)+2;
 const old=JSON.parse(ledger.raw(n,8));delete old.fulfillment;ledger.put(n,8,JSON.stringify(old));readonly(t,()=>assert.throws(()=>t.plan(),/REQUIRES_REVIEW/));
});
test('prepared and ready commands stay pending; cancellation is a separate commercial decision',()=>{
 for(const state of ['Pendiente','En preparación','Lista']){const t=fixture();stateFixture(t,state);const p=readonly(t,()=>t.plan());assertHeld(p);assert.equal(p.decision,'NO_RECORDED_DELIVERY_DECISION');assert.equal(p.fulfillment.pending,1);}
});
test('cancelled orders have zero current debt but original transfer remains unresolved and cannot close',()=>{
 const t=fixture(),it=item(t);t.request('comandasSimpleAccion',[{key:'DCS-7-'+it.batch,action:'CANCELAR'}],'cancel','GERENCIA',t.managerToken);
 const p=readonly(t,()=>t.plan());assertHeld(p);assert.equal(p.decision,'CANCELLED_ORDER_RECONCILIATION');assert.equal(p.account.due,0);assert.equal(p.fulfillment.cancelled,1);
 assert.throws(()=>t.request('corteZCerrar',[{openingRequestId:'open',countedCash:100}],'cut','GERENCIA',t.managerToken),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS' && /1 transferencia/.test(e.message));
});
test('delivered or consumed evidence forbids proposing a simple cancellation, including partial delivery',()=>{
 for(const signal of ['state','delivered','mirror','consumed','cashMirror']){
  const t=fixture({qty:2});if(signal==='state')stateFixture(t,'Entregada');
  if(signal==='delivered')stateFixture(t,'Pendiente',7,{delivered:'2026-11-05T00:00:00.000Z'});
  if(signal==='mirror')t.main.getSheetByName('COMANDAS').put(7,8,'Entregada');
  if(signal==='consumed')t.main.getSheetByName('CAJA 2').put(7,22,1);
  if(signal==='cashMirror')t.main.getSheetByName('CAJA 2').put(7,24,'Entregada');
  const p=readonly(t,()=>t.plan());assertHeld(p);assert.equal(p.decision,'DELIVERY_OR_CONSUMPTION_REVIEW');assert.equal(p.fulfillment.deliveryEvidence,1);assert.equal(p.account.due,80);
 }
});
test('empty-items transfer on an existing account still examines prior deliveries',()=>{
 const t=fixture({credit:true});stateFixture(t,'Entregada');const p=readonly(t,()=>t.plan());assert.equal(t.source.fulfillment.units.length,0);assert.equal(p.fulfillment.total,1);assert.equal(p.decision,'DELIVERY_OR_CONSUMPTION_REVIEW');assert.equal(p.account.due,40);
});
test('another legitimate payment does not become a second collection or unlock original transfer delivery',()=>{
 const t=fixture(),pay=t.sale({id:'replacement',openingRequestId:'open',ticket:t.source.ticket,items:[],method:'Efectivo'});t.request('cajaSimpleRegistrar',[pay],pay.id);
 const p=readonly(t,()=>t.plan());assertHeld(p);assert.equal(p.decision,'OTHER_PAYMENT_RECONCILIATION');assert.equal(p.account.due,0);assert.equal(p.account.paid,40);
 assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item(t)).allowed,false);
 assert.throws(()=>t.request('corteZCerrar',[{openingRequestId:'open',countedCash:140}],'cut','GERENCIA',t.managerToken),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS');
});
test('confirmed transfer is rejected as not-received, preserving original and confirmation rows',()=>{
 const t=fixture();t.request('confirmarTransferencia',[bank(t)],'confirm','GERENCIA',t.managerToken);readonly(t,()=>assert.throws(()=>t.plan(),e=>e.code==='TRANSFER_ALREADY_CONFIRMED'));
});
test('incomplete journal or ledger is retained and never resumed by proposal',()=>{
 for(const failure of ['journal','ledger','duplicate']){const t=fixture();
  if(failure==='journal')t.main.getSheetByName('DOMUS_JOURNAL').put(2,3,'PREPARED');
  if(failure==='ledger')t.main.getSheetByName('REQUESTS').put(2,5,'PROCESSING');
  if(failure==='duplicate'){const s=t.main.getSheetByName('REQUESTS');s.appendRow(s.getRange(2,1,1,8).getValues()[0]);}
  readonly(t,()=>assert.throws(()=>t.plan(),e=>e.code==='TRANSFER_RESOLUTION_REQUIRES_REVIEW'));
 }
});
test('absent journal stays absent; missing ledger blocks without creating either sheet',()=>{
 const t=fixture();t.main.sheets.delete('DOMUS_JOURNAL');assertHeld(readonly(t,()=>t.plan()));assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);
 t.main.sheets.delete('REQUESTS');readonly(t,()=>assert.throws(()=>t.plan(),e=>e.code==='TRANSFER_SOURCE_REQUIRES_REVIEW'));assert.equal(t.main.getSheetByName('REQUESTS'),null);
});
test('missing, malformed, duplicated, extra or mismatched command evidence blocks preparation',()=>{
 for(const variant of ['missing','json','duplicate','extra','qty','cash','header']){const t=fixture(),s=t.main.getSheetByName('COMANDAS');
  if(variant==='missing')s.put(7,13,'');if(variant==='json')s.put(7,13,'{broken');
  if(variant==='duplicate'||variant==='extra')s.getRange(8,1,1,14).setValues([s.getRange(7,1,1,14).getValues()[0]]);
  if(variant==='qty')stateFixture(t,'Pendiente',7,{qty:2});if(variant==='cash')t.main.getSheetByName('CAJA 2').put(7,1,'OTHER');
  if(variant==='header')s.put(6,13,'LEGACY JSON');readonly(t,()=>assert.throws(()=>t.plan()));
 }
});
test('inconsistent cancellation and unbound account row cannot masquerade as resolved',()=>{
 for(const variant of ['cancel','row','hash','device']){const t=fixture();
  if(variant==='cancel')stateFixture(t,'Cancelada');if(variant==='cancel')t.main.getSheetByName('CAJA 2').put(7,16,'Enviar');
  if(variant==='row'){const s=t.main.getSheetByName('CAJA 2');s.put(8,2,t.source.ticket);s.put(8,7,'UNBOUND');}
  if(['hash','device'].includes(variant)){const s=t.main.getSheetByName('REQUESTS');s.put(3,variant==='hash'?3:4,'');}
  readonly(t,()=>assert.throws(()=>t.plan(),e=>e.code==='TRANSFER_RESOLUTION_REQUIRES_REVIEW'));
 }
});
test('changed actual row timestamp or preparation state invalidates the previous fingerprint',()=>{
 const t=fixture(),a=readonly(t,()=>t.plan());const c=t.main.getSheetByName('CAJA 2');c.put(7,3,new Date(c.raw(7,3).getTime()+1000));
 const b=readonly(t,()=>t.plan());assert.notEqual(a.snapshotHash,b.snapshotHash);stateFixture(t,'Lista');const d=readonly(t,()=>t.plan());assert.notEqual(b.snapshotHash,d.snapshotHash);
});
test('formula errors and nonnumeric applied amounts cannot be reported as zero debt',()=>{
 for(const [sheet,column,value] of [['CAJA 2',12,'#REF!'],['COBROS',14,'40'],['COBROS',14,-1],['COBROS',6,'40']]){
  const t=fixture();t.main.getSheetByName(sheet).put(7,column,value);readonly(t,()=>assert.throws(()=>t.plan()));
 }
});
test('client flags cannot cancel, forgive debt, confirm, or force closure; proposal is not a sale ACK',()=>{
 const t=fixture(),p=readonly(t,()=>t.plan({force:true,paid:true,verified:true,cancel:true,allowPending:true,delivered:false}));assertHeld(p);assert.equal(p.account.due,40);
 const client=require('./reconciliation_regressions').setup();assert.equal(client.ctx.validSaleResult_(p,{paid:true,method:'Transferencia',expectedTotal:40}),false);
});
test('native and REST queries preserve state; GET never exposes proposal or financial data',()=>{
 const t=fixture();t.ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
 const payload={action:'prepararResolucionTransferencia',args:[t.params()],deviceId:'fixture-device',role:'GERENCIA',sessionToken:t.managerToken};
 readonly(t,()=>{const native=t.ctx.dispatchNativeAction(clone(payload)),rest=JSON.parse(t.ctx.doPost({postData:{contents:JSON.stringify(payload)}}).text);
  assert.equal(native.ok,true);assert.equal(rest.ok,true);assert.equal(native.data.snapshotHash,rest.data.snapshotHash);assertHeld(native.data);
  const get=JSON.parse(t.ctx.handleApiGetRequest_('prepararResolucionTransferencia',{}).text);assert.equal(get.ok,false);assert(!get.data);
 });
});
console.log(JSON.stringify({suite:'transfer-resolution-proposal',passed,liveNetwork:false,realBankReview:false,dispositionWrites:0,productionWrites:0}));
