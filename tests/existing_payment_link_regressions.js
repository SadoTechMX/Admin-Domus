'use strict';
const assert=require('assert/strict'),{fixture:pendingFixture,business}=require('./transfer_cancellation_regressions');
const clone=x=>JSON.parse(JSON.stringify(x));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function fixture(method='Efectivo'){
 const t=pendingFixture();
 const inv=t.main.getSheetByName('INVENTARIO');inv.put(7,7,'=SUMIF(QA)');inv.put(7,8,'=D7-G7');const value=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:value(r,c);
 const payment=t.sale({id:'existing',ticket:t.source.ticket,items:[],method,openingRequestId:'open',
  ...(method==='Mixto'?{payments:[{method:'Efectivo',amount:15},{method:'Terminal 1',amount:25}],received:20,tip:0,terminalConfirmed:true,terminalReference:'QA-TERMINAL'}:{})});
 const existing=t.request('cajaSimpleRegistrar',[payment],payment.id);
 const plan=()=>t.request('prepararVinculoPagoExistente',[t.ref],'query-existing','GERENCIA',t.managerToken);
 const body=(extra={})=>{const p=plan();return {...t.ref,openingRequestId:'open',existingPaymentRequestId:p.existingPayment.requestId,existingPaymentReceipt:p.existingPayment.receipt,
   expectedAmount:p.amount,expectedPaymentMethod:p.existingPayment.method,expectedPaymentParts:p.existingPayment.parts,expectedUnitIds:p.unitIds,snapshotHash:p.snapshotHash,confirmExistingPayment:true,newCharge:0,reason:'QA existing payment chosen',evidenceReference:'QA matching receipt review',...extra};};
 const link=(p,id='link')=>t.request('vincularPagoExistente',[p],id,'GERENCIA',t.managerToken);
 const item=()=>JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13));
 const decision=()=>t.ctx.kdsDeliveryDecision_(t.main,item());
 const ledger=()=>JSON.stringify([...t.main.sheets].map(([n,s])=>[n,[...s.cells]]));
 const deliver=()=>{const token=t.login('BARRA'),key='DCS-7-pending';for(const action of ['TOMAR','LISTA','ENTREGAR'])t.request('comandasSimpleAccion',[{key,action,operator:'QA'}],action,'BARRA',token);};
 return {...t,existing,plan,body,link,item,decision,ledger,deliver};
}
function main(){
for(const method of ['Efectivo','Terminal 1','Terminal 2','Mixto'])test(method+': one administrative link, no commercial writes, delivery and cut count existing money only',()=>{
 const t=fixture(method),before=t.ledger(),p=t.plan();assert.equal(t.ledger(),before);assert.equal(p.newCharge,0);assert.equal(p.existingPayment.receipt,t.existing.receipt);assert.equal(t.decision().allowed,false);
 const original=business(t),body=t.body(),r=t.link(body);assert.equal(business(t),original);assert.equal(r.newCharge,0);assert.equal(r.amountApplied,0);assert.equal(r.linkedAmount,40);assert.equal(t.item().state,'Pendiente');assert.equal(t.decision().allowed,true);
 const list=t.request('transferenciasPendientes',[],'list','GERENCIA',t.managerToken);assert.equal(list.pending.length,0);assert.equal(list.linked[0].existingPaymentReceipt,t.existing.receipt);
 assert.throws(()=>t.cut());t.deliver();const cut=t.cut('after-delivery');assert.equal(cut.snapshot.pendingTransfers.length,0);assert.equal(cut.snapshot.linkedPayments.length,1);
 assert.equal(Object.values(cut.snapshot.totals).reduce((a,b)=>a+b,0),40);assert.equal(cut.snapshot.movements.length,method==='Mixto'?2:1);
 assert.equal(t.ctx.transferExistingPaymentRecords_(t.main).length,1);assert.deepEqual(t.link(body),r);
});
test('same ID replays same result; changed body and another device cannot change the link',()=>{
 const t=fixture(),p=t.body(),r=t.link(p),before=t.ledger();assert.deepEqual(t.link(p),r);assert.equal(t.ledger(),before);
 assert.throws(()=>t.link({...p,newCharge:40}),/IDEMPOTENCY_KEY_REUSED/);
 const token=t.login('GERENCIA','another-device');assert.throws(()=>t.ctx.executeDomusAction_('vincularPagoExistente',{args:[p],requestId:'link',role:'GERENCIA',deviceId:'another-device',sessionToken:token}),/IDEMPOTENCY_KEY_REUSED/);
});
test('serialized concurrent new IDs cannot consume the same payment twice',()=>{
 const t=fixture(),p=t.body();t.link(p,'first');const b=business(t);assert.throws(()=>t.link(p,'second'),e=>e.code==='EXISTING_PAYMENT_VALIDATION_NO_EFFECTS');assert.equal(business(t),b);assert.equal(t.ctx.transferExistingPaymentRecords_(t.main).length,1);
 assert.equal(t.locks().held,false);assert.equal(t.locks().acquires,t.locks().releases);
});
test('manager identity and explicit zero-charge confirmation required before effects',()=>{
 const t=fixture(),p=t.body(),before=business(t);assert.throws(()=>t.request('vincularPagoExistente',[p],'bad-role'),/Acceso denegado/);
 for(const patch of [{confirmExistingPayment:false},{confirmExistingPayment:undefined},{newCharge:1},{newCharge:undefined},{reason:''},{evidenceReference:''}]){
  const x=fixture(),q=x.body(patch),b=business(x);assert.throws(()=>x.link(q),e=>e.code==='EXISTING_PAYMENT_VALIDATION_NO_EFFECTS');assert.equal(business(x),b);assert.equal(x.ctx.journalFind_('link',x.main),null);
 }
 const session=JSON.parse(t.props.get('ses:'+t.managerToken));delete session.principal;t.props.set('ses:'+t.managerToken,JSON.stringify(session));t.ctx.CacheService.getScriptCache().put('ses:'+t.managerToken,JSON.stringify(session));
 assert.throws(()=>t.link(p),e=>e.code==='AUTH_PRINCIPAL_REQUIRED');assert.equal(business(t),before);assert.throws(()=>t.ctx.vincularPagoExistente(p),/Acceso denegado|contexto|AUTH_CONTEXT_REQUIRED/i);
});
test('wrong request, receipt, amount, units, account and journey are rejected before business writes',()=>{
 for(const patch of [{existingPaymentRequestId:'other'},{existingPaymentReceipt:'OTHER'},{expectedAmount:39},{expectedUnitIds:['OTHER']},{ticket:'OTHER'},{openingRequestId:'OTHER'}]){
  const t=fixture(),p=t.body(patch),before=business(t);assert.throws(()=>t.link(p));assert.equal(business(t),before);assert.equal(t.ctx.journalFind_('link',t.main),null);
 }
});
test('stale proposal requires a fresh review and new ID after a proven no-effect rejection',()=>{
 const t=fixture(),p=t.body();t.command('Lista');assert.throws(()=>t.link(p),e=>e.code==='EXISTING_PAYMENT_VALIDATION_NO_EFFECTS');const next=t.body();assert.throws(()=>t.link(next),/IDEMPOTENCY_KEY_REUSED/);assert.equal(t.link(next,'new-reviewed').newCharge,0);
});
test('pending, partial, corrupted or duplicated existing payment evidence cannot authorize a link',()=>{
 for(const change of ['state','amount','applied','account','tag','actor','duplicate-row','duplicate-ledger','journal','journey']){
  const t=fixture(),p=t.body(),s=t.main.getSheetByName('COBROS'),q=t.main.getSheetByName('REQUESTS');
  if(change==='state')s.put(8,11,'Borrador');if(change==='amount')s.put(8,6,20);if(change==='applied')s.put(8,14,20);if(change==='account')s.put(8,4,'OTHER');if(change==='tag')s.put(8,9,'CAJA-RAPIDA:OTHER');if(change==='actor')s.put(8,12,'OTHER');
  if(change==='duplicate-row')s.appendRow(s.getRange(8,1,1,31).getValues()[0]);if(change==='duplicate-ledger')q.appendRow(q.getRange(4,1,1,8).getValues()[0]);
  if(change==='journal')t.ctx.journalFind_('existing',t.main).sheet.put(t.ctx.journalFind_('existing',t.main).row,3,'PREPARED');
  if(change==='journey'){const r=JSON.parse(q.raw(4,8));r.journey.scope.projectId='OTHER';q.put(4,8,JSON.stringify(r));}
  const b=business(t);assert.throws(()=>t.link(p));assert.equal(business(t),b);assert.equal(t.decision().allowed,false);
 }
});
test('no existing payment, extended orders and cancelled orders remain for reconciliation',()=>{
 const t=pendingFixture(),before=business(t);assert.throws(()=>t.request('prepararVinculoPagoExistente',[t.ref],'q','GERENCIA',t.managerToken));assert.equal(business(t),before);
 const x=fixture();x.main.getSheetByName('CAJA 2').put(7,16,'Cancelado');x.command('Cancelada');assert.throws(()=>x.plan());
 const y=fixture(),p=y.sale({id:'extension',ticket:y.source.ticket,openingRequestId:'open',method:'Efectivo'});y.request('cajaSimpleRegistrar',[p],p.id);assert.throws(()=>y.plan());
});
test('completed link blocks late bank application and cancellation without inventing a refund',()=>{
 const t=fixture(),p=t.body();t.link(p);const b=business(t);assert.throws(()=>t.request('confirmarTransferencia',[t.proof()],'late','GERENCIA',t.managerToken),e=>e.code==='TRANSFER_LINKED_REQUIRES_RECONCILIATION');assert.equal(t.ctx.paymentRequest_(t.ctx.paymentRequestIndex_(t.main),'late'),null);
 assert.throws(()=>t.cancel({...p,review:{noDeliveryConfirmed:true,noBankReceiptConfirmed:true,evidenceReference:'QA'},wasteReview:{status:'NO_WASTE_OBSERVED',note:'QA'}}),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(business(t),b);
 t.deliver();assert.equal(t.cut().snapshot.totals.Efectivo,40);
});
test('prepared zero-write journal and lost final REQUESTS completion recover only the original link',()=>{
 for(const stage of ['journal','request']){
  const t=fixture(),p=t.body(),before=business(t),sheet=t.main.getSheetByName(stage==='journal'?'DOMUS_JOURNAL':'REQUESTS'),put=sheet.put.bind(sheet);let fired=false;
  sheet.put=(r,c,v)=>{if(!fired && ((stage==='journal'&&c===3)||(stage==='request'&&c===5)) && v==='COMPLETED'){fired=true;throw Error('LINK_COMPLETION_FAILED');}return put(r,c,v);};
  assert.throws(()=>t.link(p),/LINK_COMPLETION_FAILED/);assert.equal(business(t),before);assert.throws(()=>t.decision());assert.throws(()=>t.cut());assert.equal(t.link(p).newCharge,0);assert.equal(t.decision().allowed,true);assert.equal(business(t),before);
 }
});
test('altered evidence or commercial replay plan cannot resume a partial linkage',()=>{
 for(const change of ['payment','plan','duplicate-journal','account']){
  const t=fixture(),p=t.body(),s=t.main.getSheetByName('REQUESTS'),put=s.put.bind(s);let fail=true;s.put=(r,c,v)=>{if(fail&&c===5&&v==='COMPLETED'){fail=false;throw Error('FAIL');}put(r,c,v);};assert.throws(()=>t.link(p));
  const j=t.ctx.journalFind_('link',t.main);if(change==='account')t.main.getSheetByName('CAJA 2').put(7,10,41);if(change==='payment')t.main.getSheetByName('COBROS').put(8,6,41);if(change==='plan')j.sheet.put(j.row,4,JSON.stringify([{sheet:'COBROS',row:9,column:6,value:40}]));if(change==='duplicate-journal')j.sheet.appendRow(j.data);
  const b=business(t);assert.throws(()=>t.link(p));assert.equal(business(t),b);
 }
});
test('durable link corruption never releases delivery or cut',()=>{
 for(const change of ['result','duplicate','payment','conflicting-bank']){const t=fixture();t.link(t.body());const s=t.main.getSheetByName('REQUESTS');
  if(change==='result'){const r=JSON.parse(s.raw(5,8));r.linkedAmount=39;s.put(5,8,JSON.stringify(r));}if(change==='duplicate')s.appendRow(s.getRange(5,1,1,8).getValues()[0]);if(change==='payment')t.main.getSheetByName('COBROS').put(8,11,'Borrador');
  if(change==='conflicting-bank'){
   // Inconsistent imported history, not an authorized mutation: both resolutions claim the same pending.
   const proof=t.proof(),bankKey=t.ctx.transferBankKey_(proof.receiver,proof.bankTransactionId),r={...proof,ok:true,kind:'TRANSFER_CONFIRMATION',confirmationRequestId:'conflicting-bank',receipt:'QA-CONFLICT',method:'Transferencia',paymentStatus:'CONFIRMADA',paid:true,verified:true,
    verificationMode:'MANUAL_BANK_REVIEW',verifiedRole:'GERENCIA',verifiedPrincipal:'direccion@domusccc.net',amountApplied:40,bankKey};
   s.appendRow(['conflicting-bank','confirmarTransferencia','a'.repeat(64),'fixture-device','COMPLETED',new Date().toISOString(),new Date().toISOString(),JSON.stringify(r)]);
   const row=Array(31).fill('');Object.assign(row,{0:r.receipt,2:'Caja',3:r.ticket,4:'Transferencia',5:40,8:'DOMUS_TRANSFER_CONFIRMATION:'+JSON.stringify({version:1,confirmationRequestId:r.confirmationRequestId,sourceRequestId:r.sourceRequestId,sourceReceipt:r.sourceReceipt,bankKey}),9:r.receiver,10:'Confirmado',13:40});t.main.getSheetByName('COBROS').appendRow(row);
  }
  const b=business(t);assert.throws(()=>t.decision());assert.throws(()=>t.cut());assert.equal(business(t),b);
 }
});
test('already recorded delivery is preserved; linkage does not consume inventory again',()=>{
 const t=fixture();t.command('Entregada',7,{delivered:'2026-11-08T01:00:00Z',deliveredBy:'QA'});t.main.getSheetByName('CAJA 2').put(7,22,1);const before=business(t);t.link(t.body());assert.equal(business(t),before);assert.equal(t.cut().snapshot.totals.Efectivo,40);
});
console.log(JSON.stringify({suite:'existing-payment-link-real-source-mocks',passed,liveSheets:false,newCollections:0}));
}
module.exports={fixture};if(require.main===module)main();
