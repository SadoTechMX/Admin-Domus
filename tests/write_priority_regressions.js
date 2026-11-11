'use strict';
// Actual client/backend functions; synthetic services only, no real IDs or retries.
const assert=require('assert/strict'),backend=require('./recovery_regressions'),{setup,tick,copy}=require('./reconciliation_regressions');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
const policy={version:1,scopes:[{id:'A',projectId:'P',projectName:'QA',eventId:'E',eventName:'QA',activity:'QA event'}],stations:[{deviceId:'fixture-device',stationId:'S',registerId:'R',scopeIds:['A']}]};
const snapshot=b=>JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([n,s])=>[n,[...s.cells]])));
function ui(){const t=setup(),timers=new Map();let next=0;
 Object.assign(t.ctx,{setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id),document:{hidden:false},DEFAULT_CATALOG:[],renderCategoryChips(){},renderAccountDropdown(){},renderJourney_(){},renderCatalog(){},updateKdsBadgeCount(){},renderComandasBoard(){}});
 t.ctx.$('cajaLockModal').classList.contains=()=>false;t.load('syncBackendData');t.load('startPolling');t.load('submitJourney_');
 t.ctx.STATE.seenOrderKeys=new Set();t.ctx.MUTATION_ACTIONS.add('turnoAbrir');t.ctx.MUTATION_ACTIONS.add('corteZCerrar');return {...t,timers};}
