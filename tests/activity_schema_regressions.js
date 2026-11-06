'use strict';
// Actual source, in-memory Sheets. Unknown 35-column layout below is a NEGATIVE
// synthetic fixture, not the missing full production-header export.
const assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const client=require('./reconciliation_regressions');
const fixture=require('./fixtures/schema_headers.json').ACTIVIDADES;
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
const event=()=>({name:'New QA event',date:'2026-11-05',type:'Fiesta',organizer:'QA',priceGeneral:100,pricePareja:180,priceTrio:250,priceGuardarropa:0,capacity:150,notes:'QA'});
const admission=()=>({customer:'QA',activity:'QA event',ticketTypeId:'General',wardrobeQty:1,paymentMethod:'Efectivo',salesChannel:'TAQUILLA_DOMUS'});
function login(t){return t.login('ACCESOS');}
function call(t,action,body,id='activity-test'){return t.request(action,[body],id,'ACCESOS',login(t));}
function business(t){return JSON.stringify([...t.main.sheets].filter(([n])=>!['REQUESTS'].includes(n)).map(([n,s])=>[n,[...s.cells]]));}
function rearrange(t,headers){
 const s=t.main.getSheetByName('ACTIVIDADES'),old=s.getRange(7,1,1,fixture.length).getValues()[0];s.cells.clear();
 s.getRange(6,1,1,headers.length).setValues([headers]);
 s.getRange(7,1,1,headers.length).setValues([headers.map(h=>fixture.includes(h)?old[fixture.indexOf(h)]:'KEEP')]);return s;
}
(async()=>{
await test('named legacy fields follow reordered columns for reads, selection and admission',()=>{
 const t=setup();rearrange(t,[...fixture].reverse());
 const rows=t.request('accesoSimpleDatos',[],undefined,'ACCESOS',login(t)).activities;
 assert.equal(rows[0].priceGeneral,100);assert.equal(rows[0].capacity,150);assert.equal(rows[0].status,'Confirmado');
 assert.equal(call(t,'accesoCambiarActividad',{activity:'QA event'},'select').activeActivity,'QA event');
 assert.equal(call(t,'accesoSimpleRegistrar',admission(),'admit').doorCollected,120);
});
await test('named event writes preserve unrelated columns and replay without another event',()=>{
 const t=setup(),headers=['Protected formula',...fixture].reverse(),s=rearrange(t,headers),before=s.getRange(7,1,1,headers.length).getValues()[0];
 const body=event();assert(call(t,'registrarNuevoEvento',body).ok);
 const row=s.getRange(8,1,1,headers.length).getValues()[0];
 assert.equal(row[headers.indexOf('Actividad')],body.name);assert.equal(row[headers.indexOf('Guardarropa')],0);assert.equal(row[headers.indexOf('Estado')],'Confirmado');
 assert.equal(row[headers.indexOf('Protected formula')],'');assert.deepEqual(s.getRange(7,1,1,headers.length).getValues()[0],before);
 assert(call(t,'registrarNuevoEvento',body).ok);assert.equal(s.getLastRow(),8);
});
await test('unknown/mixed 35-column layout fails closed before event, access or settings effects',()=>{
 for(const mixed of [false,true])for(const action of ['registrarNuevoEvento','accesoSimpleRegistrar','accesoCambiarActividad']){
  const t=setup(),headers=[...fixture,...Array.from({length:22},(_,i)=>'Unmapped '+i)];
  headers[20]='ESTADO DEL EVENTO';headers[mixed?21:11]='Acuerdo validado';headers[mixed?22:8]='% DOMUS entradas';rearrange(t,headers);
  const before=business(t),body=action==='registrarNuevoEvento'?event():action==='accesoSimpleRegistrar'?admission():{activity:'QA event'};
  assert.throws(()=>call(t,action,body),e=>e.code==='ACTIVITY_SCHEMA_REQUIRES_REVIEW'&&e.status===409);
  assert.equal(business(t),before);assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);assert.equal(t.main.getSheetByName('DOMUS_SETTINGS'),null);
 }
});
await test('missing or duplicate headers never fall back to positional access fields',()=>{
 for(const headers of [fixture.map(h=>h==='Estado'?'Acuerdo validado':h),[...fixture,' Estado ']]){
  const t=setup();rearrange(t,headers);const before=business(t);
  assert.throws(()=>t.request('accesoSimpleDatos',[],undefined,'ACCESOS',login(t)),/ACTIVITY_SCHEMA_REQUIRES_REVIEW/);
  assert.throws(()=>call(t,'registrarNuevoEvento',event()),/ACTIVITY_SCHEMA_REQUIRES_REVIEW/);assert.equal(business(t),before);
 }
});
await test('missing capacity/status are not fabricated and unconfirmed events cannot receive admissions',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES');s.getRange(7,9).setValue('');s.getRange(7,12).setValue('');
 const data=t.request('accesoSimpleDatos',[],undefined,'ACCESOS',login(t));assert.equal(data.activities[0].capacity,null);assert.equal(data.activities[0].status,'');
 const before=business(t);assert.throws(()=>call(t,'accesoSimpleRegistrar',admission()),/EVENT_PRICING_NOT_CONFIRMED/);assert.equal(business(t),before);
});
await test('duplicate event names cannot select arbitrary pricing/status',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES');s.getRange(8,1,1,13).setValues(s.getRange(7,1,1,13).getValues());const before=business(t);
 assert.throws(()=>call(t,'accesoCambiarActividad',{activity:'QA event'}),/EVENT_PRICING_NOT_CONFIRMED/);assert.equal(business(t),before);
});
await test('prepared event recovers same ID with unchanged headers and no duplicate event',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES'),body=event();s.failAt='8:5';
 assert.throws(()=>call(t,'registrarNuevoEvento',body),/INJECTED_WRITE_FAILURE/);assert.equal(t.ctx.journalFind_('activity-test',t.main).data[2],'PREPARED');
 assert(call(t,'registrarNuevoEvento',body).ok);assert.equal(s.getLastRow(),8);assert.equal(s.raw(8,1),body.name);
});
await test('header movement after partial write blocks replay before ANY further business cell',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES'),body=event();s.failAt='8:5';
 assert.throws(()=>call(t,'registrarNuevoEvento',body),/INJECTED_WRITE_FAILURE/);
 s.getRange(6,5,1,2).setValues([['Pareja','General']]);const before=business(t);
 assert.throws(()=>call(t,'registrarNuevoEvento',body),/ACTIVITY_SCHEMA_REQUIRES_REVIEW/);assert.equal(business(t),before);
 assert.equal(t.ctx.journalFind_('activity-test',t.main).data[2],'PREPARED');
});
await test('old positional journal without header bindings cannot resume into ACTIVIDADES',()=>{
 const t=setup(),s=t.main.getSheetByName('ACTIVIDADES'),body=event();s.failAt='8:5';
 assert.throws(()=>call(t,'registrarNuevoEvento',body),/INJECTED_WRITE_FAILURE/);
 const journal=t.main.getSheetByName('DOMUS_JOURNAL');
 for(let row=2;row<=journal.getLastRow();row++)if(journal.raw(row,2)==='JOURNAL_PART'){
  const plan=JSON.parse(journal.raw(row,4));for(const w of plan)delete w.activityHeaders;journal.getRange(row,4).setValue(JSON.stringify(plan));
 }
 const before=business(t);assert.throws(()=>call(t,'registrarNuevoEvento',body),/ACTIVITY_SCHEMA_REQUIRES_REVIEW/);assert.equal(business(t),before);
});
await test('completed request still returns original result after a schema change without writing',()=>{
 const t=setup(),body=event();call(t,'registrarNuevoEvento',body);t.main.getSheetByName('ACTIVIDADES').getRange(6,12).setValue('Acuerdo validado');const before=business(t);
 assert(call(t,'registrarNuevoEvento',body).ok);assert.equal(business(t),before);
});
await test('event UI does not invent success or change selection on rejected/pending acknowledgements',()=>{
 for(const outcome of ['rejected','pending','empty','confirmed']){
  const t=client.setup();t.load('saveNewEvent');t.ctx.STATE.eventsList=[{name:'current'}];t.ctx.STATE.activeActivity='current';
  for(const [key,value]of Object.entries({Name:'New QA event',Date:'2026-11-05',PriceGeneral:'100',PricePareja:'180',PriceTrio:'250',PriceWardrobe:'0',Capacity:'150'}))t.ctx.$('eventForm'+key).value=value;
  let request,closed=0,synced=0;t.ctx.callBackend=(...args)=>request=args;t.ctx.closeNewEventModal=()=>closed++;t.ctx.syncBackendData=()=>synced++;t.ctx.renderAccesosView=()=>{};
  t.ctx.saveNewEvent();assert.equal(request[1][0].priceGuardarropa,0);assert.equal(t.notices.length,0);assert.equal(t.ctx.STATE.activeActivity,'current');assert.equal(t.ctx.STATE.eventsList.length,1);
  if(outcome==='rejected')request[3](new Error('ACTIVITY_SCHEMA_REQUIRES_REVIEW'));
  else request[2](outcome==='pending'?{localOutbox:true}:outcome==='empty'?{}:{ok:true});
  assert.equal(t.ctx.STATE.activeActivity,'current');assert.equal(t.ctx.STATE.eventsList.length,1);assert.equal(t.localStorage.getItem('domus_active_event'),null);
  assert.equal(closed,outcome==='confirmed'?1:0);assert.equal(synced,outcome==='confirmed'?1:0);
  assert.equal(t.notices.filter(n=>n[1]==='ok').length,outcome==='confirmed'?1:0);
 }
});
await test('event UI preserves explicit zero wardrobe price and unknown capacity without inventing defaults',()=>{
 const t=client.setup();t.load('renderEventsTable');t.ctx.STATE.eventsList=[{name:'QA',priceGuardarropa:0,capacity:null}];
 t.ctx.renderEventsTable();const html=t.ctx.$('eventsTableBody').innerHTML;
 assert(html.includes('Sin aforo confirmado'));assert(html.includes('color: var(--gold-primary);">$0.00'));
 t.load('saveNewEvent');let sent=0;t.ctx.callBackend=()=>sent++;
 t.ctx.$('eventFormName').value='QA';t.ctx.$('eventFormDate').value='2026-11-05';t.ctx.$('eventFormPriceWardrobe').value='';
 t.ctx.saveNewEvent();assert.equal(sent,0);assert(t.notices.at(-1)[0].includes('tarifa de guardarropa'));
});
console.log(JSON.stringify({suite:'activity-schema-guards',passed,failed,production35HeadersComplete:false,liveSheets:false}));if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
