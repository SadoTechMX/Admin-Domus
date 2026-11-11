'use strict';
// Real history/admin code, synthetic services and injected concurrent mutations.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const {fixture}=require('./staging_uncertain_retention_regressions');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const helper=read('scripts/apps-script-admin/StagingRetentionApproval.gs');
const companion=read('scripts/apps-script-admin/StagingRetentionReadView.gs');
const key='DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1';
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const copy=v=>JSON.parse(JSON.stringify(v));
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
function journal(t){
 t.s.getRange(20,1,1,8).setValues([['SYNTHETIC-race','cajaSimpleRegistrar','a'.repeat(64),'synthetic','COMPLETED','','','{}']]);
 const j=t.ctx.journalSheet_(t.main);j.appendRow(['SYNTHETIC-race','cajaSimpleRegistrar','COMPLETED','[]','{}','']);return j;
}
for(const env of [undefined,'STAGING'])test((env||'modules')+': journal change between validation and prefix never binds PREPARED to a COMPLETED validation',()=>{
 const t=fixture(env),j=journal(t),prefix=t.ctx.historyPrefix_;let changed=false,seen;
 t.ctx.historyPrefix_=(sheet,...args)=>{
  if(sheet.getName()==='DOMUS_JOURNAL'&&!changed){j.put(2,3,'PREPARED');changed=true;seen=sheet.getRange(1,1,2,6).getValues()[1][2];}
  return prefix(sheet,...args);
 };
 const props=JSON.stringify([...t.props]);assert.throws(t.propose,/evidencia cambió/);assert(changed);assert.equal(seen,'COMPLETED');
 assert.equal(j.raw(2,3),'PREPARED');assert.equal(JSON.stringify([...t.props]),props);assert.equal(t.locks().held,false);
});
for(const variant of ['journal-status','journal-plan','request-status','request-response','request-formula','commercial-value','commercial-formula','shift-status','date-type','timezone','sheet-id'])test('same dimensions changed after snapshot reject without writes: '+variant,()=>{
 const t=fixture('STAGING'),j=journal(t),c=t.main.getSheetByName('COBROS'),turn=t.main.getSheetByName('TURNOS');
 c.put(22,33,'=""');t.s.getSheetId=()=>17;
 if(['date-type','timezone'].includes(variant))turn.put(2,3,new Date('2020-01-01T06:00:00.000Z'));
 const original=t.ctx.historySnapshot_;let after;
 t.ctx.historySnapshot_=(...args)=>{
  const result=original(...args);
  if(variant==='journal-status')j.put(2,3,'PREPARED');if(variant==='journal-plan')j.put(2,4,'[{"changed":true}]');
  if(variant==='request-status')t.s.put(2,5,'REQUIRES_REVIEW');if(variant==='request-response')t.s.put(2,8,'{"changed":true}');
  if(variant==='request-formula')t.s.put(2,7,'=""');if(variant==='commercial-value')c.put(7,6,99);
  if(variant==='commercial-formula')c.put(22,33,'=IF(TRUE,"","")');if(variant==='shift-status')turn.put(2,12,'CLOSED');
  if(variant==='date-type')turn.put(2,3,'2020-01-01T06:00:00.000Z');if(variant==='timezone')t.main.timeZone='UTC';
  if(variant==='sheet-id')t.s.getSheetId=()=>18;
  after=snapshot(t);return result;
 };
 const props=JSON.stringify([...t.props]);assert.throws(t.propose,/evidencia cambió/);assert.equal(snapshot(t),after);assert.equal(JSON.stringify([...t.props]),props);
});
for(const order of ['small-first','large-first'])test('overlapping ranges return one captured grid in either order: '+order,()=>{
 const t=fixture(),j=journal(t),view=t.ctx.historyReadView_(t.main),s=view.book.getSheetByName('DOMUS_JOURNAL');
 const a=s.getRange(order==='small-first'?2:1,1,order==='small-first'?1:2,6);a.getValues();
 j.put(2,3,'PREPARED');const b=s.getRange(order==='small-first'?1:2,1,order==='small-first'?2:1,6).getValues();
 assert.equal(b[order==='small-first'?1:0][2],'COMPLETED');assert.throws(view.assertDimensions,/evidencia cambió/);
});
for(const moment of ['initial-between-values-formulas','final-values','final-formulas','final-read-error'])test('concurrent mutation/read error during capture or final verification rejects: '+moment,()=>{
 const t=fixture('STAGING'),j=journal(t),get=j.getRange.bind(j);let fullReads=0,changed=false;
 j.getRange=(...args)=>{
  const r=get(...args);if(args[0]===1&&args[1]===1&&args[2]===2&&args[3]===6){
   const values=r.getValues.bind(r),formulas=r.getFormulas.bind(r);
   r.getValues=()=>{fullReads++;
    if(fullReads===2&&moment==='final-read-error')throw Error('INJECTED_FINAL_READ_FAILURE');
    if(fullReads===2&&moment==='final-values'){j.put(2,3,'PREPARED');changed=true;}
    const result=values();if(fullReads===1&&moment==='initial-between-values-formulas'){j.put(2,3,'PREPARED');changed=true;}return result;
   };
   r.getFormulas=()=>{if(fullReads===2&&moment==='final-formulas'){j.put(2,6,'=""');changed=true;}return formulas();};
  }return r;
 };
 const props=JSON.stringify([...t.props]);assert.throws(t.propose);assert(changed||moment==='final-read-error');assert.equal(JSON.stringify([...t.props]),props);
});
test('generated V16 companion is the exact same reader, with no remote mutation entry points',()=>{
 const body=read('google-apps-script/History.gs').split('function historyReadView_(source) {')[1].split('function historyPrefix_(')[0];
 assert.equal(companion.split('function domusRetencionReadView_(source) {')[1],body);
 assert(!/setProperty|setValues|deleteProperty|openById|newTrigger|UrlFetchApp/.test(companion));
 assert.deepEqual([...companion.matchAll(/^function (\w+)\(/gm)].map(m=>m[1]),['domusRetencionReadView_']);
});
function admin(env){
 const t=fixture(env==='V16'?'STAGING':env);
 if(env==='V16'){
  const code=fs.readFileSync(process.env.DOMUS_TEST_LEGACY_BUNDLE,'utf8');
  assert.equal(crypto.createHash('sha256').update(code).digest('hex'),'8ae96ee6cf60332cafbadbf902d2a4501bfe7d7d7dfe32e3ef26dc0ff5bbcf07');
  assert(code.includes('edfaad95a796a784e59a54b19c3c76966d39f1e9963af0a9262d99960960a5e4'));
  t.ctx=vm.createContext({...t.ctx});delete t.ctx.historyReadView_;vm.runInContext(code,t.ctx);
 }
 journal(t);const diagnostic=t.propose();
 t.ctx.Session.getEffectiveUser=()=>({getEmail:()=>t.ctx.Session.getActiveUser().getEmail()});
 vm.runInContext(helper,t.ctx);vm.runInContext(companion,t.ctx);
 assert.equal(t.ctx.domusRetencionAdminHashAutorizado_(),'708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b');
 t.ctx.domusRetencionAdminHashAutorizado_=()=>diagnostic.evidenceHash; // Only synthetic authorization in memory.
 t.inputAdmin={artifact:{format:'DOMUS_STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1',input:copy(t.input),diagnostic},approvalReference:'SYNTHETIC approval',expectedPropertyState:'ABSENT',confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true,confirmOnlyPrepareProposal:true,confirmPropertyWritersStopped:true};
 t.writes=[];const props=t.ctx.PropertiesService.getScriptProperties;
 t.ctx.PropertiesService.getScriptProperties=()=>({...props(),setProperty:(k,v)=>{assert.equal(k,key);assert(t.locks().held);t.writes.push([k,v]);t.props.set(k,v);}});
 t.create=()=>t.ctx.domusRetencionAdminCrear_(t.inputAdmin);return t;
}
const envs=[undefined,'STAGING'];if(process.env.DOMUS_TEST_LEGACY_BUNDLE)envs.push('V16');
for(const env of envs){
 test((env||'modules')+': companion preserves original build and diagnostic hash, and writes only one approved property',()=>{
  const t=admin(env),before=snapshot(t),build=vm.runInContext('BACKEND_BUILD.sourceSha256',t.ctx);
  t.ctx.historyReadView_=()=>assert.fail('must use reviewed companion');
  const r=t.create();assert.equal(r.status,'CREATED');assert.equal(snapshot(t),before);assert.equal(t.writes.length,1);
  const stored=JSON.parse(t.props.get(key));assert.equal(stored.evidenceHash,t.inputAdmin.artifact.diagnostic.evidenceHash);assert.equal(stored.backendSourceSha256,build);
  assert.equal(t.create().status,'EXISTING_PRESERVED');assert.equal(t.writes.length,1);
 });
 for(const moment of ['prefix','after-snapshot'])test((env||'modules')+': concurrent journal change during admin '+moment+' never creates approval',()=>{
  const t=admin(env),j=t.main.getSheetByName('DOMUS_JOURNAL');let changed=false;
  if(moment==='prefix'){
   const original=t.ctx.historyPrefix_;t.ctx.historyPrefix_=(s,...args)=>{if(s.getName()==='DOMUS_JOURNAL'&&!changed){j.put(2,3,'PREPARED');changed=true;}return original(s,...args);};
  }else{
   const original=t.ctx.historySnapshot_;t.ctx.historySnapshot_=(...args)=>{const r=original(...args);j.put(2,3,'PREPARED');changed=true;return r;};
  }
  assert.throws(t.create,/EVIDENCE_REVALIDATION_FAILED/);assert(changed);assert.equal(t.writes.length,0);assert.equal(t.props.has(key),false);
 });
}
for(const fallback of ['missing','v1-cache','wrong-companion-version'])test('admin refuses unreviewed or absent optimization instead of repeating timed-out path: '+fallback,()=>{
 const t=admin();t.ctx.domusRetencionReadView_=undefined;
 if(fallback==='missing')t.ctx.historyReadView_=undefined;
 if(fallback==='v1-cache')t.ctx.historyReadView_=s=>({book:s,assertDimensions(){}});
 if(fallback==='wrong-companion-version')t.ctx.domusRetencionReadView_=s=>({book:s,version:'V1',assertDimensions(){}});
 assert.throws(t.create,/CONSISTENT_READ_REQUIRED/);assert.equal(t.writes.length,0);
});
console.log(JSON.stringify({suite:'history-read-consistency',passed,syntheticOnly:true,liveGoogle:false,legacyBundle:process.env.DOMUS_TEST_LEGACY_BUNDLE?crypto.createHash('sha256').update(fs.readFileSync(process.env.DOMUS_TEST_LEGACY_BUNDLE)).digest('hex'):null}));
