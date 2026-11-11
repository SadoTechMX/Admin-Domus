'use strict';
// Actual modules/bundle, synthetic records only. No private IDs or Google.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {fixture:base}=require('./staging_opening_isolation_regressions');
const copy=v=>JSON.parse(JSON.stringify(v)),key='DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1';
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function addGroups(t){
 t.retainedIds=Array.from({length:17},(_,i)=>'SYNTHETIC-uncertain-'+String(i).padStart(2,'0'));
 t.s.getRange(2,1,17,8).setValues(t.retainedIds.map((id,i)=>[id,i<15?'accesoSimpleRegistrar':'guardarropaDevolver','a'.repeat(64),'old-synthetic-device','FAILED',
  '2020-01-01T00:00:00.000Z','',JSON.stringify({error:'UNKNOWN_EFFECTS',privateBody:'DO_NOT_EXPORT_PRIVATE_BODY'})]));
 return t;
}
function fixture(env){
 const t=addGroups(base(env));if(!env)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/Build.gs'),'utf8'),t.ctx);
 t.input.isolationMode='STAGING_FRESH_START_V1';t.input.backup={reference:'SYNTHETIC backup',sha256:'b'.repeat(64)};
 t.input.queue=Array.from({length:15},(_,i)=>({requestId:'SYNTHETIC-held-'+i,action:'cajaSimpleRegistrar'}));
 t.input.evidenceReference='RETAINED_UNKNOWN_V1|'+'a'.repeat(64)+'|15|SYNTHETIC manifest';
 t.allowRetention=()=>{const d=t.propose();assert.equal(d.kind,'STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1');
  const approval={version:1,mode:'STAGING_ACCESS_WARDROBE_17_V1',approved:true,evidenceHash:d.evidenceHash,
   approvalReference:'SYNTHETIC approval only',confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true};
  t.props.set(key,JSON.stringify(approval));return {diagnostic:d,approval};};
 t.approveBoundary=()=>{const p=t.propose();assert(p.snapshotHash);t.props.set('DOMUS_STAGING_FRESH_START_APPROVAL_V1',JSON.stringify({version:1,approved:true,
  mode:t.input.isolationMode,snapshotHash:p.snapshotHash,approvalReference:'SYNTHETIC boundary approval',backupSha256:t.input.backup.sha256,
  confirmStationsHeld:true,confirmBackupVerified:true,confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true}));
  return {...copy(t.input),snapshotHash:p.snapshotHash,confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true,
   confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true};};
 t.activate=()=>{t.body=t.approveBoundary();return t.call('registrarLimiteHistorico',t.body,'fixture-isolation');};return t;
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
if(require.main===module){
for(const env of [undefined,'STAGING'])test((env||'modules')+': unapproved diagnosis has no snapshot; approved proposal preserves 17 uncertain groups and 15 held pairs without writes',()=>{
 const t=fixture(env),before=snapshot(t),props=JSON.stringify([...t.props]);
 const d=t.propose();assert.equal(d.kind,'STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1');assert(!('snapshotHash'in d));assert(!('snapshot'in d));
 assert.equal(d.canActivate,false);assert.equal(d.resolved,false);assert.equal(d.financialFinal,false);assert.equal(d.approvalRequired,true);
 assert.deepEqual(copy(d.evidence.counts),{groups:17,access:15,wardrobe:2});assert.equal(d.evidenceHash,t.ctx.historyHash_(d.evidence));
 assert(!JSON.stringify(d).includes('DO_NOT_EXPORT_PRIVATE_BODY'));assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),props);
 const {approval}=t.allowRetention(),afterProps=JSON.stringify([...t.props]),p=t.propose();assert(p.snapshotHash);
 assert.equal(p.snapshot.retainedUncertain.evidenceHash,approval.evidenceHash);assert.equal(p.snapshot.counts.retainedUncertainIds,17);assert.equal(p.snapshot.counts.remainingUncertainIds,17);
 assert.equal(p.snapshot.counts.uncertainIds,24);assert.equal(p.snapshot.counts.queueIds,15);assert.equal(p.canActivate,false);assert.equal(p.resolved,false);
 assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),afterProps);assert.equal(t.locks().acquires,t.locks().releases);
});
for(const variant of ['missing','false','hash','mode','backup','held','unresolved','reference','malformed'])test('no proposal for insufficient retention approval: '+variant,()=>{
 const t=fixture(),{approval}=t.allowRetention();
 if(variant==='missing')t.props.delete(key);else if(variant==='malformed')t.props.set(key,'{');else{
  if(variant==='false')approval.approved=false;if(variant==='hash')approval.evidenceHash='c'.repeat(64);if(variant==='mode')approval.mode='OTHER';
  if(variant==='backup')approval.confirmBackupVerified=false;if(variant==='held')approval.confirmStationsHeld=false;if(variant==='unresolved')approval.acknowledgeUnresolvedHistory=false;
  if(variant==='reference')approval.approvalReference='';t.props.set(key,JSON.stringify(approval));}
 const before=snapshot(t),d=t.propose();assert.equal(d.kind,'STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1');assert(!d.snapshotHash);assert.equal(snapshot(t),before);
});
for(const variant of ['response','formula','backup','queue','manifest','commercial','policy'])test('changed evidence requires a new specific approval: '+variant,()=>{
 const t=fixture(),{diagnostic}=t.allowRetention();
 if(variant==='response')t.s.getRange(2,8).setValue('{"error":"changed"}');if(variant==='formula')t.s.getRange(2,8).setValue('="changed"');
 if(variant==='backup')t.input.backup.sha256='c'.repeat(64);if(variant==='queue')t.input.queue[0].requestId='SYNTHETIC-held-replacement';
 if(variant==='manifest')t.input.evidenceReference+=' changed';if(variant==='commercial')t.main.getSheetByName('COBROS').put(7,6,99);
 if(variant==='policy'){const p=JSON.parse(t.props.get('DOMUS_JOURNEY_POLICY_V1'));p.scopes[0].projectName='Changed';t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(p));}
 const before=snapshot(t),d=t.propose();assert.equal(d.kind,'STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1');assert.notEqual(d.evidenceHash,diagnostic.evidenceHash);assert(!d.snapshotHash);assert.equal(snapshot(t),before);
});
for(const variant of ['16','18','ratio','completed-conflict','mixed-action','unknown-action','processing','review','known-no-effects','journey','prepared','completed-journal','orphan-part','orphan-row'])
 test('scope and integrity cannot be broadened by retention approval: '+variant,()=>{
  const t=fixture();t.allowRetention();
  if(variant==='16')t.s.getRange(2,1,1,8).setValues([Array(8).fill('')]);
  if(['18','completed-conflict','mixed-action'].includes(variant)){
   const r=t.s.getRange(2,1,1,8).getValues()[0];if(variant==='18')r[0]='SYNTHETIC-extra';if(variant==='completed-conflict')r[4]='COMPLETED';if(variant==='mixed-action')r[1]='guardarropaDevolver';t.s.getRange(20,1,1,8).setValues([r]);}
  if(variant==='ratio')t.s.getRange(2,2).setValue('guardarropaDevolver');if(variant==='unknown-action')t.s.getRange(2,2).setValue('anotherAction');
  if(variant==='processing')t.s.getRange(2,5).setValue('PROCESSING');if(variant==='review')t.s.getRange(2,5).setValue('REQUIRES_REVIEW');
  if(variant==='known-no-effects')t.s.getRange(2,8).setValue('{"code":"JOURNEY_VALIDATION_NO_EFFECTS","status":422}');
  if(variant==='journey')t.s.getRange(2,8).setValue('{"journey":{}}');
  if(['prepared','completed-journal'].includes(variant))t.ctx.journalSheet_(t.main).appendRow([t.retainedIds[0],'accesoSimpleRegistrar',variant==='prepared'?'PREPARED':'COMPLETED','[]','{}','2020-01-01T00:00:00.000Z']);
  if(variant==='orphan-part')t.ctx.journalSheet_(t.main).appendRow(['SYNTHETIC-orphan#part:0','JOURNAL_PART','COMPLETED','[]','','2020-01-01T00:00:00.000Z']);
  if(variant==='orphan-row')t.ctx.journalSheet_(t.main).appendRow(['','accesoSimpleRegistrar','PREPARED','[]','{}','2020-01-01T00:00:00.000Z']);
  const before=snapshot(t);assert.throws(t.propose);assert.equal(snapshot(t),before);
 });
