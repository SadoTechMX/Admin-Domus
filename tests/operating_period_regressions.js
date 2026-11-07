'use strict';
// Actual POS/Schema/client functions with isolated workbook services; no Sheets calls.
const assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const client=require('./reconciliation_regressions');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
const dates=(b,start,end)=>b.main.getSheetByName('SEMANA').getRange('B7:B8').setValues([[new Date(start)],[new Date(end)]]);
const snapshot=b=>JSON.stringify([...b.main.sheets].filter(([n])=>!['REQUESTS','DOMUS_JOURNAL'].includes(n)).map(([n,s])=>[n,[...s.cells]]));
(async()=>{
 await test('reported October period rejects November date with explicit cause, read only',()=>{
  const b=setup();dates(b,'2026-10-19T06:00:00Z','2026-10-25T06:00:00Z');const before=snapshot(b);
  const p=b.ctx.cashOperatingPeriod_(b.main,new Date('2026-11-06T18:00:00Z'));
  assert.equal(p.allowed,false);assert.equal(p.code,'OPERATING_PERIOD_OUT_OF_RANGE');assert(p.message.includes('2026-11-06'));assert(p.message.includes('2026-10-19'));assert.equal(snapshot(b),before);
 });
 await test('inclusive local calendar days, midnight boundaries and workbook timezone',()=>{
  const b=setup();dates(b,'2026-11-02T06:00:00Z','2026-11-08T06:00:00Z');
  for(const [at,allowed] of [['2026-11-02T05:59:59Z',false],['2026-11-02T06:00:00Z',true],['2026-11-09T05:59:59Z',true],['2026-11-09T06:00:00Z',false]])assert.equal(b.ctx.cashOperatingPeriod_(b.main,new Date(at)).allowed,allowed,at);
  b.main.timeZone='UTC';dates(b,'2026-11-02T00:00:00Z','2026-11-08T00:00:00Z');assert.equal(b.ctx.cashOperatingPeriod_(b.main,new Date('2026-11-09T00:00:00Z')).allowed,false);
 });
 await test('missing, textual, invalid and reversed dates fail closed without changing configuration',()=>{
  for(const pair of [['',''],['2026-11-02','2026-11-08'],[new Date(NaN),new Date()],[new Date('2030-02-02'),new Date('2030-01-01')]]){
   const b=setup();b.main.getSheetByName('SEMANA').getRange('B7:B8').setValues(pair.map(v=>[v]));const before=snapshot(b);
   assert.equal(b.ctx.cashOperatingPeriod_(b.main,new Date()).allowed,false);assert.equal(snapshot(b),before);
  }
  const b=setup();b.main.sheets.delete('SEMANA');assert.equal(b.ctx.cashOperatingPeriod_(b.main,new Date()).allowed,false);
 });
 await test('every new payment method and authorized credit/courtesy reject before commercial journal or effects',()=>{
  const cases=[...['Efectivo','Terminal 1','Terminal 2','Transferencia'].map(method=>({method})),{paid:false,credit:'Amigo'},{courtesy:true}];
  for(const options of cases){
   const b=setup();dates(b,'2020-01-01T06:00:00Z','2020-01-07T06:00:00Z');const sale=b.sale(options);let role='CAJA',token;
   if(options.courtesy){b.manager();role='GERENCIA';token=b.login(role);sale.items[0].courtesy=true;sale.expectedTotal=0;}
   const before=snapshot(b);assert.throws(()=>b.request('cajaSimpleRegistrar',[sale],sale.id,role,token),/fuera del periodo/);
   assert.equal(snapshot(b),before);assert.equal(b.ctx.journalFind_(sale.id,b.main),null);
   const record=b.ctx.findRequestRecord_(sale.id,b.main);assert.equal(record.status,'REQUIRES_REVIEW');assert.equal(record.response.code,'SALE_VALIDATION_REJECTED_NO_EFFECTS');assert.equal(record.response.status,422);
  }
 });
 await test('there is no fixed application expiry; any explicitly configured valid future period is evaluated normally',()=>{
  const b=setup();dates(b,'2035-02-01T06:00:00Z','2035-02-07T06:00:00Z');assert.equal(b.ctx.cashOperatingPeriod_(b.main,new Date('2035-02-03T18:00:00Z')).allowed,true);
 });
 await test('completed intent returns its original receipt after period changes without another sale',()=>{
  const b=setup(),sale=b.sale(),result=b.request('cajaSimpleRegistrar',[sale],sale.id);dates(b,'2020-01-01T06:00:00Z','2020-01-07T06:00:00Z');const before=snapshot(b);
  assert.equal(b.request('cajaSimpleRegistrar',[sale],sale.id).receipt,result.receipt);assert.equal(snapshot(b),before);
 });
 await test('partially written original journal still recovers after period changes without backdating or replacement ID',()=>{
  const b=setup(),sale=b.sale();b.main.getSheetByName('COBROS').failAt='7:6';assert.throws(()=>b.request('cajaSimpleRegistrar',[sale],sale.id),/INJECTED_WRITE_FAILURE/);
  const originalDate=b.main.getSheetByName('CAJA 2').raw(7,3),record=b.ctx.journalFind_(sale.id,b.main),receipt=JSON.parse(record.data[4]).receipt;
  dates(b,'2020-01-01T06:00:00Z','2020-01-07T06:00:00Z');const result=b.request('cajaSimpleRegistrar',[sale],sale.id);
  assert.equal(result.receipt,receipt);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(b.main.getSheetByName('CAJA 2').raw(7,3).getTime(),originalDate.getTime());
 });
 await test('caller cannot supply an old sale date or a permissive period to bypass the server',()=>{
  const b=setup();dates(b,'2020-01-01T06:00:00Z','2020-01-07T06:00:00Z');const sale=b.sale({date:'2020-01-02',operatingPeriod:{allowed:true}});
  assert.throws(()=>b.request('cajaSimpleRegistrar',[sale],sale.id),/fuera del periodo/);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
 });
 await test('catalog reports period cause read only; successful new sale writes actual current Date',()=>{
  const b=setup(),before=snapshot(b),data=b.request('cajaSimpleDatos',[]);assert.equal(data.operatingPeriod.allowed,true);assert.equal(snapshot(b),before);
  const started=Date.now(),sale=b.sale({date:'2020-01-02'});b.request('cajaSimpleRegistrar',[sale],sale.id);const at=b.main.getSheetByName('CAJA 2').raw(7,3);assert(at instanceof Date);assert(at.getTime()>=started && at.getTime()<=Date.now());
 });
 await test('client blocks unverified/out-of-range period before intent creation and preserves its cart',async()=>{
  for(const period of [null,{allowed:false,message:'No cobrar: fecha fuera del periodo.'}]){
   const t=client.setup();t.ctx.STATE.operatingPeriod=period;t.ctx.STATE.cart=[{name:'QA',qty:1,price:40}];
   const before=JSON.stringify(t.ctx.STATE.cart);await t.ctx.confirmPaymentAndDispatch(true);await client.tick();
   assert.equal(t.calls.length,0);assert.equal(t.localStorage.getItem('domus_pending_sale'),null);assert.equal(JSON.stringify(t.ctx.STATE.cart),before);assert(t.notices.length);
  }
 });
 await test('server-side period change preserves a no-effects rejection and permits a corrected new intent after refresh',async()=>{
  const b=setup(),t=client.setup();dates(b,'2020-01-01T06:00:00Z','2020-01-07T06:00:00Z');
  Object.assign(t.ctx.STATE,{phase:'Solar',openAccounts:[],cart:[{name:'QA drink',sku:'QA-01',qty:1,price:40,destination:'Barra'}]});t.ctx.setSessionToken(b.login(),'CAJA');
  t.ctx.transport_=async p=>b.ctx.dispatchNativeAction(client.copy(p));
  await t.ctx.confirmPaymentAndDispatch(true);await client.tick();const rejected=t.ctx.getOutbox()[0];assert.equal(rejected.status,'REJECTED');assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
  b.main.getSheetByName('SEMANA').getRange('B7:B8').setValues([[new Date(Date.now()-86400000)],[new Date(Date.now()+86400000)]]);
  assert.throws(()=>b.request('cajaSimpleRegistrar',rejected.args,rejected.requestId),/fuera del periodo/);
  t.ctx.STATE.operatingPeriod=b.request('cajaSimpleDatos',[]).operatingPeriod;
  await t.ctx.confirmPaymentAndDispatch(true);await client.tick();assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(t.ctx.getOutbox()[0].requestId,rejected.requestId);assert.equal(t.ctx.getOutbox()[0].status,'REJECTED');assert.equal(t.ctx.STATE.cart.length,0);
 });
 console.log(JSON.stringify({suite:'operating-period-real-source',passed,liveSheets:false,productionWrites:0}));
})().catch(err=>{console.error(err);process.exitCode=1;});
