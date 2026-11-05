'use strict';
// Client + backend source under review, mocked Sheets and shared storage/lock scheduler.
// No network, real sales, spreadsheet services, printers or drawers.
const assert=require('assert/strict');
const {setup,storage,tick,copy}=require('./reconciliation_regressions');
const backend=require('./recovery_regressions');
const locksFactory=require('./mock_web_locks');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function clientSale(t){
  Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
}
function connect(t,b){
  t.ctx.setSessionToken(b.login(),'CAJA');const requests=[];
  t.ctx.transport_=async p=>{requests.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};return requests;
}
async function main(){
await test('phase rejection proves no sale effects; corrected phase/cart create a NEW ID while preserving rejected evidence',async()=>{
  const t=setup(),b=backend.setup();clientSale(t);const requests=connect(t,b);
  b.main.getSheetByName('CAJA 2').getRange('F2').setValue('Lunar');
  await t.ctx.confirmPaymentAndDispatch(true);await tick();
  const rejected=t.ctx.getOutbox()[0],old=JSON.parse(t.localStorage.getItem('domus_pending_sale'));
  assert.equal(rejected.status,'REJECTED');assert.equal(rejected.errorCode,'SALE_PHASE_CHANGED_NO_EFFECTS');
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);assert.equal(b.main.getSheetByName('COMANDAS').getLastRow(),6);
  const same=b.ctx.dispatchNativeAction({...requests[0]});assert.equal(same.code,'SALE_PHASE_CHANGED_NO_EFFECTS');
  t.ctx.STATE.phase='Lunar';t.ctx.STATE.cart[0].qty=2;t.ctx.STATE.cart[0].price=50;
  await t.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(requests.length,2);assert.notEqual(requests[1].requestId,old.id);
  assert.equal(requests[1].args[0].phase,'Lunar');assert.equal(requests[1].args[0].items[0].qty,2);
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(b.main.getSheetByName('COBROS').raw(7,6),100);
  assert.equal(t.ctx.getOutbox().length,1);assert.equal(t.ctx.getOutbox()[0].status,'REJECTED');
  assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
});
await test('unproven old REQUIRES_REVIEW cannot be replaced with a fresh charge',async()=>{
  const t=setup();clientSale(t);const old=t.item('OLD');old.status='REQUIRES_REVIEW';old.lastError='Cambió la carta';
  await t.seed([old]);t.localStorage.setItem('domus_pending_sale',JSON.stringify(old.args[0]));
  await t.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(t.calls.length,0);assert.equal(t.ctx.getOutbox()[0].requestId,'OLD');assert(t.localStorage.getItem('domus_pending_sale'));
});
await test('OLD retry with a NEW cart never rebinds ownership or erases the NEW draft on background ACK',async()=>{
  const t=setup();clientSale(t);t.ctx.transport_=async()=>{throw Error('Failed to fetch');};
  await t.ctx.confirmPaymentAndDispatch(true);await tick();const old=t.ctx.getOutbox()[0],snapshot=t.ctx.STATE.pendingSaleDraft;
  t.ctx.STATE.cart=[{sku:'NEW',qty:1,price:60}];t.cells.customerNameInput.value='NEW client';t.ctx.STATE.selectedAccountTicket='NEW account';
  const current=t.ctx.saleDraftSnapshot_();await t.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(t.ctx.STATE.pendingSaleDraft,snapshot);assert.equal(t.ctx.getOutbox().length,1);
  t.ctx.transport_=async p=>{assert.equal(p.requestId,old.requestId);assert.deepEqual(copy(p.args),copy(old.args));return {ok:true,data:{receipt:'OLD-ACK',paid:true}};};
  await t.ctx.sincronizarOutboxCore_();assert.equal(t.ctx.saleDraftSnapshot_(),current);
  assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
});
await test('foreground delayed ACK independently preserves a changed cart, client, account or activity',async()=>{
  for (const field of ['cart','client','account','activity']) {
    const t=setup();clientSale(t);let finish;t.ctx.transport_=()=>new Promise(resolve=>finish=resolve);
    await t.ctx.confirmPaymentAndDispatch(true);await tick();
    if(field==='cart')t.ctx.STATE.cart=[{sku:'NEW',qty:2,price:35}];
    if(field==='client')t.cells.customerNameInput.value='NEW client';
    if(field==='account')t.ctx.STATE.selectedAccountTicket='NEW account';
    if(field==='activity')t.cells.activitySelect.value='NEW activity';
    const draft=t.ctx.saleDraftSnapshot_();finish({ok:true,data:{receipt:'OLD',total:40,paid:true,items:[]}});await tick();
    assert.equal(t.ctx.saleDraftSnapshot_(),draft,field);assert.equal(t.ctx.getOutbox().length,0);
  }
});
await test('foreground ACK clears an unchanged original draft',async()=>{
  const t=setup();clientSale(t);await t.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(t.ctx.STATE.cart.length,0);assert.equal(t.cells.customerNameInput.value,'');assert.equal(t.ctx.getOutbox().length,0);
});
await test('two VM tabs cannot lose concurrent enqueue, confirmation or failed-update entries',async()=>{
  const shared=storage(),locks=locksFactory(),a=setup({storage:shared,locks}),b=setup({storage:shared,locks}),sends=[];
  const replies=new Map();for(const t of [a,b])t.ctx.transport_=p=>{sends.push(copy(p));return new Promise(resolve=>replies.set(p.requestId,resolve));};
  let release;const barrier=locks.request('domus-outbox-store',()=>new Promise(resolve=>release=resolve));await tick();
  const one=a.call('cajaSimpleRegistrar',a.item('A').args),two=b.call('cajaSimpleRegistrar',b.item('B').args);
  await tick();assert.equal(sends.length,0);release();await barrier;await tick();
  assert.deepEqual(a.ctx.getOutbox().map(q=>q.requestId).sort(),['A','B']);
  replies.get('A')({ok:true,data:{receipt:'ACK-A'}});
  const three=a.call('cajaSimpleRegistrar',a.item('C').args);await tick();
  replies.get('B')({ok:false,status:503,code:'SERVER_ERROR',error:'Unavailable'});await Promise.all([one,two]);
  assert.deepEqual(a.ctx.getOutbox().map(q=>q.requestId).sort(),['B','C']);
  assert.equal(a.ctx.getOutbox().find(q=>q.requestId==='B').status,'RETRY');
  replies.get('C')({ok:true,data:{receipt:'ACK-C'}});await three;
  assert.deepEqual(a.ctx.getOutbox().map(q=>q.requestId),['B']);
  assert(shared.getItem('domus_confirmation_A'));assert(shared.getItem('domus_confirmation_C'));
});
await test('two simultaneous sends of the SAME ID acquire one claim and cannot race status backwards',async()=>{
  const shared=storage(),locks=locksFactory(),a=setup({storage:shared,locks}),b=setup({storage:shared,locks});let sends=0,finish;
  for(const t of [a,b])t.ctx.transport_=()=>{sends++;return new Promise(resolve=>finish=resolve);};
  const one=a.call('cajaSimpleRegistrar',a.item('same').args),two=b.call('cajaSimpleRegistrar',b.item('same').args).then(()=>null,err=>err);
  await tick();assert.equal(sends,1);assert((await two).message.includes('pendiente'));
  finish({ok:true,data:{receipt:'one'}});await one;assert.equal(a.ctx.getOutbox().length,0);
});
await test('foreground enqueue survives background claim and ACK of another request',async()=>{
  const shared=storage(),locks=locksFactory(),a=setup({storage:shared,locks}),b=setup({storage:shared,locks});let finish;
  await a.seed([a.item('background')]);a.ctx.transport_=()=>new Promise(resolve=>finish=resolve);
  const background=a.ctx.sincronizarOutboxCore_();await tick();
  b.ctx.transport_=async()=>{throw Error('Failed to fetch');};await b.call('cajaSimpleRegistrar',b.item('new').args);
  finish({ok:true,data:{receipt:'background'}});
  // Stop after the first confirmation so the dispatcher does not consume the new retry in this case.
  a.ctx.transport_=async()=>{throw Error('Failed to fetch');};await background;
  assert.deepEqual(a.ctx.getOutbox().map(q=>q.requestId),['new']);assert.equal(a.ctx.getOutbox()[0].status,'RETRY');
});
await test('missing Web Locks fails closed before persistence or transport; unlocked snapshot writes are forbidden',async()=>{
  const t=setup();t.ctx.window.navigator={};const before=t.localStorage.getItem('domus_outbox');
  await assert.rejects(t.call('cajaSimpleRegistrar',t.item().args),/OUTBOX_LOCK_REQUIRED/);
  assert.equal(t.calls.length,0);assert.equal(t.localStorage.getItem('domus_outbox'),before);
  assert.throws(()=>t.ctx.saveOutbox([]),/OUTBOX_LOCK_REQUIRED/);
});
await test('symbolic SERVER_ERROR with numeric 5xx preserves retry and resumes a real partial journal under original ID',async()=>{
  const t=setup(),b=backend.setup();clientSale(t);const requests=connect(t,b);b.main.getSheetByName('COBROS').failAt='7:6';
  await t.ctx.confirmPaymentAndDispatch(true);await tick();const old=t.ctx.getOutbox()[0];
  assert.equal(old.errorCode,'SERVER_ERROR');assert.equal(old.errorStatus,500);assert.equal(old.status,'RETRY');
  assert(b.main.getSheetByName('DOMUS_JOURNAL'));assert(t.localStorage.getItem('domus_pending_sale'));
  await t.ctx.sincronizarOutboxCore_();assert.equal(requests.length,2);assert.equal(requests[1].requestId,old.requestId);
  assert.deepEqual(requests[1].args,requests[0].args);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
  assert.equal(t.ctx.getOutbox().length,0);assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
});
await test('known deterministic errors retain review even with a generic 500 status',()=>{
  const t=setup();assert.equal(t.ctx.classifyMutationFailure({code:'IDEMPOTENCY_KEY_REUSED',status:500,error:'conflict'}),'REQUIRES_REVIEW');
  assert.equal(t.ctx.classifyMutationFailure({code:'SERVER_ERROR',status:500,error:'PRODUCT_NOT_FOUND'}),'REQUIRES_REVIEW');
  assert.equal(t.ctx.classifyMutationFailure({code:'SERVER_ERROR',status:503,error:'Temporary failure'}),'RETRY');
});
await test('fully authorized new courtesy creates one order, zero payment, no debt; settled account still rejects',()=>{
  const b=backend.setup();b.manager();const token=b.login('GERENCIA');
  const sale=b.sale({expectedTotal:0,received:0,items:[{name:'QA drink',sku:'QA-01',qty:1,courtesy:true}]});
  const result=b.request('cajaSimpleRegistrar',[sale],sale.id,'GERENCIA',token);
  assert.equal(result.paymentStatus,'CORTESIA_AUTORIZADA');assert.equal(result.total,0);assert.equal(result.receipt,'');
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);assert.equal(b.main.getSheetByName('COMANDAS').getLastRow(),7);
  assert.equal(b.request('cajaSimpleDatos',[]).accounts.length,0);assert.equal(JSON.parse(b.main.getSheetByName('COMANDAS').raw(7,13)).credit,false);
  assert.equal(b.request('cajaSimpleRegistrar',[sale],sale.id,'GERENCIA',token).ticket,result.ticket);
  assert.equal(b.main.getSheetByName('COMANDAS').getLastRow(),7);
  const settle=b.sale({ticket:result.ticket,items:[],expectedTotal:0,received:0});assert.throws(()=>b.request('cajaSimpleRegistrar',[settle],settle.id,'GERENCIA',token),/sin saldo/);
});
await test('cashier cannot grant a total courtesy; the receipt labels it as no charge, not debt or payment',()=>{
  const b=backend.setup(),sale=b.sale({expectedTotal:0,received:0,items:[{name:'QA drink',sku:'QA-01',qty:1,courtesy:true}]});
  assert.throws(()=>b.request('cajaSimpleRegistrar',[sale],sale.id),/cortesía/i);
  assert.equal(b.main.getSheetByName('COMANDAS').getLastRow(),6);
  const t=setup();t.load('showReceiptModal');t.ctx.showReceiptModal({ticket:'courtesy',items:[],total:0,paid:false,paymentStatus:'CORTESIA_AUTORIZADA'});
  assert(t.cells.receiptFolio.textContent.includes('SIN COBRO'));assert(t.cells.receiptPaymentDetails.textContent.includes('SIN COBRO'));
});
await test('dispatcher excludes rejected, review and confirmed evidence when retrying a pending item',async()=>{
  const t=setup(),rows=['REJECTED','REQUIRES_REVIEW','CONFIRMED','RETRY'].map((status,i)=>({...t.item('id-'+i),status}));
  await t.seed(rows);await t.ctx.sincronizarOutboxCore_();
  assert.deepEqual(t.calls.map(p=>p.requestId),['id-3']);assert.equal(t.ctx.getOutbox().length,3);
});
await test('crash before enqueue recovers the saved intention with its original ID',async()=>{
  const t=setup(),old=t.item('crash').args[0];delete old.requestId;
  t.localStorage.setItem('domus_pending_sale',JSON.stringify(old));
  await t.ctx.migrateLegacyOutbox_();assert.equal(t.ctx.getOutbox()[0].requestId,'crash');
  await t.ctx.sincronizarOutboxCore_();assert.equal(t.calls[0].requestId,'crash');assert.equal(t.calls[0].args[0].id,'crash');
  assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
});
await test('two sale UIs cannot overwrite the shared pending pointer; the second draft remains untouched',async()=>{
  const shared=storage(),locks=locksFactory(),a=setup({storage:shared,locks}),b=setup({storage:shared,locks});
  for(const t of [a,b]){clientSale(t);t.ctx.transport_=async()=>{throw Error('Failed to fetch');};}
  b.ctx.STATE.cart[0].qty=2;const bDraft=b.ctx.saleDraftSnapshot_();
  await Promise.all([a.ctx.confirmPaymentAndDispatch(true),b.ctx.confirmPaymentAndDispatch(true)]);await tick();
  assert.equal(a.ctx.getOutbox().length,1);assert.equal(JSON.parse(shared.getItem('domus_pending_sale')).id,a.ctx.getOutbox()[0].requestId);
  assert.equal(b.ctx.saleDraftSnapshot_(),bDraft);assert.equal(b.ctx.STATE.pendingSaleId,undefined);
});
console.log(JSON.stringify({suite:'independent-review-regressions',passed,network:false,liveSheets:false,hardware:false}));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
