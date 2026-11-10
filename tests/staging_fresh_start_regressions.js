'use strict';
// Actual modules/dispatcher/bundles, entirely synthetic books and local storage.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {fixture:base}=require('./staging_opening_isolation_regressions');
const copy=v=>JSON.parse(JSON.stringify(v));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const denied=e=>/HISTORY_|JOURNAL_|LEDGER_|JOURNEY_|IDEMPOTENCY_/.test(e.code||'');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
function fixture(environment){
 const t=base(environment);
 if(!environment)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/Build.gs'),'utf8'),t.ctx);
 const row=(id,action,status)=>[id,action,'a'.repeat(64),'old-fixture-device',status,'2020-01-01T00:00:00.000Z','',JSON.stringify({error:'Effects unknown, synthetic only'})];
 t.s.getRange(2,1,5,8).setValues([row('old-uncertain','cajaSimpleRegistrar','FAILED'),row('old-uncertain','cajaSimpleRegistrar','COMPLETED'),
  row('old-command','comandasSimpleAccion','FAILED'),row('old-complete','cajaSimpleRegistrar','COMPLETED'),row('old-failed-pair','cajaSimpleRegistrar','FAILED')]);
 t.s.getRange(7,1,1,8).setValues([row('old-failed-pair','cajaSimpleRegistrar','FAILED')]);
 t.input.isolationMode=t.ctx.stagingFreshStartMode_();
 t.input.backup={reference:'SYNTHETIC private archive only',sha256:'b'.repeat(64)};
 t.input.queue=[{requestId:'old-uncertain',action:'cajaSimpleRegistrar'},{requestId:'old-complete',action:'cajaSimpleRegistrar'},
  {requestId:'queued-absent',action:'cajaSimpleRegistrar'}];
 t.input.stationDeviceIds.push('old-fixture-device');
 t.approve=()=>{
  const p=t.propose();t.props.set('DOMUS_STAGING_FRESH_START_APPROVAL_V1',JSON.stringify({version:1,mode:t.ctx.stagingFreshStartMode_(),approved:true,
   snapshotHash:p.snapshotHash,approvalReference:'SYNTHETIC exact approval only',confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true,
   confirmBackupVerified:true,backupSha256:t.input.backup.sha256}));
  return {...copy(t.input),snapshotHash:p.snapshotHash,confirmStationsHeld:true,acknowledgeUnresolvedHistory:true,confirmLegacyTestWriterDisabled:true,
   acceptUnattributedEffectsUnresolved:true,confirmBackupVerified:true};
 };
 t.activate=()=>{t.body=t.approve();return t.call('registrarLimiteHistorico',t.body,'fixture-isolation');};
 t.sell=(extra={})=>{const p=t.sale({openingRequestId:'fixture-new-open',...extra});return t.call('cajaSimpleRegistrar',p,p.id,'CAJA');};
 return t;
}
for(const env of [undefined,'STAGING'])test((env||'modules')+': one read-only proposal and one boundary preserve history/stock/float and separate new opening/cut',()=>{
 const t=fixture(env),before=snapshot(t),b=business(t),prefix=t.s.getRange(1,1,139,8).getValues(),p=t.propose();
 assert.equal(snapshot(t),before);assert.equal(p.kind,'STAGING_FRESH_START_PROPOSAL');assert.equal(p.canActivate,false);
 assert.equal(p.snapshot.counts.uncertainIds,10);assert.equal(p.snapshot.counts.duplicateIds,2);assert.equal(p.snapshot.counts.queueAbsent,1);
 assert.equal(p.snapshot.freshStart.backup.sha256,'b'.repeat(64));assert.equal(p.snapshot.freshStart.backendSourceSha256,vm.runInContext('BACKEND_BUILD.sourceSha256',t.ctx));
 const f=t.activate();assert.equal(f.kind,'STAGING_FRESH_START_BOUNDARY');assert.equal(f.resolved,false);assert.equal(f.newCharge,0);assert.equal(business(t),b);
 assert.equal(t.ctx.historyOperationalIndex_(t.main).size,1);assert.equal(t.ctx.paymentRequestIndex_(t.main).size,14);
 const o=t.call('turnoAbrir',{scopeId:'QA',openingFloat:123,historyBoundaryId:'fixture-isolation'},'fixture-new-open','CAJA');
 assert.equal(o.openingFloat,123);assert.equal(o.historyReview.mode,'STAGING_FRESH_START_V1');assert.equal(o.historyReview.counts.uncertainIds,10);
 const c=t.cut();assert.equal(c.financialFinal,false);assert.equal(c.snapshot.movements.length,0);assert.equal(c.snapshot.historyReview.resolved,false);
 assert.equal(business(t),b);assert.deepEqual(t.s.getRange(1,1,139,8).getValues(),prefix);assert.equal(t.main.getSheetByName('TURNOS').raw(2,12),'OPEN');
 assert.deepEqual(t.call('registrarLimiteHistorico',t.body,'fixture-isolation'),f);assert.equal(t.locks().acquires,t.locks().releases);
});
test('the previous nine-only mode still blocks unrelated legacy failures and rejects queues',()=>{
 const t=fixture();t.input.isolationMode=t.ctx.stagingIsolationMode_();assert.throws(t.propose,denied);
 t.input.queue=[];const original=base();original.s.getRange(2,1,1,8).setValues([t.s.getRange(2,1,1,8).getValues()[0]]);
 original.activate();assert.throws(original.open,/intenciones inciertas/);
});
test('unknown status or a modern historical journey is never excluded merely because it is old',()=>{
 for(const state of ['PROCESSING','REQUIRES_REVIEW','','modern-journey']){
  const t=fixture();if(state==='modern-journey')t.s.getRange(2,8).setValue('{"journey":{"openingRequestId":"prior"}}');else t.s.getRange(2,5).setValue(state);
  const before=snapshot(t);assert.throws(t.propose,denied);assert.equal(snapshot(t),before);
 }
});
test('administrative identity/device collisions with full history or queue reject before a ledger write',()=>{
 for(const variant of ['old-uncertain-retry','queued-absent-retry','device']){
  const t=fixture(),before=snapshot(t),id=variant==='device'?'new-admin':variant,device=variant==='device'?'prefix queued-absent':'fixture-device';
  assert.throws(()=>t.ctx.idempotentExecute_(id,'registrarLimiteHistorico',t.input,device,()=>assert.fail('must not execute')),denied);assert.equal(snapshot(t),before);
 }
});
for(const change of [p=>delete p.backup,p=>p.backup.sha256='invalid',p=>p.backup.reference=' ',p=>p.queue[2].requestId='bad#part:0',p=>p.stationDeviceIds=[]])
 test('incomplete backup/queue/station evidence rejects proposal without writes',()=>{
  const t=fixture();change(t.input);const before=snapshot(t);assert.throws(t.propose,denied);assert.equal(snapshot(t),before);
 });
