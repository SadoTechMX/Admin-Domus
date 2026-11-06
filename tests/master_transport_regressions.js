'use strict';
// Exercise the app's real transport and recovery with backend modules and mocked services.
// This is not a separate app or financial engine, and never accesses real Sheets.
const assert=require('assert/strict');
const {setup,tick,copy}=require('./reconciliation_regressions');
const backend=require('./recovery_regressions');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
function attach(t,native,respond){
  t.load('transport_');t.ctx.STATE.isNativeGas=native;
  t.ctx.fetch=async(_,opts)=>({json:()=>respond(JSON.parse(opts.body))});
  t.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(copy(p))).then(success,failure)})})}}};
  t.ctx.window.google=t.ctx.google;
}
const health={ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
async function main(){
for(const native of [true,false]){
 const mode=native?'native':'REST';
 await test(mode+': malformed response is uncertainty, never confirmation or credential rejection',async()=>{
  for(const bad of [null,undefined,{},[],{ok:true},{ok:true,data:null},{ok:'true',data:{}},'unexpected HTML']){
   const t=setup();attach(t,native,async()=>bad);
   await assert.rejects(t.ctx.transport_({action:'cajaSimpleDatos',args:[]}),err=>err.code==='TRANSPORT_INVALID_RESPONSE'&&t.ctx.classifyMutationFailure(err)==='RETRY');
  }
 });
 await test(mode+': invalid health response prevents sending the mutation',async()=>{
  const t=setup(),seen=[];attach(t,native,async p=>{seen.push(p.action);return null;});
  await assert.rejects(t.ctx.transport_({action:'cajaSimpleRegistrar',args:t.item('health').args}),err=>err.code==='TRANSPORT_INVALID_RESPONSE');
  assert.deepEqual(seen,['health']);
 });
 await test(mode+': lost/malformed confirmation recovers the real committed sale under its original ID',async()=>{
  for(const malformed of [null,{ok:true}]){
   const t=setup(),b=backend.setup(),requests=[];let lose=true;
   Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
   t.ctx.setSessionToken(b.login(),'CAJA');
   const respond=async p=>{
    if(p.action==='health')return health;
    requests.push(copy(p));const result=b.ctx.dispatchNativeAction(copy(p));
    if(lose){lose=false;return malformed;}return result;
   };
   attach(t,native,respond);const draft=t.ctx.saleDraftSnapshot_();
   await t.ctx.confirmPaymentAndDispatch(true);await tick();await tick();
   assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
   const old=t.ctx.getOutbox()[0];assert(old,'uncertain request must remain in Outbox');assert.equal(old.status,'RETRY');
   assert.equal(old.errorCode,'TRANSPORT_INVALID_RESPONSE');assert.equal(t.ctx.saleDraftSnapshot_(),draft);
   assert.equal(t.localStorage.getItem('domus_confirmation_'+old.requestId),null);
   const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
   await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();
   assert.equal(requests.length,2);assert.equal(requests[1].requestId,requests[0].requestId);assert.deepEqual(requests[1].args,requests[0].args);
   assert.equal(reload.ctx.getOutbox().length,0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
   const confirmation=JSON.parse(reload.localStorage.getItem('domus_confirmation_'+old.requestId));
   assert.equal(confirmation.data.receipt,b.ctx.findRequestRecord_(old.requestId,b.main).response.receipt);
  }
 });
 await test(mode+': valid deterministic error still blocks automatic replay and valid result is unchanged',async()=>{
  const t=setup(),denied={ok:false,code:'IDEMPOTENCY_KEY_REUSED',status:409,error:'IDEMPOTENCY_KEY_REUSED'};
  attach(t,native,async p=>p.action==='health'?health:denied);
  await assert.rejects(t.call('cajaSimpleRegistrar',t.item('denied').args),/IDEMPOTENCY_KEY_REUSED/);
  assert.equal(t.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');
  const reply={ok:true,data:{products:[],accounts:[],activities:[]},requestId:'read',role:'CAJA'};
  attach(t,native,async()=>reply);assert.deepEqual(copy(await t.ctx.transport_({action:'cajaSimpleDatos'})),reply);
 });
 await test(mode+': empty/invalid/wrong-intent sale ACK preserves draft and recovers the SAME ID',async()=>{
  const valid={ok:true,ticket:'CTA-fixture',receipt:'REC-fixture',paid:true,verified:true,paymentStatus:'CONFIRMADA',method:'Efectivo',total:40};
  const variants=[{},false,'success',[],{...valid,ok:false},{...valid,receipt:''},{...valid,verified:false},{...valid,total:null},{...valid,total:41},{...valid,paymentStatus:'UNKNOWN'},
   {...valid,paymentStatus:'CUENTA_ABIERTA',paid:false,verified:false,receipt:''},
   {...valid,paymentStatus:'CORTESIA_AUTORIZADA',paid:false,verified:false,total:0,method:'Cortesía',receipt:''},'WRONG_ID','MISSING_ID','WRONG_ACCOUNT'];
  for(const data of variants){
   const t=setup(),b=backend.setup(),seen=[];let malformed=true;
   Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
   if(data==='WRONG_ACCOUNT'){
    const initial=b.sale({paid:false,credit:'Amigo'}),account=b.request('cajaSimpleRegistrar',[initial],initial.id);
    Object.assign(t.ctx.STATE,{cart:[],selectedAccountTicket:account.ticket,openAccounts:[{ticket:account.ticket,due:40}]});
   }
   t.ctx.setSessionToken(b.login(),'CAJA');const respond=async p=>{
    if(p.action==='health')return health;
    seen.push(copy(p));
    if(malformed)return {ok:true,requestId:data==='MISSING_ID'?undefined:data==='WRONG_ID'?'another-intention':p.requestId,data:typeof data==='string'&&(data.endsWith('_ID')||data==='WRONG_ACCOUNT')?valid:data};
    return b.ctx.dispatchNativeAction(copy(p));
   };
   attach(t,native,respond);const draft=t.ctx.saleDraftSnapshot_();
   await t.ctx.confirmPaymentAndDispatch(true);await tick();await tick();
   const old=t.ctx.getOutbox()[0];assert(old,'missing outbox for '+JSON.stringify(data));assert.equal(old.status,'RETRY');
   assert.equal(t.ctx.saleDraftSnapshot_(),draft);assert.equal(JSON.parse(t.localStorage.getItem('domus_pending_sale')).id,old.requestId);
   assert.equal(t.localStorage.getItem('domus_confirmation_'+old.requestId),null);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
   const reload=setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');malformed=false;attach(reload,native,respond);
   await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();
   assert.equal(seen.length,2);assert.equal(seen[0].requestId,seen[1].requestId);assert.deepEqual(seen[0].args,seen[1].args);
   assert.equal(reload.ctx.getOutbox().length,0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
   assert(JSON.parse(reload.localStorage.getItem('domus_confirmation_'+old.requestId)).data.receipt);
  }
 });
 await test(mode+': actual paid, open-account, pending-transfer and zero-courtesy results satisfy their distinct contracts',async()=>{
  for(const kind of ['Efectivo','Terminal 1','Terminal 2','Transferencia','credit','courtesy','account-settlement']){
   const t=setup(),b=backend.setup();
   Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra',courtesy:kind==='courtesy'}]});
   if(kind==='account-settlement'){
    const initial=b.sale({paid:false,credit:'Amigo'}),account=b.request('cajaSimpleRegistrar',[initial],initial.id);
    Object.assign(t.ctx.STATE,{cart:[],selectedAccountTicket:account.ticket,openAccounts:[{ticket:account.ticket,due:40}]});
   }
   let role='CAJA';if(kind==='courtesy'){b.manager();role='GERENCIA';t.ctx.getStationRole=()=>role;}
   t.ctx.setSessionToken(b.login(role),role);t.ctx.activePaymentMethod=['credit','courtesy','account-settlement'].includes(kind)?'Efectivo':kind;
   t.ctx.$('creditAuthorizationSelect').value='Amigo';
   attach(t,native,async p=>p.action==='health'?health:b.ctx.dispatchNativeAction(copy(p)));
   await t.ctx.confirmPaymentAndDispatch(kind!=='credit');await tick();await tick();
   assert.equal(t.ctx.getOutbox().length,0,kind);assert.equal(t.ctx.STATE.cart.length,0,kind);
   const confirmation=JSON.parse(t.localStorage.getItem('domus_confirmation_'+t.localStorage.getItem('domus_last_sale_confirmation')));
   assert(confirmation,kind);assert.equal(confirmation.data.paymentStatus,kind==='credit'?'CUENTA_ABIERTA':kind==='courtesy'?'CORTESIA_AUTORIZADA':kind==='Transferencia'?'PENDIENTE_VERIFICACION':'CONFIRMADA');
   assert.equal(!!confirmation.data.receipt,!['credit','courtesy'].includes(kind));
  }
 });
}
await test('REST: malformed JSON is retryable without silently confirming a request',async()=>{
 const t=setup();t.load('transport_');t.ctx.fetch=async()=>({json:async()=>{throw new SyntaxError('Unexpected token <');}});
 await assert.rejects(t.ctx.transport_({action:'cajaSimpleDatos'}),err=>err.code==='TRANSPORT_INVALID_RESPONSE'&&t.ctx.classifyMutationFailure(err)==='RETRY');
});
console.log(JSON.stringify({suite:'master-app-transport',passed,failed,liveSheets:false,hardware:false}));if(failed)process.exitCode=1;
}
main().catch(err=>{console.error(err);process.exitCode=1;});
