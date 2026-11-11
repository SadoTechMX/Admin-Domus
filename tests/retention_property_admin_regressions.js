'use strict';
// Actual private helper + current real modules/bundle; synthetic books/properties only.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {fixture:base}=require('./staging_uncertain_retention_regressions');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/apps-script-admin/StagingRetentionApproval.gs'),'utf8');
const menuSource=fs.readFileSync(path.resolve(__dirname,'../scripts/apps-script-admin/StagingRetentionMenu.gs'),'utf8');
const key='DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1',approvedHash='708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b';
const copy=v=>JSON.parse(JSON.stringify(v));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function fixture(env){
 const t=base(env),d=t.propose();
 t.inputAdmin={artifact:{format:'DOMUS_STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1',input:copy(t.input),diagnostic:copy(d)},
   approvalReference:'SYNTHETIC approval only',expectedPropertyState:'ABSENT',confirmStationsHeld:true,confirmBackupVerified:true,
   acknowledgeUnresolvedHistory:true,confirmOnlyPrepareProposal:true,confirmPropertyWritersStopped:true};
 t.ctx.Session.getEffectiveUser=()=>({getEmail:()=>t.ctx.Session.getActiveUser().getEmail()});
 t.logs=[];t.ctx.console={log:s=>t.logs.push(s),error:()=>{}};
 require('./admin_fixture_build_pin')(t.ctx,source);
 assert.equal(t.ctx.domusRetencionAdminHashAutorizado_(),approvedHash);
 // Positive tests need an independently generated synthetic approval. Only this
 // authorization provider is replaced in memory; the checked-in pin stays exact.
 t.syntheticApproval=()=>{t.ctx.domusRetencionAdminHashAutorizado_=()=>d.evidenceHash;};
 t.read=()=>t.ctx.domusRetencionAdminLeer_();t.create=()=>t.ctx.domusRetencionAdminCrear_(t.inputAdmin);
 t.writes=[];t.reads=[];
 t.ctx.PropertiesService.getScriptProperties=()=>({
   getProperty:k=>{t.reads.push(k);return t.props.has(k)?t.props.get(k):null;},
   setProperty:(k,v)=>{assert(t.locks().held);assert.equal(k,key);t.writes.push([k,v]);return t.props.set(k,v);},
   getProperties:()=>assert.fail('MUST_NOT_ENUMERATE_PROPERTIES'),
   setProperties:()=>assert.fail('MUST_NOT_WRITE_PROPERTIES_BULK'),
   deleteProperty:()=>assert.fail('MUST_NOT_DELETE_PROPERTY'),deleteAllProperties:()=>assert.fail('MUST_NOT_DELETE_ALL_PROPERTIES')
 });
 return t;
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
for(const env of [undefined,'STAGING'])test((env||'modules')+': single-key inspection works with >50 properties, no books, writes or secret logs',()=>{
 const t=fixture(env);for(let i=0;i<70;i++)t.props.set('UNRELATED_'+i,'SECRET_'+i);
 const before=JSON.stringify([...t.props]);t.ctx.SpreadsheetApp.openById=()=>assert.fail('inspection must not read books');
 const r=t.ctx.domusInspeccionarAprobacionRetencion_();assert.equal(r.status,'READ_ONLY');assert.equal(r.present,false);
 assert.deepEqual(t.reads,[key]);assert.equal(t.writes.length,0);assert.equal(JSON.stringify([...t.props]),before);
 assert(!JSON.stringify(t.logs).includes('SECRET_'));assert(!JSON.stringify(r).includes('snapshotHash'));assert.equal(r.canActivate,false);
});
test('checked-in authorization pin rejects a different diagnostic without persisting anything',()=>{
 const t=fixture(),before=snapshot(t);assert.throws(t.create,/APPROVED_ARTIFACT_REQUIRED/);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
for(const env of [undefined,'STAGING'])test((env||'modules')+': exact synthetic approval creates only the named property; repeated call preserves original bytes and timestamp',()=>{
 const t=fixture(env);t.syntheticApproval();const before=snapshot(t),other=JSON.stringify([...t.props]);
 const r=t.create(),raw=t.props.get(key),a=JSON.parse(raw);assert.equal(r.status,'CREATED');assert.equal(r.currentEvidenceChecked,true);
 assert.equal(a.evidenceHash,t.inputAdmin.artifact.diagnostic.evidenceHash);assert.equal(a.recordedBy,'direccion@domusccc.net');assert(!Number.isNaN(Date.parse(a.recordedAt)));
 assert.equal(t.writes.length,1);assert.equal(t.ctx.historyRetentionApproval_(a.evidenceHash).approvalReference,a.approvalReference);
 assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props].filter(([k])=>k!==key)),other);
 const second=t.create();assert.equal(second.status,'EXISTING_PRESERVED');assert.equal(second.currentEvidenceChecked,false);assert.equal(t.props.get(key),raw);assert.equal(t.writes.length,1);
 assert(!t.props.has('DOMUS_STAGING_FRESH_START_APPROVAL_V1'));assert(!t.ctx.historyBoundary_(t.main));assert.equal(t.locks().acquires,t.locks().releases);
});
for(const raw of ['', ' ', '{bad JSON SECRET', 'false','null','[]','{"approved":false,"private":"SECRET"}',JSON.stringify({evidenceHash:'f'.repeat(64),approved:true})])test('existing value preserved byte for byte, never echoed: '+JSON.stringify(raw).slice(0,35),()=>{
 const t=fixture();t.syntheticApproval();t.props.set(key,raw);const before=JSON.stringify([...t.props]);
 t.ctx.SpreadsheetApp.openById=()=>assert.fail('existing value must not trigger revalidation');
 const r=t.read(),w=t.create();assert.equal(r.present,true);assert.equal(w.status,'EXISTING_PRESERVED');assert.equal(t.writes.length,0);
 assert.equal(JSON.stringify([...t.props]),before);assert.equal(r.valueSha256,require('crypto').createHash('sha256').update(raw).digest('hex'));assert(!JSON.stringify(r).includes('SECRET'));
});
for(const variant of ['blank-active','different-effective','non-manager','web-context','other-project','production','other-main','other-ops','other-build'])test('identity and deployment scope reject before property inspection: '+variant,()=>{
 const t=fixture();
 if(variant==='blank-active')t.ctx.Session.getActiveUser=()=>({getEmail:()=>''});
 if(variant==='different-effective')t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.test'});
 if(variant==='non-manager')t.ctx.Session.getActiveUser=()=>({getEmail:()=> 'other@example.test'});
 if(variant==='web-context')vm.runInContext('_authContext={role:"GERENCIA",principal:"direccion@domusccc.net"}',t.ctx);
 if(variant==='other-project')t.ctx.ScriptApp.getScriptId=()=> 'OTHER';
 if(['production','other-main','other-ops','other-build'].includes(variant)){
  const config=vm.runInContext('CONFIG',t.ctx),build=vm.runInContext('BACKEND_BUILD',t.ctx);
  const context=vm.createContext({...t.ctx,CONFIG:{...config},BACKEND_BUILD:{...build},_authContext:null});
  if(variant==='production')context.CONFIG.environment='PRODUCTION';if(variant==='other-main')context.CONFIG.mainSheetId='OTHER';
  if(variant==='other-ops')context.CONFIG.opsSheetId='OTHER';if(variant==='other-build')context.BACKEND_BUILD.sourceSha256='a'.repeat(64);
  vm.runInContext(source,context);assert.throws(()=>context.domusRetencionAdminLeer_());assert.throws(()=>context.domusRetencionAdminCrear_({}));
 }else {assert.throws(t.read);assert.throws(t.create);}
 assert.equal(t.reads.length,0);assert.equal(t.writes.length,0);
});
for(const field of ['expectedPropertyState','confirmStationsHeld','confirmBackupVerified','acknowledgeUnresolvedHistory','confirmOnlyPrepareProposal','confirmPropertyWritersStopped','approvalReference'])test('missing explicit confirmation fails without writes: '+field,()=>{
 const t=fixture();t.syntheticApproval();delete t.inputAdmin[field];assert.throws(t.create,/CONFIRMATIONS_REQUIRED/);assert.equal(t.writes.length,0);
});
for(const variant of ['evidence','input','build','format','activatable','snapshot','ledger','formula','commercial','ops','policy','journal'])test('stale or altered evidence fails without a property or ledger write: '+variant,()=>{
 const t=fixture();t.syntheticApproval();const a=t.inputAdmin.artifact;
 if(variant==='evidence')a.diagnostic.evidence.queueHash='a'.repeat(64);
 if(variant==='input')a.input.queue[0].requestId='SYNTHETIC-replacement';
 if(variant==='build')a.diagnostic.evidence.backendSourceSha256='a'.repeat(64);
 if(variant==='format')a.format='OTHER';if(variant==='activatable')a.diagnostic.canActivate=true;if(variant==='snapshot')a.diagnostic.snapshotHash='a'.repeat(64);
 if(variant==='ledger')t.s.put(2,8,'changed');if(variant==='formula')t.s.put(2,8,'="changed"');
 if(variant==='commercial')t.main.getSheetByName('COBROS').put(7,6,50);if(variant==='ops')t.ops.getSheetByName('RESURTIDO').put(1,1,'changed');
 if(variant==='policy')t.props.set('DOMUS_JOURNEY_POLICY_V1','{}');
 if(variant==='journal')t.ctx.journalSheet_(t.main).appendRow(['','cajaSimpleRegistrar','PREPARED','[]','{}','']);
 const before=snapshot(t),properties=JSON.stringify([...t.props]);assert.throws(t.create);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),properties);
});
test('pre-existing boundary is not modified and prevents creating an approval',()=>{
 const t=fixture();t.syntheticApproval();t.ctx.historyBoundary_=()=>({result:{}});assert.throws(t.create,/BOUNDARY_EXISTS/);assert.equal(t.writes.length,0);
});
test('another writer changing the target during validation is preserved by the final check',()=>{
 const t=fixture();t.syntheticApproval();const f=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...args)=>{const r=f(...args);t.props.set(key,'EXTERNAL_VALUE');return r;};
 assert.throws(t.create,/PROPERTY_CHANGED/);assert.equal(t.writes.length,0);assert.equal(t.props.get(key),'EXTERNAL_VALUE');
});
test('lock prevents overlapping helpers from racing before creation',()=>{
 const t=fixture();t.syntheticApproval();t.ctx.LockService.getScriptLock=()=>({waitLock(){throw Error('busy');},releaseLock(){assert.fail('not acquired');}});
 assert.throws(t.create);assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);
});
for(const mode of ['throw-before','write-then-throw','readback-diff'])test('uncertain property write is reported without rollback or automatic retry: '+mode,()=>{
 const t=fixture();t.syntheticApproval();const original=t.ctx.PropertiesService.getScriptProperties;
 t.ctx.PropertiesService.getScriptProperties=()=>{const s=original();return {...s,setProperty:(k,v)=>{
  if(mode==='throw-before')throw Error('PRIVATE_ERROR_MUST_NOT_LEAK');
  s.setProperty(k,v);if(mode==='write-then-throw')throw Error('PRIVATE_ERROR_MUST_NOT_LEAK');t.props.set(k,'EXTERNAL_READBACK');
 }};};
 t.ctx.domusRetencionAdminEntrada_=()=>t.inputAdmin;
 const result=t.ctx.domusRegistrarAprobacionRetencion_();assert.equal(result.ok,false);assert.equal(result.status,'RETENTION_ADMIN_WRITE_UNCERTAIN_INSPECT_ONLY');
 assert(!JSON.stringify(t.logs).includes('PRIVATE_ERROR'));assert.equal(t.writes.length,mode==='throw-before'?0:1);
 if(mode!=='throw-before'){t.ctx.PropertiesService.getScriptProperties=original;assert.equal(t.create().status,'EXISTING_PRESERVED');assert.equal(t.writes.length,1);}
});
test('older backend without the reviewed companion stops instead of repeating the timed-out read path',()=>{
 const t=fixture();t.syntheticApproval();t.ctx.historyReadView_=undefined;const before=snapshot(t);
 assert.throws(t.create,/CONSISTENT_READ_REQUIRED/);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
test('property read failures do not leak their message or imply absence',()=>{
 const t=fixture();t.ctx.PropertiesService.getScriptProperties=()=>({getProperty(){throw Error('SECRET_READ_FAILURE');}});
 const r=t.ctx.domusInspeccionarAprobacionRetencion_();assert.equal(r.ok,false);assert.equal(r.status,'RETENTION_ADMIN_STOPPED');assert(!('present'in r));
 assert(!JSON.stringify(t.logs).includes('SECRET_READ_FAILURE'));assert.equal(t.writes.length,0);
});
test('no public function, dispatcher action, bulk property operation, UI dependency or automatic invocation',()=>{
 const names=[...source.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)].map(m=>m[1]);assert(names.length>2);assert(names.every(n=>n.endsWith('_')));
 assert(!/\.getProperties\s*\(|\.setProperties\s*\(|\.deleteProperty\s*\(|\.deleteAllProperties\s*\(/.test(source));
 assert(!/registrarLimiteHistorico\s*\(|idempotentExecute_\s*\(|journalCommit_\s*\(|UrlFetchApp|\.setValue[s]?\s*\(/.test(source));
 const t=fixture();for(const name of ['domusInspeccionarAprobacionRetencion_','domusRegistrarAprobacionRetencion_']){
  const result=t.ctx.dispatchNativeAction({action:name,args:[],role:'GERENCIA',requestId:'SYNTHETIC-admin',deviceId:'fixture-device'});assert.equal(result.ok,false);
 }
 assert.equal(t.writes.length,0);
});
function menuFixture(env){
 const t=fixture(env);t.menuItems=[];t.menuAdded=0;
 t.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>t.main;
 const menu={addItem:(label,name)=>{t.menuItems.push({label,name});return menu;},addSeparator:()=>menu,addToUi:()=>{t.menuAdded++;}};
 t.ctx.SpreadsheetApp.getUi=()=>({createMenu:()=>menu});
 vm.runInContext(menuSource,t.ctx,{filename:'StagingRetentionMenu.gs'});return t;
}
for(const env of [undefined,'STAGING'])test((env||'modules')+': selectable launcher only adds native private callbacks, even with client-supplied write arguments',()=>{
 const t=menuFixture(env);t.syntheticApproval();t.ctx.domusRetencionAdminEntrada_=()=>t.inputAdmin;
 const before=snapshot(t),props=JSON.stringify([...t.props]);
 t.ctx.domusRetencionAdminCrear_=()=>assert.fail('launcher must never invoke setter');
 t.ctx.domusRegistrarAprobacionRetencion_=()=>assert.fail('launcher must never invoke write callback');
 t.ctx.SpreadsheetApp.openById=()=>assert.fail('launcher must not read books');
 const r=t.ctx.domusPrepararMenuRetencion({action:'domusRegistrarAprobacionRetencion_',mode:'CREATE',confirm:true,artifact:t.inputAdmin.artifact});
 assert.equal(r.status,'PRIVATE_MENU_READY');assert.equal(r.propertyWrites,0);assert.equal(r.canActivate,false);assert.equal(t.menuAdded,1);
 assert.deepEqual(t.menuItems.map(x=>x.name),['domusInspeccionarAprobacionRetencion_','domusRegistrarAprobacionRetencion_']);
 assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),props);
});
for(const mode of ['web-null','web-throws','no-ui','standalone','wrong-container','unauthorized'])test('launcher rejects unavailable/foreign UI or identity with no menu/property effects: '+mode,()=>{
 const t=menuFixture();
 if(['web-null','standalone'].includes(mode))t.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>null;
 if(mode==='web-throws')t.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>{throw Error('not available');};
 if(mode==='no-ui')t.ctx.SpreadsheetApp.getUi=()=>{throw Error('not available');};
 if(mode==='wrong-container')t.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>({getId:()=> 'OTHER'});
 if(mode==='unauthorized')t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.test'});
 const r=t.ctx.domusPrepararMenuRetencion();assert.equal(r.ok,false);assert.equal(r.canActivate,false);assert.equal(t.menuAdded,0);assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);
});
test('canonical OPS container can host the same private menu without data reads or writes',()=>{
 const t=menuFixture();t.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>t.ops;
 assert.equal(t.ctx.domusPrepararMenuRetencion().status,'PRIVATE_MENU_READY');assert.equal(t.menuAdded,1);assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);
});
test('native menu selection uses existing private callbacks and preserves create-only guards',()=>{
 const t=menuFixture('STAGING');t.syntheticApproval();t.ctx.domusRetencionAdminEntrada_=()=>t.inputAdmin;
 const before=snapshot(t);assert.equal(t.ctx.domusPrepararMenuRetencion().status,'PRIVATE_MENU_READY');assert.equal(t.writes.length,0);
 assert.equal(t.ctx[t.menuItems[0].name]().status,'READ_ONLY');assert.equal(t.writes.length,0);
 assert.equal(t.ctx[t.menuItems[1].name]().status,'CREATED');assert.equal(t.writes.length,1);
 const raw=t.props.get(key);assert.equal(t.ctx[t.menuItems[1].name]().status,'EXISTING_PRESERVED');assert.equal(t.props.get(key),raw);assert.equal(t.writes.length,1);
 assert.equal(snapshot(t),before);assert(!t.ctx.historyBoundary_(t.main));
});
test('menu callback rechecks Gerencia identity instead of trusting the menu creator',()=>{
 const t=menuFixture();t.syntheticApproval();t.ctx.domusRetencionAdminEntrada_=()=>t.inputAdmin;t.ctx.domusPrepararMenuRetencion();
 t.ctx.Session.getActiveUser=()=>({getEmail:()=> 'other@example.test'});
 const r=t.ctx[t.menuItems[1].name]();assert.equal(r.ok,false);assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);
});
test('only public entry is menu construction; no trigger, dispatcher action or dynamic callback supplied by a caller',()=>{
 assert.deepEqual([...menuSource.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)].map(m=>m[1]),['domusPrepararMenuRetencion']);
 assert(!/function onOpen|newTrigger|\.setProperty\s*\(|domusRetencionAdminCrear_\s*\(|domusRegistrarAprobacionRetencion_\s*\(/.test(menuSource));
 const t=menuFixture();const r=t.ctx.dispatchNativeAction({action:'domusPrepararMenuRetencion',args:[],role:'GERENCIA',requestId:'SYNTHETIC-menu',deviceId:'fixture-device'});
 assert.equal(r.ok,false);assert.equal(t.menuAdded,0);assert.equal(t.writes.length,0);
});
console.log(JSON.stringify({suite:'retention-property-admin',passed,syntheticOnly:true,liveGoogle:false,realPropertyWrites:0,deployments:0,activation:false}));

