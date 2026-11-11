'use strict';
// Actual companions, dispatcher, RBAC, idempotency and journal; synthetic only.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const {fixture:base}=require('./staging_uncertain_retention_regressions');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),copy=v=>JSON.parse(JSON.stringify(v));
const files=['StagingRetentionApproval','StagingRetentionReadView','StagingFreshStartAdmin','StagingFreshStartBridge','StagingFreshStartRead'];
const sources=Object.fromEntries(files.map(f=>[f,read('scripts/apps-script-admin/'+f+'.gs')]));
const pin='5c0b3a75ba2653d8255ff05159c5d6a679696d189db9cc3e57455fee0c31cd90',key='DOMUS_STAGING_FRESH_START_APPROVAL_V1';
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function fixture(env){
 const t=base(env==='V16'?'STAGING':env);
 if(env==='V16'){
  const code=fs.readFileSync(process.env.DOMUS_TEST_LEGACY_BUNDLE,'utf8');
  assert.equal(crypto.createHash('sha256').update(code).digest('hex'),'8ae96ee6cf60332cafbadbf902d2a4501bfe7d7d7dfe32e3ef26dc0ff5bbcf07');
  t.ctx=vm.createContext({...t.ctx});t.ctx.historyReadView_=undefined;vm.runInContext(code,t.ctx);
 }
 t.allowRetention();const proposal=t.propose();
 t.ctx.Session.getEffectiveUser=()=>({getEmail:()=>t.ctx.Session.getActiveUser().getEmail()});
 let now=Date.now();class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 t.advance=ms=>now+=ms;t.ctx.Date=Clock;t.logs=[];t.ctx.console={log:s=>t.logs.push(s),error:()=>{},warn:()=>{}};
 for(const [name,s] of Object.entries(sources)){if(name==='StagingRetentionApproval')require('./admin_fixture_build_pin')(t.ctx,s);else vm.runInContext(s,t.ctx);}
 assert.equal(t.ctx.domusInicioHuella_(),pin);t.authorize=()=>t.ctx.domusInicioHuella_=()=>proposal.snapshotHash;t.authorize();
 t.window={principal:'direccion@domusccc.net',issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+300000).toISOString()};
 t.ctx.domusInicioVentana_=()=>t.window;
 t.inputAdmin={artifact:{format:'DOMUS_STAGING_FRESH_START_PROPOSAL_V2',proposal:copy(proposal),input:copy(t.input)},
  approvalReference:'SYNTHETIC Steven authorization',confirmStationsHeld:true,confirmBackupVerified:true,confirmLegacyTestWriterDisabled:true,
  acceptUnattributedEffectsUnresolved:true,acknowledgeUnresolvedHistory:true,confirmPropertyWritersStopped:true,confirmSingleActivation:true};
 t.ctx.domusInicioEntrada_=()=>t.inputAdmin;
 t.writes=[];t.ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>t.props.has(k)?t.props.get(k):null,setProperty:(k,v)=>{assert(t.locks().held);t.writes.push([k,v]);t.props.set(k,v);}});
 t.calls=[];const execute=t.ctx.executeDomusAction_;t.ctx.executeDomusAction_=(action,...args)=>{t.calls.push(action);return execute(action,...args);};
 t.approve=(...a)=>t.ctx.domusAprobarInicioNuevoTemporal(...a);t.activate=(...a)=>t.ctx.domusActivarInicioNuevoTemporal(...a);t.inspect=(...a)=>t.ctx.domusVerificarInicioNuevoTemporal(...a);
 return t;
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const envs=[undefined,'STAGING'];if(process.env.DOMUS_TEST_LEGACY_BUNDLE)envs.push('V16');
for(const env of envs){
 test((env||'modules')+': exact approval then authenticated one-shot activation, stable ID and durable read-only verification',()=>{
  const t=fixture(env),before=snapshot(t),b=business(t),props=new Map(t.props),prefix=t.s.getRange(1,1,t.s.getLastRow(),8).getValues(),snapshotFn=t.ctx.historySnapshot_;
  assert.equal(t.inspect().status,'ABSENT');assert.equal(t.writes.length,0);assert.equal(t.approve().status,'APPROVED_NOT_STARTED');
  assert.equal(snapshot(t),before);assert.deepEqual(t.writes.map(x=>x[0]),[key]);assert.equal(t.approve().status,'EXISTING_PRESERVED');
  const id=t.ctx.domusInicioId_(),r=t.activate();assert.equal(r.status,'ACTIVATED_VERIFIED');assert.equal(r.verified,true);assert.equal(r.requestId,id);
  assert.deepEqual(t.calls,['authCrearSesion','registrarLimiteHistorico']);assert.equal(business(t),b);
  assert.deepEqual(t.s.getRange(1,1,prefix.length,8).getValues(),prefix);assert.equal(t.ctx.historySnapshot_,snapshotFn);assert.equal(vm.runInContext('_authContext',t.ctx),null);
  for(const [k,v] of props)assert.equal(t.props.get(k),v);const added=[...t.props.keys()].filter(k=>!props.has(k));assert.equal(added.filter(k=>k===key).length,1);assert.equal(added.filter(k=>k.startsWith('ses:')).length,1);assert.equal(added.length,2);
  const after=snapshot(t),writes=t.writes.length;assert.equal(t.activate().status,'ACTIVATED_VERIFIED');assert.equal(t.inspect().status,'ACTIVATED_VERIFIED');assert.equal(t.writes.length,writes);assert.equal(snapshot(t),after);assert.equal(t.calls.length,2);
  assert(!JSON.stringify(t.logs).includes('DOMUS-SES-'));assert(!JSON.stringify(t.logs).includes('DO_NOT_EXPORT_PRIVATE_BODY'));assert(!JSON.stringify(r).includes('snapshot":'));
  assert.equal(t.ctx.historyBoundary_(t.main).result.newCharge,0);assert.equal(t.locks().acquires,t.locks().releases);
 });
 test((env||'modules')+': partial journal keeps the attempt latch and never replays on another activation click',()=>{
  const t=fixture(env);t.approve();let once=true;t.ctx.SpreadsheetApp.flush=()=>{const j=t.main.getSheetByName('DOMUS_JOURNAL');if(once&&j&&j.raw(j.getLastRow(),3)==='PREPARED'){once=false;throw Error('SYNTHETIC_PARTIAL');}};
  const snapshotFn=t.ctx.historySnapshot_;assert.equal(t.activate().ok,false);assert.equal(t.ctx.historySnapshot_,snapshotFn);
  const s=t.inspect();assert.equal(s.verified,false);assert.equal(s.newCharge,null);assert.equal(s.inventoryMovement,null);assert.equal(s.requestStatus,'REQUIRES_REVIEW');assert.equal(s.journalStatus,'PREPARED');
  const after=snapshot(t),writes=t.writes.length,calls=t.calls.length;assert.equal(t.activate().ok,false);assert.equal(snapshot(t),after);assert.equal(t.writes.length,writes);assert.equal(t.calls.length,calls);
 });
}
for(const variant of ['unauthenticated','effective-other','non-manager','wrong-principal','app-context','project','expired','future','too-long','blank-window'])test('identity, environment and start window reject without writes: '+variant,()=>{
 const t=fixture();if(variant==='unauthenticated')t.ctx.Session.getActiveUser=()=>({getEmail:()=>''});
 if(variant==='effective-other')t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'someone@example.test'});
 if(variant==='non-manager')t.ctx.Session.getActiveUser=()=>({getEmail:()=> 'someone@example.test'});
 if(variant==='wrong-principal')t.window.principal='someone@example.test';if(variant==='app-context')vm.runInContext('_authContext={role:"GERENCIA"}',t.ctx);
 if(variant==='project')t.ctx.ScriptApp.getScriptId=()=> 'OTHER';if(variant==='expired')t.advance(300000);if(variant==='future')t.window.issuedAt=t.window.expiresAt;
 if(variant==='too-long')t.window.expiresAt=new Date(Date.now()+3600000).toISOString();if(variant==='blank-window')vm.runInContext(sources.StagingFreshStartBridge,t.ctx);
 const before=snapshot(t);assert.equal(t.approve().ok,false);assert.equal(t.activate().ok,false);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
