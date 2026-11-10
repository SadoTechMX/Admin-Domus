'use strict';
// Synthetic legacy contract shape only. No original IDs, people, amounts or rows
// are imported from the shared staging book; no network or Google services.
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const policy={version:1,scopes:[{id:'QA',projectId:'P-QA',projectName:'Fixture project',eventId:'E-QA',eventName:'Fixture event',activity:'QA event'}],
 stations:[{deviceId:'fixture-device',stationId:'NEW_QA_STATION',registerId:'NEW_QA_REGISTER',scopeIds:['QA']}]};
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells]])));
const legacy=(n=1)=>({ok:true,shiftId:'LEGACY-SHIFT-'+n,operationDayId:'OPDAY-20200101',businessDate:'2020-01-01',stationId:'OLD_STATION_'+n,
 registerId:'OLD_REGISTER_'+n,phase:'Solar',openingFloat:0,openedAt:'2020-01-01T12:00:00.000Z',openedBy:'Fixture operator',status:'OPEN',message:'Legacy fixture opening'});
function fixture(){const t=setup();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));return t;}
function put(t,n,result,status='COMPLETED'){
 const s=t.ctx.getOrCreateRequestsSheet_(t.main);s.appendRow(['fixture-legacy-'+n,'turnoAbrir','fixture-hash','unrelated-old-device',status,'2020-01-01T12:00:00.000Z','',JSON.stringify(result)]);return s;
}
const rejected=e=>e.code==='JOURNEY_REQUIRES_REVIEW' && e.status===409 && e.message.includes('Apertura sin vínculo durable');
test('valid QA policy alone returns no active journey and does not create an opening or journal',()=>{
 const t=fixture(),before=snapshot(t),r=t.request('cajaSimpleDatos',[]);assert.equal(r.journey.enabled,true);assert.equal(r.journey.active,null);assert.equal(snapshot(t),before);
});
test('legacy COMPLETED opening reproduces the exact read-only block for a different new device/station',()=>{
 const t=fixture();put(t,1,legacy());const before=snapshot(t);
 for(const action of ['cajaSimpleDatos','turnoEstado']){assert.throws(()=>t.request(action,[]),rejected);assert.equal(snapshot(t),before);}
 assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);assert.equal(t.locks().held,false);
});
test('two COMPLETED legacy openings plus seven untyped FAILED reproduce activation without rewriting any record',()=>{
 const t=fixture(),s=put(t,1,legacy(1));put(t,2,legacy(2));
 for(let n=3;n<=9;n++)put(t,n,{error:'Conflicto de custodia: ya existe turno abierto.'},'FAILED');
 const before=snapshot(t);assert.throws(()=>t.request('cajaSimpleDatos',[]),rejected);assert.equal(snapshot(t),before);assert.equal(s.getLastRow(),10);
 const rows=t.ctx.requestRows_(s);assert.equal(rows.filter(r=>r[4]==='FAILED').length,7);assert(rows.every(r=>!t.ctx.journeyKnownNoEffects_(t.main,[r])));
});
test('a failure message about an open register is not durable proof of no effects',()=>{
 const t=fixture(),s=put(t,1,{error:'Conflicto de custodia: ya existe turno abierto.'},'FAILED'),before=snapshot(t);
 assert.equal(t.ctx.journeyKnownNoEffects_(t.main,t.ctx.requestRows_(s)),false);assert.throws(()=>t.request('turnoEstado',[]),rejected);assert.equal(snapshot(t),before);
});
test('new map names, old dates and legacy CLOSED text cannot supply an event/project contract',()=>{
 for(const change of [{},{status:'CLOSED'},{stationId:'NEW_QA_STATION',registerId:'NEW_QA_REGISTER'}]){
  const t=fixture();put(t,1,{...legacy(),...change});const before=snapshot(t);assert.throws(()=>t.request('cajaSimpleDatos',[]),rejected);assert.equal(snapshot(t),before);
 }
});
test('the existing administrative boundary cannot accept legacy openings even with mock approval intent',()=>{
 const t=fixture();t.manager();const token=t.login('GERENCIA');put(t,1,legacy());const before=snapshot(t);
 const input={queue:[],stationDeviceIds:['fixture-device'],evidenceReference:'fixture-only-review'};
 assert.throws(()=>t.request('prepararLimiteHistorico',[input],undefined,'GERENCIA',token),e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS' && e.message.includes('jornada o límite previo'));
 assert.equal(snapshot(t),before);assert.equal(t.props.has('DOMUS_HISTORY_BOUNDARY_APPROVAL_V1'),false);
});
test('no legacy opening journal means no recoverable plan; a direct lookup does not manufacture one',()=>{
 const t=fixture();put(t,1,legacy());const before=snapshot(t);
 assert.equal(t.ctx.journalResume_('fixture-legacy-1','turnoAbrir',t.main),null);assert.equal(snapshot(t),before);assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);
});
test('requesting a new opening is a mutation even when preflight rejects: do not use it for live diagnosis',()=>{
 const t=fixture(),s=put(t,1,legacy()),business=()=>JSON.stringify(['CAJA 2','COBROS','COMANDAS'].map(n=>[...t.main.getSheetByName(n).cells]));
 const before=business();assert.throws(()=>t.request('turnoAbrir',[{scopeId:'QA',openingFloat:0}],'new-fixture-opening'),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS');
 assert.equal(business(),before);assert.equal(s.getLastRow(),3);assert.equal(t.ctx.findRequestRecord_('new-fixture-opening',t.main).status,'REQUIRES_REVIEW');assert.equal(t.ctx.journalFind_('new-fixture-opening',t.main),null);
});
console.log(JSON.stringify({suite:'legacy-journey-activation-real-source-mocks',passed,liveWrites:0,liveReads:false,legacyResolution:false,historyBoundaryActivated:false}));
