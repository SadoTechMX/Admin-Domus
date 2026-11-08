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
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(reload.ctx.getOutbox().length,0);
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
console.log(JSON.stringify({suite:'journey-transport-real-source-mocks',passed,liveSheets:false,network:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
