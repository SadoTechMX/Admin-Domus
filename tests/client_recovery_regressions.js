'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const source=fs.readFileSync(require('path').join(__dirname,'../js/app.js'),'utf8');
function fn(name){const a=source.search(new RegExp('  (?:async )?function '+name+'\\('));assert(a>=0,name);let b=source.indexOf('\n  function ',a+10);return source.slice(a,b<0?source.length:b);}
let passed=0;
async function test(n,f){await f();passed++;console.log('PASS',n);}
function setup(){
 const t=require('./reconciliation_regressions').setup();let prints=0;
 t.ctx.STATE.cart=[{name:'QA',price:40,qty:1,sku:'QA-01'}];t.ctx.STATE.openAccounts=[];
 t.ctx.STATE.selectedAccountTicket='';t.ctx.STATE.phase='Solar';t.ctx.STATE.operator='QA';
 t.ctx.printReceiptDirect=()=>{prints++;return Promise.resolve({});};
 t.ctx.ensureSessionToken=()=>Promise.resolve();t.ctx.getSessionToken=()=> 'session-placeholder';
 return {...t,storage:t.localStorage.data,prints:()=>prints};
}
async function main(){
await test('empty cart cannot create a new sale, but existing account settlement is allowed',async()=>{
 const t=setup();let calls=0;t.ctx.callBackend=()=>calls++;t.ctx.STATE.cart=[];t.load('confirmPaymentAndDispatch');
 await t.run('confirmPaymentAndDispatch(true)');assert.equal(calls,0);
 t.ctx.STATE.selectedAccountTicket='old-account';await t.run('confirmPaymentAndDispatch(true)');assert.equal(calls,1);
});
await test('double click before backend response produces exactly one request',async()=>{
 const t=setup();let calls=0;t.ctx.callBackend=()=>calls++;t.load('confirmPaymentAndDispatch');
 await Promise.all([t.run('confirmPaymentAndDispatch(true)'),t.run('confirmPaymentAndDispatch(true)')]);assert.equal(calls,1);
 assert(t.storage.get('domus_pending_sale'));
});
await test('queued operation is not a confirmed receipt or automatic print',async()=>{
 const t=setup();let receipts=0;t.ctx.showReceiptModal=()=>receipts++;t.ctx.callBackend=(_,__,success)=>success({localOutbox:true,paid:false});
 t.load('confirmPaymentAndDispatch');await t.run('confirmPaymentAndDispatch(true)');assert.equal(receipts,0);assert.equal(t.prints(),0);assert(t.storage.has('domus_pending_sale'));
});
await test('a second Cobrar never silently replays an unresolved original sale',async()=>{
 const t=setup();let payloads=[];t.ctx.callBackend=(_,args,ok)=>{payloads.push(JSON.parse(JSON.stringify(args[0])));ok({localOutbox:true});};
 await t.run('confirmPaymentAndDispatch(true)');const saved=t.storage.get('domus_pending_sale');
 t.ctx.STATE.cart=[{sku:'NEW',price:50,qty:2}];t.cells.cashReceivedInput.value='999';await t.run('confirmPaymentAndDispatch(true)');
 assert.equal(payloads.length,1);assert.equal(t.storage.get('domus_pending_sale'),saved);assert.equal(t.ctx.STATE.cart[0].sku,'NEW');
});
await test('confirmed transfer receipt is visibly pending, never verified from method alone',()=>{
 const t=setup();t.load('showReceiptModal');t.ctx.receipt={receipt:'r',ticket:'t',customer:'QA',items:[],total:40,paid:false,method:'Transferencia',verified:false};t.run('showReceiptModal(receipt)');
 assert(t.cells.receiptPaymentDetails.textContent.includes('PENDIENTE DE VERIFICACIÓN'));assert(!t.cells.receiptPaymentDetails.innerHTML.includes('COBRADO Y VERIFICADO'));
});
await test('mutation is persisted before transport and removed only after confirmation',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','isSessionExpiredError','classifyMutationFailure','retainConfirmation_','settleConfirmedBasket_','authenticatedTransport_','callBackend'])t.load(n);
 let persisted=false,success=false;t.ctx.transport_=async()=>{persisted=t.run('getOutbox().length===1');return {ok:true,data:{receipt:'r'}};};
 t.ctx.success=()=>success=true;t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],success)");
 await new Promise(r=>setImmediate(r));assert(persisted&&success);assert.equal(t.run('getOutbox().length'),0);
});
await test('post-confirmation presentation error cannot queue or send another charge',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','isSessionExpiredError','classifyMutationFailure','retainConfirmation_','settleConfirmedBasket_','authenticatedTransport_','callBackend'])t.load(n);
 let sends=0;t.ctx.transport_=async()=>{sends++;return {ok:true,data:{receipt:'r'}};};t.ctx.broken=()=>{throw new Error('broken UI');};
 t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],broken)");await new Promise(r=>setImmediate(r));assert.equal(sends,1);assert.equal(t.run('getOutbox().length'),0);
});
await test('storage quota failure prevents any network mutation',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','retainConfirmation_','settleConfirmedBasket_','authenticatedTransport_','callBackend'])t.load(n);
 let sends=0,errors=0;t.ctx.transport_=async()=>{sends++;};t.ctx.localStorage.setItem=()=>{throw new Error('quota');};t.ctx.failed=()=>errors++;
 t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],null,failed)");await new Promise(r=>setImmediate(r));assert.equal(sends,0);assert.equal(errors,1);
});
await test('corrupt Outbox is not silently replaced with an empty queue',()=>{
 const t=setup();t.storage.set('domus_outbox','not-json');t.load('getOutbox');assert.throws(()=>t.run('getOutbox()'),/Outbox no legible/);
});
await test('valid JSON with an invalid queue shape is preserved and blocks operation',()=>{
 for (const raw of ['null','{}','[null]','[7]','[[]]']) {
  const t=setup();t.storage.set('domus_outbox',raw);t.load('getOutbox');
  assert.throws(()=>t.run('getOutbox()'),/Outbox no legible/);assert.equal(t.storage.get('domus_outbox'),raw);
 }
});
await test('interrupted foreground and background sends recover the original intent after timeout',()=>{
 for (const status of ['SENDING','SYNCING']) {
  const t=setup(),item={requestId:'same-request',status,lastAttempt:new Date(Date.now()-100000).toISOString(),args:[{id:'same-request',items:[{sku:'QA',qty:1}]}]};
  t.storage.set('domus_outbox',JSON.stringify([item]));t.load('getOutbox');
  const recovered=JSON.parse(t.run('JSON.stringify(getOutbox()[0])'));
  assert.equal(recovered.status,'RETRY');assert.equal(recovered.requestId,item.requestId);assert.deepEqual(recovered.args,item.args);
 }
});
await test('recent sends stay in flight and malformed timestamps recover without changing the payload',()=>{
 for (const status of ['SENDING','SYNCING']) {
  const t=setup();t.load('getOutbox');
  t.storage.set('domus_outbox',JSON.stringify([{requestId:'r',status,lastAttempt:new Date().toISOString(),args:[{id:'r'}]}]));
  assert.equal(t.run('getOutbox()[0].status'),status);
  for(const lastAttempt of [undefined,'invalid-date']) {
   t.storage.set('domus_outbox',JSON.stringify([{requestId:'r',status,lastAttempt,args:[{id:'r'}]}]));
   assert.equal(t.run('getOutbox()[0].status'),'RETRY');assert.equal(t.run('getOutbox()[0].args[0].id'),'r');
  }
 }
});
console.log(JSON.stringify({suite:'isolated-client-code',passed,browser:false,hardware:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
