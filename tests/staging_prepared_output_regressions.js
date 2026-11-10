'use strict';
// Actual handlers, journal and idempotency; synthetic books only, no Google/network.
const assert=require('assert/strict'),{fixture}=require('./staging_opening_isolation_regressions');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,s.maxRows,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,s.maxRows,[...s.cells],[...s.rules]])));
const rejected=e=>e.code==='HISTORY_REQUIRES_REVIEW';
const body={scopeId:'QA',openingFloat:0,historyBoundaryId:'fixture-isolation'};
function operatorCall(t,action,p,id,operator){
 const token=t.ctx.executeDomusAction_('authCrearSesion',{args:['CAJA',operator,'fixture-device','fixture-secret'],role:'CAJA',deviceId:'fixture-device'}).result.token;
 return t.ctx.executeDomusAction_(action,{args:[JSON.parse(JSON.stringify(p))],requestId:id,role:'CAJA',deviceId:'fixture-device',sessionToken:token}).result;
}
function cleanRejection(t,id,call){
 const before=snapshot(t);assert.throws(call,rejected);assert.equal(snapshot(t),before);
 assert.equal(t.ctx.paymentRequestIndex_(t.main).has(id),false);assert.equal(t.ctx.journalFind_(id,t.main),null);
 assert.doesNotThrow(t.state);assert.equal(t.locks().held,false);
 assert.throws(call,rejected);assert.equal(snapshot(t),before);
}
for(const environment of [undefined,'STAGING'])for(const mode of ['operator','generated-shift'])test((environment||'modules')+': reported '+mode+' rejects before REQUESTS/PREPARED and leaves reads/retry intact',()=>{
 const t=fixture(environment),id='generated-collision';
 if(mode==='generated-shift'){
  const original=JSON.parse(t.s.raw(131,8));original.shiftId='TURNO-'+id;
  t.s.getRange(131,8).setValue(JSON.stringify(original));t.main.getSheetByName('TURNOS').getRange(2,1).setValue(original.shiftId);
 }
 t.activate();const call=mode==='operator'?()=>operatorCall(t,'turnoAbrir',body,id,'QA '+t.ids[0]):()=>t.call('turnoAbrir',body,id,'CAJA');
 cleanRejection(t,id,call);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
 const good=t.open();assert.equal(good.openingRequestId,'fixture-new-open');
});
test('server policy metadata is validated as output without relying on client fields',()=>{
 const t=fixture(),policy=JSON.parse(t.props.get('DOMUS_JOURNEY_POLICY_V1'));policy.scopes[0].projectName='QA '+t.ids[0];
 t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));t.activate();cleanRejection(t,'fixture-new-open',t.open);
});
for(const mode of ['catalog-group','generated-receipt','operator'])test('real POS rejects server-added '+mode+' before any financial write or binding',()=>{
 const t=fixture();t.activate();t.open();const p=t.sale({openingRequestId:'fixture-new-open'});
 if(mode==='catalog-group')t.main.getSheetByName('CATALOGO').getRange(7,2).setValue('group '+t.ids[0]);
 if(mode==='generated-receipt')t.ctx.Utilities.getUuid=()=>t.ids[0];
 const call=mode==='operator'?()=>operatorCall(t,'cajaSimpleRegistrar',p,p.id,'QA '+t.ids[0]):()=>t.call('cajaSimpleRegistrar',p,p.id,'CAJA');
 cleanRejection(t,p.id,call);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
});
function primitive(t,id,writes,result){
 return ()=>t.ctx.idempotentExecute_(id,'cajaSimpleRegistrar',{},'fixture-device',()=>t.ctx.journalCommit_(id,'cajaSimpleRegistrar',t.main,writes,result));
}
for(const mode of ['write-only','before-image','serialized-result','growth'])test('complete prepared evidence rejects '+mode+' before binding, journal creation or row growth',()=>{
 const t=fixture();t.activate();const s=t.main.getSheetByName('INVENTARIO'),id='bad-plan-'+mode;
 let result={ok:true},row=7,value='safe';
 if(mode==='write-only')value=' '+JSON.stringify({ref:t.ids[0]}).replace('fixture','\\u0066ixture');
 if(mode==='before-image')s.getRange(row,14).setValue(t.ids[0]);
 if(mode==='serialized-result')result={toJSON:()=>({ok:true,generated:t.ids[0]})};
 if(mode==='growth'){row=s.getMaxRows()+2;value=t.ids[0];}
 const writes=[t.ctx.cellWrite_(s,row,14,value)];cleanRejection(t,id,primitive(t,id,writes,result));
});
test('read-only early return is also validated before first binding',()=>{
 const t=fixture();t.activate();const id='early-return';
 cleanRejection(t,id,()=>t.ctx.idempotentExecute_(id,'turnoAbrir',{},'fixture-device',()=>({ok:true,openedBy:t.ids[0]})));
});
test('an early return is serialized once so the validated response is the one stored and acknowledged',()=>{
 const t=fixture();t.activate();let serializations=0;
 const r=t.ctx.idempotentExecute_('serialize-once','cajaSimpleRegistrar',{},'fixture-device',()=>({toJSON:()=>++serializations===1?{ok:true}:{generated:t.ids[0]}}));
 assert.equal(serializations,1);assert.equal(r.ok,true);assert.equal(t.ctx.findRequestRecord_('serialize-once',t.main).response.ok,true);assert.doesNotThrow(t.state);
});
test('valid new financial plan binds once under lock before journal and effects',()=>{
 const t=fixture();t.activate();t.open();const p=t.sale({openingRequestId:'fixture-new-open'}),before=business(t),save=t.ctx.saveRequestRecord_;let bound=0;
 t.ctx.saveRequestRecord_=(r,m)=>{
  if(r.requestId===p.id && r.status==='PROCESSING'){bound++;assert(t.locks().held);assert.equal(t.ctx.journalFind_(p.id,t.main),null);assert.equal(business(t),before);}
  return save(r,m);
 };
 const result=t.call('cajaSimpleRegistrar',p,p.id,'CAJA');assert.equal(result.paid,true);assert.equal(bound,1);
 const saved=snapshot(t);assert.deepEqual(operatorCall(t,'cajaSimpleRegistrar',p,p.id,'QA '+t.ids[0]),result);assert.equal(snapshot(t),saved);
});
test('valid row growth follows accepted preparation and uses an empty before-image',()=>{
 const t=fixture();t.activate();const s=t.main.getSheetByName('INVENTARIO'),row=s.getMaxRows()+2,id='grow-safe';
 const call=primitive(t,id,[t.ctx.cellWrite_(s,row,14,'safe')],{ok:true});call();assert.equal(s.raw(row,14),'safe');assert.equal(s.getMaxRows(),row);
 const before=snapshot(t);call();assert.equal(snapshot(t),before);
});
test('row growth does not bypass inherited validations; a structural write failure remains uncertain',()=>{
 const t=fixture();t.activate();const s=t.main.getSheetByName('INVENTARIO'),row=s.getMaxRows()+2,id='grow-invalid',grow=s.insertRowsAfter.bind(s);
 s.insertRowsAfter=(r,n)=>{grow(r,n);s.rules.set(row+':14',{getAllowInvalid:()=>false,getCriteriaType:()=> 'VALUE_IN_LIST',getCriteriaValues:()=>[['permitted']]});};
 assert.throws(primitive(t,id,[t.ctx.cellWrite_(s,row,14,'not-permitted')],{ok:true}),/SCHEMA_VALIDATION/);
 assert.equal(s.raw(row,14),'');assert.equal(t.ctx.journalFind_(id,t.main),null);assert.equal(t.ctx.paymentRequestIndex_(t.main).get(id)[0][4],'REQUIRES_REVIEW');
});
test('partial accepted sale remains bound and recovers the same ID; it is never reclassified as a rejected preparation',()=>{
 const t=fixture();t.activate();t.open();const p=t.sale({openingRequestId:'fixture-new-open'}),s=t.main.getSheetByName('COBROS');s.failAt='7:11';
 const call=()=>t.call('cajaSimpleRegistrar',p,p.id,'CAJA');assert.throws(call,/INJECTED_WRITE_FAILURE/);
 assert.equal(t.ctx.paymentRequestIndex_(t.main).get(p.id)[0][4],'REQUIRES_REVIEW');assert.equal(t.ctx.journalFind_(p.id,t.main).data[2],'PREPARED');
 assert.throws(()=>t.call('cajaSimpleRegistrar',{...p,customer:'changed'},p.id,'CAJA'),/IDEMPOTENCY_KEY_REUSED/);
 const r=call();assert.equal(r.paid,true);assert.deepEqual(call(),r);assert.equal(s.getLastRow(),7);
});
test('a binding flush failure stays uncertain and is not silently removed or treated as no effects',()=>{
 const t=fixture();t.activate();const before=business(t);let once=true;
 t.ctx.SpreadsheetApp.flush=()=>{const rows=t.ctx.paymentRequestIndex_(t.main).get('fixture-new-open');if(once && rows && rows[0][4]==='PROCESSING'){once=false;throw Error('BINDING_FLUSH_FAILED');}};
 assert.throws(t.open,/BINDING_FLUSH_FAILED/);assert.equal(business(t),before);assert.equal(t.ctx.paymentRequestIndex_(t.main).get('fixture-new-open')[0][4],'REQUIRES_REVIEW');
 assert.equal(t.ctx.journalFind_('fixture-new-open',t.main),null);assert.throws(t.open,/IDEMPOTENCY_REQUIRES_REVIEW/);
});
test('an already poisoned PREPARED plan from an older build is preserved and never automatically repaired',()=>{
 const t=fixture();t.activate();const id='old-poison';
 t.s.appendRow([id,'turnoAbrir','x','fixture-device','REQUIRES_REVIEW','','','{}']);
 t.ctx.journalSheet_(t.main).appendRow([id,'turnoAbrir','PREPARED','{"parts":0}',JSON.stringify({openedBy:t.ids[0]}),'']);
 const before=snapshot(t);assert.throws(t.state,rejected);assert.throws(()=>t.ctx.journalResume_(id,'turnoAbrir',t.main),rejected);assert.equal(snapshot(t),before);
});
test('preparation and binding hold the same lock against a different execution',()=>{
 const t=fixture();t.activate();const other=fixture();other.ctx.LockService=t.ctx.LockService;let attempted=false;
 const guard=t.ctx.historyGuardPrepared_;t.ctx.historyGuardPrepared_=(...args)=>{
  if(!attempted && args[2]==='turnoAbrir'){attempted=true;assert(t.locks().held);assert.throws(other.open,/transacción concurrente/);}
  return guard(...args);
 };
 t.open();assert(attempted);assert.equal(t.locks().acquires,t.locks().releases);
});
test('a nested/different request cannot consume another preparation binding',()=>{
 const t=fixture();t.activate();const before=snapshot(t);
 assert.throws(()=>t.ctx.idempotentExecute_('outer','turnoAbrir',{},'fixture-device',()=>t.ctx.idempotentExecute_('inner','turnoAbrir',{},'fixture-device',()=>({ok:true}))),rejected);
 assert.equal(snapshot(t),before);assert.equal(t.state().active,null);
 assert.throws(()=>t.ctx.idempotentExecute_('outer','turnoAbrir',{},'fixture-device',()=>t.ctx.journalCommit_('different','turnoAbrir',t.main,[],{ok:true})),rejected);
 assert.equal(snapshot(t),before);
});
for(const resolution of ['confirm','cancel','existing'])test('scoped custody preserves real handlers for '+resolution+' plus delivery/cut, using synthetic evidence only',()=>{
 const t=fixture();t.activate();t.open();const sale=t.sale({id:'pending-test',openingRequestId:'fixture-new-open',method:'Transferencia'});
 const source=t.call('cajaSimpleRegistrar',sale,sale.id,'CAJA'),ref={sourceRequestId:sale.id,sourceReceipt:source.receipt,ticket:source.ticket};
 let action,p;
 if(resolution==='confirm'){
  t.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['QA']}));action='confirmarTransferencia';
  p={...ref,openingRequestId:'fixture-new-open',receiver:'QA',bankTransactionId:'SYNTHETIC-BANK-ONLY',receivedDate:'2026-11-05',evidenceReference:'Memory fixture, no bank accessed',amount:40,currency:'MXN'};
 }else if(resolution==='cancel'){
  action='cancelarTransferenciaNoRecibida';const plan=t.call('prepararResolucionTransferencia',ref);
  p={...ref,openingRequestId:'fixture-new-open',snapshotHash:plan.snapshotHash,expectedAmount:plan.amount,expectedUnitIds:plan.fulfillment.units.map(u=>u.id),reason:'Synthetic cancellation only',
   review:{noDeliveryConfirmed:true,noBankReceiptConfirmed:true,evidenceReference:'Memory fixture only'},wasteReview:{status:'NO_WASTE_OBSERVED',note:'Synthetic observation only'}};
 }else{
  const cash=t.sale({id:'existing-test',openingRequestId:'fixture-new-open',ticket:source.ticket,items:[],method:'Efectivo'});t.call('cajaSimpleRegistrar',cash,cash.id,'CAJA');
  action='vincularPagoExistente';const plan=t.call('prepararVinculoPagoExistente',ref);
  p={...ref,openingRequestId:'fixture-new-open',snapshotHash:plan.snapshotHash,existingPaymentRequestId:plan.existingPayment.requestId,existingPaymentReceipt:plan.existingPayment.receipt,
   expectedAmount:plan.amount,expectedPaymentMethod:plan.existingPayment.method,expectedPaymentParts:plan.existingPayment.parts,expectedUnitIds:plan.unitIds,confirmExistingPayment:true,newCharge:0,reason:'Synthetic linkage only',evidenceReference:'Memory fixture only'};
 }
 const r=t.call(action,p,'resolve-test');assert.deepEqual(t.call(action,p,'resolve-test'),r);
 if(resolution!=='cancel'){
  assert.throws(t.cut,/comanda/);
  const inv=t.main.getSheetByName('INVENTARIO'),value=inv.value.bind(inv);inv.put(7,7,'=SUMIF(QA)');inv.put(7,8,'=D7-G7');inv.value=(r,c)=>r===7&&c===8?10:value(r,c);
  const token=t.ctx.executeDomusAction_('authCrearSesion',{args:['BARRA','QA operator','fixture-device','fixture-secret'],role:'BARRA',deviceId:'fixture-device'}).result.token;
  for(const step of ['TOMAR','LISTA','ENTREGAR'])t.ctx.executeDomusAction_('comandasSimpleAccion',{args:[{key:'DCS-7-'+sale.id,action:step}],requestId:'command-'+step,role:'BARRA',deviceId:'fixture-device',sessionToken:token});
 }
 assert.equal(t.cut().status,'CLOSED');assert.equal(t.main.getSheetByName('COBROS').getLastRow(),resolution==='cancel'?7:8);
});
(async()=>{
 const client=require('./reconciliation_regressions');
 for(const native of [false,true]){
  const b=fixture();b.activate();const opening=b.open(),t=client.setup(),sent=[];
  const token=b.ctx.executeDomusAction_('authCrearSesion',{args:['CAJA','QA '+b.ids[0],'fixture-device','fixture-secret'],role:'CAJA',deviceId:'fixture-device'}).result.token;
  t.ctx.setSessionToken(token,'CAJA');t.load('transport_');t.ctx.STATE.isNativeGas=native;
  const respond=p=>{if(p.action==='cajaSimpleRegistrar')sent.push(client.copy(p));return b.ctx.dispatchNativeAction(p);};
  const attach=u=>{
   u.load('transport_');u.ctx.STATE.isNativeGas=native;u.ctx.fetch=async(_,o)=>({json:()=>respond(JSON.parse(o.body))});
   u.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(client.copy(p))).then(success,failure)})})}}};u.ctx.window.google=u.ctx.google;
  };
  attach(t);Object.assign(t.ctx.STATE,{journey:{enabled:true,active:opening},phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
  const before=business(b),draft=t.ctx.saleDraftSnapshot_();await t.ctx.confirmPaymentAndDispatch(true);await client.tick();await client.tick();
  const queued=t.ctx.getOutbox()[0];assert(queued);assert.equal(queued.status,'REQUIRES_REVIEW');assert.equal(queued.errorCode,'HISTORY_REQUIRES_REVIEW');
  assert.equal(t.ctx.saleDraftSnapshot_(),draft);assert.equal(t.localStorage.getItem('domus_confirmation_'+queued.requestId),null);
  assert.equal(b.ctx.paymentRequestIndex_(b.main).has(queued.requestId),false);assert.equal(b.ctx.journalFind_(queued.requestId,b.main),null);assert.equal(business(b),before);assert.doesNotThrow(b.state);
  const reload=client.setup({storage:t.localStorage});reload.ctx.setSessionToken(token,'CAJA');attach(reload);await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();
  assert.equal(sent.length,1);assert.equal(reload.ctx.getOutbox()[0].requestId,queued.requestId);assert.equal(reload.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');
  passed++;console.log('PASS '+(native?'native':'REST')+': server output rejection preserves cart/Outbox without ACK or automatic replay after reload');
 }
 console.log(JSON.stringify({suite:'staging-prepared-output-real-source-mocks',passed,liveReads:false,liveWrites:0,realActivation:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
