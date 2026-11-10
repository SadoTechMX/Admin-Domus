'use strict';
// Actual dispatcher, modules and bundles, synthetic memory only. No remote service.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {setup}=require('./recovery_regressions');
const sourceContract=require('./fixtures/phase1_opening_contract.json'); // Parsed from immutable Python AST / Shifts headers, not runtime helpers.
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const business=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells],[...s.rules]])));
const policy={version:1,scopes:[{id:'QA',projectId:'P-QA',projectName:'Fixture project',eventId:'E-QA',eventName:'Fixture event',activity:'QA event'}],
 stations:[{deviceId:'fixture-device',stationId:'NEW_QA_STATION',registerId:'NEW_QA_REGISTER',scopeIds:['QA']}]};
const isoError=e=>['HISTORY_REQUIRES_REVIEW','HISTORY_BOUNDARY_NO_EFFECTS'].includes(e.code);
function fixture(environment){
 const t=setup();t.manager();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));
 t.ctx.ScriptApp={getScriptId:()=> '1sh5fyAaa0onlNsNZ40EokGumubebYEMisTGZ8rNj75gBiOsYPkA-rV4O'};
 if(environment){
  t.props.set('DOMUS_ENV',environment);t.ctx=vm.createContext({...t.ctx});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_'+environment+'_BUNDLE.gs'),'utf8'),t.ctx);
  const config=vm.runInContext('CONFIG',t.ctx);t.main.id=config.mainSheetId;t.ops.id=config.opsSheetId;
  t.ctx.SpreadsheetApp={flush(){},openById(id){if(id===t.main.id)return t.main;if(id===t.ops.id)return t.ops;throw new Error('NON_FIXTURE_BOOK');}};
 }
 const login=role=>t.ctx.executeDomusAction_('authCrearSesion',{args:[role,'QA operator','fixture-device','fixture-secret'],role,deviceId:'fixture-device'}).result.token;
 const manager=login('GERENCIA'),cashier=login('CAJA');
 t.call=(action,body,id='fixture-proposal',role='GERENCIA')=>t.ctx.executeDomusAction_(action,{args:[copy(body)],requestId:id,role,deviceId:'fixture-device',sessionToken:role==='GERENCIA'?manager:cashier}).result;
 t.s=t.ctx.getOrCreateRequestsSheet_(t.main);
 const headers=sourceContract.headers;Object.keys(headers).forEach(n=>t.main.insertSheet(n).getRange(1,1,1,headers[n].length).setValues([headers[n]]));
 const cases=sourceContract.cases.map(c=>c.payload),choices=[0,1,2,3,0,1,2,3,0],now='2020-01-01T12:00:00.000Z';
 t.ids=[];t.aliases=['fixture-original-alias-0','fixture-original-alias-1'];t.shiftIds=['FIXTURE-SHIFT-0','FIXTURE-SHIFT-1'];
 for(let n=0;n<9;n++){
  const id='fixture-opening-'+n,p=cases[choices[n]],completed=n===0 || n===3,j=n===0?0:1;
  const response=completed?{ok:true,shiftId:t.shiftIds[j],operationDayId:'OPDAY-20200101',businessDate:'2020-01-01',stationId:p.stationId,
   registerId:p.registerId,phase:'Solar',openingFloat:p.openingFloat,openedAt:now,openedBy:'QA only',status:'OPEN',message:'Synthetic legacy opening'}:{error:'Conflicto de custodia: sólo fixture'};
  t.s.getRange(131+n,1,1,8).setValues([[id,'turnoAbrir',sourceContract.cases[choices[n]].hash,'TEST-DEV-PHASE1',completed?'COMPLETED':'FAILED',now,now,JSON.stringify(response)]]);t.ids.push(id);
  if(completed)t.main.getSheetByName('TURNOS').getRange(2+j,1,1,19).setValues([[response.shiftId,response.operationDayId,response.businessDate,p.stationId,p.registerId,'Solar',now,'QA only',p.openingFloat,'',p.openingNotes||'','OPEN','','','','',1,t.aliases[j],now]]);
 }
 t.input={isolationMode:t.ctx.stagingIsolationMode_(),queue:[],stationDeviceIds:['fixture-device','TEST-DEV-PHASE1'],evidenceReference:'Synthetic exact-set audit only'};
 t.propose=()=>t.call('prepararLimiteHistorico',t.input);
 t.approve=()=>{const p=t.propose();t.props.set('DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1',JSON.stringify({version:1,mode:t.input.isolationMode,approved:true,snapshotHash:p.snapshotHash,
  approvalReference:'MOCK approval only',confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true}));
  return {...t.input,snapshotHash:p.snapshotHash,confirmStationsHeld:true,acknowledgeUnresolvedHistory:true,confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true};};
 t.activate=()=>{t.body=t.approve();return t.call('registrarLimiteHistorico',t.body,'fixture-isolation');};
 t.open=()=>t.call('turnoAbrir',{scopeId:'QA',openingFloat:0,historyBoundaryId:'fixture-isolation'},'fixture-new-open','CAJA');
 t.cut=()=>t.call('corteZCerrar',{openingRequestId:'fixture-new-open',countedCash:0,historyBoundaryId:'fixture-isolation'},'fixture-new-cut');
 t.state=()=>t.call('turnoEstado',undefined,'fixture-read','CAJA');
 return t;
}

