'use strict';
const assert=require('assert/strict');
const {setup}=require('./absent_recovery_regressions');
const {ui,copy}=require('./unconfirmed_observation_regressions');
const KEY='domus_outbox_qa_absent_recovery_v1',ATT='domus_outbox_review_journey_v1';
let passed=0;async function test(n,fn){await fn();passed++;console.log('PASS',n);}
async function client(b=setup(),options={}){
 const t=await ui(b,options);t.load('qaRecoverAbsentClient_');
 const captured=t.ctx.qaUnconfirmedCapture_();b.inputObserve.localEvidenceHash=await t.ctx.qaDigest_(captured.seal);b.inputObserve.originalAttemptHash=await t.ctx.qaDigest_(captured.attemptRaw);
 if(!options.existing)await t.observe();
 const proposal=options.proposal || b.approve();
 t.consentRecovery=()=>({...t.consent(),approvalId:b.approval.approvalId,confirmPotentialOpening:true,confirmSameId:true,confirmPayloadHash:proposal.evidence.payloadHash,confirmEvidenceHash:proposal.evidenceHash});
 t.recoveryCalls=[];t.attachRecovery=handler=>{t.ctx.window.google={script:{run:{withSuccessHandler:resolve=>({withFailureHandler:reject=>({dispatchNativeAction:p=>{
  t.recoveryCalls.push(copy(p));Promise.resolve().then(()=>handler?handler(copy(p)):b.ctx.dispatchNativeAction(copy(p))).then(resolve,reject);
 }})})}}};};t.attachRecovery();t.recover=consent=>t.ctx.qaRecoverAbsentClient_(consent || t.consentRecovery());
 t.original=()=>JSON.stringify([...t.localStorage.data].filter(([k])=>k!==KEY));return {b,t,proposal};
}
(async()=>{
 await test('one explicit mutation, same identity/body, independent confirmed-held record, original UNCONFIRMED unchanged',async()=>{
  const {b,t}=await client(),before=t.original();const r=await t.recover();assert.equal(r.state,'CONFIRMED_HELD');assert.equal(t.recoveryCalls.length,1);assert.equal(t.recoveryCalls[0].action,'recuperarAperturaQaAusente');
  assert.deepEqual(t.recoveryCalls[0].args[0].body,copy(b.inputObserve.body));assert.equal(t.original(),before);assert.equal(JSON.parse(t.localStorage.getItem(ATT)).state,'UNCONFIRMED');assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);b.guard();
  assert(!t.localStorage.getItem(KEY).includes(b.observationToken));await assert.rejects(t.recover(),/ATTEMPT_EXISTS/);assert.equal(t.recoveryCalls.length,1);
 });
 for(const change of ['consent','payload','evidence','session','observation'])await test('incomplete consent/evidence/session sends no mutation: '+change,async()=>{
  const {b,t}=await client(),c=t.consentRecovery();if(change==='consent')c.confirmPotentialOpening=false;if(change==='payload')c.confirmPayloadHash='0'.repeat(64);if(change==='evidence')c.confirmEvidenceHash='bad';if(change==='session')t.sessionStorage.removeItem('domus_session_token_CAJA');if(change==='observation')t.localStorage.setItem('domus_outbox_review_journey_observation_v1','{}');
  const before=t.original();await assert.rejects(t.recover(c));assert.equal(t.recoveryCalls.length,0);assert.equal(t.original(),before);assert.equal(t.localStorage.getItem(KEY),null);assert.equal(b.props.has('DOMUS_QA_ABSENT_RECOVERY_GATE_V1'),false);
 });
 for(const point of ['sent-before','sent-after','ack-before','ack-after'])await test('storage failure '+point+' cannot repeat or remove original evidence',async()=>{
  const {t}=await client(),before=t.original(),set=t.localStorage.setItem;let count=0;t.localStorage.setItem=(k,v)=>{if(k===KEY && ++count===(point.startsWith('sent')?1:2)){if(point.endsWith('after'))set(k,v);throw Error('SYNTHETIC_QUOTA');}set(k,v);};
  await assert.rejects(t.recover());assert.equal(t.original(),before);assert.equal(t.recoveryCalls.length,point.startsWith('sent')?0:1);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
  if(t.localStorage.getItem(KEY)!==null){await assert.rejects(t.recover(),/ATTEMPT_EXISTS/);assert.equal(t.recoveryCalls.length,point.startsWith('sent')?0:1);}
 });
 for(const location of ['ack','data','scope','history','counts','size'])await test('extra nested ACK data are never persisted: '+location,async()=>{
  const {b,t}=await client(),before=t.original();t.attachRecovery(p=>{const r=b.ctx.dispatchNativeAction(p),d=r.data.ack.data;if(location==='ack')r.data.ack.secret='SYNTHETIC_SECRET';if(location==='data')d.secret='SYNTHETIC_SECRET';if(location==='scope')d.scope.secret='SYNTHETIC_SECRET';if(location==='history')d.historyReview.secret='SYNTHETIC_SECRET';if(location==='counts')d.historyReview.counts.secret='SYNTHETIC_SECRET';if(location==='size')d.scope.projectName='SYNTHETIC_SECRET'.repeat(3000);return r;});
  await assert.rejects(t.recover(),/UNCONFIRMED/);assert.equal(t.original(),before);assert.equal(JSON.parse(t.localStorage.getItem(KEY)).state,'UNCONFIRMED');assert(!t.localStorage.getItem(KEY).includes('SYNTHETIC_SECRET'));assert.equal(t.recoveryCalls.length,1);b.guard();
 });
 await test('timeout and late committed ACK keep local uncertainty with no replay',async()=>{
  const {b,t}=await client(),before=t.original();let expire,late;t.ctx.setTimeout=(fn,ms)=>{assert.equal(ms,30000);expire=fn;return 1;};t.ctx.clearTimeout=()=>{};
  t.attachRecovery(p=>{const response=b.ctx.dispatchNativeAction(p);return new Promise(resolve=>late=()=>resolve(response));});const pending=t.recover();while(!late)await new Promise(r=>setImmediate(r));expire();await assert.rejects(pending,/UNCONFIRMED/);late();await new Promise(r=>setImmediate(r));
  assert.equal(t.recoveryCalls.length,1);assert.equal(t.original(),before);assert.equal(JSON.parse(t.localStorage.getItem(KEY)).state,'UNCONFIRMED');b.guard();
 });
 await test('two tabs compete for one exact recovery attempt, never two RPCs',async()=>{
  const locks=require('./mock_web_locks')(),a=await client(setup(),{locks}),c=await client(a.b,{locks,storage:a.t.localStorage,existing:true,proposal:a.proposal}),before=a.t.original();
  const results=await Promise.allSettled([a.t.recover(),c.t.recover()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.t.recoveryCalls.length+c.t.recoveryCalls.length,1);assert.equal(a.t.original(),before);assert.equal(a.t.ctx.reviewReleaseDecision_().allowed,false);a.b.guard();
 });
 await test('changed original attempt while response is pending is never overwritten',async()=>{
  const {b,t}=await client();let late;t.attachRecovery(p=>{const r=b.ctx.dispatchNativeAction(p);return new Promise(resolve=>late=()=>resolve(r));});const pending=t.recover();while(!late)await new Promise(r=>setImmediate(r));t.localStorage.setItem(ATT,'SYNTHETIC_EXTERNAL_CHANGE');late();await assert.rejects(pending,/UNCONFIRMED/);assert.equal(t.localStorage.getItem(ATT),'SYNTHETIC_EXTERNAL_CHANGE');assert.equal(t.recoveryCalls.length,1);b.guard();
 });
 console.log(JSON.stringify({suite:'explicit-absent-recovery-client',passed,realOperations:0,deployments:0,automaticRetries:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
