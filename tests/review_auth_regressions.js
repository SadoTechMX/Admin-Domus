'use strict';
// Exact client functions + unchanged server dispatcher; synthetic memory only.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {backend,ui,snapshot,copy}=require('./unconfirmed_observation_regressions');
const HELPERS=['qaReleaseKeys_','qaReleaseStorageSeal_','qaReviewSafeCode_','qaReviewErrorText_','qaReviewDiagnostics_','qaReviewUiState_','qaReviewUiRefresh_','qaReviewUiRun_','qaReauthenticateClient_'];
const TOKEN='domus_session_token_CAJA';
let passed=0;async function test(n,f){await f();passed++;console.log('PASS',n);}
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(options={}){
 const b=backend(false),t=await ui(b,options);b.manager();t.sessionStorage.removeItem(TOKEN);Object.assign(t.ctx,{AbortController});
 const source=fs.readFileSync(require('path').resolve(__dirname,options.bundle?'../google-apps-script/Index.html':'../js/app.js'),'utf8');
 for(const n of HELPERS){const start=source.search(new RegExp('  (?:async )?function '+n+'\\(')),end=source.indexOf('\n  }',start)+4;assert(start>=0,n);vm.runInContext(source.slice(start,end),t.ctx);}
 const calls=[];let handler=null;
 t.ctx.window.google={script:{run:{withSuccessHandler:resolve=>({withFailureHandler:reject=>({dispatchNativeAction:p=>{
  calls.push(copy(p));Promise.resolve().then(()=>handler?handler(copy(p)):b.ctx.dispatchNativeAction(copy(p))).then(resolve,reject);
 }})})}}};
 const c=()=>({...t.consent(),confirmGeneralSession:true});
 const run=(consent=c(),signal)=>t.ctx.qaReauthenticateClient_(consent,signal);
 const original=()=>JSON.stringify([...t.localStorage.data]);
 const attach=f=>handler=f;
 return {b,t,c,run,calls,original,attach};
}
async function main(){
 for(const bundle of [false,true])await test((bundle?'Index':'source')+': explicit manager auth only, same originals, separate subsequent observation',async()=>{
  const f=await fixture({bundle}),before=f.original(),books=snapshot(f.b),props=[...f.b.props.keys()];
  const r=await f.run();assert.deepEqual(f.calls.map(p=>p.action),['health','authCrearSesion']);assert.equal(f.calls[1].role,'CAJA');assert.equal(f.calls[1].args[3],'');
  const token=f.t.sessionStorage.getItem(TOKEN);assert(token);assert.equal(f.original(),before);assert.equal(snapshot(f.b),books);assert(!JSON.stringify(r).includes(token));
  assert.deepEqual([...f.b.props.keys()].filter(k=>!props.includes(k)),['ses:'+token]);assert.equal(f.t.sessionStorage.getItem('domus_session_token_BARRA'),'old-BARRA');
  assert.equal(f.t.localStorage.getItem('domus_outbox_review_journey_observation_v1'),null);assert.equal(JSON.parse(f.t.localStorage.getItem('domus_outbox_review_journey_v1')).state,'UNCONFIRMED');
  const result=await f.t.observe();assert.equal(result.report.status,'OBSERVED_ABSENT');assert.equal(f.original().includes(token),false);assert.equal(snapshot(f.b),books);
 });
 for(const field of ['confirmGeneralSession','destinationAttested','requestId','binding','attemptRaw'])await test('incomplete consent before network: '+field,async()=>{
  const f=await fixture(),c=f.c(),before=f.original();c[field]=typeof c[field]==='boolean'?false:'CHANGED';await assert.rejects(f.run(c));assert.equal(f.calls.length,0);assert.equal(f.original(),before);assert.equal(f.t.sessionStorage.getItem(TOKEN),null);
 });
 for(const key of ['domus_outbox_qa_absent_recovery_v1','domus_outbox_qa_release_intent_v1','domus_outbox_qa_release_archive_BAD','domus_outbox_qa_release_unknown'])await test('any later protocol artifact blocks new principal/session: '+key,async()=>{
  const f=await fixture();f.t.localStorage.setItem(key,'{');const before=f.original();await assert.rejects(f.run());assert.equal(f.calls.length,0);assert.equal(f.original(),before);
 });
 for(const kind of ['production','missing-native','missing-locks','invalid-attempt','changed-snapshot'])await test('preconditions fail closed before auth: '+kind,async()=>{
  const f=await fixture(),c=f.c();if(kind==='production')f.t.ctx.window.DOMUS_NATIVE_BOOT.environment='PRODUCTION';if(kind==='missing-native')f.t.ctx.window.google=null;if(kind==='missing-locks')f.t.ctx.window.navigator.locks=null;if(kind==='invalid-attempt')f.t.localStorage.setItem('domus_outbox_review_journey_v1','{}');if(kind==='changed-snapshot')f.t.localStorage.setItem('domus_outbox','[]');
  const before=f.original();await assert.rejects(f.run(c));assert.equal(f.calls.length,0);assert.equal(f.original(),before);
 });
 await test('Google non-manager rejected: no credential fallback, no operational calls',async()=>{
  const f=await fixture(),before=f.original();f.b.ctx.Session.getActiveUser=()=>({getEmail:()=>''});await assert.rejects(f.run());assert.deepEqual(f.calls.map(p=>p.action),['health','authCrearSesion']);assert.equal(f.t.sessionStorage.getItem(TOKEN),null);assert.equal(f.original(),before);
 });
 for(const at of ['health','authCrearSesion'])for(const kind of ['hold','session','release'])await test('change during '+at+' rejects stale reply: '+kind,async()=>{
  const f=await fixture();let changed;
  f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action===at){if(kind==='hold')f.t.localStorage.setItem('domus_outbox_review_hold_v1','CHANGED');if(kind==='session')f.t.sessionStorage.setItem(TOKEN,'SYNTHETIC_CONCURRENT');if(kind==='release')f.t.localStorage.setItem('domus_outbox_qa_release_intent_v1','CHANGED');changed=f.original();}return r;});
  await assert.rejects(f.run());assert.equal(f.original(),changed);assert.equal(f.t.sessionStorage.getItem(TOKEN),kind==='session'?'SYNTHETIC_CONCURRENT':null);assert.equal(f.calls.length,at==='health'?1:2);
 });
 for(const at of ['before','health','authCrearSesion'])await test('explicit cancellation at '+at+' never stores token or continues',async()=>{
  const f=await fixture(),a=new AbortController(),before=f.original();if(at==='before')a.abort();else f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action===at)a.abort();return r;});
  await assert.rejects(f.run(f.c(),a.signal));assert.equal(f.calls.length,at==='before'?0:at==='health'?1:2);assert.equal(f.t.sessionStorage.getItem(TOKEN),null);assert.equal(f.original(),before);
 });
 for(const field of ['role','deviceId','operator','principal','expires','created','token','extra'])await test('malformed/mismatched auth response: '+field,async()=>{
  const f=await fixture(),before=f.original();f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action==='authCrearSesion'){if(field==='role')r.data.role='GERENCIA';else if(field==='expires')r.data.expires=r.data.created+13*3600000;else if(field==='created')r.data.created=0;else if(field==='principal')r.data.principal='STATION:fixture-device';else if(field==='extra')r.data.secret='DO_NOT_SHOW';else r.data[field]='';}return r;});
  await assert.rejects(f.run());assert.equal(f.t.sessionStorage.getItem(TOKEN),null);assert.equal(f.original(),before);assert.equal(f.calls.length,2);
 });
 for(const stage of ['health','authCrearSesion'])await test('timeout at '+stage+' discards eventual success',async()=>{
  const f=await fixture(),before=f.original();let expire,late;f.t.ctx.setTimeout=fn=>{expire=fn;return 1;};f.t.ctx.clearTimeout=()=>{};
  f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action===stage)return new Promise(resolve=>late=()=>resolve(r));return r;});
  const pending=f.run();while(!late)await tick();expire();await assert.rejects(pending);late();await tick();assert.equal(f.t.sessionStorage.getItem(TOKEN),null);assert.equal(f.original(),before);assert.equal(f.calls.length,stage==='health'?1:2);
 });
 for(const after of [false,true])await test('session storage failure preserves hold and does not continue: after='+after,async()=>{
  const f=await fixture(),before=f.original(),set=f.t.sessionStorage.setItem;f.t.sessionStorage.setItem=(k,v)=>{if(k===TOKEN){if(after)set(k,v);throw Error('SYNTHETIC_QUOTA_SECRET');}return set(k,v);};
  await assert.rejects(f.run());assert.equal(f.original(),before);assert.deepEqual(f.calls.map(p=>p.action),['health','authCrearSesion']);
 });
 await test('diagnostic and arbitrary error are sanitized, no network or mutation',async()=>{
  const f=await fixture(),before=f.original();f.t.sessionStorage.setItem(TOKEN,'SECRET_DO_NOT_SHOW');const result=f.t.ctx.qaReviewDiagnostics_();
  assert(!JSON.stringify(result).includes('SECRET_DO_NOT_SHOW'));assert(!JSON.stringify(result).includes('SYNTHETIC-observe'));assert(!JSON.stringify(result).includes('fixture-device'));
  const text=f.t.ctx.qaReviewErrorText_(Error('SECRET_DO_NOT_SHOW'));assert(!String(text).includes('SECRET_DO_NOT_SHOW'));assert.equal(f.calls.length,0);assert.equal(f.original(),before);
 });

 await test('two tabs share locks: competing auth is rejected, no duplicate queued login',async()=>{
  const locks=require('./mock_web_locks')(),a=await fixture({locks}),b=await fixture({locks,storage:a.t.localStorage,existing:true});let release;
  a.attach(p=>{const r=a.b.ctx.dispatchNativeAction(p);return p.action==='authCrearSesion'?new Promise(resolve=>release=()=>resolve(r)):r;});
  const pending=a.run();while(!release)await tick();await assert.rejects(b.run(),/BUSY/);assert.equal(b.calls.length,0);release();await pending;assert.equal(a.calls.length,2);
 });
 await test('document closes during authentication: late reply cannot persist',async()=>{
  const f=await fixture(),before=f.original();f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action==='authCrearSesion'){const state=f.t.ctx.qaReviewUiState_();state.closed=true;state.generation++;}return r;});
  await assert.rejects(f.run(),/DOCUMENT_CLOSED/);assert.equal(f.t.sessionStorage.getItem(TOKEN),null);assert.equal(f.original(),before);
 });
 for(const kind of ['environment','mainSheetId','opsSheetId','source','envelope','status'])await test('incompatible health '+kind+' stops before authentication',async()=>{
  const f=await fixture(),before=f.original();f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(kind==='source')r.data.build.sourceSha256='0'.repeat(64);else if(kind==='envelope')r.role='CAJA';else r.data[kind]='CHANGED';return r;});
  await assert.rejects(f.run());assert.equal(f.calls.length,1);assert.equal(f.original(),before);assert.equal(f.t.sessionStorage.getItem(TOKEN),null);
 });
 for(const elapsed of [1,1000,1001])await test('bounded double-Date.now server interval: '+elapsed+'ms',async()=>{
  const f=await fixture();f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);if(p.action==='authCrearSesion')r.data.expires=r.data.created+43200000+elapsed;return r;});
  if(elapsed<=1000)await f.run();else await assert.rejects(f.run(),/SESSION_INVALID/);assert.equal(!!f.t.sessionStorage.getItem(TOKEN),elapsed<=1000);
 });
 for(const variant of ['diagnostic','unchecked','cancelled','auth-only','double-click','query-while-auth','pagehide'])await test('real review UI: '+variant,async()=>{
  const f=await fixture(),elements={},events={};f.t.ctx.document={readyState:'complete',body:{innerHTML:''},getElementById:id=>elements[id]||(elements[id]={hidden:true,disabled:false,checked:false,textContent:'',value:''})};
  f.t.ctx.window.addEventListener=(name,fn)=>events[name]=fn;f.t.ctx.confirm=()=>variant!=='cancelled';f.t.load('enterOutboxReview_');f.t.ctx.enterOutboxReview_();await tick();
  const before=f.original();assert.equal(f.calls.length,0);assert(f.t.ctx.document.body.innerHTML.includes('sesión CAJA general'));
  if(variant==='diagnostic'){
   elements.queueReviewDiagnose.onclick();assert.equal(f.calls.length,0);const d=JSON.parse(elements.queueReviewDiagnostic.textContent);assert.equal(d.sessionTokenPresent,false);assert.equal(d.code,'QA_OBSERVATION_EXISTING_CAJA_SESSION_REQUIRED');
  }else{
   f.t.ctx.document.getElementById('queueAuthAttested').checked=variant!=='unchecked';
   if(['query-while-auth','pagehide'].includes(variant)){
    let answer;f.attach(p=>{const r=f.b.ctx.dispatchNativeAction(p);return p.action==='authCrearSesion'?new Promise(resolve=>answer=()=>resolve(r)):r;});
    const pending=elements.queueReviewAuthenticate.onclick();while(!answer)await tick();
    if(variant==='query-while-auth'){f.t.ctx.document.getElementById('queueObservationAttested').checked=true;await elements.queueObserveOpening.onclick();assert.equal(f.calls.length,2);answer();}
    else{events.pagehide();answer();}
    await pending;
   }else if(variant==='double-click')await Promise.all([elements.queueReviewAuthenticate.onclick(),elements.queueReviewAuthenticate.onclick()]);
   else await elements.queueReviewAuthenticate.onclick();
   const sent=!['unchecked','cancelled'].includes(variant);assert.equal(f.calls.length,sent?2:0);assert(!f.calls.some(p=>!['health','authCrearSesion'].includes(p.action)));
   assert.equal(!!f.t.sessionStorage.getItem(TOKEN),sent && variant!=='pagehide');
  }
  assert.equal(f.original(),before);assert.equal(f.t.localStorage.getItem('domus_outbox_review_journey_observation_v1'),null);assert(f.t.localStorage.getItem('domus_outbox_review_hold_v1'));
 });

 for(const mode of ['EXISTING_ACK','ABSENT'])for(const denied of [false,true])await test('auth invalidates '+mode+' proposal before network even if login is denied='+denied,async()=>{
  const {t,b}=await require('./audited_release_client_regressions').client(mode),elements={};
  const el=id=>elements[id]||(elements[id]={hidden:true,disabled:false,checked:false,textContent:'',value:'',innerHTML:'',after(){},appendChild(){},replaceChildren(){}});
  t.ctx.document={getElementById:el,createElement:()=>({innerHTML:'',after(){}})};t.ctx.window.addEventListener=()=>{};t.ctx.confirm=()=>true;t.load('qaMountReleaseUi_');const status=el('status');t.ctx.qaMountReleaseUi_(status);
  if(mode==='ABSENT'){await t.observe();t.attachRelease();}
  el('qaReleaseAttested').checked=true;await el(mode==='ABSENT'?'qaPrepareAbsent':'qaPrepareAck').onclick();
  const button=el(mode==='ABSENT'?'qaRecoverAbsent':'qaReserveRelease');assert.equal(button.disabled,false);assert(el('qaReleaseProof').textContent);
  el('qaReleaseApproval').value='SYNTHETIC-old';el('qaReleaseEvidence').value='a'.repeat(64);const before=JSON.stringify([...t.localStorage.data]);
  b.ctx.Session.getActiveUser=()=>({getEmail:()=>denied?'':'sadotechfet@gmail.com'});
  t.attachRelease(p=>{if(p.action==='health'){assert.equal(button.disabled,true);assert.equal(el('qaReleaseProof').textContent,'');assert.equal(el('qaReleaseApproval').value,'');assert.equal(el('qaReleaseEvidence').value,'');}return b.ctx.dispatchNativeAction(p);});
  await t.ctx.qaReviewUiRun_(status,()=>t.ctx.qaReauthenticateClient_({...t.consent(),confirmGeneralSession:true}));
  assert.equal(button.disabled,true);el('qaReleaseApproval').value='SYNTHETIC-old';el('qaReleaseEvidence').value='a'.repeat(64);await button.onclick();
  assert.equal(JSON.stringify([...t.localStorage.data]),before);assert(!t.calls.some(p=>['reservarLiberacionQa','recuperarAperturaQaAusente'].includes(p.action)));
 });

 for(const [original,phrase,code] of [
  ['Entorno, libros o build revisado no coinciden; no se envió la apertura.','no coinciden','QA_REVIEW_LEGACY_TARGET_MISMATCH'],
  ['Google no autorizó CAJA. No se envió la apertura.','no autorizó CAJA','QA_REVIEW_LEGACY_AUTH_DENIED'],
  ['Apertura sin confirmar. Cola y retención conservadas; no hay reintento automático. Descargar evidencia y revisar antes de otra acción.','Apertura sin confirmar','QA_REVIEW_LEGACY_OPENING_UNCONFIRMED'],
  ['Entorno nativo sin acreditar; conservar revisión.','Entorno nativo sin acreditar','QA_REVIEW_LEGACY_NATIVE_UNVERIFIED']
 ])await test('legacy UI outcome remains specific without arbitrary message leakage: '+code,async()=>{
  const f=await fixture();assert.equal(f.t.ctx.qaReviewSafeCode_(Error(original)),code);assert(f.t.ctx.qaReviewErrorText_(Error(original)).includes(phrase));
  const altered=original+' SECRET_DO_NOT_SHOW';assert.equal(f.t.ctx.qaReviewSafeCode_(Error(altered)),'QA_REVIEW_UNKNOWN_ERROR');assert(!f.t.ctx.qaReviewErrorText_(Error(altered)).includes('SECRET_DO_NOT_SHOW'));assert.equal(f.calls.length,0);
 });
 console.log(JSON.stringify({suite:'held-review-authentication',passed,realOperations:0,deployments:0,backendChanged:false}));
}
module.exports={fixture,HELPERS};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
