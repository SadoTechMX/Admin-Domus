'use strict';
const assert=require('assert/strict'),{setup}=require('./recovery_regressions');
const clone=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,f){f();passed++;console.log('PASS',name);}
function fixture(qty=1){
 const t=setup();t.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify({version:1,scopes:[{id:'A',projectId:'PA',projectName:'QA project',eventId:'EA',eventName:'QA event',activity:'QA event'}],
 stations:[{deviceId:'fixture-device',stationId:'QA',registerId:'QA',scopeIds:['A']}]}));
 t.manager();const manager=t.login('GERENCIA');t.request('turnoAbrir',[{scopeId:'A',openingFloat:0}],'open');
 const sale=t.sale({id:'pending',openingRequestId:'open',method:'Transferencia',items:[{sku:'QA-01',qty}],expectedTotal:40*qty}),source=t.request('cajaSimpleRegistrar',[sale],sale.id);
 const ref={sourceRequestId:sale.id,sourceReceipt:source.receipt,ticket:source.ticket};
 const plan=()=>t.request('prepararResolucionTransferencia',[{...ref}],'query','GERENCIA',manager);
 const body=(patch={})=>{const observed=plan();return {...ref,openingRequestId:'open',snapshotHash:observed.snapshotHash,expectedAmount:observed.amount,expectedUnitIds:observed.fulfillment.units.map(u=>u.id),reason:'QA customer cancelled; no payment or delivery',
  review:{noDeliveryConfirmed:true,noBankReceiptConfirmed:true,evidenceReference:'QA physical and bank review'},wasteReview:{status:'NO_WASTE_OBSERVED',note:'Explicit QA observation, not inferred'},...patch};};
 const cancel=(p,id='cancel')=>t.request('cancelarTransferenciaNoRecibida',[p],id,'GERENCIA',manager);
 const cut=(id='cut')=>t.request('corteZCerrar',[{openingRequestId:'open',countedCash:0}],id,'GERENCIA',manager);
 const command=(state,row=7,extra={})=>{const s=t.main.getSheetByName('COMANDAS'),it=JSON.parse(s.raw(row,13));s.put(row,13,JSON.stringify({...it,state,...extra}));s.put(row,8,state);};
 const proof=()=>{t.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['QA']}));return {...ref,openingRequestId:'open',receiver:'QA',bankTransactionId:'QA-BANK-001',receivedDate:'2026-11-05',evidenceReference:'QA only',amount:source.total,currency:'MXN'};};
 return {...t,source,ref,plan,body,cancel,cut,command,proof,managerToken:manager};
}
const business=t=>JSON.stringify([...t.main.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells]]));
const state=t=>JSON.stringify([...[t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells]]))]);
function originals(t){return {payment:clone(t.main.getSheetByName('COBROS').getRange(7,1,1,31).getValues()[0]),request:clone(t.main.getSheetByName('REQUESTS').getRange(3,1,1,8).getValues()[0]),inventory:JSON.stringify([...t.main.getSheetByName('INVENTARIO').cells])};}
function preserved(t,b){assert.deepEqual(originals(t),b);}

