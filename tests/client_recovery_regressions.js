'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const source=fs.readFileSync(require('path').join(__dirname,'../js/app.js'),'utf8');
function fn(name){const a=source.indexOf('  function '+name+'(');assert(a>=0,name);let b=source.indexOf('\n  function ',a+10);return source.slice(a,b<0?source.length:b);}
let passed=0;
async function test(n,f){await f();passed++;console.log('PASS',n);}
function setup(){
 const cells={},storage=new Map();let prints=0;
 const ctx=vm.createContext({console,crypto,Date,Math,JSON,Number,String,Array,Set,Map,Error,Promise,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  STATE:{cart:[{name:'QA',price:40,qty:1,sku:'QA-01'}],openAccounts:[],selectedAccountTicket:'',phase:'Solar',operator:'QA'},
  $:id=>cells[id]||(cells[id]={value:({customerNameInput:'QA',cashReceivedInput:'100',cashTipInput:'0',activitySelect:'QA event'})[id]||'',disabled:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},focus(){}}),
  activePaymentMethod:'Efectivo',paymentInFlight:false,MUTATION_ACTIONS:new Set(['cajaSimpleRegistrar']),
  calculateCartTotal:()=>40,toast(){},closePaymentModal(){},playChime(){},showReceiptModal(){},printReceiptDirect:()=>{prints++;return Promise.resolve({});},
  clearCart(){},syncBackendData(){},getDeviceId:()=> 'device',getStationRole:()=> 'CAJA',getSessionToken:()=> 'session-placeholder',
  ensureSessionToken:()=>Promise.resolve(),updateSyncPill(){},updateOutboxUI(){},notifyOutboxTabs(){},cacheQuerySnapshot(){},
  callBackend(){},money:n=>'$'+n,escapeHtml:s=>String(s).replace(/</g,'&lt;')
 });
 return {ctx,cells,storage,prints:()=>prints,load:n=>vm.runInContext(fn(n),ctx),run:s=>vm.runInContext(s,ctx)};
}
async function main(){
await test('empty cart cannot create a new sale, but existing account settlement is allowed',()=>{
 const t=setup();let calls=0;t.ctx.callBackend=()=>calls++;t.ctx.STATE.cart=[];t.load('confirmPaymentAndDispatch');
 t.run('confirmPaymentAndDispatch(true)');assert.equal(calls,0);
 t.ctx.STATE.selectedAccountTicket='old-account';t.run('confirmPaymentAndDispatch(true)');assert.equal(calls,1);
});
await test('double click before backend response produces exactly one request',()=>{
 const t=setup();let calls=0;t.ctx.callBackend=()=>calls++;t.load('confirmPaymentAndDispatch');
 t.run('confirmPaymentAndDispatch(true);confirmPaymentAndDispatch(true)');assert.equal(calls,1);
 assert(t.storage.get('domus_pending_sale'));
});
await test('queued operation is not a confirmed receipt or automatic print',()=>{
 const t=setup();let receipts=0;t.ctx.showReceiptModal=()=>receipts++;t.ctx.callBackend=(_,__,success)=>success({localOutbox:true,paid:false});
 t.load('confirmPaymentAndDispatch');t.run('confirmPaymentAndDispatch(true)');assert.equal(receipts,0);assert.equal(t.prints(),0);assert(t.storage.has('domus_pending_sale'));
});
await test('retry after refresh retains original payload and request ID',()=>{
 const t=setup();let payloads=[];t.ctx.callBackend=(_,args,ok)=>{payloads.push(JSON.parse(JSON.stringify(args[0])));ok({localOutbox:true});};
 t.load('confirmPaymentAndDispatch');t.run('confirmPaymentAndDispatch(true)');t.ctx.STATE.cart=[];t.cells.cashReceivedInput.value='999';t.run('confirmPaymentAndDispatch(true)');
 assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);
});
await test('confirmed transfer receipt is visibly pending, never verified from method alone',()=>{
 const t=setup();t.load('showReceiptModal');t.ctx.receipt={receipt:'r',ticket:'t',customer:'QA',items:[],total:40,paid:false,method:'Transferencia',verified:false};t.run('showReceiptModal(receipt)');
 assert(t.cells.receiptPaymentDetails.textContent.includes('PENDIENTE DE VERIFICACIÓN'));assert(!t.cells.receiptPaymentDetails.innerHTML.includes('COBRADO Y VERIFICADO'));
});
await test('mutation is persisted before transport and removed only after confirmation',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','classifyMutationFailure','callBackend'])t.load(n);
 let persisted=false,success=false;t.ctx.transport_=async()=>{persisted=t.run('getOutbox().length===1');return {ok:true,data:{receipt:'r'}};};
 t.ctx.success=()=>success=true;t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],success)");
 await new Promise(r=>setImmediate(r));assert(persisted&&success);assert.equal(t.run('getOutbox().length'),0);
});
await test('post-confirmation presentation error cannot queue or send another charge',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','classifyMutationFailure','callBackend'])t.load(n);
 let sends=0;t.ctx.transport_=async()=>{sends++;return {ok:true,data:{receipt:'r'}};};t.ctx.broken=()=>{throw new Error('broken UI');};
 t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],broken)");await new Promise(r=>setImmediate(r));assert.equal(sends,1);assert.equal(t.run('getOutbox().length'),0);
});
await test('storage quota failure prevents any network mutation',async()=>{
 const t=setup();for(const n of ['getOutbox','saveOutbox','enqueueOutbox','callBackend'])t.load(n);
 let sends=0,errors=0;t.ctx.transport_=async()=>{sends++;};t.ctx.localStorage.setItem=()=>{throw new Error('quota');};t.ctx.failed=()=>errors++;
 t.run("callBackend('cajaSimpleRegistrar',[{id:'r1',items:[{name:'QA',qty:1}]}],null,failed)");await new Promise(r=>setImmediate(r));assert.equal(sends,0);assert.equal(errors,1);
});
await test('corrupt Outbox is not silently replaced with an empty queue',()=>{
 const t=setup();t.storage.set('domus_outbox','not-json');t.load('getOutbox');assert.throws(()=>t.run('getOutbox()'),/Outbox no legible/);
});
console.log(JSON.stringify({suite:'isolated-client-code',passed,browser:false,hardware:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
