'use strict';
// Real backend/client modules, in-memory Sheets and fixture-only transport.
// Manual bank-review assertions below are fictitious, never real bank evidence.
const assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const client=require('./reconciliation_regressions');
const {copy,tick}=client;
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
function prepare(){
 const t=setup();t.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['DOMUS_QA']}));
 const sale=t.sale({method:'Transferencia'}),source=t.request('cajaSimpleRegistrar',[sale],sale.id);
 t.manager();const manager=t.login('GERENCIA');
 const confirm=(p,id=p.requestId || 'confirmation-QA')=>t.request('confirmarTransferencia',[p],id,'GERENCIA',manager);
 const proof=(extra={})=>({sourceRequestId:sale.id,sourceReceipt:source.receipt,ticket:source.ticket,receiver:'DOMUS_QA',bankTransactionId:'QA-BANK-000001',receivedDate:'2026-11-05',evidenceReference:'QA statement line 1',amount:40,currency:'MXN',...extra});
 return {...t,salePayload:sale,source,manager,confirm,proof};
}
function business(t){return JSON.stringify([...t.main.sheets].filter(([n])=>n!=='REQUESTS').map(([n,s])=>[n,[...s.cells]]));}
function ready(t){
 const inv=t.main.getSheetByName('INVENTARIO');inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');
 const original=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:original(r,c);
 const board=t.main.getSheetByName('COMANDAS'),item=JSON.parse(board.raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=t.login('BARRA');
 t.request('comandasSimpleAccion',[{key,action:'TOMAR'}],'take','BARRA',token);
 t.request('comandasSimpleAccion',[{key,action:'LISTA'}],'ready','BARRA',token);
 const deliver=(id='deliver')=>t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],id,'BARRA',token);
 const boardData=()=>t.request('comandasSimpleDatos',[],undefined,'BARRA',token).orders;
 return {board,key,token,deliver,boardData};
}
const health={ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
function attach(t,native,respond){
 t.load('transport_');t.ctx.STATE.isNativeGas=native;
 t.ctx.fetch=async(_,opts)=>({json:()=>respond(JSON.parse(opts.body))});
 t.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(copy(p))).then(success,failure)})})}}};t.ctx.window.google=t.ctx.google;
}
(async()=>{
await test('pending -> manager confirmation appends once, preserves draft, settles balance and permits delivery',()=>{
 const t=prepare(),r=ready(t),cob=t.main.getSheetByName('COBROS'),original=cob.getRange(7,1,1,31).getValues()[0],p=t.proof();
 assert.equal(t.ctx.posBalanceFast_({m:t.main},t.source.ticket).due,40);
 assert.equal(r.boardData()[0].deliveryAllowed,false);const before=business(t);
 assert.throws(()=>r.deliver(),e=>e.code==='DELIVERY_TRANSFER_PENDING');assert.equal(business(t),before);
 assert.equal(t.ctx.paymentRequest_(t.ctx.paymentRequestIndex_(t.main),'deliver'),null);
 const result=t.confirm(p);assert.equal(result.amountApplied,40);assert.equal(result.verifiedRole,'GERENCIA');assert.equal(result.verificationMode,'MANUAL_BANK_REVIEW');
 assert.deepEqual(cob.getRange(7,1,1,31).getValues()[0],original);assert.equal(cob.getLastRow(),8);assert.equal(cob.value(8,14),40);
 assert.equal(t.ctx.posBalanceFast_({m:t.main},t.source.ticket).due,0);
 assert.equal(t.request('cajaSimpleDatos',[]).accounts.length,0);
 assert.equal(r.boardData()[0].deliveryAllowed,true);assert.equal(r.boardData()[0].credit,false);
 assert.equal(r.deliver().state,'Entregada');assert.equal(r.deliver().state,'Entregada');assert.equal(cob.getLastRow(),8);
 assert.equal(t.confirm(p).receipt,result.receipt);assert.equal(t.confirm(t.proof(),'another-confirmation').receipt,result.receipt);assert.equal(cob.getLastRow(),8);
 const pending=t.request('transferenciasPendientes',[],undefined,'GERENCIA',t.manager);assert.equal(pending.pending.length,0);
});
await test('role, receiver policy and actual source are required, no browser flag can verify a payment',()=>{
 const t=prepare(),before=business(t);
 assert.throws(()=>t.request('confirmarTransferencia',[t.proof({isTransferVerified:true})],'no-role'),/Acceso denegado/);
 t.props.delete('DOMUS_TRANSFER_REVIEW_POLICY');assert.throws(()=>t.confirm(t.proof()),e=>e.code==='TRANSFER_POLICY_REQUIRED_NO_EFFECTS');assert.equal(business(t),before);
 assert.equal(t.source.verified,false);assert.equal(t.source.paid,false);
});
await test('incomplete evidence, partial/excess amounts, receiver/currency/date/source mismatches have no business effects',()=>{
 for(const patch of [{bankTransactionId:''},{evidenceReference:''},{receiver:'UNAPPROVED'},{currency:'USD'},{receivedDate:'2026-02-30'},{receivedDate:'2099-01-01'},{amount:20},{amount:80},{amount:40.001},{sourceReceipt:'OTHER'},{ticket:'OTHER'},{sourceRequestId:'OTHER'}]){
  const t=prepare(),before=business(t);assert.throws(()=>t.confirm(t.proof(patch)));assert.equal(business(t),before);
 }
});
await test('reference uniqueness spans different accounts, normalizes case/spacing, rejects mutated same-ID proofs',()=>{
 const t=prepare(),first=t.confirm(t.proof()),cob=t.main.getSheetByName('COBROS');
 assert.equal(t.confirm(t.proof({bankTransactionId:' qa-bank-000001 '}),'normalized').receipt,first.receipt);
 assert.throws(()=>t.confirm(t.proof({bankTransactionId:'QA-BANK-000002'})),/IDEMPOTENCY_KEY_REUSED/);
 const other=t.sale({method:'Transferencia'}),result=t.request('cajaSimpleRegistrar',[other],other.id),before=business(t);
 assert.throws(()=>t.confirm(t.proof({sourceRequestId:other.id,sourceReceipt:result.receipt,ticket:result.ticket}),'other-account'),e=>e.code==='TRANSFER_BANK_REFERENCE_USED');
 assert.equal(business(t),before);assert.equal(cob.getLastRow(),9);
});
await test('another payment already settled the account: transfer requires reconciliation, no over-application',()=>{
 const t=prepare(),settle=t.sale({ticket:t.source.ticket,items:[],method:'Efectivo'});t.request('cajaSimpleRegistrar',[settle],settle.id);
 const before=business(t);assert.throws(()=>t.confirm(t.proof()),e=>e.code==='TRANSFER_BALANCE_REQUIRES_REVIEW');assert.equal(business(t),before);
});
await test('partial confirmation write remains undeliverable, resumes same ID and cannot create another collection',()=>{
 const t=prepare(),r=ready(t),cob=t.main.getSheetByName('COBROS'),p=t.proof();cob.failAt='8:14';
 assert.throws(()=>t.confirm(p),/INJECTED_WRITE_FAILURE/);const before=business(t);
 assert.throws(()=>r.deliver(),e=>e.code==='TRANSFER_HISTORY_REQUIRES_REVIEW');assert.equal(business(t),before);
 assert.throws(()=>t.confirm(t.proof(),'different-ID'),e=>e.code==='TRANSFER_HISTORY_REQUIRES_REVIEW');assert.equal(business(t),before);
 const result=t.confirm(p);assert.equal(result.amountApplied,40);assert.equal(cob.getLastRow(),8);assert.equal(r.deliver().state,'Entregada');
});
await test('completed payment journal with failed REQUESTS completion cannot authorize delivery until ledger recovery',()=>{
 const t=prepare(),r=ready(t),ledger=t.main.getSheetByName('REQUESTS'),put=ledger.put.bind(ledger);let fail=true;
 ledger.put=(row,col,value)=>{if(fail && col===5 && value==='COMPLETED'){fail=false;throw Error('INJECTED_LEDGER_FAILURE');}put(row,col,value);};
 const p=t.proof();assert.throws(()=>t.confirm(p),/INJECTED_LEDGER_FAILURE/);
 assert.equal(t.main.getSheetByName('COBROS').value(8,14),40);assert.throws(()=>r.deliver());
 t.confirm(p);assert.equal(r.deliver().state,'Entregada');assert.equal(t.main.getSheetByName('COBROS').getLastRow(),8);
});
await test('unbound legacy applied transfer and tampered original draft are quarantined, never imported',()=>{
 for(const legacy of [true,false]){
  const t=prepare(),cob=t.main.getSheetByName('COBROS');
  if(legacy)cob.getRange(8,1,1,14).setValues([['OLD',new Date(),'Caja','OLD','Transferencia',10,'','','unbound','','Confirmado','','',10]]);
  else cob.getRange(7,6).setValue(45);
  const before=business(t);assert.throws(()=>t.confirm(t.proof()));assert.equal(business(t),before);
 }
});
await test('client credit/paid flags and an unproved legacy order never authorize delivery',()=>{
 for(const legacy of [true,false]){
  const t=prepare(),r=ready(t),item=JSON.parse(r.board.raw(7,13));item.credit=true;item.paid=true;item.verified=true;item.paymentStatus='CONFIRMADA';r.board.getRange(7,13).setValue(JSON.stringify(item));
  if(legacy){const record=t.ctx.findRequestRecord_(t.salePayload.id,t.main);delete record.response.fulfillment;t.ctx.saveRequestRecord_(record,t.main);}
  const before=business(t);assert.throws(()=>r.deliver());assert.equal(business(t),before);assert.equal(r.boardData()[0].deliveryAllowed,false);
 }
});
await test('cash, terminals, authorized credit and courtesy retain delivery without bank confirmation',()=>{
 for(const kind of ['Efectivo','Terminal 1','Terminal 2','Amigo','Creador de proyecto','courtesy']){
  const t=setup();let role='CAJA',token;
  if(kind==='courtesy'){t.manager();role='GERENCIA';token=t.login(role);}
  const credit=['Amigo','Creador de proyecto'].includes(kind),sale=t.sale({paid:!credit,credit:credit?kind:'',method:credit?'':kind==='courtesy'?'Efectivo':kind,expectedTotal:kind==='courtesy'?0:40,items:[{name:'QA drink',sku:'QA-01',qty:1,courtesy:kind==='courtesy'}]});
  t.request('cajaSimpleRegistrar',[sale],sale.id,role,token);const r=ready(t);assert.equal(r.boardData()[0].deliveryAllowed,true,kind);assert.equal(r.deliver().state,'Entregada',kind);
 }
});
await test('prepared legacy delivery cannot bypass the payment guard through idempotency journal replay',()=>{
 const t=prepare(),r=ready(t),id='old-prepared-delivery',body={key:r.key,action:'ENTREGAR',requestId:id};
 const item=JSON.parse(r.board.raw(7,13));item.state='Entregada';r.board.failAt='7:8';
 // Seed an old PREPARED plan using the actual journal, not the guarded delivery API.
 assert.throws(()=>t.ctx.journalCommit_(id,'comandasSimpleAccion',t.main,[t.ctx.cellWrite_(r.board,7,8,'Entregada'),t.ctx.cellWrite_(r.board,7,13,JSON.stringify(item))],{ok:true,state:'Entregada'}),/INJECTED_WRITE_FAILURE/);
 t.ctx.saveRequestRecord_({requestId:id,action:'comandasSimpleAccion',payloadHash:t.ctx.computePayloadHash_({action:'comandasSimpleAccion',payload:body}),deviceId:'fixture-device',status:'REQUIRES_REVIEW',createdAt:'2026-11-05',response:{error:'old interrupted delivery'}},t.main);
 const before=business(t);assert.throws(()=>t.request('comandasSimpleAccion',[body],id,'BARRA',r.token),e=>e.code==='DELIVERY_TRANSFER_PENDING');assert.equal(business(t),before);
});
await test('private bank review cannot be read through Caja sale-status lookup',()=>{
 const t=prepare();t.confirm(t.proof());assert.throws(()=>t.request('cajaSimpleEstado',['confirmation-QA']),/Acceso denegado/);
 assert.throws(()=>t.request('transferenciasPendientes',[]),/Acceso denegado/);
});
await test('bank review records the authenticated principal, not a client-supplied reviewer label',()=>{
 const t=prepare(),result=t.confirm(t.proof({verifiedPrincipal:'attacker@example.invalid',verifiedBy:'Injected'}));
 assert.equal(result.verifiedPrincipal,'direccion@domusccc.net');assert.equal(result.verifiedBy,'QA operator');
});
await test('explicit pre-effect validation survives reload and permits a corrected NEW confirmation intention',async()=>{
 const b=prepare(),t=client.setup(),bad=b.proof({id:'bad-date',requestId:'bad-date',receivedDate:'2026-02-30'}),before=business(b);
 t.ctx.setSessionToken(b.manager,'GERENCIA');attach(t,true,async p=>p.action==='health'?health:b.ctx.dispatchNativeAction(copy(p)));
 await assert.rejects(t.call('confirmarTransferencia',[bad]),e=>e.code==='TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS');
 assert.equal(business(b),before);assert.equal(t.ctx.getOutbox()[0].status,'REJECTED');
 const reload=client.setup({storage:t.localStorage});reload.ctx.setSessionToken(b.manager,'GERENCIA');attach(reload,true,async p=>p.action==='health'?health:b.ctx.dispatchNativeAction(copy(p)));
 await reload.ctx.migrateLegacyOutbox_();assert.equal(reload.ctx.getOutbox()[0].status,'REJECTED');
 const fixed=b.proof({id:'corrected-date',requestId:'corrected-date'}),confirmed=await reload.call('confirmarTransferencia',[fixed]);
 assert.equal(confirmed.paid,true);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(reload.ctx.getOutbox()[0].requestId,'bad-date');
 assert.equal(reload.ctx.isSaleRejectionWithoutEffects_('confirmarTransferencia',{status:422,code:'TRANSFER_AMOUNT_REQUIRES_REVIEW'}),false);
});
await test('old manager session without verified principal renews before any confirmation binding or write',async()=>{
 const b=prepare(),t=client.setup(),key='ses:'+b.manager,cache=b.ctx.CacheService.getScriptCache(),session=JSON.parse(cache.get(key));delete session.principal;cache.put(key,JSON.stringify(session));b.props.set(key,JSON.stringify(session));
 const seen=[];t.ctx.setSessionToken(b.manager,'GERENCIA');attach(t,true,async p=>{if(p.action==='health')return health;seen.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));});
 const result=await t.call('confirmarTransferencia',[b.proof({id:'renew',requestId:'renew'})]);assert.equal(result.verifiedPrincipal,'direccion@domusccc.net');
 const sent=seen.filter(p=>p.action==='confirmarTransferencia');assert.equal(sent.length,2);assert.deepEqual(sent[0].args,sent[1].args);assert.equal(sent[0].requestId,sent[1].requestId);
 assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);
});
await test('prepared pending-access journal stays quarantined before admission or payment writes',()=>{
 const t=setup(),s=t.main.getSheetByName('ACCESO'),id='old-access-transfer',body={requestId:id,id,customer:'QA',activity:'QA event',ticketTypeId:'General',paymentMethod:'Transferencia'};
 s.failAt='7:4';assert.throws(()=>t.ctx.journalCommit_(id,'accesoSimpleRegistrar',t.main,[t.ctx.cellWrite_(s,7,4,'QA'),t.ctx.cellWrite_(s,7,26,1)],{ok:true,paymentStatus:'PENDIENTE_VERIFICACION',paymentMethod:'Transferencia'}),/INJECTED_WRITE_FAILURE/);
 t.ctx.saveRequestRecord_({requestId:id,action:'accesoSimpleRegistrar',payloadHash:t.ctx.computePayloadHash_({action:'accesoSimpleRegistrar',payload:body}),deviceId:'fixture-device',status:'REQUIRES_REVIEW',createdAt:'2026-11-05',response:{error:'interrupted'}},t.main);
 const before=business(t);assert.throws(()=>t.request('accesoSimpleRegistrar',[body],id,'ACCESOS',t.login('ACCESOS')),e=>e.code==='ACCESS_TRANSFER_REQUIRES_REVIEW');assert.equal(business(t),before);
});
for(const native of [true,false])await test((native?'native':'REST')+': invalid/lost transfer ACK survives reload and recovers the exact confirmed payment once',async()=>{
 for(const kind of ['empty','false','array','wrong-source','wrong-outer-id','wrong-bank','wrong-amount','missing-verification','missing-principal','server-partial']){
  const b=prepare(),t=client.setup(),p=b.proof({id:'client-confirm',requestId:'client-confirm'}),seen=[];let lost=true;
  if(kind==='server-partial')b.main.getSheetByName('COBROS').failAt='8:14';
  t.ctx.setSessionToken(b.manager,'GERENCIA');t.ctx.STATE.cart=[{sku:'UNRELATED',qty:1,price:77}];
  const respond=async envelope=>{
   if(envelope.action==='health')return health;seen.push(copy(envelope));const response=b.ctx.dispatchNativeAction(copy(envelope));
   if(lost){if(kind==='server-partial')return response;const bad=copy(response);if(kind==='empty')bad.data={};else if(kind==='false')bad.data=false;else if(kind==='array')bad.data=[];else if(kind==='wrong-source')bad.data.sourceReceipt='OTHER';else if(kind==='wrong-outer-id')bad.requestId='OTHER';else if(kind==='wrong-bank')bad.data.bankTransactionId='OTHER';else if(kind==='wrong-amount')bad.data.amountApplied=400;else if(kind==='missing-principal')delete bad.data.verifiedPrincipal;else delete bad.data.verified;return bad;}return response;
  };
  attach(t,native,respond);const first=await t.call('confirmarTransferencia',[p]);assert.equal(first.localOutbox,true);
  assert.equal(t.ctx.getOutbox()[0].status,'RETRY');assert.equal(t.localStorage.getItem('domus_confirmation_client-confirm'),null);assert.equal(t.ctx.STATE.cart[0].sku,'UNRELATED');
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);
  lost=false;const reload=client.setup({storage:t.localStorage});reload.ctx.setSessionToken(b.manager,'GERENCIA');attach(reload,native,respond);
  await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();
  assert.equal(seen.length,2);assert.equal(seen[0].requestId,seen[1].requestId);assert.deepEqual(seen[0].args,seen[1].args);
  const confirmation=JSON.parse(reload.localStorage.getItem('domus_confirmation_client-confirm'));assert(confirmation.data.receipt);assert.equal(confirmation.data.verified,true);
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(reload.ctx.getOutbox().length,0);assert.equal(reload.localStorage.getItem('domus_last_sale_confirmation'),'client-confirm');
 }
});
await test('frontend denies unknown/pending delivery before confirmation dialog or transport',()=>{
 for(const flag of [undefined,false]){
  const t=client.setup();let dialogs=0,sends=0;t.ctx.ensureOperator=()=>true;t.ctx.confirm=()=>{dialogs++;return true;};t.ctx.callBackend=()=>sends++;
  t.ctx.STATE.comandas=[{key:'k',state:'Lista',deliveryAllowed:flag}];t.load('deliverOrder');t.ctx.deliverOrder('k');assert.equal(dialogs,0);assert.equal(sends,0);
 }
});
await test('bank review UI requires attestation and preserves an unresolved confirmation instead of issuing another ID',async()=>{
 const t=client.setup(),b=prepare(),p=b.proof();t.load('submitTransferReview_');t.ctx.STATE.transferPending=[{...p,requiresReview:false}];
 for(const [id,value] of Object.entries({transferPendingSelect:p.sourceRequestId,transferReviewAmount:'40',transferReceiverSelect:p.receiver,transferBankReference:p.bankTransactionId,transferReceivedDate:p.receivedDate,transferEvidenceReference:p.evidenceReference}))t.ctx.$(id).value=value;
 let sends=0;t.ctx.callBackend=()=>sends++;t.ctx.submitTransferReview_();assert.equal(sends,0);
 t.ctx.$('transferBankReviewed').checked=true;
 await t.seed([{requestId:'unresolved',action:'confirmarTransferencia',args:[p],status:'RETRY'}]);t.ctx.submitTransferReview_();assert.equal(sends,0);assert(t.notices.at(-1)[0].includes('unresolved'));
});
console.log(JSON.stringify({suite:'transfer-review-real-source-isolated',passed,failed,bankVerified:false,liveSheets:false,hardware:false}));if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
