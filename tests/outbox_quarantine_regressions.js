"use strict";
// Actual client functions with isolated storage and the shared/exclusive lock scheduler.
const assert=require('assert/strict');
const {setup,tick,storage}=require('./reconciliation_regressions');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function review(options={}){
 const t=setup(options);t.ctx.window.location={origin:'https://fixture.invalid'};
 for(const name of ['captureOutboxEvidence_','validateReviewSnapshot_','preserveOutboxForReview_'])t.load(name);
 return t;
}
const holdKey='domus_outbox_review_hold_v1',initialKey='domus_outbox_review_initial_v1';
function legacy(t){
 const q=Array.from({length:15},(_,i)=>({...t.item('QA-legacy-'+i),status:['RETRY','LOCAL_PENDING','SYNCING','SENDING','REQUIRES_REVIEW'][i%5],extra:{keep:'opaque '+i}}));
 q.forEach(q=>delete q.clientContract);q[14].requestId=q[13].requestId; // preserve duplicate records too
 const raw=JSON.stringify(q,null,1);t.localStorage.setItem('domus_outbox',raw);
 t.localStorage.setItem('domus_pending_sale',' { "id":"QA-orphan", "unknown":true } ');
 for(let i=0;i<3;i++)t.localStorage.setItem('domus_confirmation_QA-'+i,JSON.stringify({receipt:'QA-linked-'+i}));
 t.localStorage.setItem('domus_print_token','NOT-EVIDENCE');t.localStorage.setItem('domus_session_token_CAJA','NOT-EVIDENCE');
 return raw;
}
(async()=>{
 await test('15 legacy records including linked/unknown/duplicate IDs remain byte-exact; migration and automatic sends stop',async()=>{
  const t=review(),raw=legacy(t),before=t.ctx.captureOutboxEvidence_().values;
  assert.equal(t.ctx.outboxReviewRequired_(true),true);await t.ctx.migrateLegacyOutbox_();
  await assert.rejects(t.ctx.sincronizarOutboxCore_(),/OUTBOX_REVIEW_REQUIRED/);
  await assert.rejects(t.call('cajaSimpleRegistrar',t.item('new').args),/OUTBOX_REVIEW_REQUIRED/);
  assert.equal(t.calls.length,0);await t.ctx.preserveOutboxForReview_();
  assert.equal(t.localStorage.getItem('domus_outbox'),raw);assert.deepEqual(t.ctx.captureOutboxEvidence_().values,before);
  const snap=JSON.parse(t.localStorage.getItem(initialKey));assert.equal(snap.values.domus_outbox,raw);
  assert.equal(Object.keys(snap.values).filter(k=>k.startsWith('domus_confirmation_')).length,3);
  assert(!JSON.stringify(snap).includes('NOT-EVIDENCE'));
  assert.equal(JSON.parse(t.localStorage.getItem(holdKey)).state,'REQUIRES_REVIEW');
 });
 await test('hold survives reload and blocks foreground, retry and original-store writes without deleting evidence',async()=>{
  const t=review(),raw=legacy(t);await t.ctx.preserveOutboxForReview_();const copy=t.localStorage.getItem(initialKey);
  const fresh=review({storage:t.localStorage});assert.equal(fresh.ctx.outboxReviewRequired_(true),true);
  await assert.rejects(fresh.call('cajaSimpleRegistrar',fresh.item('new').args),/OUTBOX_REVIEW_REQUIRED/);
  await assert.rejects(fresh.ctx.sincronizarOutboxCore_(),/OUTBOX_REVIEW_REQUIRED/);
  await assert.rejects(fresh.ctx.withOutboxStore_(()=>fresh.ctx.saveOutbox([])),/OUTBOX_REVIEW_REQUIRED/);
  await fresh.ctx.preserveOutboxForReview_();assert.equal(t.localStorage.getItem(initialKey),copy);
  assert.equal(t.localStorage.getItem('domus_outbox'),raw);assert.equal(fresh.calls.length,0);
 });
 await test('snapshot quota failure leaves a durable stop marker and original intact; a later preservation can finish',async()=>{
  const t=review(),raw=legacy(t),set=t.localStorage.setItem;
  t.localStorage.setItem=(k,v)=>{if(k===initialKey)throw Error('QUOTA');set(k,v);};
  await assert.rejects(t.ctx.preserveOutboxForReview_(),/QUOTA/);
  assert.equal(JSON.parse(t.localStorage.getItem(holdKey)).state,'DRAINING');
  await assert.rejects(t.ctx.withOutboxStore_(()=>t.ctx.saveOutbox([])),/OUTBOX_REVIEW_REQUIRED/);
  assert.equal(t.localStorage.getItem('domus_outbox'),raw);assert.equal(t.calls.length,0);
  t.localStorage.setItem=set;await t.ctx.preserveOutboxForReview_();assert.equal(JSON.parse(t.localStorage.getItem(initialKey)).values.domus_outbox,raw);
 });
 await test('failure to persist even the stop marker blocks this page in memory and never claims a durable hold',async()=>{
  const t=review();await t.seed([t.item()]);const raw=t.localStorage.getItem('domus_outbox');
  t.localStorage.setItem=()=>{throw Error('STORAGE_UNAVAILABLE');};await assert.rejects(t.ctx.preserveOutboxForReview_(),/STORAGE_UNAVAILABLE/);
  assert.equal(t.localStorage.getItem(holdKey),null);await assert.rejects(t.call('cajaSimpleDatos',[]),/OUTBOX_REVIEW_REQUIRED/);
  assert.equal(t.localStorage.getItem('domus_outbox'),raw);assert.equal(t.calls.length,0);
 });
 await test('malformed queue and malformed hold remain raw evidence, never replaced by an empty queue',async()=>{
  const t=review();t.localStorage.setItem('domus_outbox','{BROKEN');await t.ctx.preserveOutboxForReview_();
  assert.equal(JSON.parse(t.localStorage.getItem(initialKey)).values.domus_outbox,'{BROKEN');assert.equal(t.localStorage.getItem('domus_outbox'),'{BROKEN');
  const b=review();b.localStorage.setItem(holdKey,'{BROKEN');await assert.rejects(b.ctx.preserveOutboxForReview_());
  assert.equal(b.localStorage.getItem(holdKey),'{BROKEN');assert.equal(b.calls.length,0);
 });
 await test('an orphan pending sale enters review at startup; new-client queued recovery still uses its original ID',async()=>{
  const t=review();t.localStorage.setItem('domus_pending_sale','{"id":"orphan"}');assert.equal(t.ctx.outboxReviewRequired_(true),true);
  await t.ctx.migrateLegacyOutbox_();assert.equal(t.localStorage.getItem('domus_outbox'),null);
  const b=review();await b.seed([b.item('current')]);assert.equal(b.ctx.outboxReviewRequired_(true),false);
  await b.ctx.sincronizarOutboxCore_();assert.equal(b.calls[0].requestId,'current');assert.equal(b.ctx.getOutbox().length,0);
 });
 await test('a damaged or missing completed snapshot is not silently rebuilt or treated as preserved',async()=>{
  for(const raw of [null,'{BROKEN','{}']){
   const t=review(),original=legacy(t);await t.ctx.preserveOutboxForReview_();
   if(raw===null)t.localStorage.removeItem(initialKey);else t.localStorage.setItem(initialKey,raw);
   await assert.rejects(t.ctx.preserveOutboxForReview_());
   assert.equal(t.localStorage.getItem(initialKey),raw);assert.equal(t.localStorage.getItem('domus_outbox'),original);
   await assert.rejects(t.ctx.sincronizarOutboxCore_(),/OUTBOX_REVIEW_REQUIRED/);assert.equal(t.calls.length,0);
  }
 });
 await test('review drains an already-started operation, captures initial and final evidence, and blocks the next send',async()=>{
  const shared=storage(),locks=require('./mock_web_locks')(),a=review({storage:shared,locks}),b=review({storage:shared,locks});
  let complete;a.ctx.transport_=()=>new Promise(resolve=>complete=resolve);
  const sending=a.call('cajaSimpleRegistrar',a.item('in-flight').args);await tick();assert(complete);
  const before=shared.getItem('domus_outbox');let settled=false;
  const freezing=b.ctx.preserveOutboxForReview_().then(()=>settled=true);await tick();assert.equal(settled,false);
  await assert.rejects(a.call('cajaSimpleRegistrar',a.item('must-not-send').args),/OUTBOX_REVIEW_REQUIRED/);
  complete({ok:true,data:{receipt:'QA-ACK',paid:true}});await sending;await freezing;
  assert.equal(JSON.parse(shared.getItem(initialKey)).values.domus_outbox,before);
  const end=JSON.parse(shared.getItem('domus_outbox_review_settled_v1')).values;
  assert.equal(end.domus_outbox,'[]');assert(JSON.parse(end['domus_confirmation_in-flight']).data.receipt==='QA-ACK');
  assert.equal(JSON.parse(shared.getItem(holdKey)).state,'REQUIRES_REVIEW');
 });
 console.log(JSON.stringify({suite:'outbox-preservation-real-functions',passed,liveNetwork:false,liveIds:false,productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
