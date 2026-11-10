'use strict';
// Real modules/dispatcher with synthetic in-memory books. No real IDs or network.
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
let passed=0;const copy=v=>JSON.parse(JSON.stringify(v));
function test(name,fn){fn();passed++;console.log('PASS',name);}
function business(t){return JSON.stringify([...t.main.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells]]));}
function fixture(count=149,duplicates=40){
 const t=setup();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify({version:1,
  scopes:[{id:'A',projectId:'QA-P',projectName:'QA project',eventId:'QA-E',eventName:'QA event',activity:'QA event'}],
  stations:[{deviceId:'fixture-device',stationId:'QA-C',registerId:'QA-R',scopeIds:['A']}]}));
 t.manager();const manager=t.login('GERENCIA'),s=t.ctx.getOrCreateRequestsSheet_(t.main);
 const row=(id,action,status='FAILED')=>[id,action,'a'.repeat(64),'old-fixture-device',status,'2020-01-01T00:00:00.000Z','',JSON.stringify({error:'Unknown effects'})];
 for(let i=0;i<count;i++)s.appendRow(row('legacy-'+i,i<12?'cajaSimpleRegistrar':'comandasSimpleAccion'));
 for(let i=0;i<duplicates;i++)s.appendRow(row('legacy-'+i,i<12?'cajaSimpleRegistrar':'comandasSimpleAccion'));
 s.appendRow(row('legacy-complete','cajaSimpleRegistrar','COMPLETED'));
 const input={queue:[...Array.from({length:4},(_,i)=>({requestId:'legacy-'+i,action:'cajaSimpleRegistrar'})),
  {requestId:'legacy-complete',action:'cajaSimpleRegistrar'},...Array.from({length:10},(_,i)=>({requestId:'absent-'+i,action:'cajaSimpleRegistrar'}))],
  stationDeviceIds:['fixture-device','old-fixture-device'],evidenceReference:'QA inventory / no real operations'};
 const req=(action,body,id)=>t.request(action,[copy(body)],id,'GERENCIA',manager);
 Object.assign(t,{s,input,managerToken:manager,req,propose:()=>req('prepararLimiteHistorico',input,'proposal'),
  open:(id='new-open')=>t.request('turnoAbrir',[{scopeId:'A',openingFloat:0,historyBoundaryId:(t.ctx.historyNotice_(t.main)||{}).boundaryId}],id),
  cut:(id='new-cut')=>req('corteZCerrar',{openingRequestId:'new-open',countedCash:0,historyBoundaryId:(t.ctx.historyNotice_(t.main)||{}).boundaryId},id),
  sell:extra=>{const p=t.sale({openingRequestId:'new-open',...extra});return t.request('cajaSimpleRegistrar',[p],p.id);}});
 t.approve=()=>{const proposal=t.propose();t.props.set('DOMUS_HISTORY_BOUNDARY_APPROVAL_V1',JSON.stringify({version:1,approved:true,snapshotHash:proposal.snapshotHash,approvalReference:'QA explicit approval, not real'}));
  return {...input,snapshotHash:proposal.snapshotHash,acknowledgeUnresolvedHistory:true,confirmStationsHeld:true};};
 t.activate=()=>{t.body=t.approve();return req('registrarLimiteHistorico',t.body,'boundary');};
 return t;
}
if(require.main===module){
test('149 uncertain IDs / 40 duplicate groups / 15 queued (10 absent) are inventoried read-only',()=>{
 const t=fixture(),before=JSON.stringify([...t.s.cells]),b=business(t),p=t.propose();
 assert.deepEqual(copy(p.snapshot.counts),{historicalIds:150,uncertainIds:149,duplicateIds:40,queueIds:15,queueAbsent:10});
 assert.equal(p.canActivate,false);assert.equal(p.resolved,false);assert.equal(p.financialFinal,false);
 assert.equal(JSON.stringify([...t.s.cells]),before);assert.equal(business(t),b);assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);
 assert.throws(t.open,/intenciones inciertas/); // no date/UNKNOWN/null exception.
});
test('activation is disabled without exact server approval even when manager requests it',()=>{
 const t=fixture(),p=t.propose(),b=business(t);
 assert.throws(()=>t.req('registrarLimiteHistorico',{...t.input,snapshotHash:p.snapshotHash,acknowledgeUnresolvedHistory:true,confirmStationsHeld:true},'unapproved'),e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS');
 assert.equal(t.ctx.journalFind_('unapproved',t.main),null);assert.equal(business(t),b);assert.throws(t.open,/intenciones inciertas/);
});
test('roles and actual manager principal guard both proposal and registration',()=>{
 const t=fixture();for(const action of ['prepararLimiteHistorico','registrarLimiteHistorico'])assert.throws(()=>t.request(action,[t.input],'wrong-role'),/Acceso denegado/);
 const u=setup();assert.throws(()=>u.login('GERENCIA')); // no real principal in session.
});
test('approved isolated fence preserves every historical cell and leaves uncertainty on opening/cut',()=>{
 const t=fixture(),last=t.s.getLastRow(),before=t.s.getRange(1,1,last,8).getValues(),b=business(t),f=t.activate();
 assert.equal(f.resolved,false);assert.equal(f.snapshot.counts.uncertainIds,149);assert.equal(f.newCharge,0);assert.equal(business(t),b);
 const o=t.open();assert.equal(o.historyBoundaryId,'boundary');assert.equal(o.historyReview.counts.uncertainIds,149);
 const c=t.cut();assert.equal(c.financialFinal,false);assert.equal(c.snapshot.historyReview.resolved,false);assert.equal(c.snapshot.movements.length,0);
 assert.deepEqual(t.s.getRange(1,1,last,8).getValues(),before);assert.equal(business(t),b);
 assert.deepEqual(t.req('registrarLimiteHistorico',t.body,'boundary'),f);assert.equal(t.locks().acquires,t.locks().releases);
});
test('staging-shaped 40 uncertain IDs remain outstanding after a new empty operational cut',()=>{
 const t=fixture(40,0);t.activate();t.open();const c=t.cut();assert.equal(c.snapshot.historyReview.counts.uncertainIds,40);
 assert.equal(t.ctx.dataRows_(t.s,2,8).filter(r=>r[4]==='FAILED').length,40);
});
test('all 15 captured IDs stay fenced before ACK/binding/replay, including completed and absent',()=>{
 const t=fixture();t.activate();const before=JSON.stringify([...t.s.cells]),b=business(t);
 for(const q of t.input.queue){
  assert.throws(()=>t.ctx.idempotentExecute_(q.requestId,q.action,{},'fixture-device',()=>{throw new Error('MUST NOT RUN');}),e=>e.code==='HISTORY_REQUIRES_REVIEW');
  assert.throws(()=>t.request('cajaSimpleEstado',[q.requestId]),e=>e.code==='HISTORY_REQUIRES_REVIEW');
  assert.throws(()=>t.ctx.journalResume_(q.requestId,q.action,t.main),e=>e.code==='HISTORY_REQUIRES_REVIEW');
 }
 assert.equal(JSON.stringify([...t.s.cells]),before);assert.equal(business(t),b);
});
test('FAILED/COMPLETED duplicate remains a conflict, never an ACK or successful settlement',()=>{
 const t=fixture();t.s.getRange(2,5).setValue('COMPLETED');t.activate();t.open();
 assert.equal(t.cut().snapshot.historyReview.counts.duplicateIds,40);
 assert.throws(()=>t.request('cajaSimpleEstado',['legacy-0']),e=>e.code==='HISTORY_REQUIRES_REVIEW');
 assert.deepEqual(copy(t.ctx.paymentRequestIndex_(t.main).get('legacy-0').map(r=>r[4])),['COMPLETED','FAILED']);
});
test('a stale proposal or new intent before registration cannot be accepted',()=>{
 const t=fixture(),body=t.approve();t.s.getRange(2,8).setValue('{"error":"changed"}');
 assert.throws(()=>t.req('registrarLimiteHistorico',body,'stale'),e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS');assert.equal(t.ctx.journalFind_('stale',t.main),null);
});
test('any changed prefix/formula or appended duplicate stops new operations rather than rehashing',()=>{
 for(const alter of [t=>t.s.getRange(2,8).setValue('changed'),t=>t.s.getRange(2,6).setValue('=NOW()'),
  t=>t.s.appendRow(['absent-0','cajaSimpleRegistrar','','','COMPLETED','','','{}'])]){
  const t=fixture();t.activate();alter(t);const b=business(t);assert.throws(t.open,e=>e.code==='HISTORY_REQUIRES_REVIEW');assert.equal(business(t),b);
 }
});
test('unknown statuses, missing IDs, modern journey history and unlisted station are not quarantined by inference',()=>{
 for(const alter of [t=>t.s.getRange(2,5).setValue('UNKNOWN'),t=>t.s.getRange(2,5).setValue(''),t=>t.s.getRange(2,1).setValue(''),
  t=>t.s.getRange(2,8).setValue('{"journey":{"openingRequestId":"old"}}'),t=>t.input.stationDeviceIds=[]]){
  const t=fixture();alter(t);const before=JSON.stringify([...t.s.cells]);assert.throws(t.propose,e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS');assert.equal(JSON.stringify([...t.s.cells]),before);
 }
});
test('prepared legacy journal is not hidden by an administrative boundary',()=>{
 const t=fixture(),j=t.ctx.journalSheet_(t.main);j.appendRow(['legacy-0','cajaSimpleRegistrar','PREPARED','[]','{}',new Date().toISOString()]);
 const before=JSON.stringify([...j.cells]);assert.throws(t.propose,e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS');assert.equal(JSON.stringify([...j.cells]),before);
});
test('incompatible headers or a completed orphan journal cannot become a trusted boundary',()=>{
 for(const mode of ['headers','orphan']){
  const t=fixture();if(mode==='headers')t.s.getRange(1,5).setValue('OLD_STATE');
  else t.ctx.journalSheet_(t.main).appendRow(['orphan','cajaSimpleRegistrar','COMPLETED','[]','{}',new Date().toISOString()]);
  assert.throws(t.propose,e=>e.code==='HISTORY_BOUNDARY_NO_EFFECTS');assert.equal(t.ctx.paymentRequestIndex_(t.main).has('orphan'),false);
 }
});
test('missing policy cannot downgrade a fenced system to legacy, nor can a second boundary hide new failures',()=>{
 const t=fixture();t.activate();t.props.delete('DOMUS_JOURNEY_POLICY_V1');assert.throws(t.open,e=>e.code==='HISTORY_REQUIRES_REVIEW');
 const u=fixture();u.activate();assert.throws(u.propose,/Ya existe un límite/);
});
test('new unknown FAILED after the boundary blocks opening/cut even if its timestamp looks old',()=>{
 const t=fixture();t.activate();t.open();t.s.appendRow(['new-uncertain','cajaSimpleRegistrar','a'.repeat(64),'fixture-device','FAILED','1900-01-01T00:00:00.000Z','','{}']);
 assert.throws(t.cut,/intenciones inciertas/);assert.equal(t.request('turnoEstado',[]).active.openingRequestId,'new-open');
});
test('new NULL/UNKNOWN or missing-identity evidence and orphan journals cannot be filtered out',()=>{
 for(const mode of ['null','unknown','id','action','journal']){
  const t=fixture();t.activate();
  if(mode==='journal')t.ctx.journalSheet_(t.main).appendRow(['new-orphan','cajaSimpleRegistrar','COMPLETED','[]','{}',new Date().toISOString()]);
  else t.s.appendRow([mode==='id'?'':'new-unknown',mode==='action'?'':'cajaSimpleRegistrar','','',mode==='null'?'':mode==='unknown'?'UNKNOWN':'FAILED','','','{}']);
  const before=business(t);assert.throws(t.open,e=>e.code==='HISTORY_REQUIRES_REVIEW');assert.equal(business(t),before);
 }
});
test('partial administrative preparation blocks other requests; same ID resumes zero commercial writes',()=>{
 const t=fixture(),body=t.approve(),b=business(t);let once=true;
 t.ctx.SpreadsheetApp.flush=()=>{const p=t.ctx.journalFind_('partial-boundary',t.main);if(once && p && p.data[2]==='PREPARED'){once=false;throw new Error('INJECTED_PREPARED_FAILURE');}};
 const register=()=>t.req('registrarLimiteHistorico',body,'partial-boundary');assert.throws(register,/INJECTED_PREPARED_FAILURE/);
 assert.throws(t.open,e=>e.code==='HISTORY_REQUIRES_REVIEW');const f=register();assert.equal(f.boundaryId,'partial-boundary');assert.equal(business(t),b);
 assert.deepEqual(register(),f);assert.equal(t.open().historyBoundaryId,'partial-boundary');
});
test('completed journal without REQUESTS completion cannot enable a journey until same-ID recovery',()=>{
 const t=fixture(),body=t.approve(),b=business(t),save=t.ctx.saveRequestRecord_;let once=true;
 t.ctx.saveRequestRecord_=(record,m)=>{if(once && record.requestId==='boundary' && record.status==='COMPLETED'){once=false;throw new Error('STOP_LEDGER');}return save(record,m);};
 const register=()=>t.req('registrarLimiteHistorico',body,'boundary');assert.throws(register,/STOP_LEDGER/);
 assert.equal(t.ctx.journalFind_('boundary',t.main).data[2],'COMPLETED');assert.throws(t.open,e=>e.code==='HISTORY_REQUIRES_REVIEW');
 assert.equal(register().resolved,false);assert.equal(t.open().historyBoundaryId,'boundary');assert.equal(business(t),b);
});
test('header-only ledger with an explicitly inventoried queue does not fence its own administrative ID',()=>{
 const t=fixture();for(const key of [...t.s.cells.keys()])if(Number(key.split(':')[0])>1)t.s.cells.delete(key);
 const f=t.activate();assert.equal(f.snapshot.counts.historicalIds,0);assert.equal(f.snapshot.counts.queueAbsent,15);
 assert.equal(t.open().historyBoundaryId,'boundary');assert.equal(t.cut().snapshot.historyReview.counts.queueAbsent,15);
});
test('changed evidence and a nonempty administrative replay plan cannot resume',()=>{
 for(const mode of ['evidence','plan']){
  const t=fixture(),body=t.approve();let once=true;
  t.ctx.SpreadsheetApp.flush=()=>{const p=t.ctx.journalFind_('partial',t.main);if(once && p && p.data[2]==='PREPARED'){once=false;throw new Error('STOP');}};
  const register=()=>t.req('registrarLimiteHistorico',body,'partial');assert.throws(register,/STOP/);
  if(mode==='evidence')t.s.getRange(2,8).setValue('changed');else {const p=t.ctx.journalFind_('partial',t.main);p.sheet.getRange(p.row,4).setValue('[{"sheet":"COBROS"}]');}
  const b=business(t);assert.throws(register,e=>e.code==='HISTORY_REQUIRES_REVIEW');assert.equal(business(t),b);
 }
});
test('new sale and same-ID partial-write recovery stay inside the new journey and count once',()=>{
 const t=fixture();t.activate();t.open();const p=t.sale({openingRequestId:'new-open'}),cob=t.main.getSheetByName('COBROS');cob.failAt='7:11';
 const sale=()=>t.request('cajaSimpleRegistrar',[p],p.id);assert.throws(sale,/INJECTED_WRITE_FAILURE/);assert.throws(t.cut,/intenciones inciertas/);
 const r=sale();assert.equal(r.journey.historyBoundaryId,'boundary');assert.deepEqual(sale(),r);assert.equal(cob.getLastRow(),7);
 assert.throws(()=>t.cut('undelivered'),/1 comanda/);
});
test('new transfer and delivery still block cut; history fence is not a delivery authorization',()=>{
 const t=fixture();t.activate();t.open();const r=t.sell({method:'Transferencia'});
 assert.throws(t.cut,/1 transferencia\(s\) sin confirmar y 1 comanda/);const item=JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13));
 assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item).allowed,false);assert.equal(r.verified,false);
});
test('a historical command cannot be changed under a fresh request ID or treated as new credit',()=>{
 const t=fixture();t.activate();const s=t.main.getSheetByName('COMANDAS');
 s.getRange(7,13).setValue(JSON.stringify({row:7,id:'old-unit',batch:'legacy-0',ticket:'old-account',destination:'Barra',state:'Pendiente'}));
 const before=business(t),token=t.login('BARRA');assert.throws(()=>t.request('comandasSimpleAccion',[{key:'DCS-7-legacy-0',action:'TOMAR'}],'fresh-kds','BARRA',token),e=>e.code==='HISTORY_REQUIRES_REVIEW');assert.equal(business(t),before);
 assert.equal(t.ctx.paymentRequestIndex_(t.main).has('fresh-kds'),false);assert.equal(t.ctx.journalFind_('fresh-kds',t.main),null);
 for(const action of ['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente']) {
  assert.throws(()=>t.req(action,{sourceRequestId:'legacy-complete'},'fresh-'+action),e=>e.code==='HISTORY_REQUIRES_REVIEW');
  assert.equal(t.ctx.paymentRequestIndex_(t.main).has('fresh-'+action),false);
 }
 assert.equal(t.ctx.kdsDeliveryDecision_(t.main,{batch:'legacy-0'}).allowed,false);
});
test('an old client cannot open/cut a new journey without naming its boundary',()=>{
 const t=fixture();t.activate();assert.throws(()=>t.request('turnoAbrir',[{scopeId:'A',openingFloat:0}],'old-client-open'),/límite histórico/);
 t.open();assert.throws(()=>t.req('corteZCerrar',{openingRequestId:'new-open',countedCash:0},'old-client-cut'),/límite histórico/);
 assert.equal(t.cut().historyBoundaryId,'boundary');
});
test('closure and creation of a new intent use one shared lock across independent executions',()=>{
 const t=fixture();t.activate();t.open();const other=setup(),p=other.sale({openingRequestId:'new-open'});
 other.ctx.LockService=t.ctx.LockService;other.ctx.SpreadsheetApp=t.ctx.SpreadsheetApp;other.props.set('DOMUS_JOURNEY_POLICY_V1',t.props.get('DOMUS_JOURNEY_POLICY_V1'));
 const commit=t.ctx.journalCommit_;let contention=false;
 t.ctx.journalCommit_=(id,action,...args)=>{
  if(action==='corteZCerrar'){
   assert.equal(t.locks().held,true);
   assert.throws(()=>other.request('cajaSimpleRegistrar',[p],p.id),/transacción concurrente/);contention=true;
   assert.equal(t.ctx.paymentRequestIndex_(t.main).has(p.id),false);
  }
  return commit(id,action,...args);
 };
 t.cut();assert(contention);assert.throws(()=>other.request('cajaSimpleRegistrar',[p],p.id),/cerrada/);
 assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
});
test('a new paid order can be delivered and counted once, with original history still outstanding',()=>{
 const t=fixture();t.activate();t.open();const r=t.sell();
 const inv=t.main.getSheetByName('INVENTARIO'),value=inv.value.bind(inv);
 inv.getRange(7,7).setValue('=SUMIF(mock)');inv.getRange(7,8).setValue('=D7-G7');inv.value=(row,col)=>row===7&&col===8?10:value(row,col);
 const token=t.login('BARRA');for(const action of ['TOMAR','LISTA','ENTREGAR'])t.request('comandasSimpleAccion',[{key:'DCS-7-'+r.sourceRequestId,action}],'new-'+action,'BARRA',token);
 const c=t.cut();assert.equal(c.snapshot.totals.Efectivo,40);assert.equal(c.snapshot.movements.length,1);assert.equal(c.snapshot.historyReview.counts.uncertainIds,149);
 assert.equal(c.financialFinal,false);assert.deepEqual(t.cut(),c);
});
test('old accounts and old confirmed source IDs cannot be adopted into the new journey',()=>{
 const t=fixture();t.activate();t.open();const cash=t.main.getSheetByName('CAJA 2');
 const row=Array(32).fill('');Object.assign(row,{0:'legacy-unit',1:'legacy-account',4:'QA',6:'QA drink',7:1,9:40,11:40});cash.getRange(7,1,1,32).setValues([row]);const before=business(t);
 assert.throws(()=>t.sell({ticket:'legacy-account',items:[]}),/sin jornada de origen/);assert.equal(business(t),before);
 assert.throws(()=>t.ctx.transferSource_(t.main,t.ctx.paymentRequestIndex_(t.main),{sourceRequestId:'legacy-complete'}),e=>e.code==='HISTORY_REQUIRES_REVIEW');
});
test('new existing-payment resolution and same-ID recovery coexist with retained duplicate history',()=>{
 const t=fixture();t.activate();t.open();const source=t.sell({method:'Transferencia'});
 const paid=t.sell({ticket:source.ticket,items:[],method:'Efectivo'});assert.equal(paid.total,40);
 const input={sourceRequestId:source.sourceRequestId,sourceReceipt:source.receipt,ticket:source.ticket};
 const p=t.req('prepararVinculoPagoExistente',input,'proposal-link');
 const body={...input,openingRequestId:'new-open',snapshotHash:p.snapshotHash,existingPaymentRequestId:p.existingPayment.requestId,
  existingPaymentReceipt:p.existingPayment.receipt,expectedAmount:p.amount,expectedPaymentMethod:p.existingPayment.method,
  expectedPaymentParts:p.existingPayment.parts,expectedUnitIds:p.unitIds,confirmExistingPayment:true,newCharge:0,reason:'QA same payment',evidenceReference:'QA only'};
 let once=true;t.ctx.SpreadsheetApp.flush=()=>{const plan=t.ctx.journalFind_('link',t.main);if(once && plan && plan.data[2]==='PREPARED'){once=false;throw new Error('STOP_LINK');}};
 const link=()=>t.req('vincularPagoExistente',body,'link');assert.throws(link,/STOP_LINK/);const result=link();assert.equal(result.newCharge,0);assert.deepEqual(link(),result);
 assert.equal(t.main.getSheetByName('COBROS').getLastRow(),8);
});
console.log(JSON.stringify({suite:'history-boundary-real-source-mocks',passed,realData:false,liveWrites:0,approvalConfiguredInMocksOnly:true}));

}
module.exports={fixture};