for(const variant of ['absent','general','nine-only','wrong-mode','wrong-backup','unverified','body-unverified','missing-writer-flag'])
 test('fresh activation requires its own exact approval: '+variant,()=>{
  const t=fixture(),body=t.approve(),key='DOMUS_STAGING_FRESH_START_APPROVAL_V1',a=JSON.parse(t.props.get(key)),b=business(t);
  if(['absent','general','nine-only'].includes(variant)){
   t.props.delete(key);if(variant!=='absent')t.props.set(variant==='general'?'DOMUS_HISTORY_BOUNDARY_APPROVAL_V1':'DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1',JSON.stringify(a));
  }else if(variant==='body-unverified')body.confirmBackupVerified=false;
  else {if(variant==='wrong-mode')a.mode=t.ctx.stagingIsolationMode_();if(variant==='wrong-backup')a.backupSha256='c'.repeat(64);
   if(variant==='unverified')a.confirmBackupVerified=false;if(variant==='missing-writer-flag')a.confirmLegacyTestWriterDisabled=false;t.props.set(key,JSON.stringify(a));}
  assert.throws(()=>t.call('registrarLimiteHistorico',body,'unapproved-boundary'),denied);assert.equal(business(t),b);assert.equal(t.ctx.journalFind_('unapproved-boundary',t.main),null);
 });
