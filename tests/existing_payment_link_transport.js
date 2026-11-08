'use strict';
const assert=require('assert/strict'),{fixture}=require('./existing_payment_link_regressions'),{setup,copy}=require('./reconciliation_regressions');
let passed=0;async function test(n,f){await f();passed++;console.log('PASS',n);}
const health={ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
function attach(t,b,native,alter=x=>x){
 t.ctx.STATE.isNativeGas=native;t.ctx.setSessionToken(b.managerToken,'GERENCIA');t.load('transport_');const sends=[];
 const respond=p=>{if(p.action==='health')return health;sends.push(copy(p));return alter(copy(b.ctx.dispatchNativeAction(copy(p))));};
 t.ctx.fetch=async(_,opts)=>({json:()=>respond(JSON.parse(opts.body))});
 t.ctx.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:bad=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(p)).then(ok,bad)})})}}};t.ctx.window.google=t.ctx.google;return sends;
}
(async()=>{
 for(const native of [false,true])await test((native?'native':'REST')+': invalid ACK preserves ID/body/cart/receipt across reload and recovers one zero-charge link',async()=>{
  const bad=[r=>({...r,data:{}}),r=>({...r,data:false}),r=>({...r,data:[]}),r=>({...r,data:'done'}),r=>({...r,requestId:'OTHER'}),
   ...[{linkRequestId:'OTHER'},{existingPaymentRequestId:'OTHER'},{existingPaymentReceipt:'OTHER'},{linkedAmount:39},{newCharge:40},{amountApplied:40},{units:[]},{paymentParts:[]},{sourceEvidenceHash:''},{confirmExistingPayment:false}].map(p=>r=>({...r,data:{...r.data,...p}}))];
  for(const alter of bad){
   const b=fixture(),p={...b.body(),id:'link-ui',requestId:'link-ui'},t=setup();t.ctx.STATE.cart=[{sku:'NEW-CART'}];t.localStorage.setItem('domus_last_sale_confirmation','prior-receipt');const before=b.main.getSheetByName('COBROS').getLastRow();attach(t,b,native,alter);
   assert.equal((await t.call('vincularPagoExistente',[p])).localOutbox,true);assert.equal(t.ctx.getOutbox()[0].status,'RETRY');assert.deepEqual(copy(t.ctx.getOutbox()[0].args[0]),copy(p));assert.equal(t.localStorage.getItem('domus_confirmation_link-ui'),null);assert.equal(t.ctx.STATE.cart[0].sku,'NEW-CART');
   const fresh=setup({storage:t.localStorage}),sends=attach(fresh,b,native);await fresh.ctx.migrateLegacyOutbox_();await fresh.ctx.sincronizarOutboxCore_();
   assert.equal(fresh.ctx.getOutbox().length,0);assert.equal(sends[0].requestId,p.id);assert.deepEqual(sends[0].args[0],copy(p));assert.equal(t.localStorage.getItem('domus_last_sale_confirmation'),'prior-receipt');
   const ack=JSON.parse(t.localStorage.getItem('domus_confirmation_link-ui'));assert.equal(ack.data.newCharge,0);assert.equal(b.ctx.transferExistingPaymentRecords_(b.main).length,1);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),before);
  }
 });
 await test('partial completion 500 survives reload and keeps original payment immutable',async()=>{
  const b=fixture(),p={...b.body(),id:'partial',requestId:'partial'},t=setup(),s=b.main.getSheetByName('REQUESTS'),put=s.put.bind(s);let once=true;
  s.put=(r,c,v)=>{if(once&&c===5&&v==='COMPLETED'){once=false;throw Error('LINK_PARTIAL');}return put(r,c,v);};attach(t,b,true);
  const original=JSON.stringify([...b.main.getSheetByName('COBROS').cells]);assert.equal((await t.call('vincularPagoExistente',[p])).localOutbox,true);assert.equal(t.ctx.getOutbox()[0].status,'RETRY');assert.throws(()=>b.decision());
  const fresh=setup({storage:t.localStorage});attach(fresh,b,true);await fresh.ctx.migrateLegacyOutbox_();await fresh.ctx.sincronizarOutboxCore_();assert.equal(fresh.ctx.getOutbox().length,0);assert.equal(b.decision().allowed,true);assert.equal(JSON.stringify([...b.main.getSheetByName('COBROS').cells]),original);
 });
 await test('stale no-effects rejection stays auditable; corrected review uses a new ID',async()=>{
  const b=fixture(),p={...b.body(),id:'stale',requestId:'stale'},t=setup();b.command('Lista');attach(t,b,false);
  await assert.rejects(t.call('vincularPagoExistente',[p]),e=>e.code==='EXISTING_PAYMENT_VALIDATION_NO_EFFECTS');assert.equal(t.ctx.getOutbox()[0].status,'REJECTED');
  assert.equal((await t.call('vincularPagoExistente',[{...b.body(),id:'fresh',requestId:'fresh'}])).newCharge,0);assert.equal(t.ctx.getOutbox()[0].requestId,'stale');assert.equal(b.ctx.journalFind_('stale',b.main),null);
 });
 await test('two concurrent client realms sharing Web Locks preserve both intentions and record one link',async()=>{
  const b=fixture(),a=setup(),z=setup({storage:a.localStorage,locks:a.ctx.window.navigator.locks}),body=b.body();attach(a,b,true);attach(z,b,false);
  const outcomes=await Promise.allSettled([a.call('vincularPagoExistente',[{...body,id:'tab-A',requestId:'tab-A'}]),z.call('vincularPagoExistente',[{...body,id:'tab-B',requestId:'tab-B'}])]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled'&&x.value.newCharge===0).length,1);assert.equal(b.ctx.transferExistingPaymentRecords_(b.main).length,1);
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(a.ctx.getOutbox().length,1);assert.equal(a.ctx.getOutbox()[0].status,'REJECTED');
  const confirmed=['tab-A','tab-B'].filter(id=>a.localStorage.getItem('domus_confirmation_'+id));assert.equal(confirmed.length,1);
 });
 await test('review hold archives a completed administrative ACK without replay or a financial receipt',async()=>{
  const b=fixture(),t=setup(),p={...b.body(),id:'review-link',requestId:'review-link'};
  t.ctx.window.location={origin:'https://fixture.invalid'};
  for(const n of ['captureOutboxEvidence_','reviewEvidence_','reviewReleaseDecision_','preserveOutboxForReview_','releaseReviewedOutbox_'])t.load(n);
  const item={clientContract:'domus-outbox-v2',action:'vincularPagoExistente',requestId:p.id,args:[p],status:'RETRY'};
  await t.seed([item]);await t.ctx.preserveOutboxForReview_();assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
  const r=b.link(p,p.id),ack={requestId:p.id,action:item.action,args:[p],data:r};
  // Model a response that completed while the pause was draining; never replay from the hold.
  t.localStorage.setItem('domus_outbox','[]');t.localStorage.setItem('domus_confirmation_'+p.id,JSON.stringify(ack));
  t.localStorage.setItem('domus_outbox_review_settled_v1',JSON.stringify(t.ctx.captureOutboxEvidence_()));
  assert.equal(t.ctx.reviewReleaseDecision_().allowed,true);await t.ctx.releaseReviewedOutbox_();assert.equal(t.calls.length,0);assert.equal(t.localStorage.getItem('domus_last_sale_confirmation'),null);
  assert([...t.localStorage.data.keys()].some(k=>k.startsWith('domus_outbox_review_archive_')));assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);
 });
 console.log(JSON.stringify({suite:'existing-payment-link-transport',passed,malformedAckVariants:30,liveNetwork:false,newCollections:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