function main(){
test('manager cancels prepared unserved order; original payment/request/preparation and inventory preserved; no income at cut',()=>{
 const t=fixture();t.command('Lista',7,{ready:'2026-11-08T00:00:00.000Z',preparedBy:'QA cook'});const before=originals(t),p=t.body(),r=t.cancel(p);
 assert.equal(r.status,'CANCELLED_NO_RECEIPT');assert.equal(r.amountApplied,0);assert.equal(r.refund,0);assert.equal(r.inventoryMovement,0);assert.equal(r.units[0].previousState,'Lista');preserved(t,before);
 const item=JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13));assert.equal(item.ready,'2026-11-08T00:00:00.000Z');assert.equal(item.state,'Cancelada');assert.equal(item.cancellationRequestId,'cancel');
 assert.equal(t.ctx.posBalanceFast_({m:t.main},r.ticket).due,0);assert.equal(t.ctx.transferCancellationRecords_(t.main).length,1);
 const list=t.request('transferenciasPendientes',[],'list','GERENCIA',t.managerToken);assert.equal(list.pending.length,0);assert.equal(list.cancelled.length,1);
 const cut=t.cut();assert.equal(cut.snapshot.pendingTransfers.length,0);assert.equal(cut.snapshot.pendingDeliveries.length,0);assert.equal(cut.snapshot.movements.length,0);assert.equal(cut.snapshot.cancelledTransfers.length,1);
});
test('single intent cancels all units without fabricating waste or stock movement',()=>{
 const t=fixture(2),before=originals(t);t.command('En preparación');const r=t.cancel(t.body());assert.equal(r.units.length,2);assert.equal(r.wasteReview.status,'NO_WASTE_OBSERVED');preserved(t,before);
});
test('same ID recovers same resolution; mutated payload rejected; another ID cannot create another cancellation',()=>{
 const t=fixture(),p=t.body(),r=t.cancel(p),before=business(t);assert.deepEqual(t.cancel(p),r);assert.equal(business(t),before);
 assert.throws(()=>t.cancel({...p,reason:'other'}),/IDEMPOTENCY_KEY_REUSED/);assert.throws(()=>t.cancel(p,'second'),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');
 assert.equal(t.ctx.transferCancellationRecords_(t.main).length,1);assert.equal(business(t),before);assert.equal(t.cut().status,'CLOSED');
});
test('cashier and legacy manager principal cannot cancel; bank/delivery attestations and waste declaration required',()=>{
 const t=fixture(),p=t.body(),before=business(t);assert.throws(()=>t.request('cancelarTransferenciaNoRecibida',[p],'bad-role'),/Acceso denegado/);assert.equal(business(t),before);
 for(const patch of [{review:null},{review:{...p.review,noDeliveryConfirmed:false}},{review:{...p.review,noBankReceiptConfirmed:false}},{wasteReview:null},{wasteReview:{status:'ASSUMED_ZERO',note:'x'}}]){
  const x=fixture(),b=business(x);assert.throws(()=>x.cancel({...x.body(),...patch}),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(business(x),b);assert.equal(x.ctx.journalFind_('cancel',x.main),null);
 }
 const ses=JSON.parse(t.props.get('ses:'+t.managerToken));delete ses.principal;t.props.set('ses:'+t.managerToken,JSON.stringify(ses));t.ctx.CacheService.getScriptCache().put('ses:'+t.managerToken,JSON.stringify(ses));
 assert.throws(()=>t.cancel(p),e=>e.code==='AUTH_PRINCIPAL_REQUIRED');assert.equal(business(t),before);
});
test('stale observation rejects before effects; corrected attempt needs new ID and refreshed proposal',()=>{
 const t=fixture(),p=t.body();t.command('Lista');const before=business(t);assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(business(t),before);
 assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');const next=t.body();assert.throws(()=>t.cancel(next),/IDEMPOTENCY_KEY_REUSED/);assert.equal(t.cancel(next,'refreshed').status,'CANCELLED_NO_RECEIPT');
});
test('delivered, partial delivery or recorded consumption cannot be cancelled or returned to stock',()=>{
 for(const signal of ['state','date','consumed','mirror']){const t=fixture(2);
  if(signal==='state')t.command('Entregada');if(signal==='date')t.command('Lista',7,{delivered:'2026-11-08T00:00:00.000Z'});
  if(signal==='consumed')t.main.getSheetByName('CAJA 2').put(7,22,1);if(signal==='mirror')t.main.getSheetByName('COMANDAS').put(7,8,'Entregada');
  const p=t.body(),b=business(t);assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(business(t),b);
 }
});
test('already recorded other payment remains blocked for cancellation/substitution and is never charged twice',()=>{
 const t=fixture(),s=t.sale({id:'cash-payment',openingRequestId:'open',ticket:t.source.ticket,items:[],method:'Efectivo'});t.request('cajaSimpleRegistrar',[s],s.id);
 const p=t.body(),b=business(t);assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS');assert.equal(business(t),b);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),8);
});
test('serialized confirmation first wins; cancellation first blocks late bank application without a new confirmation intent',()=>{
 const a=fixture(),p=a.body();a.request('confirmarTransferencia',[a.proof()],'confirm','GERENCIA',a.managerToken);const before=business(a);assert.throws(()=>a.cancel(p));assert.equal(business(a),before);
 const b=fixture(),r=b.cancel(b.body()),proof=b.proof(),snap=state(b);assert.throws(()=>b.request('confirmarTransferencia',[proof],'late','GERENCIA',b.managerToken),e=>e.code==='TRANSFER_CANCELLED_REQUIRES_RECONCILIATION');assert.equal(state(b),snap);
 assert.equal(b.ctx.paymentRequest_(b.ctx.paymentRequestIndex_(b.main),'late'),null);assert.equal(b.ctx.transferCancellationRecords_(b.main)[0].cancellationRequestId,r.cancellationRequestId);
});
test('partial business writes stay held, block confirmation/cut, and resume once with same ID',()=>{
 const t=fixture(),p=t.body(),before=originals(t);t.main.getSheetByName('COMANDAS').failAt='7:13';assert.throws(()=>t.cancel(p),/INJECTED_WRITE_FAILURE/);
 assert.throws(()=>t.ctx.transferCancellationRecords_(t.main),/REQUIRES_REVIEW/);assert.throws(()=>t.cut());
 assert.throws(()=>t.request('confirmarTransferencia',[t.proof()],'bank-during-partial','GERENCIA',t.managerToken),/REQUIRES_REVIEW/);
 assert.equal(t.cancel(p).status,'CANCELLED_NO_RECEIPT');preserved(t,before);assert.equal(t.ctx.transferCancellationRecords_(t.main).length,1);
});
test('lost final REQUESTS completion blocks release despite completed journal; retry only completes original resolution',()=>{
 const t=fixture(),p=t.body(),s=t.main.getSheetByName('REQUESTS'),put=s.put.bind(s);let injected=false;
 s.put=(r,c,v)=>{if(!injected && r===4 && c===5 && v==='COMPLETED'){injected=true;throw Error('LEDGER_COMPLETION_FAILED');}put(r,c,v);};
 assert.throws(()=>t.cancel(p),/LEDGER_COMPLETION_FAILED/);assert.equal(t.ctx.journalFind_('cancel',t.main).data[2],'COMPLETED');assert.throws(()=>t.ctx.transferCancellationRecords_(t.main),/REQUIRES_REVIEW/);
 assert.equal(t.cancel(p).status,'CANCELLED_NO_RECEIPT');assert.equal(t.ctx.transferCancellationRecords_(t.main).length,1);
});
test('failure at each cancellation cell preserves source and resumes the same administrative intention',()=>{
 for(const [sheet,cell] of [['CAJA 2','7:16'],['COMANDAS','7:8'],['COMANDAS','7:13'],['COMANDAS','7:14']]){
  const t=fixture(),p=t.body(),before=originals(t);t.main.getSheetByName(sheet).failAt=cell;
  assert.throws(()=>t.cancel(p),/INJECTED_WRITE_FAILURE/);assert.throws(()=>t.cut());preserved(t,before);
  assert.equal(t.cancel(p).status,'CANCELLED_NO_RECEIPT');preserved(t,before);assert.equal(t.cut('after-recovery').status,'CLOSED');
 }
});
test('evidence changed during partial cancellation prevents replay before any further business write',()=>{
 for(const change of ['bank','delivery']){const t=fixture(),p=t.body();t.main.getSheetByName('COMANDAS').failAt='7:13';assert.throws(()=>t.cancel(p));
  if(change==='bank'){const s=t.main.getSheetByName('COBROS');s.put(8,1,'QA-LATE');s.put(8,3,'Caja');s.put(8,4,t.source.ticket);s.put(8,14,40);}
  else t.command('Entregada');const before=business(t);assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_REQUIRES_REVIEW');assert.equal(business(t),before);
 }
});
test('observed or unknown waste is preserved as review, never inferred as zero or stock adjustment, and keeps cut blocked',()=>{
 for(const status of ['WASTE_OBSERVED','PENDING_REVIEW']){const t=fixture();t.command('Lista');const before=originals(t),r=t.cancel(t.body({wasteReview:{status,note:'QA physical finding needs inventory reconciliation'}}));
  assert.equal(r.wasteReview.status,status);assert.equal(r.wasteReview.inventoryApplied,false);assert.equal(r.closureBlocked,true);preserved(t,before);
  assert.throws(()=>t.cut(),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS' && e.message.includes('0 transferencia(s) sin confirmar') && e.message.includes('1 cancelación(es) con merma por conciliar'));const snap=t.ctx.journeyCutSnapshot_(t.main,t.ctx.journeyOpening_(t.main,'open'),new Date());assert.equal(snap.pendingTransfers[0].reason,'WASTE_REVIEW_REQUIRED');
 }
});
test('changed durable resolution or command state cannot remove the pending from a cut',()=>{
 for(const change of ['result','command','duplicate','duplicate-journal']){const t=fixture();t.cancel(t.body());
  if(change==='result'){const s=t.main.getSheetByName('REQUESTS'),r=JSON.parse(s.raw(4,8));r.wasteReview.status='WASTE_OBSERVED';s.put(4,8,JSON.stringify(r));}
  if(change==='command')t.command('Lista');if(change==='duplicate'){const s=t.main.getSheetByName('REQUESTS');s.appendRow(s.getRange(4,1,1,8).getValues()[0]);}
  if(change==='duplicate-journal'){const r=t.ctx.journalFind_('cancel',t.main);r.sheet.appendRow(r.data);}
  const b=business(t);assert.throws(()=>t.cut());assert.equal(business(t),b);
 }
});
test('duplicate cancellation journal prevents partial replay before further business effects',()=>{
 const t=fixture(),p=t.body();t.main.getSheetByName('COMANDAS').failAt='7:13';assert.throws(()=>t.cancel(p));
 const r=t.ctx.journalFind_('cancel',t.main);r.sheet.appendRow(r.data);const before=business(t);
 assert.throws(()=>t.cancel(p),e=>e.code==='TRANSFER_CANCELLATION_REQUIRES_REVIEW');assert.equal(business(t),before);
});
test('cannot move cancellation to another opening or revive cancelled account with a new payment',()=>{
 const t=fixture(),p=t.body(),b=business(t);assert.throws(()=>t.cancel({...p,openingRequestId:'other'}));assert.equal(business(t),b);
 t.cancel(t.body(),'valid');const s=t.sale({id:'wrong-payment',openingRequestId:'open',ticket:t.source.ticket,items:[],method:'Efectivo'}),after=business(t);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[s],s.id),/Cuenta no encontrada/);assert.equal(business(t),after);
});
console.log(JSON.stringify({suite:'transfer-cancellation-real-source-mocks',passed,liveBank:false,liveSheets:false,inventoryAdjustments:0,substitutionImplemented:false}));
}
module.exports={fixture,originals,preserved,business};
if(require.main===module)main();
