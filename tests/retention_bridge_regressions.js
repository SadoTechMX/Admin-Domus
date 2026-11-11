'use strict';
// Real private helper and temporary bridge, exclusively synthetic state.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {fixture:base}=require('./staging_uncertain_retention_regressions');
const root=path.resolve(__dirname,'..');
const helper=fs.readFileSync(root+'/scripts/apps-script-admin/StagingRetentionApproval.gs','utf8');
const bridge=fs.readFileSync(root+'/scripts/apps-script-admin/StagingRetentionBridge.gs','utf8');
const reader=fs.readFileSync(root+'/scripts/apps-script-admin/StagingRetentionRead.gs','utf8');
const key='DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1',hash='708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b';
const copy=x=>JSON.parse(JSON.stringify(x));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function fixture(env){
 const t=base(env),d=t.propose();t.ctx.Session.getEffectiveUser=()=>({getEmail:()=>t.ctx.Session.getActiveUser().getEmail()});
 let now=Date.parse('2030-01-01T00:00:00.000Z');
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 t.advance=ms=>now+=ms;t.ctx.Date=Clock;
 t.logs=[];t.ctx.console={log:s=>t.logs.push(s),error:()=>{}};
 require('./admin_fixture_build_pin')(t.ctx,helper);vm.runInContext(reader,t.ctx);vm.runInContext(bridge,t.ctx);
 assert.equal(t.ctx.domusRetencionAdminHashAutorizado_(),hash);assert.equal(t.ctx.domusRetencionPuenteHuella_(),hash);
 t.config={principal:'direccion@domusccc.net',issuedAt:'2030-01-01T00:00:00.000Z',expiresAt:'2030-01-01T00:10:00.000Z'};
 t.ctx.domusRetencionPuenteConfig_=()=>t.config;
 t.inputAdmin={artifact:{format:'DOMUS_STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1',input:copy(t.input),diagnostic:copy(d)},approvalReference:'SYNTHETIC bridge approval',expectedPropertyState:'ABSENT',confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true,confirmOnlyPrepareProposal:true,confirmPropertyWritersStopped:true};
 t.ctx.domusRetencionAdminEntrada_=()=>t.inputAdmin;
 t.authorize=()=>{t.ctx.domusRetencionAdminHashAutorizado_=()=>d.evidenceHash;t.ctx.domusRetencionPuenteHuella_=()=>d.evidenceHash;}; // Synthetic approval only.
 t.writes=[];t.reads=[];
 t.ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>{t.reads.push(k);return t.props.has(k)?t.props.get(k):null;},setProperty:(k,v)=>{assert(t.locks().held);assert.equal(k,key);t.writes.push([k,v]);t.props.set(k,v);}});
 t.read=(...args)=>t.ctx.domusInspeccionarRetencionTemporal(...args);t.create=(...args)=>t.ctx.domusRegistrarRetencionTemporal(...args);
 return t;
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
for(const env of [undefined,'STAGING'])test((env||'modules')+': zero-argument inspection is read-only; authorized creation writes exactly one property and no ledger/journal',()=>{
 const t=fixture(env);t.authorize();const before=snapshot(t),properties=JSON.stringify([...t.props]);
 const r=t.read();assert.equal(r.status,'READ_ONLY');assert.equal(r.serverTimeUtc,'2030-01-01T00:00:00.000Z');assert.equal(t.writes.length,0);
 assert.equal(t.create().status,'CREATED');assert.equal(t.writes.length,1);const raw=t.props.get(key);assert.equal(t.create().status,'EXISTING_PRESERVED');assert.equal(t.props.get(key),raw);assert.equal(t.writes.length,1);
 assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props].filter(([k])=>k!==key)),properties);assert(!t.ctx.historyBoundary_(t.main));assert.equal(t.locks().acquires,t.locks().releases);
});
test('bridge is not an editor-origin check: identical authorized identity and null app context can call its public function',()=>{
 const t=fixture('STAGING');t.authorize();assert.equal(vm.runInContext('_authContext',t.ctx),null);assert.equal(t.create().status,'CREATED');
 assert.equal(t.writes.length,1); // Deliberate proof of remaining /dev exposure, not a claim of live Google verification.
});
test('shipped blank configuration disables writing while inspection remains read-only',()=>{
 const t=fixture();vm.runInContext(bridge,t.ctx);assert.equal(t.create().status,'RETENTION_ADMIN_BRIDGE_PRINCIPAL_REQUIRED');assert.equal(t.reads.length,0);assert.equal(t.read().status,'READ_ONLY');assert.equal(t.writes.length,0);
});
for(const args of [[undefined],[null],[''],[true],[{action:'CREATE',principal:'direccion@domusccc.net',expiresAt:'2099-01-01T00:00:00.000Z'}],['read','write']])test('all client arguments rejected before property access: '+JSON.stringify(args),()=>{
 const t=fixture();t.authorize();assert.equal(t.read(...args).status,'RETENTION_ADMIN_BRIDGE_NO_ARGUMENTS');assert.equal(t.create(...args).status,'RETENTION_ADMIN_BRIDGE_NO_ARGUMENTS');assert.equal(t.reads.length,0);assert.equal(t.writes.length,0);
});
for(const variant of ['active-empty','effective-other','non-manager','another-manager','app-context','project','missing-final-hook','wrong-final-version','helper-hash','bridge-hash'])test('scope or identity failure preserves everything: '+variant,()=>{
 const t=fixture();t.authorize();
 if(variant==='active-empty')t.ctx.Session.getActiveUser=()=>({getEmail:()=>''});
 if(variant==='effective-other')t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.test'});
 if(variant==='non-manager')t.ctx.Session.getActiveUser=()=>({getEmail:()=> 'other@example.test'});
 if(variant==='another-manager')t.ctx.Session.getActiveUser=()=>({getEmail:()=> 'sadotechfet@gmail.com'});
 if(variant==='app-context')vm.runInContext('_authContext={role:"GERENCIA",principal:"direccion@domusccc.net"}',t.ctx);
 if(variant==='project')t.ctx.ScriptApp.getScriptId=()=> 'OTHER';
 if(variant==='missing-final-hook')t.ctx.domusRetencionAdminGuardaFinalVersion_=undefined;
 if(variant==='wrong-final-version')t.ctx.domusRetencionAdminGuardaFinalVersion_=()=> 'OTHER';
 if(variant==='helper-hash')t.ctx.domusRetencionAdminHashAutorizado_=()=> 'a'.repeat(64);
 if(variant==='bridge-hash')t.ctx.domusRetencionPuenteHuella_=()=> 'a'.repeat(64);
 const before=snapshot(t),properties=JSON.stringify([...t.props]);assert.equal(t.create().ok,false);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),properties);
});
test('untouched real authorization pin rejects a synthetic diagnostic',()=>{
 const t=fixture();assert.equal(t.create().status,'RETENTION_ADMIN_APPROVED_ARTIFACT_REQUIRED');assert.equal(t.writes.length,0);
});
for(const variant of ['blank','invalid-date','no-milliseconds','offset','same','reversed','too-long','future','expired','exact-expiry','extra-config'])test('absolute window fails closed: '+variant,()=>{
 const t=fixture();t.authorize();
 if(variant==='blank')t.config.expiresAt='';if(variant==='invalid-date')t.config.expiresAt='2030-02-30T00:10:00.000Z';
 if(variant==='no-milliseconds')t.config.expiresAt='2030-01-01T00:10:00Z';if(variant==='offset')t.config.expiresAt='2030-01-01T00:10:00.000+00:00';
 if(variant==='same')t.config.expiresAt=t.config.issuedAt;if(variant==='reversed')t.config.expiresAt='2029-12-31T23:59:00.000Z';
 if(variant==='too-long')t.config.expiresAt='2030-01-01T00:10:00.001Z';if(variant==='future')t.config.issuedAt='2030-01-01T00:01:00.000Z';
 if(variant==='expired')t.advance(600001);if(variant==='exact-expiry')t.advance(600000);if(variant==='extra-config')t.config.action='CREATE';
 const before=snapshot(t);assert.equal(t.create().ok,false);assert.equal(t.writes.length,0);assert.equal(t.reads.length,0);assert.equal(snapshot(t),before);
});
test('inspection remains read-only after window expiry; it cannot rearm or extend the deadline',()=>{
 const t=fixture();t.authorize();t.advance(600001);const config=copy(t.config),properties=JSON.stringify([...t.props]);assert.equal(t.read().status,'READ_ONLY');assert.deepEqual(t.config,config);assert.equal(JSON.stringify([...t.props]),properties);assert.equal(t.create().status,'RETENTION_ADMIN_BRIDGE_WINDOW_CLOSED');assert.equal(t.writes.length,0);
});
test('expiry while acquiring lock rejects before any property read or expensive snapshot',()=>{
 const t=fixture();t.authorize();const get=t.ctx.LockService.getScriptLock;
 t.ctx.LockService.getScriptLock=()=>{const l=get();return {...l,waitLock:ms=>{l.waitLock(ms);t.advance(600000);}};};
 t.ctx.historySnapshot_=()=>assert.fail('must stop before revalidation');assert.equal(t.create().status,'RETENTION_ADMIN_BRIDGE_WINDOW_CLOSED');assert.equal(t.reads.length,0);assert.equal(t.writes.length,0);
});
for(const variant of ['expiry','identity'])test('final guard rejects changes during revalidation before setProperty: '+variant,()=>{
 const t=fixture();t.authorize();const snapshotFn=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...a)=>{const r=snapshotFn(...a);if(variant==='expiry')t.advance(600000);else t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.test'});return r;};
 const before=snapshot(t),r=t.create();assert.equal(r.status,variant==='expiry'?'RETENTION_ADMIN_BRIDGE_WINDOW_CLOSED':'RETENTION_ADMIN_IDENTITY_REQUIRED');assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
for(const variant of ['ledger','formula','commercial','queue','backup','journal'])test('changed evidence or active journal prevents approval: '+variant,()=>{
 const t=fixture();t.authorize();if(variant==='ledger')t.s.put(2,8,'changed');if(variant==='formula')t.s.put(2,8,'="changed"');
 if(variant==='commercial')t.main.getSheetByName('COBROS').put(7,6,25);if(variant==='queue')t.inputAdmin.artifact.input.queue[0].requestId='SYNTHETIC-other';
 if(variant==='backup')t.inputAdmin.artifact.input.backup.sha256='c'.repeat(64);if(variant==='journal')t.ctx.journalSheet_(t.main).appendRow(['','accesoSimpleRegistrar','PREPARED','[]','{}','']);
 const before=snapshot(t);assert.equal(t.create().ok,false);assert.equal(t.writes.length,0);assert.equal(snapshot(t),before);
});
for(const value of ['', '{malformed SECRET', '{"approved":false}', 'EXISTING_OTHER_HASH'])test('existing value always preserved without printing it: '+value.slice(0,12),()=>{
 const t=fixture();t.authorize();t.props.set(key,value);const before=JSON.stringify([...t.props]);assert.equal(t.create().status,'EXISTING_PRESERVED');assert.equal(t.writes.length,0);assert.equal(JSON.stringify([...t.props]),before);assert(!JSON.stringify(t.logs).includes('SECRET'));
});
test('uncertain write stops; expiry still permits inspection and never clears or retries the value',()=>{
 const t=fixture();t.authorize();const original=t.ctx.PropertiesService.getScriptProperties;
 t.ctx.PropertiesService.getScriptProperties=()=>{const s=original();return {...s,setProperty:(k,v)=>{s.setProperty(k,v);throw Error('PRIVATE_WRITE_ERROR');}};};
 assert.equal(t.create().status,'RETENTION_ADMIN_WRITE_UNCERTAIN_INSPECT_ONLY');const raw=t.props.get(key);t.advance(600001);
 assert.equal(t.read().present,true);assert.equal(t.create().status,'RETENTION_ADMIN_BRIDGE_WINDOW_CLOSED');assert.equal(t.writes.length,1);assert.equal(t.props.get(key),raw);assert(!JSON.stringify(t.logs).includes('PRIVATE_WRITE_ERROR'));
});
test('the final hook runs under the same physical lock and is not swallowed as an uncertain write',()=>{
 const t=fixture();t.authorize();const original=t.ctx.domusRetencionAdminCrear_;let checked=false;
 t.ctx.domusRetencionAdminCrear_=(input,guard)=>original(input,()=>{assert(t.locks().held);checked=true;guard();});
 assert.equal(t.create().status,'CREATED');assert(checked);assert.equal(t.locks().acquires,t.locks().releases);
});
test('bridge is absent from bundles and dispatcher; it cannot activate, delete properties or self-remove',()=>{
 assert(!/deleteProperty|deleteAllProperties|newTrigger|UrlFetchApp|registrarLimiteHistorico\s*\(|\.setProperty\s*\(/.test(bridge));
 const manifest=JSON.parse(fs.readFileSync(root+'/release-manifest.json','utf8'));assert(!Object.keys(manifest.files).some(x=>x.includes('StagingRetentionBridge')));
 const t=fixture();for(const action of ['domusInspeccionarRetencionTemporal','domusRegistrarRetencionTemporal']){
  assert.equal(t.ctx.dispatchNativeAction({action,args:[],role:'GERENCIA',requestId:'SYNTHETIC-bridge',deviceId:'fixture-device'}).ok,false);
 }
 assert.equal(t.writes.length,0);
});
test('removing all write bridge functions leaves only independent read-only inspection',()=>{
 const t=fixture();t.authorize();assert.equal(t.create().status,'CREATED');const raw=t.props.get(key);
 for(const name of [...bridge.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)].map(m=>m[1]))delete t.ctx[name];
 assert.equal(typeof t.ctx.domusRegistrarRetencionTemporal,'undefined');assert.equal(t.read().status,'READ_ONLY');assert.equal(t.props.get(key),raw);assert.equal(t.writes.length,1);
 assert(!/domusRetencionAdminCrear_|domusRegistrarAprobacionRetencion_|domusRetencionPuente|setProperty/.test(reader));
});
test('independent reader still denies an unauthenticated identity',()=>{
 const t=fixture();t.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.test'});assert.equal(t.read().ok,false);assert.equal(t.reads.length,0);assert.equal(t.writes.length,0);
});
console.log(JSON.stringify({suite:'retention-temporary-bridge',passed,syntheticOnly:true,liveGoogle:false,realPropertyWrites:0,devAccessible:true,editorOnly:false,operatorRemovalRequired:true}));