function attach(t,native,respond){t.load('transport_');t.ctx.STATE.isNativeGas=native;t.ctx.fetch=async(_,o)=>({json:()=>respond(JSON.parse(o.body))});t.ctx.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:bad=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(copy(p))).then(ok,bad)})})}}};t.ctx.window.google=t.ctx.google;}
(async()=>{
await test('server repro: a read holds the script lock; another execution times out before REQUESTS/journal and does not acquire ownership',()=>{
 const r=backend.setup(),w=backend.setup();w.ctx.LockService=r.ctx.LockService;w.ctx.SpreadsheetApp=r.ctx.SpreadsheetApp;
 const before=snapshot(r);let waited;
 const raw=r.ctx.LockService.getScriptLock;w.ctx.LockService={getScriptLock:()=>({...raw(),waitLock:ms=>{waited=ms;raw().waitLock(ms);}})};
 r.ctx.operationalRead_(()=>{
  assert(r.locks().held);assert.throws(()=>w.request('turnoAbrir',[{scopeId:'A',openingFloat:0}],'synthetic-lock-opening'),/transacción concurrente/);
  assert.equal(waited,30000);assert(r.locks().held);return {};
 });assert.equal(snapshot(r),before);assert.equal(r.ctx.findRequestRecord_('synthetic-lock-opening',r.main),null);assert.equal(r.locks().acquires,r.locks().releases);
});
for(const native of [false,true])await test((native?'native':'REST')+': opening waits for current read, skips its following KDS, captures $0/scope, double click and polling cannot compete',async()=>{
 const b=backend.setup();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));const t=ui(),sends=[];let release,reading=false;
 t.ctx.setSessionToken(b.login(),'CAJA');Object.assign(t.ctx.STATE,{journey:{enabled:true},seenOrderKeys:new Set()});t.ctx.$('journeyScopeSelect').value='A';t.ctx.$('journeyOpeningFloat').value='0';
 attach(t,native,p=>{
  sends.push(copy(p));if(p.action==='cajaSimpleDatos'){reading=true;return new Promise(resolve=>release=()=>{reading=false;resolve(b.ctx.dispatchNativeAction(p));});}
  if(p.action==='turnoAbrir')assert.equal(reading,false);return b.ctx.dispatchNativeAction(p);
 });
 const read=t.ctx.syncBackendData();await tick();await tick();assert(release);t.ctx.startPolling();
 t.ctx.submitJourney_(false);t.ctx.submitJourney_(false);await tick();await tick();assert.equal(t.ctx.STATE.backendWriteClaims,1);assert(!sends.some(p=>p.action==='turnoAbrir'));
 t.ctx.$('journeyOpeningFloat').value='999';t.ctx.startPolling();await t.ctx.syncBackendData();assert.equal(t.timers.size,0);
 release();await read;await tick();await tick();await tick();
 const sent=sends.filter(p=>p.action==='turnoAbrir');assert.equal(sent.length,1);assert.equal(sent[0].args[0].openingFloat,0);assert.equal(sent[0].args[0].scopeId,'A');
 assert.equal(sends.filter(p=>p.action==='comandasSimpleDatos').length,0);assert.equal(t.ctx.getOutbox().length,0);assert(t.localStorage.getItem('domus_confirmation_'+sent[0].requestId));
 // Any post-ACK read is read-only and follows the write, rather than overlapping.
 t.ctx.pauseForReview_();if(reading)release();await t.ctx.STATE.backendReadPromise;
});
for(const native of [false,true])await test((native?'native':'REST')+': lock failure keeps original RETRY across reload/automatic processing; one explicit same-ID recovery commits once',async()=>{
 const b=backend.setup();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));const t=ui(),sends=[],before=snapshot(b);let rejectLock=true;
 const raw=b.ctx.LockService.getScriptLock;b.ctx.LockService={getScriptLock:()=>({...raw(),waitLock:ms=>{if(rejectLock)throw Error('synthetic contention');return raw().waitLock(ms);}})};
 t.ctx.setSessionToken(b.login(),'CAJA');attach(t,native,p=>{if(p.action==='turnoAbrir')sends.push(copy(p));return b.ctx.dispatchNativeAction(p);});
 const body={requestId:'SYNTHETIC-opening-retry',scopeId:'A',openingFloat:0};const first=await t.call('turnoAbrir',[body]);assert.equal(first.localOutbox,true);assert.equal(snapshot(b),before);
 const original=copy(t.ctx.getOutbox()[0]);assert.equal(original.status,'RETRY');assert.equal(original.errorStatus,500);assert.equal(b.ctx.findRequestRecord_(body.requestId,b.main),null);
 const reload=ui();reload.ctx.localStorage=t.localStorage;reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,p=>{if(p.action==='turnoAbrir')sends.push(copy(p));return b.ctx.dispatchNativeAction(p);});
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();await reload.ctx.processOutbox();assert.equal(sends.length,1);assert.deepEqual(copy(reload.ctx.getOutbox()[0]),original);
 rejectLock=false;await reload.ctx.sincronizarOutboxCore_(body.requestId);assert.equal(sends.length,2);assert.deepEqual(sends[1].args,sends[0].args);assert.equal(sends[1].requestId,sends[0].requestId);assert.equal(sends[1].deviceId,sends[0].deviceId);assert.equal(sends[1].role,sends[0].role);
 assert.equal(reload.ctx.getOutbox().length,0);const committed=snapshot(b);await reload.ctx.sincronizarOutboxCore_(body.requestId);assert.equal(sends.length,2);assert.equal(snapshot(b),committed);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
});
await test('review pause stays set after late read finally/start/manual/online recovery; no KDS continuation or automatic mutation',async()=>{
 const t=ui();let release;const calls=[];t.ctx.callBackend=(a,_,ok)=>{calls.push(a);release=ok;};
 const read=t.ctx.syncBackendData();t.ctx.startPolling();await tick();const paused=t.ctx.pauseForReview_();assert.equal(paused.readInFlight,true);assert.equal(paused.cancelledServerExecutions,false);
 release({phase:'Solar'});await read;t.ctx.startPolling();await t.ctx.syncBackendData();await t.ctx.processOutbox();assert.equal(t.timers.size,0);assert.deepEqual(calls,['cajaSimpleDatos']);assert.equal(t.ctx.STATE.phase,undefined);
});
await test('pause while a write waits cancels only the unsent continuation; failed read also prevents dispatch',async()=>{
 for(const pause of [false,true]){const t=ui();let release,sent=0;t.ctx.callBackend=(a,_,ok,fail)=>release=pause?ok:fail;
 const read=t.ctx.syncBackendData();await tick();const write=t.ctx.withOperationalWrite_(()=>sent++);write.catch(()=>{});
 if(pause){t.ctx.pauseForReview_();release({});}else release(Error('Synthetic read failure'));
 await read;await assert.rejects(write);assert.equal(sent,0);assert.equal(t.ctx.STATE.backendWriteClaims,0);
 }
});
await test('failed read leaves the explicitly selected pending journey byte-for-byte intact without changing attempts or status',async()=>{
 const t=ui(),q={...t.item('SYNTHETIC-still-pending'),action:'turnoAbrir',args:[{requestId:'SYNTHETIC-still-pending',scopeId:'A',openingFloat:0}],attempts:1};await t.seed([q]);
 const before=t.localStorage.getItem('domus_outbox');let fail;t.ctx.callBackend=(_,__,___,error)=>fail=error;
 const read=t.ctx.syncBackendData();await tick();const retry=t.ctx.sincronizarOutboxCore_(q.requestId);retry.catch(()=>{});await tick();
 fail(Error('Synthetic read timeout'));await read;await assert.rejects(retry,/consulta previa falló/);assert.equal(t.localStorage.getItem('domus_outbox'),before);assert.equal(t.calls.length,0);
});
await test('explicit recovery rechecks the exact displayed intent after waiting; changed payload is preserved and never sent',async()=>{
 const t=ui(),q={...t.item('SYNTHETIC-changed'),action:'turnoAbrir',args:[{requestId:'SYNTHETIC-changed',scopeId:'A',openingFloat:0}]};await t.seed([q]);let release;t.ctx.callBackend=(_,__,ok)=>release=ok;
 const read=t.ctx.syncBackendData();await tick();const retry=t.ctx.sincronizarOutboxCore_(q.requestId,t.ctx.outboxIntentIdentity_(q));retry.catch(()=>{});await tick();
 const changed=copy(q);changed.args[0].openingFloat=99;await t.seed([changed]);const before=t.localStorage.getItem('domus_outbox');release({});await read;
 await assert.rejects(retry,/intención cambió/);assert.equal(t.calls.length,0);assert.equal(t.localStorage.getItem('domus_outbox'),before);
});
await test('two local write claims serialize; no poll can start between them',async()=>{
 const t=ui(),order=[];let firstDone;t.ctx.startPolling();const a=t.ctx.withOperationalWrite_(()=>new Promise(r=>{order.push('A');firstDone=r;}));const b=t.ctx.withOperationalWrite_(()=>order.push('B'));
 await tick();assert.deepEqual(order,['A']);t.ctx.scheduleBackendPoll_();assert.equal(t.timers.size,0);firstDone();await Promise.all([a,b]);assert.deepEqual(order,['A','B']);assert.equal(t.ctx.STATE.backendWriteClaims,0);assert.equal(t.timers.size,1);
});
await test('a post-write refresh exception cannot reclassify a confirmed opening or restore its queue entry',async()=>{
 const b=backend.setup();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));const t=ui();t.ctx.setSessionToken(b.login(),'CAJA');attach(t,false,p=>b.ctx.dispatchNativeAction(p));
 t.ctx.STATE.backendRefreshWanted=true;t.ctx.syncBackendData=()=>{throw Error('Synthetic presentation failure');};
 const result=await t.call('turnoAbrir',[{requestId:'SYNTHETIC-confirmed-refresh',scopeId:'A',openingFloat:0}]);await tick();
 assert.equal(result.openingRequestId,'SYNTHETIC-confirmed-refresh');assert.equal(result.localOutbox,undefined);assert.equal(t.ctx.getOutbox().length,0);assert(t.localStorage.getItem('domus_confirmation_SYNTHETIC-confirmed-refresh'));
});
await test('manual and automatic recovery cannot send or rewrite CONFIRMED, REQUIRES_REVIEW or REJECTED',async()=>{
 const t=ui();for(const status of ['CONFIRMED','REQUIRES_REVIEW','REJECTED']){
  const q={...t.item('SYNTHETIC-'+status),action:'turnoAbrir',status,args:[{requestId:'SYNTHETIC-'+status,scopeId:'A',openingFloat:0}]};await t.seed([q]);const before=t.localStorage.getItem('domus_outbox');
  await t.ctx.sincronizarOutboxCore_();await t.ctx.sincronizarOutboxCore_(q.requestId,t.ctx.outboxIntentIdentity_(q));assert.equal(t.localStorage.getItem('domus_outbox'),before);assert.equal(t.calls.length,0);
 }
});
await test('UI manual recovery names original ID and amount; cancellation sends nothing; ambiguous multiple journeys stay held',async()=>{
 const t=ui(),q={...t.item('SYNTHETIC-manual'),action:'turnoAbrir',args:[{requestId:'SYNTHETIC-manual',scopeId:'A',openingFloat:0}]};await t.seed([q]);let prompt,sent=[];t.ctx.confirm=text=>{prompt=text;return false;};t.ctx.processOutbox=id=>sent.push(id);
 t.ctx.retryOutboxFromUi_();assert(prompt.includes(q.requestId));assert(prompt.includes('$0'));assert.deepEqual(sent,[]);t.ctx.confirm=()=>true;t.ctx.retryOutboxFromUi_();assert.deepEqual(sent,[q.requestId]);
 await t.seed([q,{...q,requestId:'SYNTHETIC-other'}]);t.ctx.retryOutboxFromUi_();assert.deepEqual(sent,[q.requestId]);
});
console.log(JSON.stringify({suite:'write-priority-and-manual-journey-recovery',passed,liveGoogle:false,realIdsUsed:false,productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
