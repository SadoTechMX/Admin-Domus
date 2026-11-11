'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{createRequire}=require('module');
const root=require('path').resolve(__dirname,'..'),req=createRequire(root+'/tests/operational_reads_regressions.js');
const setupSource=fs.readFileSync(root+'/tests/operational_reads_regressions.js','utf8').split('for(const env of')[0];
const {setup}=new Function('require',setupSource+';return {setup};')(req);
const small=req('./staging_uncertain_retention_regressions').fixture;
const currentJourneys=fs.readFileSync(root+'/google-apps-script/Journeys.gs','utf8');
const from=currentJourneys.indexOf('function turnoAbrir(p) {'),to=currentJourneys.indexOf('\nfunction turnoEstado()',from);
const legacyOpening=currentJourneys.slice(from,to).replace('    const read=historyReadView_(m);\n','').replace('      const m=read.book;\n','').replace('    read.assertDimensions();\n','').replace('journeyPrepareOpening_(read.book,p,new Date())','journeyPrepareOpening_(m,p,new Date())');
assert(!legacyOpening.includes('read.'),'baseline fixture must use uncached physical book');
const freeze=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));
let environment;
function fixture({patched=true,large=false}={}){const t=large?setup(environment):small(environment);if(!large){t.allowRetention();t.boundary=t.activate();}
 if(!patched){t.ctx.historyBoundary_=t.ctx.historyBoundaryRead_;vm.runInContext(legacyOpening,t.ctx);}
 t.open=()=>t.call('turnoAbrir',{requestId:'SYNTHETIC-PROFILE',scopeId:'QA',openingFloat:0,historyBoundaryId:t.boundary.boundaryId},'SYNTHETIC-PROFILE','CAJA');return t;}
function meter(t){const count={reads:0,firstWrite:null,writes:0,methods:{},functions:{}};
 for(const n of ['historyBoundary_','historyValidateBoundary_','journalFind_']){const f=t.ctx[n];t.ctx[n]=(...a)=>{count.functions[n]=(count.functions[n]||0)+1;return f(...a);};}
 for(const b of [t.main,t.ops])for(const sheet of b.sheets.values()){
  for(const k of ['getLastRow','getLastColumn','getName']){const f=sheet[k].bind(sheet);sheet[k]=(...a)=>{count.methods[k]=(count.methods[k]||0)+1;return f(...a);};}
  const get=sheet.getRange.bind(sheet);sheet.getRange=(...a)=>{const r=get(...a);for(const k of ['getValues','getFormulas']){const f=r[k].bind(r);r[k]=()=>{count.reads++;return f();};}for(const k of ['setValues','setValue']){const f=r[k].bind(r);r[k]=(...a)=>{count.writes++;if(count.firstWrite===null)count.firstWrite=count.reads;return f(...a);};}return r;};}
 return count;}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',environment||'modules',name);}
