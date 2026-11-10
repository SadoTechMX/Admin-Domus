'use strict';
// Actual modules and generated bundles, isolated in-memory books only.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{setup}=require('./recovery_regressions');
let passed=0;function test(n,f){f();passed++;console.log('PASS',n);}
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[b.getId(),[...b.sheets].map(([n,s])=>[n,s.maxRows,[...s.cells],[...s.rules]])]));
const identity=e=>e.code==='LEDGER_IDENTITY_REQUIRES_REVIEW' && e.status===409;
const duplicate=e=>e.code==='LEDGER_DUPLICATE_REQUIRES_REVIEW' && e.status===409;
function fixture(id='valid-root',partial=false){
 const t=setup(),p=t.sale({id});let result;
 if(partial){t.main.getSheetByName('COBROS').failAt='7:11';assert.throws(()=>t.request('cajaSimpleRegistrar',[p],id),/INJECTED_WRITE_FAILURE/);}
 else result=t.request('cajaSimpleRegistrar',[p],id);
 return Object.assign(t,{p,result,s:t.main.getSheetByName('REQUESTS')});
}
function blocked(t,predicate=identity){
 const before=snapshot(t);
 const calls=[()=>t.ctx.findRequestRecord_(t.p.id,t.main),()=>t.request('cajaSimpleEstado',[t.p.id]),
  ()=>t.request('cajaSimpleRegistrar',[t.p],t.p.id),()=>t.ctx.journalResume_(t.p.id,'cajaSimpleRegistrar',t.main),
  ()=>t.ctx.journalCommit_(t.p.id,'cajaSimpleRegistrar',t.main,[],{mustNotReturn:true})];
 for(const call of calls){assert.throws(call,predicate);assert.equal(snapshot(t),before);}
 assert.equal(t.locks().held,false);assert.equal(t.locks().acquires,t.locks().releases);
}
for(const partial of [false,true])for(const [id,stored] of [['valid-root',' valid-root '],['123',123]])test((partial?'partial':'completed')+' reported persisted alias '+JSON.stringify(stored)+' cannot ACK/resume/overwrite',()=>{
 const t=fixture(id,partial);t.s.put(2,1,stored);blocked(t);assert.strictEqual(t.s.raw(2,1),stored);
});
for(const partial of [false,true])test((partial?'partial':'completed')+' malformed identity variants stay unmodified across all readers',()=>{
 for(const stored of [' valid-root','valid-root ','\tvalid-root','valid-root\n','\u00a0valid-root','valid\u0000-root','',0,false,true,null,'valid-root#part:0']){
  const t=fixture('valid-root',partial);t.s.put(2,1,stored);blocked(t);
  const before=snapshot(t);assert.throws(()=>t.ctx.paymentRequestIndex_(t.main),identity);assert.equal(snapshot(t),before);
 }
});
for(const partial of [false,true])test((partial?'partial':'completed')+' a formula displaying the canonical ID is not literal evidence',()=>{
 const t=fixture('valid-root',partial),value=t.s.value.bind(t.s);t.s.put(2,1,'="valid-root"');
 t.s.value=(r,c)=>r===2&&c===1?'valid-root':value(r,c);blocked(t);assert.equal(t.s.raw(2,1),'="valid-root"');
});
for(const partial of [false,true])for(const status of ['COMPLETED','FAILED'])test((partial?'partial':'completed')+' plus duplicate '+status+' never picks a winning row',()=>{
 const t=fixture('valid-root',partial),row=t.s.getRange(2,1,1,8).getValues()[0];row[4]=status;row[7]='not even JSON';t.s.appendRow(row);
 blocked(t,duplicate);assert.equal(t.ctx.paymentRequestIndex_(t.main).get('valid-root').length,2,'retain duplicates for explicit historical review, not normalization');
});
test('canonical and padded/numeric aliases together cannot hide behind a valid completed row',()=>{
 for(const [id,stored] of [['valid-root',' valid-root '],['123',123]])for(const aliasFirst of [true,false]){
  const t=fixture(id),row=t.s.getRange(2,1,1,8).getValues()[0];t.s.appendRow(row);t.s.put(aliasFirst?2:3,1,stored);blocked(t);
 }
});
test('malformed unrelated rows beyond the old scan window cannot be ignored for a new root',()=>{
 for(const stored of [' unrelated ',99,'']){
  const t=fixture(),row=t.s.getRange(2,1,1,8).getValues()[0];row[0]=stored;t.s.getRange(5101,1,1,8).setValues([row]);
  const p=t.sale({id:'new-intent'}),before=snapshot(t);assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),identity);assert.equal(snapshot(t),before);
 }
});
test('formula-only evidence with blank ID blocks; truly blank physical rows retain offsets',()=>{
 const t=fixture();t.s.put(8,8,'=""');blocked(t);
 const u=setup(),s=u.ctx.getOrCreateRequestsSheet_(u.main);s.getRange(2,1,4,8).setValues(Array.from({length:4},()=>Array(8).fill('')));
 const p=u.sale({id:'after-blanks'}),r=u.request('cajaSimpleRegistrar',[p],p.id),record=u.ctx.findRequestRecord_(p.id,u.main);
 assert.equal(record.sheetRowIndex,6);assert.equal(s.raw(6,1),p.id);const before=snapshot(u);assert.deepEqual(u.request('cajaSimpleRegistrar',[p],p.id),r);assert.equal(snapshot(u),before);
});
for(const partial of [false,true])test((partial?'partial':'completed')+' canonical string IDs, including numeric-looking strings, preserve normal recovery',()=>{
 for(const id of ['valid-root','123','0','domain:v1_2','a b']){
  const t=fixture(id,partial),r=t.request('cajaSimpleRegistrar',[t.p],id);assert.equal(r.paid,true);assert.strictEqual(t.s.raw(2,1),id);
  assert.equal(t.s.raw(2,5),'COMPLETED');assert.equal(t.main.getSheetByName('COBROS').getLastRow(),7);
  const before=snapshot(t);assert.deepEqual(t.request('cajaSimpleRegistrar',[t.p],id),r);assert.deepEqual(t.request('cajaSimpleEstado',[id]).result,r);assert.equal(snapshot(t),before);
  assert.throws(()=>t.request('cajaSimpleRegistrar',[{...t.p,customer:'changed'}],id),/IDEMPOTENCY_KEY_REUSED/);
  assert.throws(()=>t.ctx.idempotentExecute_(id,'cajaSimpleRegistrar',t.p,'different-device',()=>{}),/IDEMPOTENCY_KEY_REUSED/);assert.equal(snapshot(t),before);
 }
});
test('writer revalidates the original identity/row and never overwrites changed historical evidence',()=>{
 for(const mode of ['padded','numeric','renamed','wrong-row','missing-row','row-string','row-zero','append-duplicate','second-row']){
  const t=fixture('123'),record=t.ctx.findRequestRecord_('123',t.main);
  if(mode==='padded')t.s.put(2,1,' 123 ');
  if(mode==='numeric')t.s.put(2,1,123);
  if(mode==='renamed')t.s.put(2,1,'different-valid');
  if(mode==='wrong-row')record.sheetRowIndex=3;
  if(mode==='missing-row'){t.s.getRange(2,1,1,8).setValues([Array(8).fill('')]);}
  if(mode==='row-string')record.sheetRowIndex='2';
  if(mode==='row-zero')record.sheetRowIndex=0;
  if(mode==='append-duplicate')delete record.sheetRowIndex;
  if(mode==='second-row')t.s.appendRow(t.s.getRange(2,1,1,8).getValues()[0]);
  const before=snapshot(t);assert.throws(()=>t.ctx.saveRequestRecord_({...record,response:{mustNotWrite:true}},t.main),['append-duplicate','second-row'].includes(mode)?duplicate:identity);assert.equal(snapshot(t),before);
 }
});
test('writer detects a changed row after lookup and before completion, without claiming external writer atomicity',()=>{
 const t=setup();let captured;
 assert.throws(()=>t.ctx.idempotentExecute_('valid-root','fixtureAction',{},'fixture-device',()=>{
  const s=t.main.getSheetByName('REQUESTS');s.put(2,1,' valid-root ');captured=snapshot(t);return {ok:true};
 }),identity);assert.equal(snapshot(t),captured);assert.equal(t.main.getSheetByName('REQUESTS').raw(2,5),'PROCESSING');
});
test('legacy TRANSACCIONES_API uses exact identities without creating a replacement ledger',()=>{
 for(const partial of [false,true]){
  const t=fixture('123',partial);t.main.sheets.delete('REQUESTS');t.s.name='TRANSACCIONES_API';t.main.sheets.set(t.s.name,t.s);
  t.s.put(2,1,123);blocked(t);assert.equal(t.main.getSheetByName('REQUESTS'),null);
 }
});
for(const stage of ['before','after'])test(stage+' historical boundary: malformed ledger identity is never classified away',()=>{
 for(const stored of [' bad ',123,'']){
  const t=require('./history_boundary_regressions').fixture();if(stage==='after'){t.activate();t.open();}
  t.s.appendRow([stored,'cajaSimpleRegistrar','','','FAILED','','','{}']);const before=snapshot(t);
  for(const call of stage==='before'?[t.propose]:[t.open,t.cut]){assert.throws(call,identity);assert.equal(snapshot(t),before);}
 }
});
for(const environment of ['STAGING','PRODUCTION'])test(environment+' generated bundle rejects malformed stored IDs and preserves valid replay using mocks only',()=>{
 const t=setup();t.props.set('DOMUS_ENV',environment);const context=vm.createContext({...t.ctx});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_'+environment+'_BUNDLE.gs'),'utf8'),context);
 const config=vm.runInContext('CONFIG',context);t.main.id=config.mainSheetId;t.ops.id=config.opsSheetId;
 context.SpreadsheetApp={flush(){},openById(id){if(id===t.main.id)return t.main;if(id===t.ops.id)return t.ops;throw new Error('NON_FIXTURE_BOOK');}};
 const token=context.executeDomusAction_('authCrearSesion',{args:['CAJA','QA operator','fixture-device','fixture-secret'],role:'CAJA',deviceId:'fixture-device'}).result.token;
 const p=t.sale({id:'123'}),call=()=>context.executeDomusAction_('cajaSimpleRegistrar',{args:[p],requestId:p.id,role:'CAJA',deviceId:'fixture-device',sessionToken:token}).result;
 const r=call();assert.deepEqual(call(),r);const s=t.main.getSheetByName('REQUESTS');s.put(2,1,123);const before=snapshot(t);assert.throws(call,identity);assert.equal(snapshot(t),before);
});
console.log(JSON.stringify({suite:'ledger-identity-real-source-mocks',passed,liveData:false,liveWrites:0}));
