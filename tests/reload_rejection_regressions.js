'use strict';
// Real client/backend source, new client VM after reload, persistent mocked Sheets/storage.
// No external network, live data or hardware.
const assert=require('assert/strict');
const {setup,tick,copy}=require('./reconciliation_regressions');
const backend=require('./recovery_regressions');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
function clientSale(t){Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});}
function connect(t,b){
  t.ctx.setSessionToken(b.login(),'CAJA');const requests=[];
  t.ctx.transport_=async p=>{requests.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};return requests;
}
function businessSnapshot(b){
  return JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].filter(([name])=>!['REQUESTS','DOMUS_JOURNAL'].includes(name)).map(([name,s])=>[name,[...s.cells]])));
}
function assertNoEffects(b,id,before){
  assert.equal(businessSnapshot(b),before,'all business cells must remain unchanged');
  assert.equal(b.ctx.journalFind_(id,b.main),null,'no prepared plan for rejected request');
  const record=b.ctx.findRequestRecord_(id,b.main);
  assert.equal(record.response.code,'SALE_VALIDATION_REJECTED_NO_EFFECTS');assert.equal(record.response.status,422);
}
async function main(){
await test('partial SERVER_ERROR/500 survives reload and resumes PREPARED under original ID/body once',async()=>{
  const t=setup(),b=backend.setup();clientSale(t);const requests=connect(t,b);
  b.main.getSheetByName('COBROS').failAt='7:6';
  await t.ctx.confirmPaymentAndDispatch(true);await tick();const old=copy(t.ctx.getOutbox()[0]);
  assert.equal(old.errorCode,'SERVER_ERROR');assert.equal(old.errorStatus,500);assert.equal(old.status,'RETRY');
  const journal=b.ctx.journalFind_(old.requestId,b.main);assert.equal(journal.data[2],'PREPARED');
  const receipt=JSON.parse(journal.data[4]).receipt;
  // Changed current business conditions must not turn a prepared plan into a rejection.
  b.main.getSheetByName('CAJA 2').getRange('F2').setValue('Lunar');
  b.main.getSheetByName('CATALOGO').getRange(7,17).setValue(80);
  const reload=setup({storage:t.localStorage});clientSale(reload);reload.ctx.STATE.cart[0].qty=2;
  const draft=reload.ctx.saleDraftSnapshot_(),resends=connect(reload,b);
  await reload.ctx.migrateLegacyOutbox_();assert.equal(reload.ctx.getOutbox()[0].status,'RETRY');
  assert.equal(reload.ctx.getOutbox()[0].errorStatus,500);
  await reload.ctx.confirmPaymentAndDispatch(true);await tick();assert.equal(resends.length,0,'no replacement for partial effects');
  await reload.ctx.sincronizarOutboxCore_();
  assert.equal(resends.length,1);assert.equal(resends[0].requestId,old.requestId);assert.deepEqual(resends[0].args,requests[0].args);
  assert.equal(b.ctx.journalFind_(old.requestId,b.main).data[2],'COMPLETED');
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(b.main.getSheetByName('COBROS').raw(7,6),40);
  assert.equal(JSON.parse(reload.localStorage.getItem('domus_confirmation_'+old.requestId)).data.receipt,receipt);
  assert.equal(reload.ctx.getOutbox().length,0);assert.equal(reload.localStorage.getItem('domus_pending_sale'),null);
  assert.equal(reload.ctx.saleDraftSnapshot_(),draft,'recovery cannot claim a new post-reload draft');
  await reload.ctx.sincronizarOutboxCore_();assert.equal(resends.length,1);
});
await test('reload classifies saved code/status as well as text and keeps legacy uncertainty in review',async()=>{
  const t=setup();const cases=[
    ['http500','INJECTED_WRITE_FAILURE','SERVER_ERROR',500,'RETRY'],
    ['http503','','SERVER_ERROR',503,'RETRY'],
    ['numeric409','conflict','SERVER_ERROR',409,'REQUIRES_REVIEW'],
    ['symbolic409','conflict','IDEMPOTENCY_KEY_REUSED',500,'REQUIRES_REVIEW'],
    ['deterministic','PRODUCT_NOT_FOUND','SERVER_ERROR',500,'REQUIRES_REVIEW'],
    ['legacy','Saldo cambió','','','REQUIRES_REVIEW'],
    ['network','Failed to fetch','','','RETRY']
  ];
  await t.seed(cases.map(([id,lastError,errorCode,errorStatus])=>({...t.item(id),lastError,errorCode,errorStatus})));
  const reload=setup({storage:t.localStorage});await reload.ctx.migrateLegacyOutbox_();
  for(const [id,,,status,expected] of cases){const item=reload.ctx.getOutbox().find(q=>q.requestId===id);assert.equal(item.status,expected,id);assert.equal(item.errorStatus,status);}
});
for(const changed of ['catalog price','account balance'])await test(changed+' rejection survives reload, proves zero effects, and allows corrected new ID',async()=>{
  const b=backend.setup(),t=setup();clientSale(t);const requests=connect(t,b);let ticket='';
  if(changed==='catalog price')b.main.getSheetByName('CATALOGO').getRange(7,17).setValue(60);
  else {
    const initial=b.sale({paid:false,credit:'Amigo'});ticket=b.request('cajaSimpleRegistrar',[initial],initial.id).ticket;
    const added=b.sale({ticket,paid:false,credit:'Amigo'});b.request('cajaSimpleRegistrar',[added],added.id);
    Object.assign(t.ctx.STATE,{cart:[],selectedAccountTicket:ticket,openAccounts:[{ticket,due:40}]});
  }
  const before=businessSnapshot(b);
  await t.ctx.confirmPaymentAndDispatch(true);await tick();const rejected=copy(t.ctx.getOutbox()[0]);
  assert.equal(rejected.status,'REJECTED');assert.equal(rejected.errorCode,'SALE_VALIDATION_REJECTED_NO_EFFECTS');
  assertNoEffects(b,rejected.requestId,before);
  const replay=b.ctx.dispatchNativeAction(copy(requests[0]));assert.equal(replay.code,rejected.errorCode);assert.equal(replay.status,422);assertNoEffects(b,rejected.requestId,before);
  const altered=copy(requests[0]);altered.args[0].expectedTotal=1;
  assert.equal(b.ctx.dispatchNativeAction(altered).code,'IDEMPOTENCY_KEY_REUSED');assertNoEffects(b,rejected.requestId,before);
  const reload=setup({storage:t.localStorage});clientSale(reload);const resends=connect(reload,b);
  await reload.ctx.migrateLegacyOutbox_();assert.equal(reload.ctx.getOutbox()[0].status,'REJECTED');
  if(ticket)Object.assign(reload.ctx.STATE,{cart:[],selectedAccountTicket:ticket,openAccounts:[{ticket,due:80}]});
  else reload.ctx.STATE.cart[0].price=60;
  await reload.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(resends.length,1);assert.notEqual(resends[0].requestId,rejected.requestId);
  assert.equal(b.main.getSheetByName('COBROS').raw(7,6),ticket?80:60);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
  assert.equal(reload.localStorage.getItem('domus_pending_sale'),null);
  assert.deepEqual(copy(reload.ctx.getOutbox()[0]),rejected,'original rejection evidence retained');
});
await test('explicit pre-effect POS validations are structured and replayable with business sheets unchanged',()=>{
  const variants=[{ticket:'missing'}, {items:[]}, {items:[{sku:'missing',qty:1}]}, {items:[{sku:'QA-01',qty:0}]},
    {items:[{sku:'QA-01',qty:1,courtesy:true}]}, {paid:false,credit:''}, {method:'invalid'}, {received:1}, {tip:-1}, {expectedTotal:39}];
  for(const fields of variants){
    const b=backend.setup(),sale=b.sale(fields),before=businessSnapshot(b);
    const payload={action:'cajaSimpleRegistrar',args:[sale],requestId:sale.id,role:'CAJA',deviceId:'fixture-device',sessionToken:b.login()};
    const response=b.ctx.dispatchNativeAction(payload);assert.equal(response.code,'SALE_VALIDATION_REJECTED_NO_EFFECTS',JSON.stringify(fields));assertNoEffects(b,sale.id,before);
    assert.equal(b.ctx.dispatchNativeAction(payload).code,response.code);assertNoEffects(b,sale.id,before);
  }
});
await test('lost rejection response stays uncertain until same-ID recovery obtains durable no-effects evidence',async()=>{
  const b=backend.setup(),t=setup();clientSale(t);const requests=connect(t,b),send=t.ctx.transport_;
  b.main.getSheetByName('CATALOGO').getRange(7,17).setValue(60);const before=businessSnapshot(b);
  t.ctx.transport_=async p=>{await send(p);throw Error('Failed to fetch');};
  await t.ctx.confirmPaymentAndDispatch(true);await tick();const old=copy(t.ctx.getOutbox()[0]);
  assert.equal(old.status,'RETRY');assertNoEffects(b,old.requestId,before);
  const reload=setup({storage:t.localStorage});clientSale(reload);reload.ctx.STATE.cart[0].price=60;
  const resends=connect(reload,b);await reload.ctx.migrateLegacyOutbox_();
  await reload.ctx.confirmPaymentAndDispatch(true);await tick();assert.equal(resends.length,0);
  await reload.ctx.sincronizarOutboxCore_();assert.equal(reload.ctx.getOutbox()[0].status,'REJECTED');
  assert.equal(resends[0].requestId,old.requestId);assert.deepEqual(resends[0].args,requests[0].args);assertNoEffects(b,old.requestId,before);
  await reload.ctx.confirmPaymentAndDispatch(true);await tick();
  assert.equal(resends.length,2);assert.notEqual(resends[1].requestId,old.requestId);assert.equal(b.main.getSheetByName('COBROS').raw(7,6),60);
});
await test('uncertain errors, unrecognized codes and malformed no-effects proofs cannot authorize replacement',async()=>{
  for(const error of [
    {status:'REQUIRES_REVIEW',lastError:'Saldo cambió',errorCode:'SERVER_ERROR',errorStatus:500},
    {status:'REJECTED',lastError:'Saldo cambió',errorCode:'UNKNOWN_NO_EFFECTS',errorStatus:422},
    {status:'REJECTED',lastError:'Saldo cambió',errorCode:'SALE_VALIDATION_REJECTED_NO_EFFECTS',errorStatus:500},
    {status:'REJECTED',lastError:'Cambió la carta',errorCode:'SALE_PHASE_CHANGED_NO_EFFECTS',errorStatus:500},
    {action:'anotherAction',status:'REJECTED',lastError:'Saldo cambió',errorCode:'SALE_VALIDATION_REJECTED_NO_EFFECTS',errorStatus:422}
  ]){
    const t=setup();clientSale(t);const old={...t.item('unknown'),...error};await t.seed([old]);
    t.localStorage.setItem('domus_pending_sale',JSON.stringify(old.args[0]));
    const reload=setup({storage:t.localStorage});clientSale(reload);await reload.ctx.migrateLegacyOutbox_();
    await reload.ctx.confirmPaymentAndDispatch(true);await tick();assert.equal(reload.calls.length,0,JSON.stringify(error));
    assert.equal(JSON.parse(reload.localStorage.getItem('domus_pending_sale')).id,'unknown');
  }
});
await test('infrastructure failure outside explicit validations never acquires no-effects permission',()=>{
  const b=backend.setup(),sale=b.sale();b.main.getSheetByName('CAJA 2').getRange(6,1).setValue('schema broken');
  // Force a genuinely required header failure, without invoking the POS validation helper.
  b.main.getSheetByName('CAJA 2').getRange(6,7).setValue('missing product header');
  const payload={action:'cajaSimpleRegistrar',args:[sale],requestId:sale.id,role:'CAJA',deviceId:'fixture-device',sessionToken:b.login()};
  const response=b.ctx.dispatchNativeAction(payload);
  assert.equal(response.code,'SERVER_ERROR');assert.equal(response.status,500);
  assert(!b.ctx.findRequestRecord_(sale.id,b.main).response.code.includes('NO_EFFECTS'));
  assert.equal(b.ctx.journalFind_(sale.id,b.main),null);
  assert.equal(b.ctx.dispatchNativeAction(payload).code,'IDEMPOTENCY_REQUIRES_REVIEW','absence of a journal alone is not permission to replace');
});
console.log(JSON.stringify({suite:'reload-rejection-regressions',passed,failed,network:false,liveSheets:false,hardware:false}));
if(failed)process.exitCode=1;
}
main().catch(err=>{console.error(err);process.exitCode=1;});