test('retention approval alone does not authorize a boundary or any business effects',()=>{
 const t=fixture();t.allowRetention();const before=business(t);assert.throws(()=>t.call('registrarLimiteHistorico',{...t.input,snapshotHash:t.propose().snapshotHash,
  confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true,confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true},
  'SYNTHETIC-unapproved-boundary'),/Falta aprobación explícita/);
 assert.equal(business(t),before);assert.equal(t.ctx.journalFind_('SYNTHETIC-unapproved-boundary',t.main),null);
});
test('evidence and approval are read under the existing project lock',()=>{
 const t=fixture(),original=t.ctx.LockService.getScriptLock;let locked=false,checked=0;
 t.ctx.LockService.getScriptLock=()=>{const lock=original();return {waitLock:n=>{lock.waitLock(n);locked=true;},releaseLock:()=>{locked=false;lock.releaseLock();}};};
 const evidence=t.ctx.historyRetentionEvidence_,approval=t.ctx.historyRetentionApproval_;
 t.ctx.historyRetentionEvidence_=(...args)=>{assert(locked);checked++;return evidence(...args);};
 t.ctx.historyRetentionApproval_=(...args)=>{assert(locked);checked++;return approval(...args);};
 t.allowRetention();const p=t.propose();assert(p.snapshotHash);assert.equal(checked,4);assert.equal(locked,false);
});
test('revoked or stale retention approval between proposal and registration cannot activate',()=>{
 const t=fixture();t.allowRetention();const body=t.approveBoundary(),before=business(t);t.props.delete(key);
 assert.throws(()=>t.call('registrarLimiteHistorico',body,'SYNTHETIC-stale-approval'));
 assert.equal(business(t),before);assert.equal(t.ctx.journalFind_('SYNTHETIC-stale-approval',t.main),null);
});
test('separately approved mock boundary preserves originals and fences ACK, replay and references for every retained group',()=>{
 const t=fixture('STAGING');t.allowRetention();const before=business(t),prefix=t.s.getRange(1,1,139,8).getValues();const b=t.activate();
 assert.equal(b.resolved,false);assert.equal(b.financialFinal,false);assert.equal(b.newCharge,0);assert.equal(b.inventoryMovement,0);
 assert.equal(business(t),before);assert.deepEqual(t.s.getRange(1,1,139,8).getValues(),prefix);
 assert.equal(t.ctx.paymentRequestIndex_(t.main).size,27);assert.equal(t.ctx.historyOperationalIndex_(t.main).size,1);
 const frozen=snapshot(t);
 const held=e=>e.code==='HISTORY_REQUIRES_REVIEW' && /retenido/.test(e.message);
 for(const id of t.retainedIds){
  assert.throws(()=>t.ctx.idempotentExecute_(id,'accesoSimpleRegistrar',{},'fixture-device',()=>assert.fail('REPLAY')),held);
  assert.throws(()=>t.ctx.journalResume_(id,'accesoSimpleRegistrar',t.main),held);
  assert.throws(()=>t.ctx.idempotentExecute_('new-'+id,'guardarropaDevolver',{ticket:'REF '+id},'fixture-device',()=>assert.fail('REPLACEMENT')),held);
 }
 assert.equal(snapshot(t),frozen);assert.deepEqual(t.call('registrarLimiteHistorico',t.body,'fixture-isolation'),b);
 t.props.delete(key);assert.equal(t.ctx.historyBoundary_(t.main).result.snapshot.retainedUncertain.evidenceHash,b.snapshot.retainedUncertain.evidenceHash);
 t.call('turnoAbrir',{scopeId:'QA',openingFloat:25,historyBoundaryId:'fixture-isolation'},'fixture-new-open','CAJA');
 assert.equal(t.state().active.openingFloat,25);t.cut();assert.equal(business(t),before);
});
test('a retained ID appended after the mock boundary stops new opening rather than being adopted',()=>{
 const t=fixture();t.allowRetention();t.activate();t.s.appendRow(t.s.getRange(2,1,1,8).getValues()[0]);const before=snapshot(t);
 assert.throws(t.open);assert.equal(snapshot(t),before);
});
for(const env of ['PRODUCTION','wrong-project','nine-only'])test('new retention scope never applies outside fresh canonical staging: '+env,()=>{
 const t=fixture(env==='PRODUCTION'?env:'STAGING');if(env==='wrong-project')t.ctx.ScriptApp.getScriptId=()=> 'OTHER';if(env==='nine-only')t.input.isolationMode=t.ctx.stagingIsolationMode_();
 const before=snapshot(t);assert.throws(t.propose);assert.equal(snapshot(t),before);
});
console.log(JSON.stringify({suite:'staging-uncertain-retention',passed,syntheticOnly:true,liveGoogle:false,realApproval:false,realActivation:false}));
}
module.exports={fixture,addGroups};