for(const alter of [t=>t.s.getRange(2,8).setValue('changed'),t=>t.main.getSheetByName('COBROS').put(7,6,99),
 t=>t.ops.getSheetByName('RESURTIDO').put(1,1,'changed'),t=>t.input.backup.sha256='d'.repeat(64)])
 test('stale ledger/commercial evidence/ops/backup invalidates exact approval without commercial writes',()=>{
  const t=fixture(),body=t.approve();alter(t);if(body.backup.sha256!==t.input.backup.sha256)body.backup=copy(t.input.backup);
  const b=business(t);assert.throws(()=>t.call('registrarLimiteHistorico',body,'stale-boundary'),denied);assert.equal(business(t),b);assert.equal(t.ctx.journalFind_('stale-boundary',t.main),null);
 });
test('production or another script cannot propose/register this mode, even with copied approval',()=>{
 for(const variant of ['PRODUCTION','wrong-project']){
  const t=fixture(variant==='PRODUCTION'?variant:undefined);if(variant==='wrong-project')t.ctx.ScriptApp.getScriptId=()=> 'different-script';
  const before=snapshot(t);assert.throws(t.propose,denied);assert.throws(()=>t.call('registrarLimiteHistorico',t.input,'wrong-environment'),denied);assert.equal(snapshot(t),before);
 }
});
test('all retained IDs, aliases, shifts and absent queued IDs reject ACK/replay before any binding',()=>{
 const t=fixture();t.activate();const before=snapshot(t),ids=t.ids.concat(t.aliases,t.shiftIds,['old-uncertain','old-command','old-complete','old-failed-pair','queued-absent']);
 for(const id of ids){
  assert.throws(()=>t.ctx.idempotentExecute_(id,'cajaSimpleRegistrar',{},'fixture-device',()=>assert.fail('must not run')),denied);
  assert.throws(()=>t.call('cajaSimpleEstado',id,'read-state'),denied);assert.throws(()=>t.ctx.journalResume_(id,'cajaSimpleRegistrar',t.main),denied);
 }
 assert.equal(snapshot(t),before);assert.deepEqual(copy(t.ctx.paymentRequestIndex_(t.main).get('old-uncertain').map(r=>r[4])),['FAILED','COMPLETED']);
});
test('old references under a new ID including decoded Unicode, aliases and server output remain unbound',()=>{
 const t=fixture();t.activate();const before=snapshot(t);
 for(const body of [{memo:'prefix queued-absent suffix'},{memo:'  {"id":"old-\\u0063omplete"}'},{openingRequestId:t.aliases[0]}])
  assert.throws(()=>t.call('cajaSimpleRegistrar',body,'different-new-id','CAJA'),denied);
 for(const result of [{openedBy:'Operator old-uncertain'},{shiftId:'TURNO-queued-absent'}])
  assert.throws(()=>t.ctx.idempotentExecute_('different-new-id','turnoAbrir',{},'fixture-device',()=>t.ctx.journalCommit_('different-new-id','turnoAbrir',t.main,[],result)),denied);
 assert.equal(snapshot(t),before);assert.equal(t.state().active,null);
});
for(const variant of ['PREPARED','missing-root-id','orphan-part','incomplete-parts','unknown-status'])
 test('active or malformed journal before activation stays visible and blocks: '+variant,()=>{
  const t=fixture(),j=t.ctx.journalSheet_(t.main);
  if(variant==='orphan-part')j.appendRow(['old-complete#part:0','JOURNAL_PART','COMPLETED','[]','','']);
  else j.appendRow([variant==='missing-root-id'?'':'old-complete','cajaSimpleRegistrar',variant==='unknown-status'?'UNKNOWN':variant==='incomplete-parts'?'COMPLETED':'PREPARED',JSON.stringify({parts:variant==='incomplete-parts'?1:0}),'{}','']);
  const before=snapshot(t);assert.throws(t.propose,denied);assert.equal(snapshot(t),before);
 });
