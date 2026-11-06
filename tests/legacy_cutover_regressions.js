'use strict';
// Actual candidate backend, in-memory historical records. Never live Sheets.
const assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name);}catch(err){failed++;console.error('FAIL',name,err);}}
function snapshot(t){return JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([name,s])=>[name,[...s.cells]])));}
function prepare(t){t.ctx.getOrCreateRequestsSheet_(t.main);}
function blocked(t,sale){
 const before=snapshot(t),props=[...t.props];
 assert.throws(()=>t.request('cajaSimpleRegistrar',[sale],sale.id),err=>err.code==='IDEMPOTENCY_REQUIRES_REVIEW'&&err.status===409);
 assert.equal(snapshot(t),before,'no financial, journal or ledger writes');assert.deepEqual([...t.props],props);
}
for(const key of ['idemp:','cajaSimple:'])test('missing REQUESTS plus legacy '+key+' evidence never creates a replacement',()=>{
 for(const value of ['{"status":"COMPLETED","response":{"receipt":"OLD"}}','{invalid']){
  const t=setup(),sale=t.sale();prepare(t);t.props.set(key+sale.id,value);blocked(t,sale);
 }
});
test('legacy cache evidence also blocks if Properties/REQUESTS persistence had failed',()=>{
 const t=setup(),sale=t.sale();prepare(t);t.ctx.CacheService.getScriptCache().put('idemp:'+sale.id,'{"status":"COMPLETED"}');blocked(t,sale);
});
test('historical payment beyond row 500 blocks even without legacy Properties',()=>{
 const t=setup(),sale=t.sale();prepare(t);
 t.main.getSheetByName('COBROS').getRange(4565,9).setValue('CAJA-RAPIDA:'+sale.id);blocked(t,sale);
});
test('legacy credit order evidence blocks without payment, Properties or REQUESTS',()=>{
 const t=setup(),sale=t.sale({paid:false,credit:'Amigo'});prepare(t);
 t.main.getSheetByName('COMANDAS').getRange(1500,13).setValue(JSON.stringify({batch:sale.id,state:'Pendiente'}));blocked(t,sale);
});
test('legacy timestamp POS IDs without durable proof cannot replay orphan cash rows or unsent old tabs',()=>{
 const t=setup(),sale=t.sale({id:'POS-1793314442100-p8jui2'});prepare(t);blocked(t,sale);
});
test('orphan journal without REQUESTS cannot be rebound to a new payload',()=>{
 const t=setup(),sale=t.sale();prepare(t);t.main.getSheetByName('COBROS').failAt='7:6';
 assert.throws(()=>t.request('cajaSimpleRegistrar',[sale],sale.id),/INJECTED_WRITE_FAILURE/);
 const ledger=t.main.getSheetByName('REQUESTS');
 // Simulated lost historical ledger row; never delete a real record during cutover.
 for(const key of [...ledger.cells.keys()])if(Number(key.split(':')[0])>1)ledger.cells.delete(key);
 assert.equal(t.ctx.journalFind_(sale.id,t.main).data[2],'PREPARED');
 blocked(t,{...sale,customer:'altered payload'});
});
test('durable completed legacy row returns its original receipt while retaining payload/device binding',()=>{
 const t=setup(),sale=t.sale({id:'POS-1793314442100-p8jui2'});sale.requestId=sale.id;prepare(t);
 const result={ticket:'legacy',receipt:'OLD-RECEIPT',paid:true,total:40};
 t.ctx.saveRequestRecord_({requestId:sale.id,action:'cajaSimpleRegistrar',payloadHash:t.ctx.computePayloadHash_({action:'cajaSimpleRegistrar',payload:sale}),deviceId:'fixture-device',status:'COMPLETED',createdAt:'2026-10-29',response:result},t.main);
 t.props.set('idemp:'+sale.id,'legacy evidence');const before=snapshot(t);
 assert.equal(t.request('cajaSimpleRegistrar',[sale],sale.id).receipt,'OLD-RECEIPT');assert.equal(snapshot(t),before);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[{...sale,customer:'different'}],sale.id),/IDEMPOTENCY_KEY_REUSED/);
 assert.throws(()=>t.ctx.idempotentExecute_(sale.id,'cajaSimpleRegistrar',sale,'different-device',()=>{}),/IDEMPOTENCY_KEY_REUSED/);
});
test('fresh candidate sale and known PREPARED recovery still work despite unrelated historical evidence',()=>{
 const t=setup(),sale=t.sale();prepare(t);t.props.set('idemp:another-id','old');
 t.main.getSheetByName('COBROS').getRange(4565,9).setValue('CAJA-RAPIDA:another-id');
 t.main.getSheetByName('COMANDAS').getRange(1500,13).setValue('{"batch":"another-id"}');
 t.main.getSheetByName('COBROS').failAt='4566:6';assert.throws(()=>t.request('cajaSimpleRegistrar',[sale],sale.id),/INJECTED_WRITE_FAILURE/);
 const receipt=JSON.parse(t.ctx.journalFind_(sale.id,t.main).data[4]).receipt;
 assert.equal(t.request('cajaSimpleRegistrar',[sale],sale.id).receipt,receipt);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),4566);
 assert.equal(t.ctx.journalFind_(sale.id,t.main).data[2],'COMPLETED');
});
console.log(JSON.stringify({suite:'legacy-cutover',passed,failed,liveSheets:false}));if(failed)process.exitCode=1;
