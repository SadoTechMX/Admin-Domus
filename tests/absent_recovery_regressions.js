'use strict';
// Actual dispatcher/modules/bundles, synthetic in-memory books. No live actions.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {backend,ui,originals,snapshot,copy}=require('./unconfirmed_observation_regressions');
const build=require('../release-manifest.json').build.sourceSha256;
const GATE='DOMUS_QA_ABSENT_RECOVERY_GATE_V1',APPROVAL='DOMUS_QA_ABSENT_RECOVERY_APPROVAL_V1';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function setup(env){
 const b=backend(false,env);for(const book of [b.main,b.ops]){book.getSheets=()=>[...book.sheets.values()];let id=0;for(const sheet of book.sheets.values()){const n=++id;sheet.getSheetId=()=>n;}}
 b.inputObserve.originalAttemptHash='b'.repeat(64);
 b.invoke=(action,p=b.inputObserve)=>b.ctx.executeDomusAction_(action,{args:[copy(p)],requestId:p.requestId,role:'CAJA',deviceId:p.deviceId,sessionToken:b.observationToken}).result;
 b.prepare=()=>b.invoke('prepararRecuperacionQaAusente');
 b.approve=()=>{const proposal=b.prepare(),now=Date.now();b.approval={version:1,approved:true,approvalId:'SYNTHETIC-exact-approval',approvedBy:'direccion@domusccc.net',approvalReference:'SYNTHETIC user approval only',evidenceHash:proposal.evidenceHash,issuedAt:now,expiresAt:now+600000,confirmSameIdBody:true,confirmStationsHeld:true,confirmOldExecutionsTerminated:true,confirmIncompatibleWritersDisabled:true,executorBarrierEvidenceHash:'c'.repeat(64),allowedLateSourceSha256:['2412ae75708c2991e1ff92b9259473d638b573e2b5d2d427e0027fd605a0463f']};b.props.set(APPROVAL,JSON.stringify(b.approval));b.recovery={...copy(b.inputObserve),approvalId:b.approval.approvalId,confirmPotentialOpening:true,confirmSameId:true,confirmPayloadHash:proposal.evidence.payloadHash,confirmEvidenceHash:proposal.evidenceHash};return proposal;};
 b.recover=()=>b.invoke('recuperarAperturaQaAusente',b.recovery);
 b.guard=()=>{assert.throws(()=>b.invoke('turnoEstado'),/GATE_HELD/);assert.throws(()=>b.ctx.idempotentExecute_(b.inputObserve.requestId,'turnoAbrir',copy(b.inputObserve.body),b.inputObserve.deviceId,()=>assert.fail('generic callback')),/GATE_HELD/);assert.throws(()=>b.ctx.journalResume_(b.inputObserve.requestId,'turnoAbrir',b.main),/GATE_HELD/);assert.throws(()=>b.ctx.journeyContext_(b.main,b.inputObserve.requestId,new Date()),/GATE_HELD/);};
 b.legacy=(version='v2')=>{const ctx=vm.createContext({...b.ctx});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'fixtures/legacy_recovery_backend_'+version+'.gs'),'utf8'),ctx);return ()=>ctx.executeDomusAction_('turnoAbrir',{args:[copy(b.inputObserve.body)],requestId:b.inputObserve.requestId,deviceId:b.inputObserve.deviceId,role:'CAJA',sessionToken:b.observationToken}).result;};
 return b;
}
function business(b){return JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));}
function instrument(b,hook){
 let step=0;const actions=[];const event=(phase,name,fn)=>{const n=phase==='before'?++step:step;hook?.({phase,name,n,b});return n;};
 for(const book of [b.main,b.ops])for(const sheet of book.sheets.values()){
  const get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const range=get(...args),set=range.setValues.bind(range);range.setValues=values=>{const name='cells:'+sheet.getName()+':'+args[0]+':'+args[1];event('before',name);actions.push(name);const r=set(values);event('after',name);return r;};return range;};
 }
 const flush=b.ctx.SpreadsheetApp.flush;b.ctx.SpreadsheetApp.flush=()=>{event('before','flush');actions.push('flush');const r=flush();event('after','flush');return r;};
 const props=b.ctx.PropertiesService.getScriptProperties;b.ctx.PropertiesService.getScriptProperties=()=>({...props(),setProperty:(k,v)=>{event('before','property:'+k);actions.push('property:'+k);const r=props().setProperty(k,v);event('after','property:'+k);return r;}});
 return {actions,steps:()=>step};
}
async function main(){
 for(const env of [undefined,'STAGING'])await test((env||'modules')+': successful explicit absent-only recovery preserves business and global hold',()=>{
  const b=setup(env),businessBefore=business(b),proposal=b.approve(),beforeLedger=b.s.getRange(1,1,b.s.getLastRow(),8).getValues(),j=b.main.getSheetByName('DOMUS_JOURNAL'),beforeJournal=j.getRange(1,1,j.getLastRow(),6).getValues();
  const tracking=instrument(b);for(const n of ['idempotentExecute_','journalCommit_','journalResume_','turnoAbrir'])b.ctx[n]=()=>assert.fail('forbidden recovery helper '+n);
  const r=b.recover();assert.equal(r.requestId,b.inputObserve.requestId);assert.equal(r.canRelease,false);assert.equal(r.canRetry,false);assert.equal(r.operationalGate,'HELD');assert.equal(business(b),businessBefore);
  assert.deepEqual(copy(b.s.getRange(1,1,beforeLedger.length,8).getValues()),copy(beforeLedger));assert.deepEqual(copy(j.getRange(1,1,beforeJournal.length,6).getValues()),copy(beforeJournal));
  assert.equal(b.entry().values[2],proposal.evidence.payloadHash);assert.equal(b.entry().values[4],'COMPLETED');assert.equal(b.plan().data[2],'COMPLETED');assert.equal(JSON.parse(b.props.get(GATE)).state,'COMMITTED_REQUIRES_REVIEW');
  assert.equal(tracking.actions.filter(n=>n.startsWith('cells:')).length,4);assert.equal(tracking.actions.filter(n=>n.startsWith('property:')).length,2);
  assert.throws(()=>b.recover(),/GATE_HELD/);assert.throws(()=>b.invoke('turnoEstado'),/GATE_HELD/);assert.equal(b.inspect().status,'OBSERVED_CONFIRMED');
  assert.equal(b.locks().acquires,b.locks().releases);
 });
 await test('read-only proposal neither approves nor writes any recovery state',()=>{
  const b=setup(),before=snapshot(b),props=JSON.stringify([...b.props]),r=b.prepare();assert.equal(r.canRecover,false);assert.equal(r.canRetry,false);assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);assert.equal(b.props.has(GATE),false);
 });
 for(const variant of ['missing','expired','future','too-long','wrong-evidence','wrong-manager','barrier','held','not-terminated','unknown-executor','consent','changed-body','changed-device','changed-attempt','extra-field'])await test('missing/stale/mismatched authorization rejects without writing: '+variant,()=>{
  const b=setup();b.approve();const a=copy(b.approval);
  if(variant==='missing')b.props.delete(APPROVAL);else{
   if(variant==='expired')a.expiresAt=Date.now()-1;if(variant==='future')a.issuedAt=Date.now()+5000;if(variant==='too-long')a.expiresAt=a.issuedAt+600001;if(variant==='wrong-evidence')a.evidenceHash='0'.repeat(64);if(variant==='wrong-manager')a.approvedBy='not-authorized';if(variant==='barrier')a.confirmIncompatibleWritersDisabled=false;if(variant==='held')a.confirmStationsHeld=false;if(variant==='not-terminated')a.confirmOldExecutionsTerminated=false;if(variant==='unknown-executor')a.allowedLateSourceSha256=['0'.repeat(64)];if(variant==='extra-field')a.extra='UNEXPECTED';
   b.props.set(APPROVAL,JSON.stringify(a));
  }
  if(variant==='consent')b.recovery.confirmPotentialOpening=false;if(variant==='changed-body')b.recovery.body.scopeId='OTHER';if(variant==='changed-device')b.recovery.deviceId='OTHER';if(variant==='changed-attempt')b.recovery.originalAttemptHash='0'.repeat(64);
  const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.recover());assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 for(const variant of ['request','journal','legacy','commercial','policy','other-opening'])await test('change after approval rejects absent-only without replay: '+variant,()=>{
  const b=setup();b.approve();if(variant==='request')b.s.appendRow([b.inputObserve.requestId,'turnoAbrir',b.recovery.confirmPayloadHash,b.inputObserve.deviceId,'PROCESSING',new Date().toISOString(),'','null']);
  if(variant==='journal')b.main.getSheetByName('DOMUS_JOURNAL').appendRow([b.inputObserve.requestId,'turnoAbrir','PREPARED','[]','{}',new Date().toISOString()]);
  if(variant==='legacy')b.props.set('idemp:'+b.inputObserve.requestId,'SYNTHETIC-old-evidence');if(variant==='commercial')b.main.getSheetByName('COBROS').put(8,2,'SYNTHETIC-external');if(variant==='policy')b.props.set('DOMUS_JOURNEY_POLICY_V1','{}');if(variant==='other-opening')b.call('turnoAbrir',{...copy(b.inputObserve.body),id:'SYNTHETIC-other',requestId:'SYNTHETIC-other'},'SYNTHETIC-other','CAJA');
  const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.recover());assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 for(let step=1;step<=10;step++)for(const phase of ['before','after'])await test('failure '+phase+' durable operation '+step+' preserves uncertainty, gate and same-ID deduplication',()=>{
  const b=setup();b.approve();const old=b.legacy(),before=snapshot(b),businessBefore=business(b);let injected=false;
  instrument(b,e=>{if(e.n===step && e.phase===phase){injected=true;throw Error('SYNTHETIC_FAILURE');}});
  assert.throws(()=>b.recover(),/SYNTHETIC_FAILURE/);assert(injected);assert.equal(business(b),businessBefore);
  if(b.props.has(GATE))b.guard();else assert.equal(snapshot(b),before);
  const prior=b.entry(),fenced=prior && prior.values[2].startsWith('QA_RECOVERY_FENCE_V1:');
  if(fenced)assert.throws(old);else {const r=old();assert.equal(r.openingRequestId,b.inputObserve.requestId);}
  assert.equal(b.s.getRange(2,1,b.s.getLastRow()-1,8).getValues().filter(r=>r[0]===b.inputObserve.requestId).length,1);
  assert.equal(business(b),businessBefore);if(b.props.has(GATE)){const after=snapshot(b);assert.throws(()=>b.recover(),/GATE_HELD/);assert.equal(snapshot(b),after);b.guard();}
 });
 for(const writeNo of [1,2,3,4])for(const prefix of (writeNo===2?[0,1,2,3,4,5]:writeNo===4?[0,1]:[0,1,2,3,4,5,6,7]))await test('partial write '+writeNo+' prefix '+prefix+' never resumes or removes the global barrier',()=>{
  const b=setup();b.approve();const businessBefore=business(b);let n=0,hit=false;
  for(const book of [b.main,b.ops])for(const sheet of book.sheets.values()){
   const get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const r=get(...args),set=r.setValues.bind(r);r.setValues=rows=>{if(++n===writeNo){hit=true;for(let k=0;k<Math.min(prefix,rows[0].length);k++)sheet.put(args[0],args[1]+k,rows[0][k]);throw Error('SYNTHETIC_PARTIAL');}return set(rows);};return r;};
  }
  assert.throws(()=>b.recover(),/SYNTHETIC_PARTIAL/);assert(hit);assert(b.props.has(GATE));b.guard();assert.equal(business(b),businessBefore);
  const before=snapshot(b);assert.throws(()=>b.recover(),/GATE_HELD/);assert.equal(snapshot(b),before);
 });
 for(let target=1;target<=4;target++)await test('uncertain readback after write '+target+' cannot progress',()=>{
  const b=setup();b.approve();let n=0,pending=null;
  for(const book of [b.main,b.ops])for(const sheet of book.sheets.values()){
   const get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const r=get(...args),set=r.setValues.bind(r),read=r.getValues.bind(r),key=sheet.getName()+':'+args[0]+':'+args[1];
    r.setValues=v=>{const result=set(v);if(++n===target)pending=key;return result;};r.getValues=()=>{const v=read();if(pending===key){pending=null;v[0][0]='SYNTHETIC_INCONSISTENT_READBACK';}return v;};return r;};
  }
  assert.throws(()=>b.recover(),/READBACK_UNCERTAIN/);assert.equal(n,target);b.guard();
 });
 await test('two separate execution contexts cannot enter during any held write/flush; second recovery remains denied afterwards',()=>{
  const b=setup();b.approve();const old=b.legacy(),ctx=vm.createContext({...b.ctx});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_STAGING_BUNDLE.gs'),'utf8'),ctx);
  const peer=()=>ctx.executeDomusAction_('recuperarAperturaQaAusente',{args:[copy(b.recovery)],requestId:b.recovery.requestId,role:'CAJA',deviceId:b.recovery.deviceId,sessionToken:b.observationToken}).result;let probes=0;
  instrument(b,e=>{if(e.phase==='after'){assert.throws(old,/otra transacción/);assert.throws(peer,/otra transacción/);probes+=2;}});
  b.recover();assert.equal(probes,20);assert.throws(peer,/GATE_HELD/);assert.equal(old().openingRequestId,b.inputObserve.requestId);b.guard();
 });
 for(const variant of ['approval','session','expiry','policy','target'])await test('change after durable fence aborts without overwrite or cleanup: '+variant,()=>{
  const b=setup();b.approve();const row=b.s.getLastRow()+1;
  instrument(b,e=>{if(e.n===3 && e.phase==='after'){
   if(variant==='approval')b.props.delete(APPROVAL);if(variant==='session')b.props.delete('ses:'+b.observationToken);
   if(variant==='expiry'){const NativeDate=b.ctx.Date,offset=700000;b.ctx.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NativeDate.now()+offset]));}static now(){return NativeDate.now()+offset;}};}
   if(variant==='policy')b.props.set('DOMUS_JOURNEY_POLICY_V1','{}');if(variant==='target')b.s.put(row,4,'SYNTHETIC_EXTERNAL_EDIT');
  }});
  assert.throws(()=>b.recover());assert(b.props.has(GATE));if(variant==='target')assert.equal(b.s.raw(row,4),'SYNTHETIC_EXTERNAL_EDIT');assert.notEqual(b.s.raw(row,3),b.recovery.confirmPayloadHash);
 });
 await test('durable fence blocks operational readers even after external removal of the property',()=>{
  const b=setup();b.approve();instrument(b,e=>{if(e.n===8 && e.phase==='before')throw Error('STOP_BEFORE_PUBLICATION');});assert.throws(()=>b.recover(),/STOP_BEFORE_PUBLICATION/);
  b.props.delete(GATE);assert.equal(b.entry().values[4],'COMPLETED');assert.throws(()=>b.invoke('turnoEstado'),/DURABLE_FENCE_HELD/);assert.throws(()=>b.ctx.journeyContext_(b.main,b.inputObserve.requestId,new Date()),/DURABLE_FENCE_HELD/);
 });
 await test('active gate rejects observation of another ID before any sheet is opened',()=>{
  const b=setup();b.approve();b.recover();const p=copy(b.inputObserve);p.requestId=p.body.id=p.body.requestId='SYNTHETIC-other';b.ctx.SpreadsheetApp.openById=()=>assert.fail('must not open');assert.throws(()=>b.inspect(p),/GATE_HELD/);
 });
 await test('proposal rejects session revoked during full inventory',()=>{
  const b=setup(),old=b.ctx.qaRecoveryInventory_;b.ctx.qaRecoveryInventory_=(...a)=>{const r=old(...a);b.props.delete('ses:'+b.observationToken);return r;};assert.throws(()=>b.prepare(),/SESSION_INVALID/);assert.equal(b.props.has(GATE),false);
 });
 for(const timing of ['first','fenced','published'])await test('exact V20 late executor '+timing+' remains same-ID and cannot duplicate binding',()=>{
  const b=setup();b.approve();const old=b.legacy('v20'),businessBefore=business(b);
  if(timing==='first'){old();const before=snapshot(b);assert.throws(()=>b.recover(),/NOT_ABSENT/);assert.equal(snapshot(b),before);assert.equal(b.props.has(GATE),false);}
  if(timing==='fenced'){instrument(b,e=>{if(e.n===8 && e.phase==='before')throw Error('STOP');});assert.throws(()=>b.recover(),/STOP/);const before=snapshot(b);assert.throws(old);assert.equal(snapshot(b),before);b.guard();}
  if(timing==='published'){b.recover();const before=snapshot(b);assert.equal(old().openingRequestId,b.inputObserve.requestId);assert.equal(snapshot(b),before);b.guard();}
  assert.equal(business(b),businessBefore);assert.equal(b.s.getRange(2,1,b.s.getLastRow()-1,8).getValues().filter(r=>r[0]===b.inputObserve.requestId).length,1);
 });
 for(const malformed of [' x','x ','=FORMULA','x#part:0','x\nother',''])await test('malformed original identity cannot be normalized into recovery: '+JSON.stringify(malformed),()=>{
  const b=setup();b.approve();b.recovery.requestId=b.recovery.body.id=b.recovery.body.requestId=malformed;const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.recover());assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 await test('real historical custody guard rejects retained reference in authenticated operator before approval or writes',()=>{
  const b=setup(),raw=JSON.parse(b.props.get('ses:'+b.observationToken));raw.operator='SYNTHETIC-uncertain-00';const encoded=JSON.stringify(raw);b.props.set('ses:'+b.observationToken,encoded);b.ctx.CacheService.getScriptCache().put('ses:'+b.observationToken,encoded);b.inputObserve.operator=raw.operator;const before=snapshot(b);
  assert.throws(()=>b.prepare(),/referencia retenida/);assert.equal(snapshot(b),before);assert.equal(b.props.has(GATE),false);
 });
 await test('retained reference in approval marker is rejected before even the gate claim',()=>{
  const b=setup();b.approve();b.approval.approvalId=b.recovery.approvalId='SYNTHETIC-uncertain-00';b.props.set(APPROVAL,JSON.stringify(b.approval));const before=snapshot(b),props=JSON.stringify([...b.props]);
  assert.throws(()=>b.recover(),/referencia retenida/);assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 console.log(JSON.stringify({suite:'absent-only-recovery',passed,realOperations:0,deployments:0,originalUnconfirmedTouched:false}));
}
module.exports={setup,business,instrument};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