for(environment of [undefined,'STAGING']){
let baseline;
test('baseline and prototype return same opening and snapshot, same writes and immutable commercial books',()=>{
 const results=[];for(const patched of [false,true]){const t=fixture({patched,large:true}),before=business(t),m=meter(t),r=t.open();assert.equal(business(t),before);delete r.openedAt;results.push(r);assert.equal(t.locks().acquires,t.locks().releases);if(!patched)baseline=m;else{assert(m.reads<baseline.reads/2);assert.equal(m.writes,baseline.writes);console.log(JSON.stringify({baseline,prototype:m,syntheticOnly:true,liveLatencyMeasured:false}));}}
 assert.deepEqual(results[0],results[1]);
});
test('completed same-ID ACK has no second journal or business write',()=>{
 const t=fixture(),first=t.open(),before=freeze(t),m=meter(t);assert.deepEqual(t.open(),first);assert.equal(freeze(t),before);assert.equal(m.writes,0);
});
test('PREPARED same-ID journal resumes under original guards and preserves commercial data',()=>{
 const t=fixture(),r=t.open(),j=t.main.getSheetByName('DOMUS_JOURNAL'),record=t.ctx.requestRecordEntry_(t.s,'SYNTHETIC-PROFILE'),plan=t.ctx.journalFind_('SYNTHETIC-PROFILE',t.main);
 j.put(plan.row,3,'PREPARED');t.s.put(record.row,5,'REQUIRES_REVIEW');const before=business(t);assert.deepEqual(t.open(),r);assert.equal(business(t),before);assert.equal(j.raw(plan.row,3),'COMPLETED');
});
test('same-dimension commercial mutation after preflight is detected before REQUESTS bind',()=>{
 const t=fixture(),orig=t.ctx.journeyPreflight_;let after;t.ctx.journeyPreflight_=fn=>{const r=orig(fn);t.main.getSheetByName('COBROS').put(7,6,77);after=freeze(t);return r;};
 assert.throws(t.open,/evidencia cambió/);assert.equal(freeze(t),after);assert.equal(t.ctx.findRequestRecord_('SYNTHETIC-PROFILE',t.main),null);assert.equal(t.locks().acquires,t.locks().releases);
});
test('policy changed after preflight still stops at original journal/history guard without binding',()=>{
 const t=fixture(),orig=t.ctx.journeyPreflight_;t.ctx.journeyPreflight_=fn=>{const r=orig(fn),p=JSON.parse(t.props.get('DOMUS_JOURNEY_POLICY_V1'));p.scopes[0].projectName='Changed';t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(p));return r;};
 const before=freeze(t);assert.throws(t.open,/mapa aprobado/);assert.equal(freeze(t),before);assert.equal(t.ctx.findRequestRecord_('SYNTHETIC-PROFILE',t.main),null);
});
test('retained reference generated in output remains blocked before ledger/journal writes',()=>{
 const t=fixture(),orig=t.ctx.turnoAbrir;t.ctx.turnoAbrir=p=>{vm.runInContext('_authContext.operator="SYNTHETIC-uncertain-00"',t.ctx);return orig(p);};const before=freeze(t);
 assert.throws(t.open,/referencia retenida/);assert.equal(freeze(t),before);assert.equal(t.ctx.findRequestRecord_('SYNTHETIC-PROFILE',t.main),null);
});
test('orphan/incomplete journal still blocks and is not classified as harmless history',()=>{
 const t=fixture();t.main.getSheetByName('DOMUS_JOURNAL').appendRow(['ORPHAN','turnoAbrir','PREPARED','[]','{}','']);const before=freeze(t);assert.throws(t.open);assert.equal(freeze(t),before);
});
test('failure after durable journal preparation retains uncertainty and permits only original-ID recovery',()=>{
 const t=fixture(),b=business(t);let once=true;t.ctx.SpreadsheetApp.flush=()=>{const j=t.main.getSheetByName('DOMUS_JOURNAL');if(once&&j.raw(j.getLastRow(),3)==='PREPARED'){once=false;throw Error('SYNTHETIC_FLUSH_UNCERTAIN');}};
 assert.throws(t.open,/SYNTHETIC_FLUSH_UNCERTAIN/);assert.equal(t.ctx.findRequestRecord_('SYNTHETIC-PROFILE',t.main).status,'REQUIRES_REVIEW');assert.equal(business(t),b);const r=t.open();assert.equal(r.openingRequestId,'SYNTHETIC-PROFILE');assert.equal(business(t),b);
});
}
if(process.env.DOMUS_TEST_PREVIOUS_BUNDLE)test('immutable previous b07 boundary survives upgraded runtime; opening preserves original evidence and approval',()=>{
 const crypto=require('crypto'),t=small('STAGING'),old=fs.readFileSync(process.env.DOMUS_TEST_PREVIOUS_BUNDLE,'utf8');
 assert.equal(crypto.createHash('sha256').update(old).digest('hex'),'431826f0c243db172ea0f23f395b5b030b000eeacb508e5bd6c13398ef382de5');
 t.ctx=vm.createContext({...t.ctx});vm.runInContext(old,t.ctx);t.allowRetention();const boundary=t.activate(),props=JSON.stringify([...t.props]),before=business(t);
 const oldRecord=JSON.stringify(t.ctx.findRequestRecord_('fixture-isolation',t.main));
 t.ctx=vm.createContext({...t.ctx});vm.runInContext(fs.readFileSync(root+'/google-apps-script/DOMUS_STAGING_BUNDLE.gs','utf8'),t.ctx);
 const opened=t.call('turnoAbrir',{requestId:'SYNTHETIC-UPGRADE',scopeId:'QA',openingFloat:0,historyBoundaryId:boundary.boundaryId},'SYNTHETIC-UPGRADE','CAJA');
 assert.equal(opened.historyReview.snapshotHash,boundary.snapshotHash);assert.equal(opened.historyReview.resolved,false);
 assert.equal(business(t),before);assert.equal(JSON.stringify([...t.props]),props);assert.equal(JSON.stringify(t.ctx.findRequestRecord_('fixture-isolation',t.main)),oldRecord);
 assert.equal(t.call('turnoEstado').historyReview.snapshotHash,boundary.snapshotHash);assert.equal(t.locks().acquires,t.locks().releases);
});
console.log(JSON.stringify({suite:'isolated-opening-read-scopes',passed,syntheticOnly:true,liveGoogle:false,realIdUsed:false}));

