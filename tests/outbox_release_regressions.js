'use strict';
const assert=require('assert/strict');
const {setup,storage,tick}=require('./reconciliation_regressions');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
const hold='domus_outbox_review_hold_v1',initial='domus_outbox_review_initial_v1',settled='domus_outbox_review_settled_v1';
function review(options={}){
 const t=setup(options);t.ctx.window.location={origin:'https://fixture.invalid'};
 for(const n of ['captureOutboxEvidence_','reviewEvidence_','reviewReleaseDecision_','preserveOutboxForReview_','releaseReviewedOutbox_'])t.load(n);
 return t;
}
const archives=t=>[...t.localStorage.data.keys()].filter(k=>k.startsWith('domus_outbox_review_archive_'));
(async()=>{
 await test('empty review closes only on explicit request; raw evidence is archived and no traffic starts',async()=>{
  const t=review();t.localStorage.setItem('domus_outbox',' [ ] ');await t.ctx.preserveOutboxForReview_();
  const raw=t.localStorage.getItem(initial);assert.equal(t.ctx.reviewReleaseDecision_().allowed,true);
  await t.ctx.releaseReviewedOutbox_();assert.equal(t.localStorage.getItem(hold),null);assert.equal(t.localStorage.getItem('domus_outbox'),' [ ] ');
  assert.equal(archives(t).length,1);assert.equal(JSON.parse(t.localStorage.getItem(archives(t)[0])).initialRaw,raw);assert.equal(t.calls.length,0);
  await assert.rejects(t.call('cajaSimpleDatos',[]),/OUTBOX_REVIEW_REQUIRED/); // this screen stays stopped until explicit navigation
  const reload=review({storage:t.localStorage});assert.equal(reload.ctx.outboxReviewRequired_(true),false);
 });
 await test('15 unknown/legacy entries and orphan pending cannot be released or cleared',async()=>{
  for(const orphan of [false,true]){
   const t=review();if(orphan)t.localStorage.setItem('domus_pending_sale','{"id":"QA-orphan"}');
   else t.localStorage.setItem('domus_outbox',JSON.stringify(Array.from({length:15},(_,i)=>({requestId:'QA-'+i,status:'RETRY'}))));
   await t.ctx.preserveOutboxForReview_();const before=t.ctx.captureOutboxEvidence_().values;
   assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);await assert.rejects(t.ctx.releaseReviewedOutbox_());assert.deepEqual(t.ctx.captureOutboxEvidence_().values,before);assert.equal(archives(t).length,0);
  }
 });
 await test('a real new-client in-flight confirmation can close after drain, preserving original receipt without replay',async()=>{
  const shared=storage(),locks=require('./mock_web_locks')(),a=review({storage:shared,locks}),b=review({storage:shared,locks});
  const body={id:'QA-complete',requestId:'QA-complete',paid:true,method:'Efectivo',expectedTotal:200,items:[{sku:'QA-01',qty:1}]};let complete;
  a.ctx.transport_=()=>new Promise(resolve=>complete=resolve);shared.setItem('domus_pending_sale',JSON.stringify(body));
  const sending=a.call('cajaSimpleRegistrar',[body]);await tick();const freezing=b.ctx.preserveOutboxForReview_();await tick();
  complete({ok:true,data:{ok:true,ticket:'QA-ticket',receipt:'QA-receipt',paid:true,verified:true,paymentStatus:'CONFIRMADA',method:'Efectivo',total:200}});
  await sending;await freezing;assert.equal(b.ctx.reviewReleaseDecision_().allowed,true);await b.ctx.releaseReviewedOutbox_();
  assert.equal(shared.getItem('domus_outbox'),'[]');assert.equal(JSON.parse(shared.getItem('domus_confirmation_QA-complete')).data.receipt,'QA-receipt');assert.equal(archives(b).length,1);
 });
 await test('empty current queue does not erase unresolved initial history or trust an empty/wrong receipt',async()=>{
  for(const variant of ['no-receipt','empty-receipt','wrong-intention','legacy']){
   const t=review(),item=t.item('QA-initial');item.args[0].method='Efectivo';item.args[0].expectedTotal=40;if(variant==='legacy')delete item.clientContract;
   t.localStorage.setItem('domus_outbox',JSON.stringify([item]));await t.ctx.preserveOutboxForReview_();
   t.localStorage.setItem('domus_outbox','[]');
   if(variant!=='no-receipt')t.localStorage.setItem('domus_confirmation_'+item.requestId,JSON.stringify({requestId:variant==='wrong-intention'?'OTHER':item.requestId,action:item.action,args:item.args,data:{}}));
   t.localStorage.setItem(settled,JSON.stringify(t.ctx.captureOutboxEvidence_()));
   assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);await assert.rejects(t.ctx.releaseReviewedOutbox_());assert(t.localStorage.getItem(hold));
  }
 });
 await test('post-pause storage change, duplicate IDs and damaged snapshots remain held',async()=>{
  for(const variant of ['changed','duplicate','damaged']){
   const t=review();await t.ctx.preserveOutboxForReview_();
   if(variant==='changed')t.localStorage.setItem('domus_confirmation_EXTRA','{}');
   if(variant==='duplicate'){const s=JSON.parse(t.localStorage.getItem(initial));s.values.domus_outbox=JSON.stringify([t.item(),t.item()]);t.localStorage.setItem(initial,JSON.stringify(s));}
   if(variant==='damaged')t.localStorage.setItem(initial,'{}');
   await assert.rejects(t.ctx.releaseReviewedOutbox_());assert.equal(archives(t).length,0);assert(t.localStorage.getItem(hold));
  }
 });
 await test('archive quota failure cannot remove the hold or initial/settled evidence',async()=>{
  const t=review();await t.ctx.preserveOutboxForReview_();const before=[hold,initial,settled].map(k=>t.localStorage.getItem(k)),set=t.localStorage.setItem;
  t.localStorage.setItem=(k,v)=>{if(k.startsWith('domus_outbox_review_archive_'))throw Error('QUOTA');set(k,v);};
  await assert.rejects(t.ctx.releaseReviewedOutbox_(),/QUOTA/);assert.deepEqual([hold,initial,settled].map(k=>t.localStorage.getItem(k)),before);
 });
 await test('interrupted cleanup stays held; reload finishes explicit close using the same durable archive',async()=>{
  const t=review();await t.ctx.preserveOutboxForReview_();const remove=t.localStorage.removeItem;
  t.localStorage.removeItem=k=>{if(k===settled)throw Error('INTERRUPTED');return remove(k);};
  await assert.rejects(t.ctx.releaseReviewedOutbox_(),/INTERRUPTED/);assert.equal(JSON.parse(t.localStorage.getItem(hold)).state,'RELEASE_READY');assert.equal(archives(t).length,1);
  t.localStorage.removeItem=remove;const reload=review({storage:t.localStorage});await reload.ctx.preserveOutboxForReview_();assert.equal(reload.ctx.reviewReleaseDecision_().allowed,true);
  await reload.ctx.releaseReviewedOutbox_();assert.equal(archives(t).length,1);assert.equal(t.localStorage.getItem(hold),null);
 });
 await test('concurrent close attempts produce one archive; subsequent review gets fresh snapshots',async()=>{
  const shared=storage(),locks=require('./mock_web_locks')(),a=review({storage:shared,locks}),b=review({storage:shared,locks});await a.ctx.preserveOutboxForReview_();
  const outcomes=await Promise.allSettled([a.ctx.releaseReviewedOutbox_(),b.ctx.releaseReviewedOutbox_()]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(archives(a).length,1);
  const next=review({storage:shared});shared.setItem('domus_outbox',JSON.stringify([next.item('QA-new')]));await next.ctx.preserveOutboxForReview_();assert(JSON.parse(shared.getItem(initial)).values.domus_outbox.includes('QA-new'));assert.equal(next.ctx.reviewReleaseDecision_().allowed,false);
 });
 console.log(JSON.stringify({suite:'outbox-release-real-functions',passed,liveNetwork:false,realIds:false,productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