test('blank journal rows are legitimate; completed root is frozen and never replayed as a new operation',()=>{
 const t=fixture(),j=t.ctx.journalSheet_(t.main);j.appendRow(['old-complete','cajaSimpleRegistrar','COMPLETED','{"parts":0}','{}','']);j.appendRow(['','','','','','']);
 const before=j.getRange(1,1,3,6).getValues();t.activate();t.open();assert.deepEqual(j.getRange(1,1,3,6).getValues(),before);
 assert.throws(()=>t.ctx.journalResume_('old-complete','cajaSimpleRegistrar',t.main),denied);assert.equal(t.cut().status,'CLOSED');
});
test('new unknown request, active journal or orphan after boundary blocks opening/cut without altering history',()=>{
 for(const variant of ['request','PREPARED','orphan','completed-ledger','non-POS']){
  const t=fixture();t.activate();t.open();
  const action=variant==='non-POS'?'inventarioAjustar':'cajaSimpleRegistrar';
  if(variant!=='orphan')t.s.appendRow(['new-uncertain',action,'a'.repeat(64),'fixture-device',variant==='completed-ledger'?'COMPLETED':'REQUIRES_REVIEW','','','{}']);
  if(variant!=='request')t.ctx.journalSheet_(t.main).appendRow([variant==='orphan'?'':'new-uncertain',action,'PREPARED','{"parts":0}','{}','']);
  const before=snapshot(t);assert.throws(t.cut,denied);assert.equal(snapshot(t),before);
 }
});
test('a second boundary, changed frozen evidence or appended historical identity cannot be adopted',()=>{
 const t=fixture();t.activate();assert.throws(t.propose,denied);assert.throws(()=>t.call('registrarLimiteHistorico',t.body,'second-boundary'),denied);
 for(const variant of ['duplicate','original']){
  const u=fixture();u.activate();if(variant==='duplicate')u.s.appendRow(['queued-absent','cajaSimpleRegistrar','x','old-fixture-device','COMPLETED','','','{}']);else u.s.getRange(2,8).setValue('changed');
  const before=snapshot(u);assert.throws(u.open,denied);assert.equal(snapshot(u),before);
 }
});
test('legacy account and receipt cannot become credit or a new payment in the fresh journey',()=>{
 const t=fixture();t.activate();t.open();const cash=t.main.getSheetByName('CAJA 2'),row=Array(32).fill('');
 Object.assign(row,{0:'legacy-unit',1:'legacy-account',4:'QA',6:'QA drink',7:1,9:40,11:40});cash.getRange(7,1,1,32).setValues([row]);const before=snapshot(t);
 assert.throws(()=>t.sell({ticket:'legacy-account',items:[]}),/sin jornada de origen/);assert.equal(snapshot(t),before);
 for(const action of ['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'])assert.throws(()=>t.call(action,{sourceRequestId:'old-complete'},'new-resolution'),denied);
 assert.equal(snapshot(t),before);
});
test('new partial sale requires same-ID recovery; transfer and command still block close',()=>{
 const t=fixture();t.activate();t.open();const p=t.sale({id:'new-sale',openingRequestId:'fixture-new-open',method:'Transferencia'}),cob=t.main.getSheetByName('COBROS');cob.failAt='7:11';
 const sell=()=>t.call('cajaSimpleRegistrar',p,p.id,'CAJA');assert.throws(sell,/INJECTED_WRITE_FAILURE/);assert.throws(t.cut,/journal incompleto/);
 const r=sell();assert.deepEqual(sell(),r);assert.equal(cob.getLastRow(),7);assert.equal(r.journey.historyBoundaryId,'fixture-isolation');assert.equal(r.verified,false);
 assert.throws(t.cut,/transferencia.*comanda/);assert.equal(t.ctx.kdsDeliveryDecision_(t.main,JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13))).allowed,false);
});
test('new paid sale, delivery and limited cut count once without adopting old balances or closing original shifts',()=>{
 const t=fixture('STAGING');t.activate();t.open();const r=t.sell({id:'paid-new-sale'});
 assert.throws(t.cut,/comanda/);assert.equal(r.journey.historyBoundaryId,'fixture-isolation');
 const inv=t.main.getSheetByName('INVENTARIO'),value=inv.value.bind(inv);inv.put(7,7,'=SUMIF(QA)');inv.put(7,8,'=D7-G7');inv.value=(r,c)=>r===7&&c===8?10:value(r,c);
 const token=t.ctx.executeDomusAction_('authCrearSesion',{args:['BARRA','QA operator','fixture-device','fixture-secret'],role:'BARRA',deviceId:'fixture-device'}).result.token;
 for(const step of ['TOMAR','LISTA','ENTREGAR'])t.ctx.executeDomusAction_('comandasSimpleAccion',{args:[{key:'DCS-7-'+r.sourceRequestId,action:step}],requestId:'command-'+step,role:'BARRA',deviceId:'fixture-device',sessionToken:token});
 const cut=t.cut();assert.equal(cut.snapshot.totals.Efectivo,40);assert.equal(cut.snapshot.movements.length,1);assert.equal(cut.financialFinal,false);
 assert.equal(cut.snapshot.historyReview.counts.uncertainIds,10);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),7);
 assert.deepEqual(t.cut(),cut);assert.equal(t.main.getSheetByName('TURNOS').raw(2,12),'OPEN');assert.equal(inv.raw(7,4),10);
});
test('registration, new binding and cut serialize under one script lock',()=>{
 const t=fixture(),other=fixture();other.ctx.LockService=t.ctx.LockService;const commit=t.ctx.journalCommit_;let attempts=0;
 t.ctx.journalCommit_=(id,action,...args)=>{if(['registrarLimiteHistorico','corteZCerrar'].includes(action)){
  assert(t.locks().held);assert.throws(other.open,/transacción concurrente/);attempts++;
 }return commit(id,action,...args);};
 t.activate();t.open();t.cut();assert.equal(attempts,2);assert.equal(t.locks().acquires,t.locks().releases);
});
test('partial administrative commit blocks operation and recovers only the same ID without duplicating the boundary',()=>{
 const t=fixture(),body=t.approve(),b=business(t);let once=true;
 t.ctx.SpreadsheetApp.flush=()=>{const j=t.ctx.journalFind_('fixture-isolation',t.main);if(once && j && j.data[2]==='PREPARED'){once=false;throw Error('STOP_BOUNDARY');}};
 const call=()=>t.call('registrarLimiteHistorico',body,'fixture-isolation');assert.throws(call,/STOP_BOUNDARY/);assert.throws(t.open,denied);
 const r=call();assert.deepEqual(call(),r);assert.equal(business(t),b);assert.equal(t.open().historyBoundaryId,'fixture-isolation');
});
(async()=>{
 const client=require('./reconciliation_regressions');
 for(const native of [false,true]){
  const b=fixture();b.activate();const t=client.setup(),sent=[];
  t.ctx.setSessionToken(b.login(),'CAJA');t.ctx.STATE.cart=[{sku:'QA-01',name:'QA drink',qty:1,price:40}];
  const respond=p=>{if(p.action!=='health')sent.push(client.copy(p));return b.ctx.dispatchNativeAction(client.copy(p));};
  const attach=u=>{u.load('transport_');u.ctx.STATE.isNativeGas=native;u.ctx.fetch=async(_,o)=>({json:()=>respond(JSON.parse(o.body))});
   u.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(client.copy(p))).then(success,failure)})})}}};u.ctx.window.google=u.ctx.google;};
  attach(t);const draft=t.ctx.saleDraftSnapshot_(),before=business(b);await assert.rejects(t.call('cajaSimpleRegistrar',[b.sale({id:'queued-absent'})]),denied);await client.tick();
  assert.equal(t.ctx.getOutbox()[0].status,'REQUIRES_REVIEW');assert.equal(t.ctx.getOutbox()[0].requestId,'queued-absent');assert.equal(t.ctx.saleDraftSnapshot_(),draft);
  assert.equal(t.localStorage.getItem('domus_confirmation_queued-absent'),null);assert.equal(business(b),before);
  const reload=client.setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload);
  await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(sent.length,1);assert.equal(reload.ctx.getOutbox()[0].requestId,'queued-absent');
  assert.equal(b.ctx.paymentRequestIndex_(b.main).has('queued-absent'),false);passed++;console.log('PASS '+(native?'native':'REST')+': retained queue has no ACK, no rebind, no automatic replay after reload');
 }
 console.log(JSON.stringify({suite:'staging-fresh-start-real-source-mocks',passed,liveReads:false,liveWrites:0,realActivation:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
