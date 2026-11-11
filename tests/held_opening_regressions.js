'use strict';
// Actual review functions + actual backend modules. All IDs/books synthetic.
const assert=require('assert/strict'),{setup,copy}=require('./reconciliation_regressions');
const {fixture}=require('./history_boundary_regressions');
const HOLD='domus_outbox_review_hold_v1',INITIAL='domus_outbox_review_initial_v1',SETTLED='domus_outbox_review_settled_v1',RECOVERY='domus_outbox_review_journey_v1';
const HASH=require('../release-manifest.json').build.sourceSha256;
let passed=0;async function test(n,f){await f();passed++;console.log('PASS',n);}
function client(options={}){
 const t=setup(options);t.ctx.window.location={origin:'https://fixture.invalid'};t.ctx.window.DOMUS_NATIVE_BOOT={environment:'STAGING'};
 for(const n of ['captureOutboxEvidence_','reviewEvidence_','reviewReleaseDecision_','preserveOutboxForReview_','releaseReviewedOutbox_',
  'reviewJourneyCandidate_','reviewJourneyPayload_','validReviewJourneyAck_','recoverReviewedJourney_','reviewJourneyReleaseDecision_'])t.load(n);
 return t;
}
async function held(options={}){
 const b=fixture(0,0);b.activate();const t=client(options),calls=[];
 const item={clientContract:'domus-outbox-v2',action:'turnoAbrir',requestId:'SYNTHETIC-held-opening',args:[{id:'SYNTHETIC-held-opening',requestId:'SYNTHETIC-held-opening',scopeId:'A',openingFloat:0,historyBoundaryId:'boundary'}],
  role:'CAJA',deviceId:'fixture-device',operatorId:'Fixture',status:'RETRY',errorCode:'SERVER_ERROR',errorStatus:500,lastError:'Synthetic contention',attempts:1};
 t.localStorage.setItem('domus_device_id',item.deviceId);t.localStorage.setItem('domus_outbox',JSON.stringify([item],null,2));
 const respond=p=>{calls.push(copy(p));let result=b.ctx.dispatchNativeAction(copy(p));if(p.action==='health')result={...result,data:{...result.data,build:{sourceSha256:HASH}}};return result;};
 const attach=(target,fn)=>{target.ctx.window.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>fn(copy(p))).then(success,failure)})})}}};};
 attach(t,respond);await t.ctx.preserveOutboxForReview_();
 const consent=()=>{const c=t.ctx.reviewJourneyCandidate_();return {binding:c.binding,requestId:item.requestId,reference:'Synthetic private audit reference',destinationAttested:true};};
 return {t,b,item,calls,respond,attach,consent};
}
const archive=t=>[...t.localStorage.data.keys()].filter(k=>k.startsWith('domus_outbox_review_archive_'));
(async()=>{
 await test('reproduce inaccessible normal recovery: durable hold blocks traffic and release while preserving RETRY',async()=>{
  const {t,calls}=await held();assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);await assert.rejects(t.ctx.sincronizarOutboxCore_('SYNTHETIC-held-opening'),/OUTBOX_REVIEW_REQUIRED/);assert.equal(calls.length,0);
 });
 for(const existing of [false,true])await test((existing?'existing ACK':'absent opening')+': explicit original ID only, no queue mutation until archive; no sale/stock effect',async()=>{
  const {t,b,item,calls,consent}=await held();if(existing)b.request('turnoAbrir',copy(item.args),item.requestId);
  const evidence=[HOLD,INITIAL,SETTLED,'domus_outbox'].map(k=>t.localStorage.getItem(k));
  const result=await t.ctx.recoverReviewedJourney_(consent());assert.equal(result.state,'CONFIRMED');
  assert.deepEqual([HOLD,INITIAL,SETTLED,'domus_outbox'].map(k=>t.localStorage.getItem(k)),evidence);
  assert.deepEqual(calls.map(p=>p.action),['health','authCrearSesion','turnoAbrir']);const payload=calls[2];
  assert.deepEqual(payload.args,item.args);for(const k of ['requestId','deviceId','role'])assert.equal(payload[k],item[k]);assert.equal(payload.operator,item.operatorId);
  assert.equal(t.localStorage.getItem('domus_confirmation_'+item.requestId),null);assert.equal(t.ctx.reviewReleaseDecision_().allowed,true);
  assert(![...t.localStorage.data.values()].join('').includes(payload.sessionToken));await assert.rejects(t.ctx.recoverReviewedJourney_(consent()),/Ya existe/);assert.equal(calls.length,3);
  await t.ctx.releaseReviewedOutbox_();assert.equal(t.localStorage.getItem(HOLD),null);assert.equal(t.localStorage.getItem('domus_outbox'),'[]');
  assert.equal(archive(t).length,1);const saved=JSON.parse(t.localStorage.getItem(archive(t)[0]));assert.equal(saved.initialRaw,evidence[1]);assert.equal(saved.settledRaw,evidence[2]);assert.equal(JSON.parse(saved.recoveryRaw).response.requestId,item.requestId);
  assert.equal(JSON.parse(t.localStorage.getItem('domus_confirmation_'+item.requestId)).data.openingRequestId,item.requestId);
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);assert.equal(b.ctx.findRequestRecord_(item.requestId,b.main).status,'COMPLETED');
  await assert.rejects(t.call('cajaSimpleDatos',[]),/OUTBOX_REVIEW_REQUIRED/);assert.equal(calls.length,3);
 });
 await test('unknown destination, old queues, sale/cut/review states, mismatched device and altered snapshots cannot use this path',async()=>{
  for(const variant of ['static','production','unknown','legacy','15','sale','cut','review','confirmed','syncing','device','pending','amount','no-boundary','wrong-id','reserved','deterministic','receipt','changed']){
   const {t,item,calls}=await held();const q=copy(item);
   if(['static','production','unknown'].includes(variant)){t.ctx.window.DOMUS_NATIVE_BOOT={environment:variant==='production'?'PRODUCTION':'UNKNOWN'};}
   else if(variant==='legacy')delete q.clientContract;
   else if(variant==='sale')q.action='cajaSimpleRegistrar';else if(variant==='cut')q.action='corteZCerrar';
   else if(['review','confirmed','syncing'].includes(variant))q.status={review:'REQUIRES_REVIEW',confirmed:'CONFIRMED',syncing:'SYNCING'}[variant];
   else if(variant==='device')q.deviceId='another-device';else if(variant==='amount')q.args[0].openingFloat=60;
   else if(variant==='no-boundary')delete q.args[0].historyBoundaryId;else if(variant==='wrong-id')q.args[0].requestId='other';
   else if(variant==='reserved')q.requestId=q.args[0].requestId=q.args[0].id='client#part:0';
   else if(variant==='deterministic'){q.errorStatus=409;q.errorCode='HISTORY_REQUIRES_REVIEW';}
   t.localStorage.setItem('domus_outbox',JSON.stringify(variant==='15'?Array(15).fill(q):[q]));
   if(variant==='pending')t.localStorage.setItem('domus_pending_sale','{}');
   if(variant==='receipt')t.localStorage.setItem('domus_confirmation_'+q.requestId,'{}');
   if(variant!=='changed'){const snap=JSON.stringify(t.ctx.captureOutboxEvidence_());t.localStorage.setItem(INITIAL,snap);t.localStorage.setItem(SETTLED,snap);}
   assert.throws(()=>t.ctx.reviewJourneyCandidate_(),undefined,variant);assert.equal(calls.length,0);
  }
 });
 await test('destination attestation, exact consent and unchanged evidence are mandatory before network',async()=>{
  for(const patch of [{destinationAttested:false},{requestId:'other'},{reference:''},{binding:'other'}]){
   const {t,consent,calls}=await held();await assert.rejects(t.ctx.recoverReviewedJourney_({...consent(),...patch}));assert.equal(calls.length,0);
  }
 });
 await test('health identity/build mismatch or Google CAJA rejection sends no opening and persists no credentials',async()=>{
  for(const kind of ['environment','main','ops','build','previous-build','auth','auth-role','auth-device']){
   const {t,calls,respond,attach,consent}=await held();attach(t,p=>{const r=respond(p);if(p.action==='health'){
    if(kind==='environment')r.data.environment='PRODUCTION';if(kind==='main')r.data.mainSheetId='other';if(kind==='ops')r.data.opsSheetId='other';if(kind==='build')r.data.build.sourceSha256='other';if(kind==='previous-build')r.data.build.sourceSha256='b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61';
   }if(p.action==='authCrearSesion'&&kind==='auth-role')r.data.role='BARRA';if(p.action==='authCrearSesion'&&kind==='auth-device')r.data.deviceId='other';return p.action==='authCrearSesion'&&kind==='auth'?{ok:false,error:'denied'}:r;});
   await assert.rejects(t.ctx.recoverReviewedJourney_(consent()));assert(!calls.some(p=>p.action==='turnoAbrir'));assert.equal(t.localStorage.getItem(RECOVERY),null);assert(t.localStorage.getItem(HOLD));
  }
 });
 await test('missing/wrong/malformed ACK, 500 or lost reply preserve originals; reload and another click cannot replay an uncertain attempt',async()=>{
  for(const kind of ['empty','null','wrong-id','wrong-device','wrong-boundary','500','lost']){
   const {t,respond,attach,consent,item,calls}=await held();const before=t.localStorage.getItem('domus_outbox');
   attach(t,p=>{const r=respond(p);if(p.action!=='turnoAbrir')return r;
    if(kind==='lost')throw Error('Synthetic lost response');if(kind==='500')return {ok:false,code:'SERVER_ERROR',status:500};
    if(kind==='empty')r.data={};if(kind==='null')r.data=null;if(kind==='wrong-id')r.requestId='other';if(kind==='wrong-device')r.data.deviceId='other';if(kind==='wrong-boundary')r.data.historyBoundaryId='other';return r;
   });
   await assert.rejects(t.ctx.recoverReviewedJourney_(consent()),/sin confirmar/);assert.equal(t.localStorage.getItem('domus_outbox'),before);
   assert.equal(JSON.parse(t.localStorage.getItem(RECOVERY)).state,'UNCONFIRMED');assert.equal(t.localStorage.getItem('domus_confirmation_'+item.requestId),null);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
   const reload=client({storage:t.localStorage});attach(reload,respond);await reload.ctx.preserveOutboxForReview_();await assert.rejects(reload.ctx.recoverReviewedJourney_(consent()),/Ya existe/);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,1);
  }
 });
 await test('queue/hold/device changes while checking health or login abort before mutation',async()=>{
  for(const action of ['health','authCrearSesion']){
   const {t,respond,attach,consent,calls}=await held();attach(t,p=>{const r=respond(p);if(p.action===action)t.localStorage.setItem('domus_device_id','changed');return r;});
   await assert.rejects(t.ctx.recoverReviewedJourney_(consent()));assert(!calls.some(p=>p.action==='turnoAbrir'));assert.equal(t.localStorage.getItem(RECOVERY),null);
  }
 });
 await test('changed evidence after send cannot release even if server committed successfully',async()=>{
  const {t,respond,attach,consent}=await held();attach(t,p=>{const r=respond(p);if(p.action==='turnoAbrir')t.localStorage.setItem('domus_confirmation_other','{}');return r;});
  await assert.rejects(t.ctx.recoverReviewedJourney_(consent()),/sin confirmar/);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);assert(t.localStorage.getItem(HOLD));
 });
 await test('quota before send blocks; quota after ACK keeps SENT as uncertainty, never drops queue',async()=>{
  for(const after of [false,true]){
   const {t,consent,calls}=await held();const before=t.localStorage.getItem('domus_outbox'),set=t.localStorage.setItem;
   t.localStorage.setItem=(k,v)=>{if(k===RECOVERY && (!after || JSON.parse(v).state!=='SENT'))throw Error('QUOTA');set(k,v);};
   await assert.rejects(t.ctx.recoverReviewedJourney_(consent()));assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,after?1:0);assert.equal(t.localStorage.getItem('domus_outbox'),before);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
  }
 });
 await test('two review tabs serialize recovery and close; exactly one original dispatch',async()=>{
  const locks=require('./mock_web_locks')(),{t,respond,attach,consent,calls}=await held({locks});const other=client({storage:t.localStorage,locks});attach(other,respond);
  const outcomes=await Promise.allSettled([t.ctx.recoverReviewedJourney_(consent()),other.ctx.recoverReviewedJourney_(consent())]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,1);
  const closed=await Promise.allSettled([t.ctx.releaseReviewedOutbox_(),other.ctx.releaseReviewedOutbox_()]);assert.equal(closed.filter(r=>r.status==='fulfilled').length,1);assert.equal(archive(t).length,1);
 });
 await test('archive interruption at each cleanup boundary is resumable without a second server call or loss of originals',async()=>{
  for(const key of ['archive',HOLD,'confirmation','domus_outbox',RECOVERY,INITIAL,SETTLED,'remove-hold']){
   const {t,consent,calls,attach,respond}=await held();await t.ctx.recoverReviewedJourney_(consent());const initial=t.localStorage.getItem(INITIAL);
   const set=t.localStorage.setItem,remove=t.localStorage.removeItem;
   t.localStorage.setItem=(k,v)=>{if(k===key || (key==='archive'&&k.startsWith('domus_outbox_review_archive_')) || (key==='confirmation'&&k.startsWith('domus_confirmation_')))throw Error('INTERRUPTED');set(k,v);};
   t.localStorage.removeItem=k=>{if(k===key || (key==='remove-hold'&&k===HOLD))throw Error('INTERRUPTED');remove(k);};
   await assert.rejects(t.ctx.releaseReviewedOutbox_(),/INTERRUPTED/);assert(t.localStorage.getItem(HOLD));t.localStorage.setItem=set;t.localStorage.removeItem=remove;
   const reload=client({storage:t.localStorage});attach(reload,respond);await reload.ctx.preserveOutboxForReview_();assert.equal(reload.ctx.reviewReleaseDecision_().allowed,true,JSON.stringify(reload.ctx.reviewReleaseDecision_()));await reload.ctx.releaseReviewedOutbox_();
   assert.equal(t.localStorage.getItem(HOLD),null);assert.equal(t.localStorage.getItem('domus_outbox'),'[]');assert.equal(calls.length,3);assert(archive(t).some(k=>JSON.parse(t.localStorage.getItem(k)).initialRaw===initial));
  }
 });
 await test('preexisting SENT or UNCONFIRMED from the prior UI stays byte-identical and cannot send any network request',async()=>{
  for(const state of ['SENT','UNCONFIRMED']){
   const {t,consent,calls}=await held();const c=consent();
   t.localStorage.setItem(RECOVERY,JSON.stringify({version:1,state,requestId:'SYNTHETIC-held-opening',binding:c.binding,legacyBuild:'b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61'}));
   const before=JSON.stringify([...t.localStorage.data]);await assert.rejects(t.ctx.recoverReviewedJourney_(c),/Ya existe/);
   assert.equal(calls.length,0);assert.equal(JSON.stringify([...t.localStorage.data]),before);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
  }
 });
 await test('changed queue after partial archive cannot be cleared during resume',async()=>{
  const {t,consent}=await held();await t.ctx.recoverReviewedJourney_(consent());const set=t.localStorage.setItem;t.localStorage.setItem=(k,v)=>{if(k==='domus_outbox')throw Error('INTERRUPTED');set(k,v);};
  await assert.rejects(t.ctx.releaseReviewedOutbox_());t.localStorage.setItem=set;set('domus_outbox','[{"requestId":"other"}]');assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);await assert.rejects(t.ctx.releaseReviewedOutbox_());assert.equal(t.localStorage.getItem('domus_outbox'),'[{"requestId":"other"}]');
 });
 console.log(JSON.stringify({suite:'held-opening-recovery',passed,liveGoogle:false,realIds:false,productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
