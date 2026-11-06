'use strict';
// Actual client functions, isolated VM storage/transport. No live network or hardware.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), crypto = require('crypto');
const source = fs.readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS', name); }
function storage() {
  const data = new Map();
  return {data, getItem:k=>data.get(k) ?? null, setItem:(k,v)=>data.set(k,String(v)), removeItem:k=>data.delete(k)};
}
function setup(options={}) {
  const localStorage = options.storage || storage(), sessionStorage = storage(), calls = [], notices = [], cells={};
  const locks = options.locks || require('./mock_web_locks')();
  const ctx = vm.createContext({console, Date, JSON, Map, Set, Promise, Error, crypto,
    localStorage, sessionStorage, sessionRequests:new Map(), isOutboxCoreRunning:false, outboxStoreHeld_:false, paymentInFlight:false, activePaymentMethod:'Efectivo',
    STATE:{mode:'caja',operator:'Fixture',cart:[],isNativeGas:false,isProductionLocked:false,apiUrl:'https://fixture.invalid'},
    MUTATION_ACTIONS:new Set(['cajaSimpleRegistrar','comandasSimpleAccion','accesoCambiarActividad','cambiarFase']),
    updateSyncPill(){}, updateOutboxUI(){}, notifyOutboxTabs(){}, cacheQuerySnapshot(){},
    toast:(...args)=>notices.push(args), playChime(){}, syncBackendData(){},
    clearCart(){ctx.STATE.cart=[];}, renderActivityDropdown(){}, window:{navigator:{locks}}, getDeviceId:()=> 'fixture-device',
    $:id=>cells[id]||(cells[id]={value:({customerNameInput:'Fixture',cashReceivedInput:'100',cashTipInput:'0',activitySelect:'QA event'})[id]||'',disabled:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},focus(){}}),
    closePaymentModal(){}, showReceiptModal(){}, openCashDrawer_(){}, printReceiptDirect:()=>Promise.resolve(),
    money:n=>'$'+n,escapeHtml:s=>String(s).replace(/</g,'&lt;'),
    transport_:async payload=>{calls.push(copy(payload));return {ok:true,data:{receipt:'fixture-receipt',paid:true}};}
  });
  function load(name) {
    const start = source.search(new RegExp('  (?:async )?function '+name+'\\('));
    assert(start>=0,name);
    const end = source.indexOf('\n  }',start)+4;
    vm.runInContext(source.slice(start,end),ctx);
  }
  for (const name of ['isSessionExpiredError','getStationRole','getSessionToken','setSessionToken','clearSessionToken',
    'ensureSessionToken','authenticatedTransport_','validSaleResult_','validateBackendResponse_','getOutbox','withOutboxStore_','saveOutbox','enqueueOutbox','isSaleRejectionWithoutEffects_','classifyMutationFailure',
    'retainConfirmation_','saleDraftSnapshot_','settleConfirmedBasket_','recoverReceipt_','migrateLegacyOutbox_','sincronizarOutboxCore_','callBackend','recordOutboxFailure_','calculateCartTotal','confirmPaymentAndDispatch']) load(name);
  ctx.setSessionToken('old-CAJA','CAJA');ctx.setSessionToken('old-BARRA','BARRA');
  const call = (action,args) => new Promise((resolve,reject)=>ctx.callBackend(action,args,resolve,reject));
  const item = (id='fixture-sale') => ({requestId:id,action:'cajaSimpleRegistrar',args:[{id,requestId:id,customer:'Fixture',items:[{sku:'QA',qty:1}],paid:true}],role:'CAJA',deviceId:'fixture-device',operatorId:'Fixture',status:'RETRY'});
  const seed = queue => ctx.withOutboxStore_(()=>ctx.saveOutbox(queue));
  return {ctx,localStorage,sessionStorage,calls,notices,cells,load,call,item,seed,run:code=>vm.runInContext(code,ctx)};
}
async function main() {
await test('concurrent login coalesces per role and never shares role tokens',async()=>{
  const t=setup(), pending={};let logins=0;
  t.ctx.clearSessionToken('CAJA');t.ctx.clearSessionToken('BARRA');
  t.ctx.transport_=p=>{logins++;return new Promise(resolve=>pending[p.role]=resolve);};
  const a=t.ctx.ensureSessionToken(null,'CAJA'), b=t.ctx.ensureSessionToken(null,'BARRA'), c=t.ctx.ensureSessionToken(null,'barra');
  assert.equal(logins,2);pending.BARRA({ok:true,data:{token:'new-BARRA'}});assert.equal(await b,'new-BARRA');assert.equal(await c,'new-BARRA');
  assert.equal(t.ctx.getSessionToken('CAJA'),'');pending.CAJA({ok:true,data:{token:'new-CAJA'}});assert.equal(await a,'new-CAJA');
  assert.equal(t.ctx.getSessionToken('BARRA'),'new-BARRA');assert.equal(t.ctx.sessionRequests.size,0);
});
await test('credential fallback is per role and a cancelled login can be retried',async()=>{
  const t=setup();t.ctx.clearSessionToken('CAJA');let prompts=0;
  t.ctx.transport_=async p=>p.args[3]==='fixture-secret'?{ok:true,data:{token:'authenticated'}}:{ok:false,error:'Acceso denegado'};
  t.ctx.requestStationSecret_=async role=>{assert.equal(role,'CAJA');prompts++;throw Error('Autenticación cancelada');};
  await assert.rejects(t.ctx.ensureSessionToken(null,'CAJA'),/cancelada/);assert.equal(t.ctx.sessionRequests.size,0);
  t.ctx.requestStationSecret_=async()=>{prompts++;return 'fixture-secret';};await t.ctx.ensureSessionToken(null,'CAJA');
  assert.equal(prompts,2);assert.equal(t.ctx.getSessionToken('CAJA'),'authenticated');
  assert(![...t.localStorage.data.values()].join('').includes('fixture-secret'));
});
for(const native of [false,true]) await test((native?'native':'REST')+' read and mutation renew once, preserving role/request/payload across view changes',async()=>{
  for(const action of ['cajaSimpleDatos','cajaSimpleRegistrar']) {
    const t=setup(), seen=[];t.load('transport_');t.ctx.STATE.isNativeGas=native;
    const response=async p=>{
      seen.push(copy(p));
      if(p.action==='health')return {ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
      if(p.action==='authCrearSesion')return {ok:true,data:{token:'new-CAJA'}};
      t.ctx.STATE.mode='comandas';
      return p.sessionToken==='old-CAJA'?{ok:false,status:401,error:'Sesión inválida o expirada'}:{ok:true,requestId:p.requestId,data:{ok:true,ticket:'CTA-fixture',receipt:'receipt',paid:true,verified:true,paymentStatus:'CONFIRMADA',method:'Efectivo',total:40}};
    };
    t.ctx.fetch=async(_,opts)=>({json:()=>response(JSON.parse(opts.body))});
    t.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>response(p).then(success,failure)})})}}};
    t.ctx.window.google=t.ctx.google;
    const body={id:'stable-id',items:[{sku:'QA',qty:1}],paid:true,method:'Efectivo'};const promise=t.call(action,[body]);body.items[0].qty=999;
    assert.equal((await promise).receipt,'receipt');
    const sends=seen.filter(p=>p.action===action);assert.equal(sends.length,2);
    const {sessionToken:a,...first}=sends[0],{sessionToken:b,...second}=sends[1];
    assert.deepEqual(first,second);assert.equal(first.role,'CAJA');assert.equal(first.args[0].items[0].qty,1);
    assert.equal(seen.filter(p=>p.action==='authCrearSesion').length,1);
    assert.equal(t.ctx.getSessionToken('BARRA'),'old-BARRA');
    if(action==='cajaSimpleRegistrar')assert.equal(seen.filter(p=>p.action==='health').length,2);
  }
});
await test('late expired response uses the already renewed token without another login',async()=>{
  const t=setup(),held=[];let logins=0;
  t.ctx.transport_=async p=>{
    if(p.action==='authCrearSesion'){logins++;return {ok:true,data:{token:'renewed'}};}
    if(p.sessionToken==='old-CAJA')return new Promise(resolve=>held.push(resolve));
    return {ok:true,data:{}};
  };
  const one=t.call('cajaSimpleDatos',[]),two=t.call('cajaSimpleDatos',[]);await tick();
  held[0]({ok:false,error:'Sesión inválida o expirada'});await one;
  held[1]({ok:false,error:'Sesión inválida o expirada'});await two;assert.equal(logins,1);
});
await test('second explicit expiration is bounded and preserves the mutation for review',async()=>{
  const t=setup();let sends=0,logins=0;
  t.ctx.transport_=async p=>p.action==='authCrearSesion'?(logins++,{ok:true,data:{token:'still-expired'}}):(sends++,{ok:false,status:401,error:'Sesión inválida o expirada'});
  await assert.rejects(t.call('cajaSimpleRegistrar',t.item().args),/expirada/);
  assert.equal(sends,2);assert.equal(logins,1);assert.equal(t.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');
});
await test('network uncertainty queues the original operation without an immediate auth replay',async()=>{
  const t=setup();let sends=0;t.ctx.transport_=async()=>{sends++;throw Error('Failed to fetch');};
  const result=await t.call('cajaSimpleRegistrar',t.item().args);assert(result.localOutbox);assert.equal(sends,1);
  assert.equal(t.ctx.getOutbox()[0].requestId,'fixture-sale');assert.equal(t.ctx.getOutbox()[0].status,'RETRY');
});
await test('background recovery renews the recorded role and persists receipt before removing intent',async()=>{
  const t=setup(),item=t.item(),seen=[];t.ctx.STATE.mode='comandas';await t.seed([item]);
  t.localStorage.setItem('domus_pending_sale',JSON.stringify(item.args[0]));
  t.ctx.transport_=async p=>{seen.push(copy(p));return p.action==='authCrearSesion'?{ok:true,data:{token:'new'}}:p.sessionToken==='old-CAJA'?{ok:false,error:'Sesión inválida o expirada'}:{ok:true,data:{receipt:'recovered',paid:true}};};
  await t.ctx.sincronizarOutboxCore_();assert.equal(t.ctx.getOutbox().length,0);assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
  const saved=JSON.parse(t.localStorage.getItem('domus_confirmation_'+item.requestId));assert.equal(saved.data.receipt,'recovered');
  const sends=seen.filter(p=>p.action===item.action);assert.equal(sends.length,2);assert.equal(sends[1].role,'CAJA');assert.deepEqual(sends[0].args,sends[1].args);
  assert.equal(sends[1].requestId,item.requestId);assert.equal(sends[1].deviceId,item.deviceId);
});
await test('background success cannot remove a different pending sale or discard a newer basket',async()=>{
  const t=setup(),item=t.item();await t.seed([item]);t.localStorage.setItem('domus_pending_sale','{"id":"different"}');
  t.ctx.STATE.pendingSaleId=item.requestId;t.ctx.STATE.pendingSaleDraft=t.ctx.saleDraftSnapshot_();t.ctx.STATE.cart=[{sku:'new'}];
  await t.ctx.sincronizarOutboxCore_();assert.equal(JSON.parse(t.localStorage.getItem('domus_pending_sale')).id,'different');
  assert.equal(t.ctx.STATE.cart[0].sku,'new');
});
await test('background confirmation clears only its unchanged submitted basket',async()=>{
  const t=setup(),item=t.item();await t.seed([item]);t.ctx.STATE.cart=item.args[0].items;
  t.ctx.STATE.pendingSaleId=item.requestId;t.ctx.STATE.pendingSaleDraft=t.ctx.saleDraftSnapshot_();
  await t.ctx.sincronizarOutboxCore_();assert.equal(t.ctx.STATE.cart.length,0);
});
await test('receipt persistence failure leaves the original intent and queue for review',async()=>{
  const t=setup(),item=t.item();await t.seed([item]);t.localStorage.setItem('domus_pending_sale',JSON.stringify(item.args[0]));
  const set=t.localStorage.setItem;t.localStorage.setItem=(key,v)=>{if(key.startsWith('domus_confirmation_'))throw Error('quota');set(key,v);};
  await t.ctx.sincronizarOutboxCore_();assert(t.localStorage.getItem('domus_pending_sale'));assert.equal(t.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');
  assert.equal(t.ctx.getOutbox()[0].requestId,item.requestId);
});
await test('receipt can be retrieved from persistent storage without transport, print, or drawer',async()=>{
  const t=setup(),item=t.item();t.ctx.retainConfirmation_(item,{receipt:'saved',paid:true,total:40,method:'Efectivo'});
  let displayed;t.ctx.prompt=(_,id)=>id;t.ctx.showReceiptModal=data=>displayed=data;
  t.ctx.transport_=()=>{throw Error('No transport permitted');};t.ctx.recoverReceipt_();
  assert.equal(displayed.receipt,'saved');assert.equal(displayed.customer,'Fixture');assert.equal(displayed.items[0].price,40);
});
await test('empty-cart account settlement survives the legacy Outbox migration',async()=>{
  const t=setup(),item=t.item();item.args[0]={id:item.requestId,ticket:'account',paid:true,items:[]};await t.seed([item]);
  await t.ctx.migrateLegacyOutbox_();assert.equal(t.ctx.getOutbox()[0].status,'RETRY');await t.ctx.sincronizarOutboxCore_();assert.equal(t.ctx.getOutbox().length,0);
});
await test('event change preserves server ACK checks and forbids a success notice for queued change',async()=>{
  const t=setup();t.ctx.STATE.eventsList=[{name:'Fixture event'}];t.ctx.STATE.activeActivity='Previous';
  t.ctx.STATE.eventChangeRevision=0;t.ctx.getActiveEvent=()=>({name:'Fixture event'});t.ctx.renderAccesosView=()=>{};
  t.ctx.transport_=async()=>{throw Error('Failed to fetch');};t.load('changeActiveEvent');
  t.ctx.changeActiveEvent('Fixture event');await tick();assert.equal(t.ctx.STATE.activeActivity,'Previous');assert.equal(t.ctx.STATE.eventChangePending,false);
  assert.equal(t.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');assert(!t.notices.some(([text])=>text.startsWith('Evento confirmado')));
});
await test('KDS incident evidence does not block canonical action progression or allow early delivery',()=>{
  const t=setup(),actions=[];t.ctx.STATE.comandas=[{key:'k',state:'Pendiente',incident:'Agotado',responsible:''}];
  t.ctx.ensureOperator=()=>true;t.ctx.confirm=()=>true;t.ctx.callBackend=(action,args)=>actions.push(copy(args[0]));
  for(const n of ['claimOrder','markOrderReady','deliverOrder'])t.load(n);
  t.ctx.deliverOrder('k');assert.equal(actions.length,0);t.ctx.claimOrder('k');assert.equal(actions.at(-1).action,'TOMAR');
  t.ctx.STATE.comandas[0].state='En preparación';t.ctx.markOrderReady('k');assert.equal(actions.at(-1).action,'LISTA');
  t.ctx.STATE.comandas[0].state='Lista';t.ctx.deliverOrder('k');assert.equal(actions.at(-1).action,'ENTREGAR');assert.equal(t.ctx.STATE.comandas[0].incident,'Agotado');
});
await test('queued KDS actions never announce confirmed preparation or delivery',()=>{
  const t=setup();t.ctx.ensureOperator=()=>true;t.ctx.confirm=()=>true;
  t.ctx.callBackend=(_,__,ok)=>ok({localOutbox:true,paid:false});
  for(const [name,state] of [['claimOrder','Pendiente'],['markOrderReady','En preparación'],['deliverOrder','Lista']]) {
    t.ctx.STATE.comandas=[{key:'k',state,incident:'Agotado'}];t.load(name);t.ctx[name]('k');
    assert(t.notices.at(-1)[0].includes('sin confirmar'));
  }
});
await test('replaying an existing intention keeps its role and device despite the current view',async()=>{
  const t=setup(),item=t.item();await t.seed([item]);t.ctx.STATE.mode='comandas';
  await t.call('cajaSimpleRegistrar',copy(item.args));assert.equal(t.calls[0].role,'CAJA');
  assert.equal(t.calls[0].deviceId,item.deviceId);assert.equal(t.calls[0].requestId,item.requestId);
});
console.log(JSON.stringify({suite:'reconciled-client-functions',passed,network:false,liveBackend:false,hardware:false}));
}
module.exports={setup,storage,tick,copy};
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
