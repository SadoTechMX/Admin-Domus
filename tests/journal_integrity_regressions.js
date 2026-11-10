'use strict';
// Actual journal/dispatcher against in-memory fixtures only. No Google or network.
const assert=require('assert/strict'),{fixture}=require('./history_boundary_regressions'),{setup}=require('./recovery_regressions');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const snapshot=t=>JSON.stringify([...t.main.sheets].map(([name,s])=>[name,[...s.cells]]));
const bad=e=>e.code==='JOURNAL_INTEGRITY_REQUIRES_REVIEW' && e.status===409;
function append(t,row){const s=t.ctx.journalSheet_(t.main);s.appendRow(row);return s;}
const orphan=['','cajaSimpleRegistrar','PREPARED','[{"sheet":"COBROS","row":7,"column":6,"value":999}]','{}','2026-11-10T00:00:00.000Z'];
test('reported nonempty PREPARED without REQUEST_ID blocks proposal before activation without any writes',()=>{
 const t=fixture();append(t,orphan);const before=snapshot(t);assert.throws(t.propose,bad);assert.equal(snapshot(t),before);
});
test('same orphan after activation blocks opening and cut before creating another REQUEST',()=>{
 const t=fixture();t.activate();t.open();append(t,orphan);const before=snapshot(t);
 assert.throws(()=>t.open('another-open'),bad);assert.throws(t.cut,bad);assert.equal(snapshot(t),before);
});
test('orphan between approved proposal and registration invalidates registration without replacing evidence',()=>{
 const t=fixture(),body=t.approve();append(t,orphan);const before=snapshot(t);
 assert.throws(()=>t.req('registrarLimiteHistorico',body,'boundary'),bad);assert.equal(snapshot(t),before);
});
test('a missing or altered journal header cannot hide populated row one as an empty journal',()=>{
 for(const value of ['', 'PREPARED', '="STATUS"']){
  const t=fixture(),j=t.ctx.journalSheet_(t.main);j.getRange(1,3).setValue(value);const before=snapshot(t);
  assert.throws(t.propose,bad);assert.equal(snapshot(t),before);
 }
});
test('without a boundary, generic dispatcher and direct journal commit reject the orphan before effects',()=>{
 const t=setup();append(t,orphan);const before=snapshot(t),p=t.sale();
 assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),bad);
 assert.throws(()=>t.ctx.withLock_(1000,()=>t.ctx.journalCommit_('new','fixtureAction',t.main,[t.ctx.cellWrite_(t.main.getSheetByName('COBROS'),7,6,123)],{ok:true})),bad);
 assert.equal(snapshot(t),before);
});
const variants=[
 ['missing ID',orphan],['space ID',['  ',...orphan.slice(1)]],['null ID',[null,...orphan.slice(1)]],['zero ID',[0,...orphan.slice(1)]],['false ID',[false,...orphan.slice(1)]],
 ['ID with padding',[' existing ',...orphan.slice(1)]],['missing action',['existing','','COMPLETED','[]','{}','']],
 ['missing status',['existing','fixtureAction','','[]','{}','']],['unknown status',['existing','fixtureAction','UNKNOWN','[]','{}','']],
 ['FAILED status',['existing','fixtureAction','FAILED','[]','{}','']],['false status',['existing','fixtureAction',false,'[]','{}','']],
 ['COMPLETED without identity',['','','COMPLETED','[]','{}','']],['only plan',['','','','[{"pending":true}]','','']],
 ['only result',['','','','','{}','']],['only timestamp',['','','','','','2026-11-10T00:00:00.000Z']],
 ['PREPARED chunk',['existing#part:0','JOURNAL_PART','PREPARED','[]','','']],['formula ID',['=""','fixtureAction','COMPLETED','[]','{}','']],
 ['formula alone',['','','','=""','','']]
];
for(const [name,row] of variants)test(name+': before/after boundary reject without mutating historical or operational cells',()=>{
 for(const timing of ['before','after']){
  const t=fixture();if(timing==='after'){t.activate();t.open();}append(t,row);const before=snapshot(t);
  assert.throws(timing==='before'?t.propose:t.cut,bad);assert.equal(snapshot(t),before);
 }
});
test('completely empty rows before/after boundary are legitimate and retain physical journal row coordinates',()=>{
 const t=fixture();append(t,['','','','','','']);const b=t.activate();assert.equal(b.resolved,false);
 append(t,['','','','','','']);const o=t.open();assert.equal(o.status,'OPEN');const cut=t.cut();assert.equal(cut.status,'CLOSED');
 for(const id of ['boundary','new-open','new-cut']){const r=t.ctx.journalFind_(id,t.main);assert.equal(r.sheet.raw(r.row,1),id);assert.equal(r.data[2],'COMPLETED');}
 assert.deepEqual(t.cut(),cut);
});
test('orphan blocks even same-ID recovery of a valid partial journal, preserving its original plan',()=>{
 const t=setup(),p=t.sale();t.main.getSheetByName('COBROS').failAt='7:11';assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),/INJECTED_WRITE_FAILURE/);
 append(t,orphan);const before=snapshot(t);assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),bad);assert.equal(snapshot(t),before);
});
test('independent execution cannot insert an orphan while cut owns the script lock',()=>{
 const t=fixture();t.activate();t.open();const other=setup();other.ctx.LockService=t.ctx.LockService;other.ctx.SpreadsheetApp=t.ctx.SpreadsheetApp;
 const commit=t.ctx.journalCommit_;let checked=false;
 t.ctx.journalCommit_=(id,action,...args)=>{
  if(action==='corteZCerrar'){
   assert(t.locks().held);assert.throws(()=>other.ctx.withLock_(1000,()=>append(t,orphan)),/transacción concurrente/);checked=true;
  }
  return commit(id,action,...args);
 };
 assert.equal(t.cut().status,'CLOSED');assert(checked);assert.equal(t.locks().acquires,t.locks().releases);
});
test('orphan inserted before a concurrent cut wins the lock blocks that cut without a new intent',()=>{
 const t=fixture();t.activate();t.open();t.ctx.withLock_(1000,()=>append(t,orphan));const before=snapshot(t);
 assert.throws(t.cut,bad);assert.equal(snapshot(t),before);assert.equal(t.locks().acquires,t.locks().releases);
});
const root=(plan={parts:1})=>['part-root','comandasSimpleAccion','COMPLETED',JSON.stringify(plan),'{}','2026-11-10T00:00:00.000Z'];
const part=(n=0,plan=[])=>['part-root#part:'+n,'JOURNAL_PART','COMPLETED',JSON.stringify(plan),'','2026-11-10T00:00:00.000Z'];
const partCases=[
 ['orphan commercial fragment',[part(0,[{sheet:'COBROS',row:7,column:6,value:999}])]],
 ['missing part zero',[root({parts:2}),part(1)]],['missing final part',[root({parts:2}),part(0)]],
 ['extra fragment',[root(),part(0),part(1)]],['fragment beside legacy inline plan',[root([]),part(0)]],
 ['duplicate fragment',[root(),part(0),part(0)]],['duplicate parent',[root(),root(),part(0)]],
 ['noncanonical part index',[root(),part('00')]],['negative part index',[root(),part(-1)]],
 ['non-array fragment plan',[root(),part(0,{writes:[]})]],['wrong fragment action',[root(),['part-root#part:0','cajaSimpleRegistrar','COMPLETED','[]','{}','']]],
 ['negative parent part count',[root({parts:-1})]],['noninteger parent part count',[root({parts:1.5})]],
 ['unbounded parent part count',[root({parts:1000000000})]]
];
for(const [name,rows] of partCases)test(name+': before/after boundary blocks without rewriting parent, children or REQUESTS',()=>{
 for(const timing of ['before','after']){
  const t=fixture();if(timing==='after'){t.activate();t.open();}
  t.s.appendRow(['part-root','comandasSimpleAccion','a'.repeat(64),'fixture-device','COMPLETED','2020-01-01T00:00:00.000Z','','{}']);
  rows.forEach(r=>append(t,r));const before=snapshot(t);assert.throws(timing==='before'?t.propose:t.cut,bad);assert.equal(snapshot(t),before);
 }
});
test('reported legacy-0 fragment without parent is rejected despite existing REQUESTS base ID',()=>{
 const t=fixture();append(t,['legacy-0#part:0','JOURNAL_PART','COMPLETED','[{"sheet":"COBROS","row":7,"column":6,"value":999}]','','']);
 const before=snapshot(t);assert.throws(t.propose,bad);assert.equal(snapshot(t),before);
});
test('complete canonical fragment set and legacy inline plan remain readable without replay',()=>{
 const t=fixture();t.s.appendRow(['part-root','comandasSimpleAccion','a'.repeat(64),'fixture-device','COMPLETED','2020-01-01T00:00:00.000Z','','{}']);
 append(t,root({parts:2}));append(t,part(1));append(t,['','','','','','']);append(t,part(0));
 const before=snapshot(t);assert.equal(t.ctx.journalFind_('part-root',t.main).row,2);assert.equal(t.propose().canActivate,false);assert.equal(snapshot(t),before);
 const u=fixture();u.s.appendRow(['part-root','comandasSimpleAccion','a'.repeat(64),'fixture-device','COMPLETED','2020-01-01T00:00:00.000Z','','{}']);append(u,root([]));assert.equal(u.propose().canActivate,false);
});
test('chunk inserted before closing blocks the cut; a competing insertion cannot acquire the cut lock',()=>{
 for(const insertFirst of [true,false]){
  const t=fixture();t.activate();t.open();t.s.appendRow(['part-root','comandasSimpleAccion','a'.repeat(64),'fixture-device','COMPLETED','2020-01-01T00:00:00.000Z','','{}']);
  if(insertFirst){t.ctx.withLock_(1000,()=>append(t,part()));const before=snapshot(t);assert.throws(t.cut,bad);assert.equal(snapshot(t),before);}
  else {
   const other=setup();other.ctx.LockService=t.ctx.LockService;const commit=t.ctx.journalCommit_;let checked=false;
   t.ctx.journalCommit_=(id,action,...args)=>{if(action==='corteZCerrar'){assert.throws(()=>other.ctx.withLock_(1000,()=>append(t,part())),/transacción concurrente/);checked=true;}return commit(id,action,...args);};
   assert.equal(t.cut().status,'CLOSED');assert(checked);
  }
 }
});
test('invalid external row introduced after cut preflight is caught again before journal preparation',()=>{
 for(const row of [orphan,part()]){
  const t=fixture();t.activate();t.open();const commit=t.ctx.journalCommit_;
  t.ctx.journalCommit_=(id,action,...args)=>{if(action==='corteZCerrar')append(t,row);return commit(id,action,...args);};
  assert.throws(t.cut,bad);
  const journal=t.main.getSheetByName('DOMUS_JOURNAL'),requests=t.ctx.paymentRequestIndex_(t.main);
  assert.equal([...journal.cells.values()].includes('new-cut'),false);assert.equal(requests.get('new-cut')[0][4],'REQUIRES_REVIEW');
  assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
 }
});
console.log(JSON.stringify({suite:'journal-integrity-real-source-mocks',passed,liveData:false,liveWrites:0}));
