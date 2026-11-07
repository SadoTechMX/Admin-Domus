'use strict';
// Actual dispatcher, POS, KDS, transfer and journal; mock books only. No network.
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
const copy=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(n,f){f();passed++;console.log('PASS',n);}
function policy(){return {version:1,scopes:[
 {id:'A',projectId:'P-A',projectName:'QA project A',eventId:'E-A',eventName:'QA event A',activity:'QA event'},
 {id:'B',projectId:'P-B',projectName:'QA project B',eventId:null,eventName:'',activity:'QA project B'}],
 stations:[{deviceId:'fixture-device',stationId:'CAJA_1',registerId:'GAVETA_1',scopeIds:['A','B']},
 {deviceId:'fixture-device-2',stationId:'CAJA_2',registerId:'GAVETA_2',scopeIds:['A','B']}]};}
function prepare(){
 const t=setup();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy()));
 t.manager();const manager=t.login('GERENCIA');
 return Object.assign(t,{
 open:(id='open-A',scopeId='A',openingFloat=100)=>t.request('turnoAbrir',[{scopeId,openingFloat}],id),
 cut:(id='cut-A',openingRequestId='open-A',countedCash=100)=>t.request('corteZCerrar',[{openingRequestId,countedCash}],id,'GERENCIA',manager),
 sell:(extra={})=>{const p=t.sale({openingRequestId:'open-A',...extra});return t.request('cajaSimpleRegistrar',[p],p.id);},managerToken:manager
 });
}
function business(t){return JSON.stringify([...t.main.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells]]));}
function deliver(t,row=7){
 const inv=t.main.getSheetByName('INVENTARIO');inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');
 const old=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:old(r,c); // Explicit mock formula result; not live inventory validation.
 const item=JSON.parse(t.main.getSheetByName('COMANDAS').raw(row,13)),key='DCS-'+row+'-'+item.batch,token=t.login('BARRA');
 for(const action of ['TOMAR','LISTA','ENTREGAR'])t.request('comandasSimpleAccion',[{key,action}],action+'-'+row,'BARRA',token);
}
function clock(t,iso){const when=Date.parse(iso);t.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:[when]));}static now(){return when;}static [Symbol.hasInstance](v){return v instanceof Date;}};}
test('disabled mapping preserves legacy sale, while opening with no mapping has no business effects',()=>{
 const t=setup(),before=business(t);assert.equal(t.request('turnoEstado',[]).enabled,false);
 assert.throws(()=>t.request('turnoAbrir',[{scopeId:'A',openingFloat:0}],'no-policy'),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS');assert.equal(business(t),before);
 const sale=t.sale();assert.equal(t.request('cajaSimpleRegistrar',[sale],sale.id).paid,true);
});
test('opening freezes explicit identity, server device and time; float never enters COBROS',()=>{
 const t=prepare(),before=business(t),r=t.open();assert.equal(r.journeyId,'JOR-open-A');assert.equal(r.stationId,'CAJA_1');assert.equal(r.scope.projectId,'P-A');assert.equal(r.openingFloat,100);
 assert.equal(business(t),before);assert.deepEqual(t.open(),r);assert.equal(t.request('turnoEstado',[]).active.openingRequestId,'open-A');
 assert.throws(()=>t.open('open-A','A',150),/IDEMPOTENCY_KEY_REUSED/);assert.equal(t.locks().held,false);assert.equal(t.locks().acquires,t.locks().releases);
});
test('missing/invalid identity map and non-numeric float cannot be guessed',()=>{
 for(const value of ['100',null,-1,1.001,NaN]){const t=prepare(),before=business(t);assert.throws(()=>t.open('bad','A',value));assert.equal(business(t),before);}
 const t=prepare(),p=policy();p.scopes[0].projectId='';t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(p));assert.throws(()=>t.open(),/Mapa explícito/);
});
test('one opening per station, register and event/project, with independent projects on separate stations',()=>{
 const t=prepare();t.open();assert.throws(()=>t.open('duplicate','B'),/ya tiene jornada/);
 const token=t.login('CAJA','fixture-device-2');const call=(scopeId,id)=>t.ctx.executeDomusAction_('turnoAbrir',{args:[{scopeId,openingFloat:0}],requestId:id,deviceId:'fixture-device-2',role:'CAJA',sessionToken:token}).result;
 assert.throws(()=>call('A','scope-duplicate'),/ya tiene jornada/);const b=call('B','open-B');assert.notEqual(b.journeyId,'JOR-open-A');assert.equal(b.scope.eventId,null);
});
test('sales require explicit live opening, correct station and matching event; all failures preserve sheets',()=>{
 const t=prepare();t.open();const before=business(t);
 for(const extra of [{openingRequestId:''},{openingRequestId:'unknown'},{activity:'another-event'}])assert.throws(()=>t.sell(extra));assert.equal(business(t),before);
 const token=t.login('CAJA','fixture-device-2'),p=t.sale({openingRequestId:'open-A'});
 assert.throws(()=>t.ctx.executeDomusAction_('cajaSimpleRegistrar',{args:[p],requestId:p.id,deviceId:'fixture-device-2',role:'CAJA',sessionToken:token}),/ajena/);assert.equal(business(t),before);
});
test('real POS and mixed payment preserve journey, original timestamp and command context',()=>{
 const t=prepare();t.open();const r=t.sell({method:'Mixto',payments:[{method:'Efectivo',amount:15},{method:'Terminal 1',amount:25}],received:20,tip:1,terminalConfirmed:true,terminalReference:'QA-ONLY'});
 assert.equal(r.journey.openingRequestId,'open-A');assert.equal(r.originJourney.journeyId,r.journey.journeyId);assert.equal(r.payments.length,2);
 assert.equal(t.main.getSheetByName('CAJA 2').raw(7,3).toISOString(),r.journey.occurredAt);assert.equal(JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13)).journey.journeyId,r.journey.journeyId);
 deliver(t);const cut=t.cut('cut-A','open-A',116);assert.equal(cut.snapshot.totals.Efectivo,15);assert.equal(cut.snapshot.totals['Terminal 1'],25);assert.equal(cut.snapshot.cashFromBoundPOS,116);
 assert.equal(cut.financialFinal,false);assert.equal(cut.snapshot.coverage,'JOURNEY_POS_RECEIPTS');
});
test('same opening spans midnight and 07:00; expired SEMANA still rejects without changing report cells',()=>{
 const t=prepare();clock(t,'2026-11-07T02:00:00.000Z');t.main.getSheetByName('SEMANA').getRange('B7:B8').setValues([[new Date('2026-11-06')],[new Date('2026-11-08')]]);
 const r=t.open();clock(t,'2026-11-07T13:00:00.000Z');const s=t.sell();assert.equal(s.journey.journeyId,r.journeyId);assert.equal(s.journey.occurredAt,'2026-11-07T13:00:00.000Z');
 clock(t,'2026-11-20T12:00:00.000Z');const token=t.login(),before=business(t),p=t.sale({openingRequestId:'open-A'});
 assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id,'CAJA',token),e=>e.code==='SALE_VALIDATION_REJECTED_NO_EFFECTS');assert.equal(business(t),before);
 assert.equal(t.request('turnoEstado',[],undefined,'CAJA',token).active.journeyId,r.journeyId);
});
test('cut requires manager identity and counted cash; no automatic use of expected cash',()=>{
 const t=prepare();t.open();const before=business(t);assert.throws(()=>t.request('corteZCerrar',[{openingRequestId:'open-A',countedCash:100}],'no-role'),/Acceso denegado/);
 for(const value of [null,'100',-1,0.001])assert.throws(()=>t.cut('bad-'+String(value),'open-A',value),/efectivo contado/);
 assert.equal(business(t),before);assert.equal(t.request('turnoEstado',[]).active.openingRequestId,'open-A');
});
test('cut with unresolved transfer/delivery is explicitly blocked while pending policy remains undecided',()=>{
 for(const method of ['Efectivo','Transferencia']){const t=prepare();t.open();t.sell({method});const before=business(t);assert.throws(()=>t.cut(),/falta definir la regla/);assert.equal(business(t),before);assert(t.request('turnoEstado',[]).active);}
});
test('completed cut blocks new/late-offline sale but original confirmed ACK recovers unchanged',()=>{
 const t=prepare();t.open();const p=t.sale({openingRequestId:'open-A'}),r=t.request('cajaSimpleRegistrar',[p],p.id);deliver(t);const cut=t.cut();
 assert.equal(t.request('turnoEstado',[]).active,null);const before=business(t);assert.throws(()=>t.sell(),/cerrada/);assert.equal(business(t),before);
 assert.deepEqual(t.request('cajaSimpleRegistrar',[p],p.id),r);assert.deepEqual(t.cut(),cut);assert.throws(()=>t.cut('another-cut'),/cerrada/);
});
test('prepared sale prevents cutting; retry preserves exact ID/time/journey and applies once',()=>{
 const t=prepare();t.open();const p=t.sale({openingRequestId:'open-A'}),c=t.main.getSheetByName('COBROS');c.failAt='7:1';assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),/INJECTED/);
 assert.throws(()=>t.cut('blocked-cut'),/inciertas/);const planned=JSON.parse(t.ctx.journalFind_(p.id,t.main).data[4]);
 const r=t.request('cajaSimpleRegistrar',[p],p.id);assert.deepEqual(copy(r),copy(planned));assert.equal(c.getLastRow(),7);assert.equal(t.ctx.posBalanceFast_({m:t.main},r.ticket).due,0);
 assert.throws(()=>t.cut('blocked-cut'),/inciertas/); // Original no-effects rejection remains immutable.
 deliver(t);assert.equal(t.cut('new-cut-after-recovery').status,'CLOSED');
});
test('lost opening/cut ACK and interrupted final ledger update recover same journal result',()=>{
 for(const action of ['turnoAbrir','corteZCerrar']){
  const t=prepare();if(action==='corteZCerrar')t.open();
  const ledger=t.ctx.getOrCreateRequestsSheet_(t.main),original=ledger.put.bind(ledger);let failures=1;
  ledger.put=(r,c,v)=>{if(c===5 && v==='COMPLETED' && failures-- >0)throw Error('INJECTED_LEDGER_FAILURE');return original(r,c,v);};
  const call=()=>action==='turnoAbrir'?t.open():t.cut();assert.throws(call,/INJECTED_LEDGER/);ledger.put=original;
  const id=action==='turnoAbrir'?'open-A':'cut-A',planned=JSON.parse(t.ctx.journalFind_(id,t.main).data[4]);assert.deepEqual(copy(call()),copy(planned));
  assert.deepEqual(copy(call()),copy(planned));assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
 }
});
test('open account retains original journey, later payment has its own journey without moving old rows',()=>{
 const t=prepare();t.open();const r=t.sell({paid:false,credit:'Amigo'});deliver(t);const old=t.main.getSheetByName('CAJA 2').getRange(7,1,1,32).getValues();
 const cut=t.cut();assert.equal(cut.snapshot.openAccounts[0].due,40);t.open('open-next');
 const paid=t.sell({openingRequestId:'open-next',ticket:r.ticket,items:[],expectedTotal:40});assert.equal(paid.journey.journeyId,'JOR-open-next');assert.equal(paid.originJourney.journeyId,'JOR-open-A');
 assert.deepEqual(t.main.getSheetByName('CAJA 2').getRange(7,1,1,32).getValues(),old);assert.equal(t.ctx.posBalanceFast_({m:t.main},r.ticket).due,0);
});
test('legacy accounts and different projects cannot be silently assigned to a new journey',()=>{
 const t=setup(),p=t.sale({paid:false,credit:'Amigo'}),r=t.request('cajaSimpleRegistrar',[p],p.id);t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy()));
 t.request('turnoAbrir',[{scopeId:'A',openingFloat:0}],'open-A');const before=business(t),payment=t.sale({openingRequestId:'open-A',ticket:r.ticket,items:[]});
 assert.throws(()=>t.request('cajaSimpleRegistrar',[payment],payment.id),/histórica/);assert.equal(business(t),before);
 const u=prepare();u.open();const old=u.sell({paid:false,credit:'Amigo'});deliver(u);u.cut();u.open('open-B','B');
 assert.throws(()=>u.sell({openingRequestId:'open-B',ticket:old.ticket,items:[]}),/otro evento\/proyecto/);
});
test('removing mapping after durable opening cannot downgrade subsequent sales to legacy',()=>{
 const t=prepare();t.open();t.props.delete('DOMUS_JOURNEY_POLICY_V1');const before=business(t);assert.throws(()=>t.sell({openingRequestId:''}),/No volver al modo legado/);assert.equal(business(t),before);
 for(const [name,column] of [['REQUESTS',8],['DOMUS_JOURNAL',5]]){
  const s=t.main.getSheetByName(name);for(let row=2;row<=s.getLastRow();row++)if(s.raw(row,column))s.getRange(row,column).setValue(JSON.stringify(JSON.parse(s.raw(row,column)),null,2));
 }
 assert.throws(()=>t.sell({openingRequestId:''}),/No volver al modo legado/);assert.equal(business(t),before);
});
test('bank confirmation binds current collection and original journey, without altering pending row',()=>{
 const t=prepare();t.open();const r=t.sell({method:'Transferencia'}),c=t.main.getSheetByName('COBROS'),old=c.getRange(7,1,1,31).getValues();
 t.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['DOMUS_QA']}));
 const proof={openingRequestId:'open-A',sourceRequestId:r.sourceRequestId,sourceReceipt:r.receipt,ticket:r.ticket,receiver:'DOMUS_QA',bankTransactionId:'QA-BANK-001',receivedDate:'2026-11-07',evidenceReference:'QA only',amount:40,currency:'MXN'};
 const confirmed=t.request('confirmarTransferencia',[proof],'bank-confirm','GERENCIA',t.managerToken);
 assert.equal(confirmed.journey.journeyId,'JOR-open-A');assert.equal(confirmed.originJourney.journeyId,'JOR-open-A');assert.deepEqual(c.getRange(7,1,1,31).getValues(),old);
 assert.equal(t.request('confirmarTransferencia',[{...proof}],'bank-duplicate-ack','GERENCIA',t.managerToken).receipt,confirmed.receipt);
 deliver(t);const cut=t.cut();assert.equal(cut.snapshot.totals.Transferencia,40);assert.equal(cut.snapshot.pendingTransfers.length,0);assert.equal(cut.snapshot.movements.length,1);
});
test('corrupt payment evidence blocks cut instead of sealing fabricated totals',()=>{
 const t=prepare();t.open();t.sell();deliver(t);t.main.getSheetByName('COBROS').getRange(7,6).setValue(999);assert.throws(()=>t.cut(),/correspondencia única/);
 assert.equal(t.ctx.journalFind_('cut-A',t.main),null);assert.equal(t.ctx.findRequestRecord_('open-A',t.main).response.status,'OPEN');
});
test('oversized cut evidence fails before journal preparation without truncating original ledger',()=>{
 const t=prepare();t.open();const sale=t.sell();deliver(t);
 const ledger=t.main.getSheetByName('REQUESTS'),cob=t.main.getSheetByName('COBROS'),example=cob.getRange(7,1,1,31).getValues()[0];
 // Volume fixture: explicit durable receipt rows, never live sales or a second engine.
 for(let i=0;i<650;i++){
  const id='QA-VOLUME-REQUEST-'+String(i).padStart(32,'0'),receipt='QA-VOLUME-RECEIPT-'+id;
  const r={...copy(sale),receipt,sourceRequestId:id,fulfillment:{units:[]}},row=example.slice();row[0]=receipt;row[8]='CAJA-RAPIDA:'+id;
  cob.appendRow(row);ledger.appendRow([id,'cajaSimpleRegistrar','fixture-binding','fixture-device','COMPLETED',new Date().toISOString(),new Date().toISOString(),JSON.stringify(r)]);
 }
 const before=business(t);assert.throws(()=>t.cut(),/demasiado grande/);assert.equal(t.ctx.journalFind_('cut-A',t.main),null);assert.equal(business(t),before);
});
console.log(JSON.stringify({suite:'journey-operations-real-source-mocks',passed,liveSheets:false,productionWrites:0,formulaEvaluation:false}));