test('exact test provenance is a read-only proposal, not a no-effects classification',()=>{
 const t=fixture(),before=snapshot(t);assert.throws(t.state,/Apertura sin vínculo/);const p=t.propose();
 assert.equal(p.kind,'STAGING_TEST_OPENING_PROPOSAL');assert.equal(p.canActivate,false);assert.equal(p.resolved,false);
 assert.equal(p.snapshot.isolation.entries.length,9);assert.equal(p.snapshot.isolation.sourceCommit,'881a71c9f705ebe8ef4772273c9ed0a7a1b0d8fd');
 assert.equal(p.snapshot.counts.uncertainIds,7);assert.equal(p.snapshot.counts.remainingUncertainIds,0);assert.equal(snapshot(t),before);
 assert.equal(t.ctx.journeyKnownNoEffects_(t.main,[t.ctx.requestRows_(t.s)[130]]),false);
});
test('generic boundary still refuses the test openings',()=>{
 const t=fixture();delete t.input.isolationMode;assert.throws(t.propose,/jornada o límite previo/);
});
for(const mode of ['missing','generic','wrong-hash','writer','untagged','wrong-mode','client-flags'])test('activation requires exact distinct authorization: '+mode,()=>{
 const t=fixture(),body=t.approve(),p=JSON.parse(t.props.get('DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1')),b=business(t);
 if(mode==='missing')t.props.delete('DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1');
 else if(mode==='generic'){t.props.set('DOMUS_HISTORY_BOUNDARY_APPROVAL_V1',JSON.stringify(p));t.props.delete('DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1');}
 else{if(mode==='wrong-hash')p.snapshotHash='a'.repeat(64);if(mode==='writer')delete p.confirmLegacyTestWriterDisabled;if(mode==='untagged')delete p.acceptUnattributedEffectsUnresolved;
  if(mode==='wrong-mode')p.mode='OTHER';if(mode==='client-flags')delete body.confirmLegacyTestWriterDisabled;t.props.set('DOMUS_STAGING_TEST_ISOLATION_APPROVAL_V1',JSON.stringify(p));}
 assert.throws(()=>t.call('registrarLimiteHistorico',body,'denied'),isoError);assert.equal(t.ctx.journalFind_('denied',t.main),null);assert.equal(business(t),b);assert.throws(t.state,/Apertura sin vínculo/);
});
test('manager role and effective principal are required, including read-only proposal',()=>{
 const t=fixture(),before=snapshot(t);assert.throws(()=>t.call('prepararLimiteHistorico',t.input,'wrong','CAJA'),/Acceso denegado/);assert.equal(snapshot(t),before);
});
test('registration cannot consume a retained ID, shift or absent alias before activation',()=>{
 const t=fixture(),body=t.approve(),before=snapshot(t);
 for(const id of [...t.ids,...t.aliases,...t.shiftIds])assert.throws(()=>t.call('registrarLimiteHistorico',body,id),isoError);
 assert.equal(snapshot(t),before);
});
for(const alter of [
 t=>t.s.getRange(131,3).setValue('a'.repeat(64)),t=>t.s.getRange(132,4).setValue('OTHER_DEVICE'),
 t=>t.s.getRange(134,5).setValue('FAILED'),t=>t.s.getRange(132,5).setValue('COMPLETED'),
 t=>t.s.getRange(132,8).setValue('{"error":"x","journey":{"version":1}}'),
 t=>t.s.getRange(132,8).setValue('{"ok":true}'),t=>t.s.getRange(132,6).setValue('=NOW()'),
 t=>t.s.appendRow(t.s.getRange(131,1,1,8).getValues()[0]),t=>t.input.queue.push({requestId:'unrelated-pending',action:'cajaSimpleRegistrar'}),
 t=>t.main.getSheetByName('TURNOS').getRange(2,12).setValue('CLOSED'),t=>t.main.getSheetByName('TURNOS').getRange(2,16).setValue('fake-cut'),
 t=>t.main.getSheetByName('TURNOS').getRange(3,18).setValue(t.aliases[0]),t=>t.main.getSheetByName('TURNOS').getRange(2,9).setValue(1),
 t=>t.main.getSheetByName('TURNOS').getRange(4,1).setValue('unreviewed-shift'),t=>t.main.getSheetByName('CORTES_Z').getRange(1,2).setValue('unreviewed-header'),
 t=>t.main.id='OTHER_BOOK',t=>t.ctx.ScriptApp.getScriptId=()=> 'OTHER_PROJECT',t=>delete t.ctx.ScriptApp
])test('evidence/provenance change fails closed: '+alter.toString(),()=>{
 const t=fixture();alter(t);const before=snapshot(t);assert.throws(t.propose);assert.equal(snapshot(t),before);
});
test('approved custody preserves all originals and only appends an empty administrative journal',()=>{
 const t=fixture(),before=business(t),old=t.s.getRange(1,1,139,8).getValues(),r=t.activate();
 assert.equal(r.kind,'STAGING_TEST_OPENING_ISOLATION');assert.equal(r.resolved,false);assert.equal(r.financialFinal,false);assert.equal(r.newCharge,0);assert.equal(r.inventoryMovement,0);
 assert.equal(business(t),before);assert.deepEqual(t.s.getRange(1,1,139,8).getValues(),old);
 assert.equal(t.ctx.journalFind_('fixture-isolation',t.main).data[3],'{"parts":0}');assert.equal(t.ctx.historyOperationalIndex_(t.main).size,1);
 assert.equal(t.state().active,null);assert.equal(t.state().historyReview.counts.isolatedOpenings,2);assert.match(t.state().historyReview.message,/efectos no etiquetados/i);
 assert.deepEqual(t.call('registrarLimiteHistorico',t.body,'fixture-isolation'),r);assert.equal(t.main.getSheetByName('TURNOS').raw(2,12),'OPEN');
});
test('all nine IDs, two aliases and two shifts are fenced before ACK, binding and journal replay',()=>{
 const t=fixture();t.activate();const before=snapshot(t);
 for(const id of [...t.ids,...t.aliases,...t.shiftIds]){
  assert.throws(()=>t.ctx.idempotentExecute_(id,'turnoAbrir',{},'fixture-device',()=>{throw Error('MUST NOT EXECUTE');}),isoError);
  assert.throws(()=>t.ctx.journalResume_(id,'turnoAbrir',t.main),isoError);
  assert.throws(()=>t.call('cajaSimpleEstado',id,'read','CAJA'),isoError);
 }
 assert.equal(snapshot(t),before);
});
test('fresh IDs cannot attach an old opening/shift or alias, even via a nested reference',()=>{
 const t=fixture();t.activate();const before=snapshot(t);
 for(const [i,ref] of [...t.ids,...t.shiftIds,...t.aliases].entries())for(const body of [{openingRequestId:ref},{shiftId:ref},{nested:{sourceRequestId:ref}}])
  assert.throws(()=>t.call('corteZCerrar',body,'fresh-'+i),isoError);
 assert.equal(snapshot(t),before);
});
for(const when of ['before proposal','before activation','after activation'])test('tagged payments/cuts/commands/other requests or journals stop isolation '+when,()=>{
 for(const name of ['COBROS','CAJA 2','COMANDAS','ACCESO','CORTES_Z','REQUESTS','DOMUS_JOURNAL']){
  const t=fixture();let body;if(when!=='before proposal')body=t.approve();if(when==='after activation')t.call('registrarLimiteHistorico',body,'fixture-isolation');
  if(name==='REQUESTS')t.s.appendRow(['linked','cajaSimpleRegistrar','x','fixture-device','COMPLETED','','',JSON.stringify({shiftId:t.shiftIds[0]})]);
  else if(name==='DOMUS_JOURNAL')t.ctx.journalSheet_(t.main).appendRow(['','x','PREPARED','[]','{}','']);
  else t.main.getSheetByName(name).getRange(10,1).setValue(JSON.stringify({shiftId:t.shiftIds[0]}).replace('FIXTURE','\\u0046IXTURE'));
  const before=business(t);assert.throws(when==='before proposal'?t.propose:when==='after activation'?t.state:()=>t.call('registrarLimiteHistorico',body,'fixture-isolation'));
  assert.equal(business(t),before);
 }
});
for(const when of ['before activation','after activation'])test('stale frozen prefix/turnos/cuts rejects '+when,()=>{
 for(const alter of [t=>t.s.getRange(132,8).setValue('{"error":"changed"}'),t=>t.main.getSheetByName('TURNOS').getRange(2,11).setValue('changed'),
  t=>t.main.getSheetByName('CORTES_Z').getRange(2,1).setValue('unrelated-new-cut'),t=>t.s.appendRow(t.s.getRange(131,1,1,8).getValues()[0])]){
  const t=fixture(),body=t.approve();if(when==='after activation')t.call('registrarLimiteHistorico',body,'fixture-isolation');alter(t);
  const before=business(t);assert.throws(when==='after activation'?t.state:()=>t.call('registrarLimiteHistorico',body,'fixture-isolation'));assert.equal(business(t),before);
 }
});
test('unrelated historical FAILED/duplicates stay visible and block opening instead of being excluded',()=>{
 const t=fixture();t.s.getRange(2,1,2,8).setValues([['unrelated','cajaSimpleRegistrar','x','old','FAILED','','','{}'],['unrelated','cajaSimpleRegistrar','x','old','COMPLETED','','','{}']]);
 t.activate();assert.equal(t.ctx.historyOperationalIndex_(t.main).get('unrelated').length,2);assert.equal(t.state().historyReview.counts.remainingUncertainIds,1);
 const before=business(t);assert.throws(t.open,/intenciones inciertas/);assert.equal(business(t),before);assert.equal(t.ctx.journalFind_('fixture-new-open',t.main),null);
});
test('new uncertain intent blocks cut; no inference from missing journey or old timestamp',()=>{
 const t=fixture();t.activate();t.open();t.s.appendRow(['other-failure','comandasSimpleAccion','x','old','FAILED','1900-01-01','','{}']);
 assert.throws(t.cut,/intenciones inciertas/);assert.equal(t.ctx.journalFind_('fixture-new-cut',t.main),null);
});
test('a synthetic new empty journey can close without closing or crediting either legacy turn',()=>{
 const t=fixture(),before=business(t);t.activate();const o=t.open(),c=t.cut();assert.equal(o.openingFloat,0);assert.equal(c.financialFinal,false);
 assert.equal(c.snapshot.movements.length,0);assert.equal(c.snapshot.historyReview.resolved,false);assert.equal(business(t),before);
});
for(const mode of ['prepared','ledger'])test('partial administrative '+mode+' blocks operations until same-ID recovery with zero business writes',()=>{
 const t=fixture(),body=t.approve(),before=business(t);let once=true;
 if(mode==='prepared')t.ctx.SpreadsheetApp.flush=()=>{const p=t.ctx.journalFind_('fixture-isolation',t.main);if(once && p && p.data[2]==='PREPARED'){once=false;throw Error('INJECTED_STOP');}};
 else{const save=t.ctx.saveRequestRecord_;t.ctx.saveRequestRecord_=(r,m)=>{if(once && r.requestId==='fixture-isolation' && r.status==='COMPLETED'){once=false;throw Error('INJECTED_STOP');}return save(r,m);};}
 const register=()=>t.call('registrarLimiteHistorico',body,'fixture-isolation');assert.throws(register,/INJECTED_STOP/);assert.throws(t.state,isoError);
 const r=register();assert.equal(r.resolved,false);assert.deepEqual(register(),r);assert.equal(business(t),before);assert.equal(t.state().active,null);
});
test('activation uses the shared lock and detects a competing intent before durable approval',()=>{
 const t=fixture(),body=t.approve(),other=fixture();other.ctx.LockService=t.ctx.LockService;
 const commit=t.ctx.journalCommit_;let attempted=false;t.ctx.journalCommit_=(...args)=>{
  if(args[1]==='registrarLimiteHistorico'){assert(t.locks().held);assert.throws(()=>other.call('turnoAbrir',{scopeId:'QA',openingFloat:0},'competing','CAJA'),/transacción concurrente/);attempted=true;}
  return commit(...args);
 };
 t.call('registrarLimiteHistorico',body,'fixture-isolation');assert(attempted);assert.equal(t.locks().acquires,t.locks().releases);assert.equal(t.ctx.paymentRequestIndex_(t.main).has('competing'),false);
});
test('a second boundary cannot broaden the retained set or overwrite the first',()=>{
 const t=fixture();t.activate();const before=business(t);assert.throws(t.propose,/Ya existe/);assert.throws(()=>t.call('registrarLimiteHistorico',t.body,'second'),isoError);assert.equal(business(t),before);
});
test('a new unrelated intent between proposal and approval changes the hash and cannot be hidden',()=>{
 const t=fixture(),body=t.approve();t.s.appendRow(['late-intent','cajaSimpleRegistrar','x','old','FAILED','','','{}']);
 assert.throws(()=>t.call('registrarLimiteHistorico',body,'fixture-isolation'),isoError);assert.equal(t.ctx.journalFind_('fixture-isolation',t.main),null);
});
for(const when of ['before','after'])test('journal integrity stays closed for orphan parts/missing IDs '+when+' custody',()=>{
 for(const row of [['','cajaSimpleRegistrar','PREPARED','[]','{}',''],['orphan#part:0','JOURNAL_PART','COMPLETED','[{"sheet":"COBROS"}]','{}','']]){
  const t=fixture();if(when==='after')t.activate();t.ctx.journalSheet_(t.main).appendRow(row);const before=snapshot(t);
  assert.throws(when==='after'?t.state:t.propose);assert.equal(snapshot(t),before);
 }
});
test('legitimate empty journal rows do not become evidence or create a new operation',()=>{
 const t=fixture();t.ctx.journalSheet_(t.main).getRange(2,1,1,6).setValues([Array(6).fill('')]);t.activate();assert.equal(t.state().active,null);
});
test('stale evidence or nonempty plan during partial registration cannot resume',()=>{
 for(const alter of [t=>t.main.getSheetByName('TURNOS').getRange(2,11).setValue('changed'),
   t=>{const j=t.ctx.journalFind_('fixture-isolation',t.main);j.sheet.getRange(j.row,4).setValue('[{"sheet":"COBROS"}]');}]){
  const t=fixture(),body=t.approve();let once=true;t.ctx.SpreadsheetApp.flush=()=>{if(once && t.ctx.journalFind_('fixture-isolation',t.main)){once=false;throw Error('STOP');}};
  const register=()=>t.call('registrarLimiteHistorico',body,'fixture-isolation');assert.throws(register,/STOP/);alter(t);const before=business(t);
  assert.throws(register,isoError);assert.equal(business(t),before);
 }
});
for(const environment of ['STAGING','PRODUCTION'])test('generated '+environment+' bundle enforces staging-only custody in memory',()=>{
 const t=fixture(environment),before=snapshot(t),b=business(t);
 if(environment==='PRODUCTION'){
  assert.throws(t.propose,/canónicos de STAGING/);
  assert.throws(()=>t.call('registrarLimiteHistorico',t.input,'must-not-bind'),/canónicos de STAGING/);
  assert.equal(snapshot(t),before);
 }else{t.activate();assert.equal(t.state().active,null);assert.throws(()=>t.call('cajaSimpleEstado',t.ids[0],'read','CAJA'),isoError);assert.equal(business(t),b);}
});
console.log(JSON.stringify({suite:'staging-opening-isolation-real-source-mocks',passed,liveReads:false,liveWrites:0,realAuthorization:false,realActivation:false}));
module.exports={fixture};
