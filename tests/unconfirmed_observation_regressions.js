'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const {fixture}=require('./staging_uncertain_retention_regressions');
const {setup:clientSetup}=require('./reconciliation_regressions');
const root=path.resolve(__dirname,'..'),build=require('../release-manifest.json').build.sourceSha256;
const clientSource=fs.readFileSync(root+'/js/app.js','utf8');
const copy=v=>JSON.parse(JSON.stringify(v)),snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const OBS='domus_outbox_review_journey_observation_v1',ATT='domus_outbox_review_journey_v1';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function backend(confirmed=true,env){
 const t=fixture(env);t.allowRetention();t.boundary=t.activate();
 t.inputObserve={action:'turnoAbrir',requestId:'SYNTHETIC-observe',deviceId:'fixture-device',operator:'QA operator',
  body:{id:'SYNTHETIC-observe',requestId:'SYNTHETIC-observe',scopeId:'QA',openingFloat:0,historyBoundaryId:t.boundary.boundaryId},localEvidenceHash:'a'.repeat(64),expectedSourceSha256:build};
 if(confirmed)t.opened=t.call('turnoAbrir',t.inputObserve.body,t.inputObserve.requestId,'CAJA');
 t.observationToken=t.login('CAJA');
 t.inspect=(p=t.inputObserve,role='CAJA')=>t.ctx.executeDomusAction_('consultarAperturaQa',{args:[copy(p)],requestId:p.requestId,role,deviceId:p.deviceId,sessionToken:role==='CAJA'?t.observationToken:t.login(role)}).result;
 t.entry=()=>t.ctx.requestRecordEntry_(t.s,t.inputObserve.requestId);
 t.plan=()=>t.ctx.journalFind_(t.inputObserve.requestId,t.main);
 return t;
}
function noWrites(t){
 for(const n of ['getOrCreateRequestsSheet_','journalSheet_','journalResume_','journalCommit_','saveRequestRecord_','idempotentExecute_'])
  t.ctx[n]=()=>assert.fail('forbidden mutation/helper '+n);
 for(const b of [t.main,t.ops]){b.insertSheet=()=>assert.fail('insertSheet');for(const s of b.sheets.values()){
  const get=s.getRange.bind(s);s.getRange=(...a)=>{const r=get(...a);for(const method of ['setValues','setValue','setFontWeight'])r[method]=()=>assert.fail(method);return r;};
  s.appendRow=()=>assert.fail('appendRow');s.insertRowsAfter=()=>assert.fail('grow');
 }}
 t.ctx.SpreadsheetApp.flush=()=>assert.fail('flush');
 const p=t.ctx.PropertiesService.getScriptProperties;t.ctx.PropertiesService.getScriptProperties=()=>({...p(),setProperty:()=>assert.fail('setProperty')});
 const c=t.ctx.CacheService.getScriptCache;t.ctx.CacheService.getScriptCache=()=>({...c(),put:()=>assert.fail('cache put')});
}
async function ui(b,options={}){
 const t=clientSetup(options);Object.assign(t.ctx,{TextEncoder,Uint8Array});
 t.ctx.window.location={origin:options.origin || 'https://synthetic.invalid'};t.ctx.window.DOMUS_NATIVE_BOOT={environment:'STAGING'};t.ctx.window.google={script:{run:{}}};
 for(const n of ['captureOutboxEvidence_','reviewEvidence_','reviewReleaseDecision_','preserveOutboxForReview_','releaseReviewedOutbox_',
  'reviewJourneyCandidate_','reviewJourneyPayload_','validReviewJourneyAck_','recoverReviewedJourney_','reviewJourneyReleaseDecision_'])t.load(n);
 const source=options.bundle?fs.readFileSync(root+'/google-apps-script/Index.html','utf8'):clientSource;
 for(const n of ['qaCanonical_','qaDigest_','qaClientKeys_','qaUnconfirmedCapture_','qaObserveUnconfirmedClient_','qaObservationExpectedSource_','qaObservationTransport_','qaReleaseKeys_','qaReleaseStorageSeal_','qaReviewSafeCode_','qaReviewErrorText_','qaReviewDiagnostics_','qaReviewUiState_','qaReviewUiRefresh_','qaReviewUiRun_','qaReauthenticateClient_']){
  const start=source.search(new RegExp('  (?:async )?function '+n+'\\('));assert(start>=0,n);const end=source.indexOf('\n  }',start)+4;vm.runInContext(source.slice(start,end),t.ctx);
 }
 t.sessionStorage.setItem('domus_session_token_CAJA',b.observationToken);

 if(!options.existing){
  const item={clientContract:'domus-outbox-v2',action:'turnoAbrir',requestId:b.inputObserve.requestId,args:[copy(b.inputObserve.body)],
   role:'CAJA',deviceId:'fixture-device',operatorId:'QA operator',status:'RETRY',errorCode:'SERVER_ERROR',errorStatus:500,lastError:'Synthetic timeout',attempts:1};
  t.localStorage.setItem('domus_device_id','fixture-device');t.localStorage.setItem('domus_outbox',JSON.stringify([item]));await t.ctx.preserveOutboxForReview_();
  const c=t.ctx.reviewJourneyCandidate_(),now=new Date().toISOString();
  t.localStorage.setItem(ATT,JSON.stringify({format:'DOMUS_REVIEW_JOURNEY_V1',state:'UNCONFIRMED',binding:c.binding,identity:t.ctx.outboxIntentIdentity_(item),
   destination:'STAGING',destinationAttested:true,reference:'Synthetic evidence',sentAt:now,finishedAt:now}));
 }
 t.consent=()=>{const c=t.ctx.reviewJourneyCandidate_();return {requestId:c.item.requestId,binding:c.binding,attemptRaw:t.localStorage.getItem(ATT),destinationAttested:true};};
 t.wire=[];
 t.attach=adapter=>{
  t.ctx.window.google={script:{run:{withSuccessHandler:resolve=>({withFailureHandler:reject=>({dispatchNativeAction:p=>{
   t.wire.push(copy(p));Promise.resolve().then(async()=>adapter?{ok:true,requestId:p.requestId,role:'CAJA',data:await adapter(p.args[0])}:b.ctx.dispatchNativeAction(copy(p))).then(resolve,reject);
  }})})}}};
 };
 t.observe=adapter=>{t.attach(adapter);return t.ctx.qaObserveUnconfirmedClient_(t.consent());};
 return t;
}
function originals(t){return JSON.stringify([...t.localStorage.data].filter(([k])=>k!==OBS));}
async function main(){
 await test('confirmed: real modules verify exact joint durable ACK; absolutely no server writes or replay',()=>{
  const t=backend(),before=snapshot(t),props=JSON.stringify([...t.props]);noWrites(t);const r=t.inspect();
  assert.equal(r.status,'OBSERVED_CONFIRMED');assert.equal(r.ack.requestId,t.inputObserve.requestId);assert.equal(r.canRelease,false);assert.equal(r.canRetry,false);
  assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),props);assert.equal(t.locks().acquires,t.locks().releases);
 });
 await test('absent: observation is not proof of no effects, approval, binding or new opening',()=>{
  const t=backend(false),before=snapshot(t);noWrites(t);const r=t.inspect();assert.equal(r.status,'OBSERVED_ABSENT');assert.equal(r.ack,null);assert.equal(r.resolved,false);assert.equal(r.canRetry,false);assert.equal(snapshot(t),before);
 });
 for(const req of ['PROCESSING','FAILED','REQUIRES_REVIEW','COMPLETED'])for(const journal of ['PREPARED','COMPLETED']){
  if(req==='COMPLETED'&&journal==='COMPLETED')continue;
  await test('nonfinal states never yield ACK: '+req+'/'+journal,()=>{const t=backend(),e=t.entry(),p=t.plan();t.s.put(e.row,5,req);p.sheet.put(p.row,3,journal);const before=snapshot(t);noWrites(t);const r=t.inspect();assert.equal(r.status,'UNRESOLVED');assert.equal(r.ack,null);assert.equal(snapshot(t),before);});
 }
 for(const variant of ['missing-ledger','second-ledger','ledger-header','journal-header','orphan-request','orphan-journal','duplicate-request','duplicate-journal','formula','payload','device','result','nonempty-plan','future-date','closed','ambiguous-opening']){
  await test('conflict fails closed without mutation: '+variant,()=>{
   const t=backend(),e=t.entry(),p=t.plan(),id=t.inputObserve.requestId;
   if(variant==='missing-ledger')t.main.sheets.delete('REQUESTS');
   if(variant==='second-ledger')t.main.insertSheet('TRANSACCIONES_API');
   if(variant==='ledger-header')t.s.put(1,1,'CHANGED');
   if(variant==='journal-header')p.sheet.put(1,1,'CHANGED');
   if(variant==='orphan-request')for(let c=1;c<=6;c++)p.sheet.put(p.row,c,'');
   if(variant==='orphan-journal')for(let c=1;c<=8;c++)t.s.put(e.row,c,'');
   if(variant==='duplicate-request')t.s.appendRow(e.values);
   if(variant==='duplicate-journal')p.sheet.appendRow(p.data);
   if(variant==='formula')t.s.put(e.row,7,'=NOW()');
   if(variant==='payload')t.inputObserve.body.extra='CHANGED';
   if(variant==='device')t.s.put(e.row,4,'ANOTHER');
   if(variant==='result')p.sheet.put(p.row,5,JSON.stringify({...t.opened,openedBy:'ANOTHER'}));
   if(variant==='nonempty-plan')p.sheet.put(p.row,4,JSON.stringify([{sheet:'COBROS',row:7,column:6,values:[[70]]}]));
   if(variant==='future-date')t.s.put(e.row,7,'2099-01-01T00:00:00.000Z');
   if(variant==='closed')t.call('corteZCerrar',{requestId:'SYNTHETIC-cut',openingRequestId:id,countedCash:0,historyBoundaryId:t.boundary.boundaryId},'SYNTHETIC-cut');
   if(variant==='ambiguous-opening'){
    const other='SYNTHETIC-other',r={...t.opened,openingRequestId:other,journeyId:'JOR-'+other,shiftId:'TURNO-'+other};
    const row=e.values.slice();row[0]=other;row[7]=JSON.stringify(r);t.s.appendRow(row);const j=p.data.slice();j[0]=other;j[4]=JSON.stringify(r);p.sheet.appendRow(j);
   }
   const before=snapshot(t);noWrites(t);assert.throws(()=>t.inspect());assert.equal(snapshot(t),before);assert.equal(t.locks().acquires,t.locks().releases);
  });
 }
 for(const variant of ['role','environment','project','input-device','input-float','input-id','lock']){
  await test('authentication/environment/lock refuse: '+variant,()=>{const t=backend(),before=snapshot(t);
   if(variant==='environment')t.props.set('DOMUS_ENV','PRODUCTION');
   if(variant==='project')t.ctx.ScriptApp.getScriptId=()=> 'OTHER';
   if(variant==='input-device')t.inputObserve.deviceId='OTHER';
   if(variant==='input-float')t.inputObserve.body.openingFloat=70;
   if(variant==='input-id')t.inputObserve.body.requestId='OTHER';
   if(variant==='lock')t.ctx.LockService.getScriptLock=()=>({waitLock(){throw Error('BUSY');},releaseLock(){assert.fail('not acquired');}});
   noWrites(t);assert.throws(()=>t.inspect(undefined,variant==='role'?'GERENCIA':'CAJA'));assert.equal(snapshot(t),before);
  });
 }
 for(const variant of ['cells','policy','legacy-cache']){
  await test('concurrent change at final verification blocks observation: '+variant,()=>{const t=backend(),old=t.ctx.historyReadView_;let after;
   t.ctx.historyReadView_=source=>{const read=old(source),check=read.assertDimensions;if(source===t.main)read.assertDimensions=()=>{
    if(variant==='cells')t.s.put(t.entry().row,7,'2001-01-01T00:00:00.000Z');
    if(variant==='policy')t.props.set('DOMUS_JOURNEY_POLICY_V1','{}');
    if(variant==='legacy-cache')t.props.set('idemp:'+t.inputObserve.requestId,'SECRET_NOT_EXPORTED');
    after=snapshot(t);check();};return read;};
   noWrites(t);assert.throws(()=>t.inspect());assert.equal(snapshot(t),after);
  });
 }
 await test('legacy evidence is hashed, not exposed or imported as ACK',()=>{const t=backend(false);t.props.set('idemp:'+t.inputObserve.requestId,'SECRET_NOT_EXPORTED');noWrites(t);const r=t.inspect();assert.equal(r.status,'UNRESOLVED');assert(!JSON.stringify(r).includes('SECRET_NOT_EXPORTED'));assert.equal(r.ack,null);});
 await test('client observation is separate; original attempt/hold/queue/receipts unchanged and current release/retry stay blocked',async()=>{
  const b=backend(),t=await ui(b),before=originals(t),books=snapshot(b);noWrites(b);const r=await t.observe();
  assert.equal(r.report.status,'OBSERVED_CONFIRMED');assert.equal(originals(t),before);assert.equal(snapshot(b),books);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
  await assert.rejects(t.ctx.recoverReviewedJourney_({}),/Confirma/);assert.equal(JSON.parse(t.localStorage.getItem(ATT)).state,'UNCONFIRMED');
  assert.equal(r.format,'DOMUS_QA_LOCAL_OBSERVATION_V1');assert.equal(r.canRelease,false);await assert.rejects(t.observe(),/EXISTS_PRESERVED/);
 });
 for(const key of [ATT,'domus_outbox_review_hold_v1','domus_outbox','domus_device_id','domus_confirmation_other',OBS]){
  await test('local change while read is pending remains preserved and cannot be overwritten: '+key,async()=>{
   const b=backend(),t=await ui(b);let release;const promise=t.observe(p=>new Promise(r=>release=()=>r(b.inspect(copy(p)))));while(!release)await new Promise(r=>setImmediate(r));
   t.localStorage.setItem(key,'CHANGED');const after=JSON.stringify([...t.localStorage.data]);release();await assert.rejects(promise);
   assert.equal(JSON.stringify([...t.localStorage.data]),after);assert.equal(t.localStorage.getItem(OBS),key===OBS?'CHANGED':null);
  });
 }
 for(const variant of ['missing','wrong-id','wrong-hash','fake-release','wrong-destination','uncertain-ack']){
  await test('invalid adapter report is never persisted: '+variant,async()=>{const b=backend(),t=await ui(b),before=originals(t);
   await assert.rejects(t.observe(p=>{const r=copy(b.inspect(copy(p)));if(variant==='missing')return null;if(variant==='wrong-id')r.requestId='OTHER';if(variant==='wrong-hash')r.observationHash='0'.repeat(64);if(variant==='fake-release')r.canRelease=true;if(variant==='wrong-destination')r.environment='PRODUCTION';if(variant==='uncertain-ack')r.status='UNRESOLVED';return r;}));
   assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
  });
 }
 for(const after of [false,true])await test('quota or uncertain local write never clears hold, including after successful persistence: '+after,async()=>{
  const b=backend(),t=await ui(b),before=originals(t),set=t.localStorage.setItem;t.localStorage.setItem=(k,v)=>{if(k===OBS){if(after)set(k,v);throw Error('QUOTA');}set(k,v);};
  await assert.rejects(t.observe(),/WRITE_UNCERTAIN/);assert.equal(originals(t),before);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
 });
 await test('two tabs: exclusive traffic/store locks permit only one observation write and one server read',async()=>{
  const b=backend(),locks=require('./mock_web_locks')(),a=await ui(b,{locks}),c=await ui(b,{locks,storage:a.localStorage,existing:true}),before=originals(a);let calls=0;
  const read=p=>{calls++;return Promise.resolve(b.inspect(copy(p)));};const results=await Promise.allSettled([a.observe(read),c.observe(read)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(originals(a),before);assert.equal(a.ctx.reviewReleaseDecision_().allowed,false);
 });
 await test('adapter result alias cannot mutate the private observation during digest',async()=>{
  const b=backend(),t=await ui(b),before=originals(t),digest=t.ctx.qaDigest_;let alias,changed=false;
  t.ctx.qaDigest_=async v=>{if(v?.format==='DOMUS_QA_OPENING_OBSERVATION_V1' && alias){alias.canRelease=true;alias.canRetry=true;alias.hiddenSecret='SECRET_NOT_EXPORTED';changed=true;}return digest(v);};
  const result=await t.observe(p=>{alias=b.inspect(copy(p));return alias;});
  assert(changed);assert.equal(result.report.canRelease,false);assert.equal(result.report.canRetry,false);
  assert(!t.localStorage.getItem(OBS).includes('SECRET_NOT_EXPORTED'));assert.equal(originals(t),before);
  const unsigned=copy(result.report);delete unsigned.observationHash;assert.equal(await digest(unsigned),result.report.observationHash);
 });
 await test('adapter input alias cannot redefine the expected payload hash',async()=>{
  const b=backend(),t=await ui(b),before=originals(t);
  await assert.rejects(t.observe(async p=>{const r=b.inspect(copy(p));p.body.scopeId='OTHER';r.payloadHash=await t.ctx.qaDigest_({action:'turnoAbrir',payload:p.body});const u=copy(r);delete u.observationHash;r.observationHash=await t.ctx.qaDigest_(u);return r;}),/REPORT_INVALID/);
  assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 for(const variant of ['report','evidence','ack','data','scope','history','counts','timestamp','reason'])await test('correctly rehashed but invalid schema is refused: '+variant,async()=>{
  const b=backend(),t=await ui(b),before=originals(t);
  await assert.rejects(t.observe(async p=>{const r=b.inspect(copy(p));
   if(variant==='report')r.sessionToken='SECRET_NOT_EXPORTED';if(variant==='evidence')r.evidence.secret='SECRET_NOT_EXPORTED';
   if(variant==='ack')r.ack.sessionToken='SECRET_NOT_EXPORTED';if(variant==='data')r.ack.data.sessionToken='SECRET_NOT_EXPORTED';
   if(variant==='scope')r.ack.data.scope.secret='SECRET_NOT_EXPORTED';if(variant==='history')r.ack.data.historyReview.secret='SECRET_NOT_EXPORTED';
   if(variant==='counts')r.ack.data.historyReview.counts.extra='SECRET_NOT_EXPORTED';if(variant==='timestamp')r.observedAt='2026-11-11';if(variant==='reason')r.reason='SECRET_NOT_EXPORTED';
   const u=copy(r);delete u.observationHash;r.observationHash=await t.ctx.qaDigest_(u);return r;}));
  assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 for(const variant of ['extra-result','extra-history','legacy-completed'])await test('durable completed records cannot import unexpected fields or legacy evidence: '+variant,()=>{
  const b=backend(),e=b.entry(),p=b.plan();
  if(variant==='legacy-completed')b.props.set('idemp:'+b.inputObserve.requestId,'SECRET_NOT_EXPORTED');else{
   const r=copy(b.opened);if(variant==='extra-result')r.sessionToken='SECRET_NOT_EXPORTED';else r.historyReview.secret='SECRET_NOT_EXPORTED';
   b.s.put(e.row,8,JSON.stringify(r));p.sheet.put(p.row,5,JSON.stringify(r));
  }
  const before=snapshot(b);noWrites(b);if(variant==='legacy-completed'){const r=b.inspect();assert.equal(r.status,'UNRESOLVED');assert.equal(r.ack,null);assert(!JSON.stringify(r).includes('SECRET_NOT_EXPORTED'));}else assert.throws(()=>b.inspect());assert.equal(snapshot(b),before);
 });
 await test('SENT original attempt is observed without changing it or adding a response',async()=>{
  const b=backend(),t=await ui(b),a=JSON.parse(t.localStorage.getItem(ATT));a.state='SENT';delete a.finishedAt;t.localStorage.setItem(ATT,JSON.stringify(a));const before=originals(t);
  const r=await t.observe();assert.equal(r.report.status,'OBSERVED_CONFIRMED');assert.equal(originals(t),before);assert.equal(JSON.parse(t.localStorage.getItem(ATT)).state,'SENT');assert.equal(r.originalAttemptRaw,undefined);
 });
 await test('unexpected original attempt fields stay untouched and prevent adapter execution',async()=>{
  const b=backend(),t=await ui(b),a=JSON.parse(t.localStorage.getItem(ATT));a.sessionToken='SECRET_NOT_EXPORTED';t.localStorage.setItem(ATT,JSON.stringify(a));const before=originals(t);let calls=0;
  await assert.rejects(t.observe(()=>{calls++;return null;}),/ATTEMPT_INVALID/);assert.equal(calls,0);assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 await test('adapter timeout/rejection cannot add or clear any local evidence',async()=>{
  const b=backend(),t=await ui(b),before=originals(t);await assert.rejects(t.observe(()=>Promise.reject(Error('SYNTHETIC_TIMEOUT'))),/TRANSPORT_UNCONFIRMED/);assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 await test('malformed previous observation is preserved and blocks adapter execution',async()=>{
  const b=backend(),t=await ui(b);t.localStorage.setItem(OBS,'{bad');const before=JSON.stringify([...t.localStorage.data]);let calls=0;
  await assert.rejects(t.observe(()=>{calls++;return null;}),/EXISTS_PRESERVED/);assert.equal(calls,0);assert.equal(JSON.stringify([...t.localStorage.data]),before);
 });
 for(const env of [undefined,'STAGING'])for(const outcome of ['confirmed','absent','nonfinal'])await test((env||'modules')+' authenticated native path: '+outcome+'; one read and no financial dispatch',async()=>{
  const b=backend(outcome!=='absent',env),t=await ui(b,{bundle:!!env});if(outcome==='nonfinal')b.s.put(b.entry().row,5,'PROCESSING');
  const before=originals(t),books=snapshot(b),props=JSON.stringify([...b.props]);noWrites(b);
  const result=await t.observe();assert.equal(result.report.status,{confirmed:'OBSERVED_CONFIRMED',absent:'OBSERVED_ABSENT',nonfinal:'UNRESOLVED'}[outcome]);
  assert.deepEqual(t.wire.map(p=>p.action),['consultarAperturaQa']);assert.equal(t.wire[0].requestId,b.inputObserve.requestId);
  assert.equal(snapshot(b),books);assert.equal(JSON.stringify([...b.props]),props);assert.equal(originals(t),before);
  assert(!t.localStorage.getItem(OBS).includes(b.observationToken));assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
 });
 for(const variant of ['missing-token','expired','missing-persisted','changed-session','wrong-role','wrong-device','wrong-operator','wrong-build','wrong-project','production','direct-helper'])await test('authenticated dispatcher rejects before spreadsheet access: '+variant,()=>{
  const b=backend(),input=copy(b.inputObserve),p={action:'consultarAperturaQa',args:[input],requestId:input.requestId,role:'CAJA',deviceId:input.deviceId,sessionToken:b.observationToken};
  if(variant==='missing-token')p.sessionToken='';if(variant==='expired'){const a=JSON.parse(b.props.get('ses:'+p.sessionToken));a.expires=1;b.props.set('ses:'+p.sessionToken,JSON.stringify(a));}
  if(variant==='missing-persisted')b.props.delete('ses:'+p.sessionToken);if(variant==='changed-session'){const a=JSON.parse(b.props.get('ses:'+p.sessionToken));a.operator='OTHER';b.props.set('ses:'+p.sessionToken,JSON.stringify(a));}
  if(variant==='wrong-role'){p.role='GERENCIA';p.sessionToken=b.login('GERENCIA');}if(variant==='wrong-device')p.deviceId='OTHER';if(variant==='wrong-operator')input.operator='OTHER';
  if(variant==='wrong-build')input.expectedSourceSha256='0'.repeat(64);if(variant==='wrong-project')b.ctx.ScriptApp.getScriptId=()=> 'OTHER';if(variant==='production')b.props.set('DOMUS_ENV','PRODUCTION');
  b.ctx.SpreadsheetApp.openById=()=>assert.fail('forbidden spreadsheet access');noWrites(b);
  if(variant==='direct-helper')assert.throws(()=>b.ctx.qaObserveOpeningServer_(input,()=>({role:'CAJA'})));else assert.throws(()=>b.ctx.executeDomusAction_(p.action,p));
 });
 await test('production bundle rejects this action without opening any book',()=>{
  const b=fixture('PRODUCTION');const token=b.login('CAJA');b.ctx.SpreadsheetApp.openById=()=>assert.fail('production book must never open');noWrites(b);
  assert.throws(()=>b.ctx.executeDomusAction_('consultarAperturaQa',{args:[{action:'turnoAbrir',requestId:'SYNTHETIC-id',deviceId:'fixture-device',operator:'QA operator',body:{requestId:'SYNTHETIC-id',scopeId:'QA',openingFloat:0,historyBoundaryId:'boundary'},localEvidenceHash:'a'.repeat(64),expectedSourceSha256:build}],requestId:'SYNTHETIC-id',role:'CAJA',deviceId:'fixture-device',sessionToken:token}));
 });
 await test('session revoked while waiting for lock is rejected before any spreadsheet access',()=>{
  const b=backend(),get=b.ctx.LockService.getScriptLock;b.ctx.LockService.getScriptLock=()=>{const lock=get(),wait=lock.waitLock;lock.waitLock=()=>{wait();b.props.delete('ses:'+b.observationToken);};return lock;};
  b.ctx.SpreadsheetApp.openById=()=>assert.fail('expired authority must not open a book');noWrites(b);assert.throws(()=>b.inspect(),/SESSION_INVALID/);assert.equal(b.locks().acquires,b.locks().releases);
 });
 await test('session revoked during capture is rejected at the final validation',()=>{
  const b=backend(),old=b.ctx.historyReadView_;b.ctx.historyReadView_=source=>{const read=old(source),check=read.assertDimensions;if(source===b.main)read.assertDimensions=()=>{check();b.props.delete('ses:'+b.observationToken);};return read;};
  const before=snapshot(b);noWrites(b);assert.throws(()=>b.inspect(),/SESSION_INVALID/);assert.equal(snapshot(b),before);
 });
 for(const variant of ['missing-token','non-native','non-staging'])await test('client refuses locally without login, alternate transport or query: '+variant,async()=>{
  const b=backend(),t=await ui(b),before=originals(t);if(variant==='missing-token')t.sessionStorage.removeItem('domus_session_token_CAJA');if(variant==='non-native')delete t.ctx.window.google;if(variant==='non-staging')t.ctx.window.DOMUS_NATIVE_BOOT.environment='PRODUCTION';
  // t.observe installs only the native transport fixture; preserve missing native in this variant.
  if(variant==='non-native')await assert.rejects(async()=>t.ctx.qaObserveUnconfirmedClient_(t.consent()));else await assert.rejects(async()=>t.observe());
  assert.equal(t.wire.length,0);assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 await test('query timeout and late ACK cannot persist, release or replay',async()=>{
  const b=backend(),t=await ui(b),before=originals(t);let expire,reply;
  t.ctx.setTimeout=(cb,ms)=>{assert.equal(ms,30000);expire=cb;return 1;};t.ctx.clearTimeout=()=>{};
  const pending=t.observe(p=>new Promise(resolve=>reply=()=>resolve(b.inspect(copy(p)))));while(!reply)await new Promise(r=>setImmediate(r));expire();
  await assert.rejects(pending,/QUERY_TIMEOUT/);reply();await new Promise(r=>setImmediate(r));
  assert.equal(t.wire.length,1);assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);
 });
 await test('session changes while a read is pending: no result is persisted and no renewal',async()=>{
  const b=backend(),t=await ui(b),before=originals(t);let reply;const pending=t.observe(p=>new Promise(resolve=>reply=()=>resolve(b.inspect(copy(p)))));while(!reply)await new Promise(r=>setImmediate(r));
  t.sessionStorage.setItem('domus_session_token_CAJA','OTHER');reply();await assert.rejects(pending,/SESSION_CHANGED/);assert.equal(t.wire.length,1);assert.equal(originals(t),before);assert.equal(t.localStorage.getItem(OBS),null);
 });
 await test('private action is not available through GET',()=>{
  const b=backend();b.ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
  b.ctx.SpreadsheetApp.openById=()=>assert.fail('GET must not read a book');const r=b.ctx.handleApiGetRequest_('consultarAperturaQa',{token:b.observationToken});assert.equal(JSON.parse(r.text).ok,false);
 });
 for(const variant of ['unchecked','cancelled','confirmed','absent','double-click'])await test('real review UI handlers with synthetic DOM: '+variant,async()=>{
  const b=backend(variant!=='absent'),t=await ui(b),before=originals(t),elements={};t.attach();noWrites(b);
  t.ctx.document={readyState:'complete',body:{innerHTML:''},getElementById:id=>elements[id] || (elements[id]={hidden:true,disabled:false,checked:false,textContent:'',value:''})};
  t.ctx.confirm=()=>variant!=='cancelled';t.load('enterOutboxReview_');t.ctx.enterOutboxReview_();await new Promise(r=>setImmediate(r));
  assert(t.ctx.document.body.innerHTML.includes('id="queueObserveOpening"'));assert.equal(elements.queueOpeningObservation.hidden,false);assert.equal(t.wire.length,0);
  t.ctx.document.getElementById('queueObservationAttested').checked=variant!=='unchecked';
  if(variant==='double-click')await Promise.all([elements.queueObserveOpening.onclick(),elements.queueObserveOpening.onclick()]);else await elements.queueObserveOpening.onclick();
  const sent=!['unchecked','cancelled'].includes(variant);assert.equal(t.wire.length,sent?1:0);assert.equal(originals(t),before);assert.equal(elements.queueReviewRelease.disabled,true);assert.equal(elements.queueJourneyRecover.disabled,true);
  if(sent){assert.equal(elements.queueObserveOpening.disabled,true);assert.equal(JSON.parse(t.localStorage.getItem(OBS)).report.status,variant==='absent'?'OBSERVED_ABSENT':'OBSERVED_CONFIRMED');}else assert.equal(t.localStorage.getItem(OBS),null);
 });
 console.log(JSON.stringify({suite:'integrated-authenticated-unconfirmed-observation',passed,realOperations:0,serverWrites:0,deployments:0,liveAuthenticityVerified:false,syntheticRealDispatcher:true}));
}
module.exports={backend,ui,originals,noWrites,snapshot,copy};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
