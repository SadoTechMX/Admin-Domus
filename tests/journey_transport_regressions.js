'use strict';
const assert=require('assert/strict'),backend=require('./recovery_regressions');
const {setup,tick,copy}=require('./reconciliation_regressions');let passed=0;
async function test(n,f){await f();passed++;console.log('PASS',n);}
const policy={version:1,scopes:[{id:'A',projectId:'P',projectName:'QA project',eventId:'E',eventName:'QA event',activity:'QA event'}],stations:[{deviceId:'fixture-device',stationId:'CAJA_1',registerId:'GAVETA_1',scopeIds:['A']}]};
function attach(t,native,respond){
 t.ctx.MUTATION_ACTIONS.add('turnoAbrir');t.ctx.MUTATION_ACTIONS.add('corteZCerrar');
 t.load('transport_');t.ctx.STATE.isNativeGas=native;
 t.ctx.fetch=async(_,o)=>({json:()=>respond(JSON.parse(o.body))});
 t.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(copy(p))).then(success,failure)})})}}};t.ctx.window.google=t.ctx.google;
}
(async()=>{
for(const native of [false,true])for(const action of ['turnoAbrir','corteZCerrar','cajaSimpleRegistrar'])await test((native?'native':'REST')+' '+action+': incomplete/bad-journey ACK retains intent and recovers same ID without another effect',async()=>{
 const b=backend.setup();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));b.manager();const manager=b.login('GERENCIA');
 const opening=action==='turnoAbrir'?null:b.request('turnoAbrir',[{scopeId:'A',openingFloat:100}],'opening-A');
 const t=setup(),requests=[];t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.setSessionToken(manager,'GERENCIA');
 let lose=true;
 const respond=async p=>{
  if(p.action==='health')return b.ctx.dispatchNativeAction(p);
  requests.push(copy(p));const result=b.ctx.dispatchNativeAction(copy(p));assert.equal(result.ok,true,result.error);
  if(lose){
   lose=false;
   const data=action==='cajaSimpleRegistrar'?{...result.data,journey:{...result.data.journey,openingRequestId:'OTHER'}}:
    action==='corteZCerrar'?{...result.data,snapshot:{...result.data.snapshot,[native?'pendingDeliveries':'pendingTransfers']:[{id:'QA-PENDING'}]}}:{};
   return {...result,data};
  }return result;
 };
 attach(t,native,respond);
 if(action==='cajaSimpleRegistrar'){
  Object.assign(t.ctx.STATE,{journey:{enabled:true,active:opening},phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
  await t.ctx.confirmPaymentAndDispatch(true);await tick();await tick();assert.equal(t.ctx.STATE.cart.length,1);assert(t.localStorage.getItem('domus_pending_sale'));
 }else await t.call(action,[action==='turnoAbrir'?{id:'open-request',scopeId:'A',openingFloat:100}:{id:'cut-request',openingRequestId:'opening-A',countedCash:100}]);
 const queued=t.ctx.getOutbox()[0];assert.equal(queued.status,'RETRY');assert.equal(queued.errorCode,'TRANSPORT_INVALID_RESPONSE');assert.equal(t.localStorage.getItem('domus_confirmation_'+queued.requestId),null);
 const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');reload.ctx.setSessionToken(manager,'GERENCIA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();
 if(action!=='cajaSimpleRegistrar'){assert.equal(requests.length,1);assert.equal(reload.ctx.getOutbox()[0].requestId,queued.requestId);await reload.ctx.sincronizarOutboxCore_(queued.requestId);}
 assert.equal(reload.ctx.getOutbox().length,0);
 assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.deepEqual(requests[0].args,requests[1].args);
 assert.equal(b.main.getSheetByName('COBROS').getLastRow(),action==='cajaSimpleRegistrar'?7:6);
 const confirmed=JSON.parse(reload.localStorage.getItem('domus_confirmation_'+queued.requestId));assert.deepEqual(confirmed.data,copy(b.ctx.findRequestRecord_(queued.requestId,b.main).response));
});
await test('wrong intent/scope/amount or empty opening/cut payload cannot satisfy ACK contract',()=>{
 const b=backend.setup();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));b.manager();const manager=b.login('GERENCIA'),t=setup();
 const openBody={scopeId:'A',openingFloat:100},opened=b.request('turnoAbrir',[openBody],'open'),closeBody={openingRequestId:'open',countedCash:100};
 const closed=b.request('corteZCerrar',[closeBody],'cut','GERENCIA',manager);
 for(const [action,id,body,result,patches] of [['turnoAbrir','open',openBody,opened,[{openingRequestId:'other'},{scopeId:'other'},{openingFloat:99},{scope:{}}]],
 ['corteZCerrar','cut',closeBody,closed,[{closingRequestId:'other'},{openingRequestId:'other'},{countedCash:99},{snapshot:{}},{financialFinal:true},
 {closurePolicy:'ALLOW_PENDING'},{snapshot:{...closed.snapshot,pendingTransfers:[{receipt:'pending'}]}},{snapshot:{...closed.snapshot,pendingDeliveries:[{id:'pending'}]}}]]]){
  const payload={action,requestId:id,args:[body]};assert.equal(t.ctx.validJourneyResult_(result,payload),true);
  for(const bad of [{},null,false,[],...patches.map(p=>({...result,...p}))])assert.equal(t.ctx.validJourneyResult_(bad,payload),false);
  if(action==='corteZCerrar')assert.equal(t.ctx.validJourneyResult_({...result,closurePolicy:undefined},payload),true,'original zero-pending cut ACK from prior version remains recoverable');
 }
});
await test('changing journey changes draft ownership; old ACK does not clear the new draft',()=>{
 const t=setup();t.ctx.STATE.cart=[{name:'QA',qty:1}];t.ctx.STATE.journey={enabled:true,active:{openingRequestId:'OLD'}};
 t.ctx.STATE.pendingSaleId='sale-old';t.ctx.STATE.pendingSaleDraft=t.ctx.saleDraftSnapshot_();t.ctx.STATE.journey.active.openingRequestId='NEW';
 t.localStorage.setItem('domus_confirmation_sale-old',JSON.stringify({data:{ok:true}}));t.ctx.settleConfirmedBasket_('sale-old');assert.equal(t.ctx.STATE.cart.length,1);
});
for(const native of [false,true])await test((native?'native':'REST')+' fenced absent ID keeps its queue/cart/evidence across reload without automatic retry or ACK',async()=>{
 const b=require('./history_boundary_regressions').fixture();b.activate();const t=setup(),sends=[];
 t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.STATE.cart=[{sku:'QA-01',name:'QA drink',qty:1,price:40}];
 const body=b.sale({id:'absent-0'}),respond=p=>{if(p.action!=='health')sends.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};
 attach(t,native,respond);const rows=b.main.getSheetByName('REQUESTS').getLastRow();
 await assert.rejects(t.call('cajaSimpleRegistrar',[body]),e=>e.code==='HISTORY_REQUIRES_REVIEW');
 const q=t.ctx.getOutbox()[0];assert.equal(q.requestId,'absent-0');assert.equal(q.status,'REQUIRES_REVIEW');assert.equal(q.errorStatus,409);
 assert.equal(t.ctx.STATE.cart.length,1);assert.equal(t.localStorage.getItem('domus_confirmation_absent-0'),null);
 const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(sends.length,1);
 assert.equal(reload.ctx.getOutbox()[0].requestId,'absent-0');assert.equal(reload.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');
 assert.equal(b.main.getSheetByName('REQUESTS').getLastRow(),rows);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
});
await test('journey ACK must name the same explicit history boundary as the requested opening/cut',()=>{
 const b=require('./history_boundary_regressions').fixture();b.activate();const t=setup(),o=b.open(),c=b.cut();
 for(const [action,result,body,id] of [['turnoAbrir',o,{scopeId:'A',openingFloat:0,historyBoundaryId:'boundary'},'new-open'],
 ['corteZCerrar',c,{openingRequestId:'new-open',countedCash:0,historyBoundaryId:'boundary'},'new-cut']]){
  const payload={action,requestId:id,args:[body]};assert.equal(t.ctx.validJourneyResult_(result,payload),true);
  for(const historyBoundaryId of [null,undefined,'OTHER'])assert.equal(t.ctx.validJourneyResult_({...result,historyBoundaryId},payload),false);
 }
});
for(const native of [false,true])for(const kind of ['missing-id','orphan-part'])await test((native?'native':'REST')+' '+kind+': journal integrity rejection preserves intent and prevents retry after reload',async()=>{
 const b=require('./history_boundary_regressions').fixture();b.activate();b.open();
 b.ctx.journalSheet_(b.main).appendRow(kind==='missing-id'?['','cajaSimpleRegistrar','PREPARED','[]','{}','']:['unknown#part:0','JOURNAL_PART','COMPLETED','[]','','']);
 const t=setup(),sends=[];t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.STATE.cart=[{sku:'QA-01',name:'QA drink',qty:1,price:40}];
 const body=b.sale({openingRequestId:'new-open'}),respond=p=>{if(p.action!=='health')sends.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};
 attach(t,native,respond);const original=JSON.stringify([...b.main.sheets].map(([name,s])=>[name,[...s.cells]]));
 await assert.rejects(t.call('cajaSimpleRegistrar',[body]),e=>e.code==='JOURNAL_INTEGRITY_REQUIRES_REVIEW' && e.status===409);
 const q=copy(t.ctx.getOutbox()[0]);assert.equal(q.status,'REQUIRES_REVIEW');assert.equal(q.requestId,body.id);assert.equal(t.ctx.STATE.cart.length,1);
 assert.equal(t.localStorage.getItem('domus_confirmation_'+body.id),null);
 const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(sends.length,1);
 assert.equal(reload.ctx.getOutbox()[0].requestId,q.requestId);assert.deepEqual(copy(reload.ctx.getOutbox()[0].args),q.args);
 assert.equal(reload.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');assert.equal(reload.localStorage.getItem('domus_confirmation_'+body.id),null);
 assert.equal(JSON.stringify([...b.main.sheets].map(([name,s])=>[name,[...s.cells]])),original);
});
for(const native of [false,true])await test((native?'native':'REST')+': invalid root is preserved in review across reload, without ACK, new ID or backend persistence',async()=>{
 const b=backend.setup(),t=setup(),sends=[];t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.STATE.cart=[{sku:'QA-01',name:'QA drink',qty:1,price:40}];
 const body=b.sale({id:'client#part:0'}),respond=p=>{if(p.action!=='health')sends.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};
 attach(t,native,respond);const before=JSON.stringify([...b.main.sheets].map(([name,s])=>[name,[...s.cells]]));
 await assert.rejects(t.call('cajaSimpleRegistrar',[body]),e=>e.code==='REQUEST_ID_INVALID' && e.status===422);
 const q=copy(t.ctx.getOutbox()[0]);assert.equal(q.requestId,body.id);assert.equal(q.status,'REQUIRES_REVIEW');assert.equal(q.errorStatus,422);assert.equal(t.ctx.STATE.cart.length,1);
 const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(sends.length,1);assert.deepEqual(copy(reload.ctx.getOutbox()[0].args),q.args);
 assert.equal(reload.ctx.getOutbox()[0].requestId,q.requestId);assert.equal(reload.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');assert.equal(reload.localStorage.getItem('domus_confirmation_'+q.requestId),null);
 assert.equal(JSON.stringify([...b.main.sheets].map(([name,s])=>[name,[...s.cells]])),before);
 const p=b.sale({id:'independent-valid'});assert.equal(b.request('cajaSimpleRegistrar',[p],p.id).paid,true);
});
for(const native of [false,true])for(const partial of [false,true])await test((native?'native':'REST')+' '+(partial?'partial':'completed')+': malformed persisted ID preserves queue and basket across reload without ACK or replay',async()=>{
 const b=backend.setup(),body=b.sale({id:'123'});
 if(partial){b.main.getSheetByName('COBROS').failAt='7:11';assert.throws(()=>b.request('cajaSimpleRegistrar',[body],body.id),/INJECTED_WRITE_FAILURE/);}
 else b.request('cajaSimpleRegistrar',[body],body.id);
 b.main.getSheetByName('REQUESTS').put(2,1,partial?123:' 123 ');
 const t=setup(),sends=[];t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.STATE.cart=[{sku:'QA-01',name:'QA drink',qty:1,price:40}];
 const respond=p=>{if(p.action!=='health')sends.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};attach(t,native,respond);
 const before=JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([name,s])=>[name,[...s.cells]])));
 await assert.rejects(t.call('cajaSimpleRegistrar',[body]),e=>e.code==='LEDGER_IDENTITY_REQUIRES_REVIEW' && e.status===409);
 const q=copy(t.ctx.getOutbox()[0]);assert.equal(q.requestId,body.id);assert.equal(q.status,'REQUIRES_REVIEW');assert.equal(q.errorStatus,409);assert.equal(t.ctx.STATE.cart.length,1);
 assert.equal(t.localStorage.getItem('domus_confirmation_'+body.id),null);
 const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(sends.length,1);assert.deepEqual(copy(reload.ctx.getOutbox()[0].args),q.args);
 assert.equal(reload.ctx.getOutbox()[0].requestId,q.requestId);assert.equal(reload.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');assert.equal(reload.localStorage.getItem('domus_confirmation_'+q.requestId),null);
 assert.equal(JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([name,s])=>[name,[...s.cells]]))),before);
});
console.log(JSON.stringify({suite:'journey-transport-real-source-mocks',passed,liveSheets:false,network:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
