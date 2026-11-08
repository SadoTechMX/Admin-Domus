'use strict';
const assert=require('assert/strict'),{fixture}=require('./transfer_cancellation_regressions'),{setup,copy}=require('./reconciliation_regressions');
let passed=0;async function test(n,f){await f();passed++;console.log('PASS',n);}
const health={ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
function attach(t,b,native,alter=x=>x){
 t.ctx.STATE.isNativeGas=native;t.ctx.setSessionToken(b.managerToken,'GERENCIA');t.load('transport_');const sends=[];
 const respond=payload=>{if(payload.action==='health')return health;sends.push(copy(payload));return alter(copy(b.ctx.dispatchNativeAction(copy(payload))));};
 t.ctx.fetch=async(_,opts)=>({json:()=>respond(JSON.parse(opts.body))});
 t.ctx.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:bad=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(p)).then(ok,bad)})})}}};t.ctx.window.google=t.ctx.google;return sends;
}
(async()=>{
 for(const native of [false,true])await test((native?'native':'REST')+': incomplete/wrong cancellation ACK retains exact intent on reload and recovers once',async()=>{
  for(const alter of [r=>({...r,data:{}}),r=>({...r,data:false}),r=>({...r,data:[]}),r=>({...r,data:'done'}),r=>({...r,requestId:'OTHER'}),
   r=>({...r,data:{...r.data,cancellationRequestId:'OTHER'}}),r=>({...r,data:{...r.data,amountApplied:40}}),r=>({...r,data:{...r.data,sourceReceipt:'OTHER'}}),
   r=>({...r,data:{...r.data,units:[]}}),r=>({...r,data:{...r.data,closureBlocked:true}}),r=>({...r,data:{...r.data,wasteReview:{status:'PENDING_REVIEW'}}})]){
   const b=fixture(),p={...b.body(),id:'cancel-ui',requestId:'cancel-ui'},t=setup();t.ctx.STATE.cart=[{sku:'NEW-CART'}];attach(t,b,native,alter);
   const uncertain=await t.call('cancelarTransferenciaNoRecibida',[p]);assert.equal(uncertain.localOutbox,true);assert.equal(t.ctx.getOutbox()[0].errorCode,'TRANSPORT_INVALID_RESPONSE');
   assert.equal(t.ctx.getOutbox()[0].status,'RETRY');assert.deepEqual(copy(t.ctx.getOutbox()[0].args[0]),copy(p));assert.equal(t.localStorage.getItem('domus_confirmation_cancel-ui'),null);
   assert.equal(t.ctx.STATE.cart[0].sku,'NEW-CART');assert.equal(b.ctx.transferCancellationRecords_(b.main).length,1);
   const fresh=setup({storage:t.localStorage}),sends=attach(fresh,b,native);await fresh.ctx.migrateLegacyOutbox_();await fresh.ctx.sincronizarOutboxCore_();
   assert.equal(fresh.ctx.getOutbox().length,0);assert.equal(sends[0].requestId,p.id);assert.deepEqual(sends[0].args[0],copy(p));
   const ack=JSON.parse(t.localStorage.getItem('domus_confirmation_cancel-ui'));assert.equal(ack.data.kind,'TRANSFER_CANCELLATION');assert.equal(ack.data.amountApplied,0);
   assert.equal(t.localStorage.getItem('domus_last_sale_confirmation'),null);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(b.ctx.transferCancellationRecords_(b.main).length,1);
  }
 });
 await test('partial 500 survives reload and resumes original cancellation without fake income',async()=>{
  const b=fixture(),p={...b.body(),id:'partial-ui',requestId:'partial-ui'},t=setup();b.main.getSheetByName('COMANDAS').failAt='7:13';attach(t,b,true);
  assert.equal((await t.call('cancelarTransferenciaNoRecibida',[p])).localOutbox,true);assert.equal(t.ctx.getOutbox()[0].status,'RETRY');
  const fresh=setup({storage:t.localStorage});attach(fresh,b,true);await fresh.ctx.migrateLegacyOutbox_();await fresh.ctx.sincronizarOutboxCore_();assert.equal(fresh.ctx.getOutbox().length,0);
  assert.equal(b.ctx.transferCancellationRecords_(b.main).length,1);assert.equal(b.main.getSheetByName('COBROS').value(7,14),0);
 });
 await test('explicit stale-state rejection remains auditable and allows a newly reviewed intention, not replacement of an uncertain one',async()=>{
  const b=fixture(),p={...b.body(),id:'stale-ui',requestId:'stale-ui'},t=setup();b.command('Lista');attach(t,b,false);
  await assert.rejects(t.call('cancelarTransferenciaNoRecibida',[p]),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(t.ctx.getOutbox()[0].status,'REJECTED');
  const fresh={...b.body(),id:'fresh-ui',requestId:'fresh-ui'};const r=await t.call('cancelarTransferenciaNoRecibida',[fresh]);assert.equal(r.cancellationRequestId,'fresh-ui');
  assert.equal(t.ctx.getOutbox().length,1);assert.equal(t.ctx.getOutbox()[0].requestId,'stale-ui');assert.equal(b.ctx.journalFind_('stale-ui',b.main),null);
 });
 console.log(JSON.stringify({suite:'transfer-cancellation-transport',passed,malformedAckVariants:22,network:false,bankVerified:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
