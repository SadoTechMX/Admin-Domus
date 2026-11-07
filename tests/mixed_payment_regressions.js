'use strict';
// Actual POS/journal/KDS and client transport, fixture Sheets only. No card charge.
const assert=require('assert/strict');
const backend=require('./recovery_regressions'),client=require('./reconciliation_regressions');
const {copy,tick}=client;
let passed=0;
const mixed=(t,patch={})=>t.sale({method:'Mixto',payments:[{method:'Efectivo',amount:15},{method:'Terminal 1',amount:25}],received:20,tip:2,terminalConfirmed:true,terminalReference:'QA-APPROVED-1',...patch});
const business=t=>JSON.stringify([...t.main.sheets].filter(([n])=>n!=='REQUESTS').map(([n,s])=>[n,[...s.cells]]));
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function attach(t,native,respond){
 t.load('transport_');t.ctx.STATE.isNativeGas=native;
 t.ctx.fetch=async(_,opts)=>({json:()=>respond(JSON.parse(opts.body))});
 t.ctx.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>Promise.resolve().then(()=>respond(copy(p))).then(success,failure)})})}}};t.ctx.window.google=t.ctx.google;
}
const health={ok:true,data:{environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'}};
function draft(t){
 Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],selectedAccountTicket:'',cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});
 t.ctx.activePaymentMethod='Mixto';
 for(const [id,value] of Object.entries({mixedTerminalAmount:'25',mixedTerminalSelect:'Terminal 1',mixedTerminalReference:'QA-APPROVED-1',cashReceivedInput:'20',cashTipInput:'2'}))t.ctx.$(id).value=value;
 t.ctx.$('mixedTerminalConfirmed').checked=true;
}
(async()=>{
for(const method of ['Terminal 1','Terminal 2'])await test(method+': one sale/receipt/request, two distinct ledger rows and exact cash change',()=>{
 const t=backend.setup(),p=mixed(t,{payments:[{method:'Efectivo',amount:15},{method,amount:25}]}),cob=t.main.getSheetByName('COBROS');
 for(const row of [7,8])cob.rules.set(row+':5',{getAllowInvalid:()=>false,getCriteriaType:()=> 'VALUE_IN_LIST',getCriteriaValues:()=>[['Efectivo','Terminal 1','Terminal 2','Transferencia']]});
 const r=t.request('cajaSimpleRegistrar',[p],p.id);assert.equal(r.total,40);assert.equal(r.change,3);assert.equal(r.tip,2);assert.equal(r.paid,true);
 assert.equal(cob.getLastRow(),8);assert.equal(cob.raw(7,1),r.receipt+'-E');assert.equal(cob.raw(8,1),r.receipt+'-T');
 assert.equal(cob.raw(7,5),'Efectivo');assert.equal(cob.raw(8,5),method);assert.equal(cob.raw(7,6),15);assert.equal(cob.raw(8,6),25);
 assert.equal(cob.value(7,14)+cob.value(8,14),40);assert.equal(cob.raw(7,29),2);assert.equal(cob.raw(8,29),0);assert.equal(cob.raw(7,30),20);assert.equal(cob.raw(7,31),3);assert.equal(cob.raw(8,30),'');
 for(const row of [7,8])assert.equal(cob.raw(row,9),'CAJA-RAPIDA:'+p.id);
 assert.equal(t.request('cajaSimpleDatos',[]).accounts.length,0);assert.equal(t.main.getSheetByName('COMANDAS').getLastRow(),7);
 const before=business(t);assert.deepEqual(t.request('cajaSimpleRegistrar',[p],p.id),r);assert.equal(business(t),before);
 assert.equal(t.ctx.dataRows_(t.main.getSheetByName('REQUESTS'),2,8).length,1);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[{...p,terminalReference:'DIFFERENT'}],p.id),/IDEMPOTENCY_KEY_REUSED/);
});
await test('invalid splits, approval, cents, methods and sums reject before financial or order effects',()=>{
 const patches=[{payments:[]},{payments:null},{payments:[null,{}]},{payments:[{method:'Efectivo',amount:15},{method:'Transferencia',amount:25}]},
 {payments:[{method:'Efectivo',amount:0},{method:'Terminal 1',amount:40}]},{payments:[{method:'Efectivo',amount:14},{method:'Terminal 1',amount:25}]},
 {payments:[{method:'Efectivo',amount:15},{method:'Terminal 1',amount:26}]},{payments:[{method:'Efectivo',amount:15.001},{method:'Terminal 1',amount:24.999}]},
 {payments:[{method:'Efectivo',amount:'15'},{method:'Terminal 1',amount:25}]},{received:16},{received:null},{tip:-1},{tip:0.001},{expectedTotal:41},{expectedTotal:NaN},
 {terminalConfirmed:false},{terminalReference:''},{terminalReference:'QA\nBAD'},{method:'Efectivo'},{paid:false,credit:'Amigo'}];
 for(const patch of patches){const t=backend.setup(),p=mixed(t,patch),before=business(t);assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),e=>e.code==='SALE_VALIDATION_REJECTED_NO_EFFECTS');assert.equal(business(t),before,JSON.stringify(patch));}
});
await test('fractional cents represented as valid decimals settle exactly; existing account adds no consumption',()=>{
 const t=backend.setup(),open=t.sale({paid:false,method:'',credit:'Amigo'}),account=t.request('cajaSimpleRegistrar',[open],open.id);
 const p=mixed(t,{ticket:account.ticket,items:[],payments:[{method:'Efectivo',amount:15.15},{method:'Terminal 2',amount:24.85}],tip:0.25,received:20}),r=t.request('cajaSimpleRegistrar',[p],p.id);
 assert.equal(r.change,4.6);assert.equal(t.main.getSheetByName('COMANDAS').getLastRow(),7);assert.equal(t.main.getSheetByName('CAJA 2').getLastRow(),7);assert.equal(t.request('cajaSimpleDatos',[]).accounts.length,0);
});
for(const failAt of ['7:6','8:6','8:14'])await test('partial ledger at '+failAt+' denies delivery and resumes original receipt/parts once',()=>{
 const t=backend.setup(),p=mixed(t),cob=t.main.getSheetByName('COBROS');cob.failAt=failAt;
 assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),/INJECTED_WRITE_FAILURE/);
 const plan=JSON.parse(t.ctx.journalFind_(p.id,t.main).data[4]);
 const item={...plan.fulfillment.units[0],ticket:plan.ticket,batch:p.id};assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item).allowed,false);
 const r=t.request('cajaSimpleRegistrar',[p],p.id);assert.equal(r.receipt,plan.receipt);assert.deepEqual(r.payments,plan.payments);assert.equal(cob.getLastRow(),8);
 assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item).allowed,true);assert.deepEqual(t.request('cajaSimpleRegistrar',[p],p.id),r);
});
await test('REQUESTS completion failure keeps mixed delivery blocked despite both applied rows',()=>{
 const t=backend.setup(),p=mixed(t);t.ctx.findRequestRecord_('initialize',t.main);
 // Create ledger through actual read helper used by request storage.
 t.ctx.getOrCreateRequestsSheet_(t.main);
 const ledger=t.main.getSheetByName('REQUESTS'),put=ledger.put.bind(ledger);let fail=true;
 ledger.put=(row,col,value)=>{if(fail && col===5 && value==='COMPLETED'){fail=false;throw Error('INJECTED_LEDGER_FAILURE');}put(row,col,value);};
 assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),/INJECTED_LEDGER_FAILURE/);
 const item=JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13));assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item).allowed,false);
 assert.equal(t.main.getSheetByName('COBROS').value(7,14)+t.main.getSheetByName('COBROS').value(8,14),40);
 t.request('cajaSimpleRegistrar',[p],p.id);assert.equal(t.ctx.kdsDeliveryDecision_(t.main,item).allowed,true);
});
await test('missing, duplicate, mismatched or unapplied component cannot authorize delivery',()=>{
 for(const mutate of [s=>s.getRange(8,1).setValue('OTHER'),s=>s.getRange(8,6).setValue(24),s=>s.getRange(8,11).setValue('Borrador'),s=>s.getRange(8,4).setValue('OTHER'),s=>s.getRange(8,9).setValue('OTHER'),s=>s.getRange(8,5).setValue('Terminal 2'),s=>s.getRange(8,14).setValue(0),s=>s.getRange(9,1,1,31).setValues(s.getRange(8,1,1,31).getValues())]) {
  const t=backend.setup(),p=mixed(t);t.request('cajaSimpleRegistrar',[p],p.id);mutate(t.main.getSheetByName('COBROS'));
  assert.equal(t.ctx.kdsDeliveryDecision_(t.main,JSON.parse(t.main.getSheetByName('COMANDAS').raw(7,13))).allowed,false);
 }
});
await test('two-tender journal prevalidates terminal row before applying cash or creating order',()=>{
 const t=backend.setup(),p=mixed(t),cob=t.main.getSheetByName('COBROS');cob.rules.set('8:5',{getAllowInvalid:()=>false,getCriteriaType:()=> 'VALUE_IN_LIST',getCriteriaValues:()=>[['Efectivo']]});
 t.ctx.journalSheet_(t.main);const before=business(t);assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),/SCHEMA_VALIDATION/);assert.equal(business(t),before);
});
await test('mixed order marks delivery once and preserves stock formulas; fixture does not calculate inventory',()=>{
 const t=backend.setup(),p=mixed(t),inv=t.main.getSheetByName('INVENTARIO');
 inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');const value=inv.value.bind(inv);inv.value=(r,c)=>r===7 && c===8?10:value(r,c);
 const before=JSON.stringify([...inv.cells]);t.request('cajaSimpleRegistrar',[p],p.id);assert.equal(JSON.stringify([...inv.cells]),before);
 const board=t.main.getSheetByName('COMANDAS'),item=JSON.parse(board.raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=t.login('BARRA');
 assert.throws(()=>t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'early','BARRA',token),/INVALID_KDS_TRANSITION/);
 for(const action of ['TOMAR','LISTA'])t.request('comandasSimpleAccion',[{key,action}],action,'BARRA',token);
 assert.equal(JSON.stringify([...inv.cells]),before);
 assert.equal(t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'deliver','BARRA',token).state,'Entregada');
 assert.equal(board.raw(7,8),'Entregada');
 const after=business(t);t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'deliver','BARRA',token);assert.equal(business(t),after);
 assert.equal(inv.raw(7,7),'=SUMIF(example)');assert.equal(t.main.getSheetByName('COBROS').getLastRow(),8);
});
await test('client rejects incomplete, other-intent or altered mixed ACK, accepts exact evidence only',()=>{
 const b=backend.setup(),p=mixed(b),r=copy(b.request('cajaSimpleRegistrar',[p],p.id)),t=client.setup();assert.equal(t.ctx.validSaleResult_(r,p),true);
 for(const patch of [{payments:[]},{payments:[r.payments[0]]},{payments:[r.payments[0],null]},{sourceRequestId:'other'},{terminalConfirmed:false},{terminalReference:'other'},{received:21},{tip:3},{change:4},{total:39.99},
 {payments:[r.payments[0],{...r.payments[1],receipt:'OTHER'}]},{payments:[{...r.payments[0],amount:15.001},{...r.payments[1],amount:24.999}]}])assert.equal(t.ctx.validSaleResult_({...r,...patch},p),false,JSON.stringify(patch));
});
for(const native of [true,false])for(const failure of ['partial','incomplete-ack'])await test((native?'native':'REST')+' '+failure+': reload retains ID/body/cart and recovers two rows, one receipt',async()=>{
 const t=client.setup(),b=backend.setup(),seen=[];draft(t);t.ctx.setSessionToken(b.login(),'CAJA');let first=true;
 if(failure==='partial')b.main.getSheetByName('COBROS').failAt='8:6';
 const respond=async p=>{
  if(p.action==='health')return health;seen.push(copy(p));const result=b.ctx.dispatchNativeAction(copy(p));
  if(first && failure==='incomplete-ack'){first=false;result.data.payments=[];}return result;
 };
 attach(t,native,respond);const snapshot=t.ctx.saleDraftSnapshot_();await t.ctx.confirmPaymentAndDispatch(true);await tick();await tick();
 const item=t.ctx.getOutbox()[0];assert(item);assert.equal(item.status,'RETRY');assert.equal(t.ctx.saleDraftSnapshot_(),snapshot);assert.equal(t.localStorage.getItem('domus_confirmation_'+item.requestId),null);
 assert.equal(JSON.parse(t.localStorage.getItem('domus_pending_sale')).id,item.requestId);
 const reload=client.setup({storage:t.localStorage});reload.ctx.setSessionToken(b.login(),'CAJA');attach(reload,native,respond);
 await reload.ctx.migrateLegacyOutbox_();await reload.ctx.sincronizarOutboxCore_();assert.equal(reload.ctx.getOutbox().length,0);
 assert.equal(seen.length,2);assert.equal(seen[0].requestId,seen[1].requestId);assert.deepEqual(seen[0].args,seen[1].args);
 assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(JSON.parse(reload.localStorage.getItem('domus_confirmation_'+item.requestId)).data.payments.length,2);
});
await test('mixed document contains one customer receipt, applied portions, cash-only change and escaped reference',()=>{
 const b=backend.setup(),p=mixed(b,{terminalReference:'QA <terminal>'}),r=b.request('cajaSimpleRegistrar',[p],p.id),t=client.setup();t.load('escapeHtml');t.load('receiptDocument_');
 const html=t.ctx.receiptDocument_(r);for(const value of ['Efectivo: $15','Terminal 1: $25','Cambio: $3','Propina: $2','QA &lt;terminal&gt;',r.receipt])assert(html.includes(value),value);
 assert(!html.includes(r.receipt+'-E'));assert(!html.includes(r.receipt+'-T'));
});
console.log(JSON.stringify({suite:'mixed-payment-real-source-mocks',passed,liveSheets:false,terminalCharged:false,hardware:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
