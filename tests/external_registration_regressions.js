'use strict';
// Actual Access/client code with isolated services. No vendor, Google or real data.
const assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const client=require('./reconciliation_regressions');
const headers35=require('./fixtures/activities_headers_35.json');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
const body=(extra={})=>({customer:'QA',activity:'QA event',ticketTypeId:'General',wardrobeQty:0,
 salesChannel:'BOLETERA_EXTERNA',ticketProvider:'QA custom provider',externalTicketId:'QA-order-1',
 externalReportedAmount:375,externalPaymentRecipient:'QA project',externalPaymentMethod:'Transferencia',paymentMethod:'Efectivo',...extra});
function call(t,p,id='external-1'){return t.request('accesoSimpleRegistrar',[p],id,'ACCESOS',t.login('ACCESOS'));}
function business(t){return JSON.stringify([...t.main.sheets].filter(([n])=>n!=='REQUESTS').map(([n,s])=>[n,[...s.cells]]));}
function clientAccess(){
 const t=client.setup();t.ctx.isRegisteringAccess=false;
 Object.assign(t.ctx.STATE,{activityPolicyPending:false,accessSalesChannel:'BOLETERA_EXTERNA',accessSelectedType:'General',accessWardrobeQty:0,accessPaymentMethod:'Efectivo',activeActivity:'QA event',recentAccessList:[]});
 for(const [id,value] of Object.entries({accessCustomerName:'QA',accessTicketProvider:'QA custom provider',accessExternalTicketId:'QA-order-1',accessExternalAmount:'375',accessExternalRecipient:'QA project',accessExternalMethod:'Transferencia'}))t.ctx.$(id).value=value;
 t.ctx.$('btnConfirmAccess').dataset={};
 Object.assign(t.ctx,{updateAccessSummary(){},setAccessSalesChannel(){},setWardrobeQty(){},renderAccesosView(){},getActiveEvent:()=>({priceGuardarropa:20}),calculateAccessSubtotal:()=>({faceValue:100,persons:1,doorEntryCharge:0,wardrobeCost:0,doorTotal:0,commercialTotal:100})});
 t.load('confirmAccessAndRegister');return t;
}
test('external declaration round-trips in AD, never financial T/U/V or a new entry collection',()=>{
 const t=setup(),s=t.main.getSheetByName('ACCESO');
 s.getRange(7,20,1,3).setValues([[0.7,70,30]]);
 const result=call(t,body());
 assert.equal(result.faceValue,100);assert.equal(result.externalReportedAmount,375);assert.equal(result.doorCollected,0);
 assert.equal(result.externalVerification,'NO_VERIFICADA_AUTOMATICAMENTE');assert.equal(result.externalRecordedBy,'QA operator');
 assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
 assert.deepEqual(s.getRange(7,20,1,3).getValues()[0],[0.7,70,30]);
 for(const col of [20,21,22])assert.equal(s.cells.has(s.getLastRow()+':'+col),false);
 const read=t.request('accesoSimpleDatos',[],undefined,'ACCESOS',t.login('ACCESOS')).recentAccess[0];
 for(const k of ['ticketProvider','externalTicketId','externalReportedAmount','externalPaymentRecipient','externalPaymentMethod','externalVerification'])assert.equal(read[k],result[k],k);
 assert.equal(read.ticketProvider,'QA custom provider');
});
test('wardrobe is a distinct DOMUS collection; external transfer is only a declaration',()=>{
 for(const method of ['Efectivo','Terminal 1','Terminal 2','Transferencia']){
  const t=setup();
  if(method==='Transferencia'){
   const before=business(t);assert.throws(()=>call(t,body({wardrobeQty:2,paymentMethod:method})),e=>e.code==='ACCESS_TRANSFER_CONFIRMATION_REQUIRED');assert.equal(business(t),before);continue;
  }
  const result=call(t,body({wardrobeQty:2,paymentMethod:method}));
  const cob=t.main.getSheetByName('COBROS');assert.equal(cob.getLastRow(),7);assert.equal(cob.raw(7,6),40);
  assert.equal(cob.value(7,14),method==='Transferencia'?0:40);
  assert.equal(result.doorCollected,method==='Transferencia'?0:40);assert.equal(result.externalReportedAmount,375);
  assert.equal(result.paymentStatus,method==='Transferencia'?'PENDIENTE_VERIFICACION':'PAGADO_EXTERNAMENTE');
 }
});
test('missing/invalid external evidence fails before journal or business effects',()=>{
 for(const patch of [{ticketProvider:''},{externalTicketId:''},{externalTicketId:'=1+1'},{externalReportedAmount:null},{externalReportedAmount:''},{externalReportedAmount:-1},{externalReportedAmount:Infinity},{externalPaymentRecipient:''},{externalPaymentMethod:''}]){
  const t=setup(),before=business(t);assert.throws(()=>call(t,body(patch)));assert.equal(business(t),before);assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);
 }
});
test('same ID replays one registration; repeated reference/event under a new ID stays rejected',()=>{
 const t=setup(),p=body({wardrobeQty:1}),result=call(t,p),before=business(t);
 assert.equal(call(t,p).id,result.id);assert.equal(business(t),before);
 assert.throws(()=>call(t,body({wardrobeQty:1}),'external-2'),/Boleto ya utilizado/);assert.equal(business(t),before);
});
test('partial wardrobe write resumes the original external declaration without a second payment',()=>{
 const t=setup(),p=body({wardrobeQty:1}),cob=t.main.getSheetByName('COBROS');cob.failAt='7:6';
 assert.throws(()=>call(t,p),/INJECTED_WRITE_FAILURE/);
 const result=call(t,p);assert.equal(result.externalReportedAmount,375);assert.equal(result.ticketProvider,p.ticketProvider);
 assert.equal(t.main.getSheetByName('ACCESO').getLastRow(),7);assert.equal(cob.getLastRow(),7);assert.equal(cob.value(7,14),20);
 assert.equal(call(t,p).id,result.id);assert.equal(cob.getLastRow(),7);
});
test('financial numeric U and malformed legacy metadata never become a provider',()=>{
 const t=setup();call(t,body());const s=t.main.getSheetByName('ACCESO');s.getRange(7,21).setValue(70);s.getRange(7,30).setValue('null');
 const row=t.request('accesoSimpleDatos',[],undefined,'ACCESOS',t.login('ACCESOS')).recentAccess[0];
 assert.equal(row.ticketProvider,'');assert.equal(row.externalReportedAmount,null);
 assert.equal(row.externalVerification,'NO_VERIFICADA_AUTOMATICAMENTE');
});
test('canonical 35-column policy still blocks new external admissions before any business write',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES');s.cells.clear();s.getRange(6,1,1,35).setValues([headers35]);
 const row=Array(35).fill('');row[0]='QA event';row[20]='Confirmado';s.getRange(7,1,1,35).setValues([row]);
 const before=business(t);assert.throws(()=>call(t,body()),e=>e.code==='ACTIVITY_POLICY_REQUIRED');assert.equal(business(t),before);
});
test('client requires real references for external tickets and DOMUS presales without clearing the form',()=>{
 for(const channel of ['BOLETERA_EXTERNA','PREVENTA_DOMUS']){
  const t=clientAccess();t.ctx.STATE.accessSalesChannel=channel;t.ctx.$('accessExternalTicketId').value='';let sends=0;t.ctx.callBackend=()=>sends++;
  t.ctx.confirmAccessAndRegister();assert.equal(sends,0);assert.equal(t.ctx.$('accessCustomerName').value,'QA');assert.equal(t.ctx.isRegisteringAccess,false);
 }
});
test('client zero-at-door external record uses a valid backend method and preserves supplied declaration',()=>{
 const t=clientAccess(),b=setup();let sent;
 t.ctx.callBackend=(action,args)=>{assert.equal(action,'accesoSimpleRegistrar');sent=args[0];};
 t.ctx.confirmAccessAndRegister();assert.equal(sent.paymentMethod,'Efectivo');assert.equal(sent.externalReportedAmount,375);
 assert.equal(sent.externalTicketId,'QA-order-1');assert.equal(sent.externalPaymentRecipient,'QA project');
 const result=call(b,sent,sent.id);assert.equal(result.doorCollected,0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
});
console.log(JSON.stringify({suite:'external-registration-real-source-mocks',passed,network:false,production:false,providerVerification:false}));
