'use strict';
// Real private resolver and existing REQUESTS readers, isolated fixture books.
// Open/cut records below are explicit future-contract fixtures, not live events.
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
const opening=(id='open-A',extra={})=>({ok:true,journeyContract:'domus-journey-v1',openingRequestId:id,journeyId:'JOR-'+id,shiftId:'SHIFT-'+id,
 scope:{projectId:'PROJ-QA-A',projectName:'QA project',eventId:'EVENT-QA-A',eventName:'QA event'},openedAt:'2026-11-07T02:00:00.000Z',status:'OPEN',...extra});
const closing=(id='cut-A',extra={})=>({ok:true,journeyContract:'domus-journey-v1',closingRequestId:id,openingRequestId:'open-A',journeyId:'JOR-open-A',shiftId:'SHIFT-open-A',cutId:'CUT-QA-A',closedAt:'2026-11-07T13:00:00.000Z',status:'CLOSED',...extra});
function put(t,id,action,result,status='COMPLETED'){
 const s=t.ctx.getOrCreateRequestsSheet_(t.main);s.appendRow([id,action,'fixture-binding','fixture-device',status,'fixture-start','fixture-end',JSON.stringify(result)]);
}
const snapshot=t=>JSON.stringify([...t.main.sheets].map(([n,s])=>[n,[...s.cells]]));
const resolve=(t,id='open-A',at='2026-11-07T13:01:00.000Z')=>t.ctx.journeyContext_(t.main,id,new Date(at));
test('missing opening fails closed without creating REQUESTS, journal or any sheet',()=>{
 const t=setup(),before=snapshot(t);assert.throws(()=>resolve(t),e=>e.code==='JOURNEY_REQUIRES_REVIEW');assert.equal(snapshot(t),before);assert.equal(t.main.getSheetByName('REQUESTS'),null);
});
test('20:00 opening stays same journey across midnight, 07:00 and later days until an actual cut',()=>{
 const t=setup();put(t,'open-A','turnoAbrir',opening());const before=snapshot(t);
 for(const at of ['2026-11-07T02:00:00.000Z','2026-11-07T06:00:00.000Z','2026-11-07T13:00:00.000Z','2026-11-10T18:00:00.000Z']){
  const r=resolve(t,'open-A',at);assert.equal(r.journeyId,'JOR-open-A');assert.equal(r.allowed,true);assert.equal(r.occurredAt,at);assert.equal(r.openedAt,opening().openedAt);
 }
 assert.equal(snapshot(t),before);
});
test('two projects on the same calendar date remain distinct; project-only operation has no invented event',()=>{
 const t=setup();put(t,'open-A','turnoAbrir',opening());put(t,'open-B','turnoAbrir',opening('open-B',{scope:{projectId:'PROJ-QA-B',projectName:'Other QA',eventId:null,eventName:''}}));
 const a=resolve(t),b=resolve(t,'open-B');assert.notEqual(a.journeyId,b.journeyId);assert.notEqual(a.scope.projectId,b.scope.projectId);assert.equal(b.scope.eventId,null);assert.equal(b.scope.eventName,'');
 b.scope.projectName='Changed consumer';assert.equal(resolve(t,'open-B').scope.projectName,'Other QA');
});
test('cut closes exactly its own journey without closing another project or changing opening timestamps',()=>{
 const t=setup();put(t,'open-A','turnoAbrir',opening());put(t,'open-B','turnoAbrir',opening('open-B'));put(t,'cut-A','corteZCerrar',closing());const before=snapshot(t);
 const a=resolve(t,'open-A','2026-11-07T13:00:00.000Z');assert.equal(a.allowed,false);assert.equal(a.status,'CLOSED');assert.equal(a.cutId,'CUT-QA-A');assert.equal(a.openedAt,opening().openedAt);assert.equal(resolve(t,'open-B').allowed,true);assert.equal(snapshot(t),before);
});
test('legacy/date-derived, incomplete, different-action or duplicate opening cannot become a journey',()=>{
 for(const patch of [{journeyContract:undefined},{journeyId:'OPDAY-20261106'},{openingRequestId:'another'},{scope:{projectName:'name only'}},{openedAt:'2026-11-06'},{status:'CLOSED'}]){
  const t=setup();put(t,'open-A','turnoAbrir',opening('open-A',patch));assert.throws(()=>resolve(t));
 }
 for(const variant of ['wrong-action','duplicate','partial']){
  const t=setup();put(t,'open-A',variant==='wrong-action'?'cajaSimpleRegistrar':'turnoAbrir',opening(),variant==='partial'?'PROCESSING':'COMPLETED');
  if(variant==='duplicate')put(t,'open-A','turnoAbrir',opening());assert.throws(()=>resolve(t));
 }
});
test('incomplete, failed, legacy or duplicate cut cannot masquerade as still-open or safely closed',()=>{
 for(const variant of ['PREPARED','FAILED','empty','legacy','duplicate']){
  const t=setup();put(t,'open-A','turnoAbrir',opening());
  put(t,'cut-A','corteZCerrar',variant==='empty'?null:variant==='legacy'?{ok:true,shiftId:'SHIFT-open-A'}:closing(),['FAILED','PREPARED'].includes(variant)?variant:'COMPLETED');
  if(variant==='duplicate')put(t,'cut-B','corteZCerrar',closing('cut-B'));
  const before=snapshot(t);assert.throws(()=>resolve(t));assert.equal(snapshot(t),before);
 }
});
test('misbound cut, inverted/future timestamps and invalid server clock fail closed',()=>{
 for(const patch of [{shiftId:'OTHER'},{closedAt:'2026-11-07T01:00:00.000Z'},{closedAt:'2026-11-08T13:00:00.000Z'},{closedAt:'2026-02-30T13:00:00.000Z'}]){
  const t=setup();put(t,'open-A','turnoAbrir',opening());put(t,'cut-A','corteZCerrar',closing('cut-A',patch));assert.throws(()=>resolve(t));
 }
 const t=setup();put(t,'open-A','turnoAbrir',opening());assert.throws(()=>resolve(t,'open-A','2026-11-07T01:00:00.000Z'));assert.throws(()=>resolve(t,'open-A','invalid'));
});
test('prepared journal retains original journey/time after cut, without recomputing context during replay',()=>{
 const t=setup();put(t,'open-A','turnoAbrir',opening());const context=resolve(t,'open-A','2026-11-07T05:59:00.000Z'),sheet=t.main.getSheetByName('COBROS');
 // Existing recovery mechanism stores the context alongside a prepared result.
 // This is a journal fixture, not a public POS integration or a real collection.
 sheet.failAt='7:1';assert.throws(()=>t.ctx.journalCommit_('fixture-plan','fixture-context',t.main,[t.ctx.cellWrite_(sheet,7,1,'QA-MARKER')],{context}),/INJECTED_WRITE_FAILURE/);
 put(t,'cut-A','corteZCerrar',closing());assert.equal(resolve(t).allowed,false);
 const recovered=t.ctx.journalResume_('fixture-plan','fixture-context',t.main);assert.deepEqual(JSON.parse(JSON.stringify(recovered.context)),JSON.parse(JSON.stringify(context)));assert.equal(recovered.context.occurredAt,'2026-11-07T05:59:00.000Z');
 assert.deepEqual(t.ctx.journalResume_('fixture-plan','fixture-context',t.main),recovered);assert.equal(sheet.getLastRow(),7);
});
test('resolver stays private; opening requires configured policy and cut requires manager',()=>{
 const t=setup();assert.throws(()=>t.request('journeyContext_',[]),/Acceso denegado/);
 assert.throws(()=>t.request('turnoAbrir',[{scopeId:'A',openingFloat:0}]),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS');
 assert.throws(()=>t.request('corteZCerrar',[{countedCash:0}]),/Acceso denegado/);
});
console.log(JSON.stringify({suite:'journey-context-read-only',passed,realOpenings:0,realCuts:0,posIntegration:false,liveSheets:false}));