for(const arg of [undefined,null,'OTHER',{requestId:'OTHER',sessionToken:'DO_NOT_LOG'}])test('public calls reject every supplied argument without effect: '+typeof arg,()=>{
 const t=fixture();assert.equal(t.approve(arg).ok,false);assert.equal(t.activate(arg).ok,false);assert.equal(t.inspect(arg).ok,false);assert.equal(t.writes.length,0);assert(!JSON.stringify(t.logs).includes('DO_NOT_LOG'));
});
for(const variant of ['pin','snapshot','body','build','flags','extra-body','reader'])test('wrong or incomplete artifact cannot grant the approval: '+variant,()=>{
 const t=fixture();if(variant==='pin')t.ctx.domusInicioHuella_=()=>pin;if(variant==='snapshot')t.inputAdmin.artifact.proposal.snapshot.counts.queueIds++;
 if(variant==='body')t.inputAdmin.artifact.input.queue[0].requestId='SYNTHETIC-OTHER';if(variant==='build')t.inputAdmin.artifact.proposal.snapshot.freshStart.backendSourceSha256='f'.repeat(64);
 if(variant==='flags')t.inputAdmin.confirmSingleActivation=false;if(variant==='extra-body')t.inputAdmin.artifact.input.requestId='OTHER';if(variant==='reader')t.ctx.domusRetencionReadView_=undefined;
 const before=snapshot(t);assert.equal(t.approve().ok,false);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
for(const value of ['', '{SECRET', '{"approved":false}', '{"snapshotHash":"other"}'])test('pre-existing approval value is preserved and cannot activate: '+value.slice(0,12),()=>{
 const t=fixture();t.props.set(key,value);const before=snapshot(t);assert.equal(t.approve().status,'EXISTING_PRESERVED');assert.equal(t.activate().ok,false);assert.equal(t.props.get(key),value);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);assert(!JSON.stringify(t.logs).includes('SECRET'));
});
for(const moment of ['approval','activation-before-latch','activation-after-binding'])test('changed evidence fails closed at '+moment,()=>{
 const t=fixture();if(moment!=='approval')t.approve();const original=t.ctx.historySnapshot_;let after;
 t.ctx.historySnapshot_=(m,p,id,...args)=>{const r=original(m,p,id,...args);if(moment!=='activation-after-binding'||id===t.ctx.domusInicioId_()){t.main.getSheetByName('COBROS').put(7,6,99);after=business(t);}return r;};
 assert.equal((moment==='approval'?t.approve():t.activate()).ok,false);assert.equal(business(t),after);
 if(moment==='activation-after-binding'){assert(JSON.parse(t.props.get(key)).attempt);const count=t.calls.length;assert.equal(t.activate().ok,false);assert.equal(t.calls.length,count);}
 else {assert.equal(t.calls.length,0);assert.equal(moment==='approval'?t.props.has(key):JSON.parse(t.props.get(key)).attempt,moment==='approval'?false:null);}
});
test('lost acknowledgement after a completed dispatcher is verified independently without invoking it twice',()=>{
 const t=fixture();t.approve();const execute=t.ctx.executeDomusAction_;t.ctx.executeDomusAction_=(action,...args)=>{const r=execute(action,...args);if(action==='registrarLimiteHistorico')throw Error('SYNTHETIC_LOST_ACK');return r;};
 assert.equal(t.activate().ok,false);assert.equal(t.inspect().status,'ACTIVATED_VERIFIED');const calls=t.calls.length,writes=t.writes.length;
 assert.equal(t.activate().status,'ACTIVATED_VERIFIED');assert.equal(t.calls.length,calls);assert.equal(t.writes.length,writes);
});
test('login failure after attempt marker cannot be retried or clear the marker',()=>{
 const t=fixture();t.approve();t.ctx.executeDomusAction_=()=>{throw Error('DO_NOT_LOG_TOKEN');};assert.equal(t.activate().ok,false);
 const raw=t.props.get(key);assert(JSON.parse(raw).attempt);assert.equal(t.inspect().status,'ATTEMPT_OR_PROPERTY_REQUIRES_REVIEW');assert.equal(t.activate().ok,false);assert.equal(t.props.get(key),raw);assert(!JSON.stringify(t.logs).includes('DO_NOT_LOG_TOKEN'));
});
test('property write-then-error requires inspection and never replays after the latch',()=>{
 const t=fixture();t.approve();const original=t.ctx.PropertiesService.getScriptProperties;t.ctx.PropertiesService.getScriptProperties=()=>{const p=original();return {...p,setProperty:(k,v)=>{p.setProperty(k,v);if(k===key)throw Error('UNCERTAIN');}};};
 assert.equal(t.activate().status,'RETENTION_ADMIN_FRESH_WRITE_UNCERTAIN_INSPECT_ONLY');assert.equal(t.calls.length,0);assert.equal(t.activate().ok,false);assert.equal(t.calls.length,0);
});
test('another writer replacing approval during revalidation is preserved, without dispatch',()=>{
 const t=fixture();t.approve();const original=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...args)=>{const r=original(...args);t.props.set(key,'EXTERNAL');return r;};
 assert.equal(t.activate().status,'RETENTION_ADMIN_FRESH_PROPERTY_CHANGED');assert.equal(t.props.get(key),'EXTERNAL');assert.equal(t.calls.length,0);
});
test('expiry during approval revalidation prevents creation; inspection works after writer removal',()=>{
 const t=fixture(),original=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...args)=>{const r=original(...args);t.advance(600000);return r;};
 assert.equal(t.approve().status,'RETENTION_ADMIN_FRESH_WINDOW_CLOSED');assert.equal(t.writes.length,0);
 for(const name of [...sources.StagingFreshStartBridge.matchAll(/^function (\w+)\(/gm)].map(m=>m[1]))t.ctx[name]=undefined;
 assert.equal(t.inspect().status,'ABSENT');assert.equal(t.writes.length,0);
});
test('concurrent callers serialize approval and preserve the existing property',()=>{
 const t=fixture(),other=fixture();other.ctx.LockService=t.ctx.LockService;const original=t.ctx.historySnapshot_;let seen=false;
 t.ctx.historySnapshot_=(...args)=>{seen=true;assert.equal(other.approve().ok,false);assert.equal(other.writes.length,0);return original(...args);};assert.equal(t.approve().status,'APPROVED_NOT_STARTED');assert(seen);
});
test('corrupted durable completion is never reported as verified or replayed',()=>{
 const t=fixture();t.approve();t.activate();const id=t.ctx.domusInicioId_(),record=t.ctx.requestRecordEntry_(t.s,id);t.s.put(record.row,2,'cajaSimpleRegistrar');
 const before=snapshot(t),calls=t.calls.length;assert.notEqual(t.inspect().verified,true);assert.equal(t.activate().ok,false);assert.equal(snapshot(t),before);assert.equal(t.calls.length,calls);
});
test('a request already bound before this helper is inspected, never resumed or replaced',()=>{
 const t=fixture();t.approve();t.s.appendRow([t.ctx.domusInicioId_(),'registrarLimiteHistorico','a'.repeat(64),t.ctx.domusInicioDispositivo_(),'PROCESSING','','','null']);
 const before=snapshot(t);assert.equal(t.activate().ok,false);assert.equal(t.calls.length,0);assert.equal(snapshot(t),before);assert.equal(t.inspect().newCharge,null);
});
test('failed authentication remains subject to normal backend RBAC and cannot reach activation',()=>{
 const t=fixture();t.approve();const validate=t.ctx.authValidateAction;
 t.ctx.authValidateAction=(action,...args)=>{if(action==='registrarLimiteHistorico')throw Error('DENIED_BY_RBAC');return validate(action,...args);};
 assert.equal(t.activate().ok,false);assert.equal(t.ctx.requestRecordEntry_(t.s,t.ctx.domusInicioId_()),null);assert(JSON.parse(t.props.get(key)).attempt);
});
test('unexpected persisted status is reduced to UNKNOWN, without exposing its content',()=>{
 const t=fixture();t.approve();t.s.appendRow([t.ctx.domusInicioId_(),'registrarLimiteHistorico','a'.repeat(64),t.ctx.domusInicioDispositivo_(),'PRIVATE_SECRET_STATUS','','','null']);
 assert.equal(t.inspect().requestStatus,'UNKNOWN');assert(!JSON.stringify(t.logs).includes('PRIVATE_SECRET_STATUS'));assert.equal(t.activate().ok,false);
});
test('altered attempt attribution cannot be certified as a verified activation',()=>{
 const t=fixture();t.approve();t.activate();const a=JSON.parse(t.props.get(key));a.attempt.by='OTHER';t.props.set(key,JSON.stringify(a));
 assert.equal(t.inspect().verified,false);const n=t.calls.length;assert.equal(t.activate().ok,false);assert.equal(t.calls.length,n);
});
test('changing the private window during an invocation does not extend that invocation',()=>{
 const t=fixture(),original=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...args)=>{const r=original(...args);t.advance(600000);t.window.expiresAt=new Date(Date.now()+1800000).toISOString();return r;};
 assert.equal(t.approve().status,'RETENTION_ADMIN_FRESH_WINDOW_CLOSED');assert.equal(t.writes.length,0);
});
test('no generic property writer, supplied session token, business operation or deployment path is introduced',()=>{
 assert(!/deleteProperty|deleteAllProperties|\.setProperties\(|\.getProperties\(|UrlFetchApp|newTrigger/.test(sources.StagingFreshStartAdmin));
 assert(!/cajaSimpleRegistrar\s*\(|turnoAbrir\s*\(|setValues\s*\(/.test(sources.StagingFreshStartAdmin));
 assert([...sources.StagingFreshStartAdmin.matchAll(/^function (\w+)\(/gm)].every(m=>m[1].endsWith('_')));
 assert(!/domusInicioActivar_|domusInicioAprobar_|setProperty/.test(sources.StagingFreshStartRead));
});
console.log(JSON.stringify({suite:'fresh-start-admin',passed,syntheticOnly:true,liveGoogle:false,realActivation:false,legacyBundle:!!process.env.DOMUS_TEST_LEGACY_BUNDLE}));

