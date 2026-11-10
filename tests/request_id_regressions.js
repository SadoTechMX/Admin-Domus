'use strict';
// Real dispatcher/journal; only in-memory books. No Google, sale or bank traffic.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{setup}=require('./recovery_regressions');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const copy=v=>JSON.parse(JSON.stringify(v));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[b.getId(),[...b.sheets].map(([n,s])=>[n,s.maxRows,[...s.cells],[...s.rules]])]));
const invalid=e=>e.code==='REQUEST_ID_INVALID' && e.status===422;
function nextSale(t){const p=t.sale({id:'next-valid'}),r=t.request('cajaSimpleRegistrar',[p],p.id);assert.equal(r.paid,true);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),7);assert.deepEqual(t.request('cajaSimpleRegistrar',[p],p.id),r);}
test('reported client#part:0 is rejected before REQUESTS/journal creation and a valid sale still succeeds',()=>{
 const t=setup(),p=t.sale({id:'client#part:0'}),before=snapshot(t);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),invalid);assert.equal(snapshot(t),before);
 assert.equal(t.main.getSheetByName('REQUESTS'),null);assert.equal(t.main.getSheetByName('DOMUS_JOURNAL'),null);nextSale(t);
});
const ids=['client#part:0','client#part:1','client#part:','client#part:xyz','client#part:-1','client#part:00','client#part:0#part:1','#part:0',
 '=1+1',' leading','trailing ','cl\nient','cl\rient','cl\tient','cl\u2028ient','cl\u2029ient','cl\u0000ient','',0,123,false,null,{},['client']];
test('reserved, noncanonical, formula and non-string IDs fail before hash/lock/storage without normalizing identity',()=>{
 for(const id of ids){const t=setup(),before=snapshot(t),locks=t.locks().acquires;let ran=false;
  assert.throws(()=>t.ctx.idempotentExecute_(id,'fixtureAction',{},'fixture-device',()=>{ran=true;}),invalid);
  assert.equal(ran,false);assert.equal(t.locks().acquires,locks);assert.equal(snapshot(t),before);
 }
});
test('persistence/lookup/resume entry points independently reject invalid roots before sheet creation or row growth',()=>{
 for(const id of ids)for(const path of ['save','lookup','commit','resume']){
  const t=setup(),before=snapshot(t);
  const invoke=()=>path==='save'?t.ctx.saveRequestRecord_({requestId:id},t.main):path==='lookup'?t.ctx.findRequestRecord_(id,t.main):
   path==='resume'?t.ctx.journalResume_(id,'fixtureAction',t.main):t.ctx.journalCommit_(id,'fixtureAction',t.main,[t.ctx.cellWrite_(t.main.getSheetByName('COBROS'),9000,6,99)],{ok:true});
  assert.throws(invoke,invalid);assert.equal(snapshot(t),before);
 }
});
const actions=['cajaSimpleRegistrar','accesoSimpleRegistrar','comandasSimpleAccion','comandasSimpleResolver','turnoAbrir','corteZCerrar','registrarLimiteHistorico',
 'confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente','cambiarFase','solicitarResurtido','editarAcceso','anularAcceso',
 'guardarropaDevolver','accesoCambiarActividad','registrarNuevoEvento','registrarNuevoProducto','sincronizarCartaConCatalogoDOMUS','sincronizarJujutsuShi'];
function transport(t,native,p){
 t.ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
 return native?t.ctx.dispatchNativeAction(copy(p)):JSON.parse(t.ctx.doPost({postData:{contents:JSON.stringify(p)}}).text);
}
for(const native of [false,true])test((native?'native':'REST')+': all 20 mutation routes reject the reserved root before binding or action effects',()=>{
 for(const action of actions){const t=setup();t.manager();const token=t.login('ADMIN'),before=snapshot(t);
  const p={action,requestId:'client#part:0',args:[{id:'domain-object',requestId:'client#part:0'}],role:'ADMIN',deviceId:'fixture-device',sessionToken:token};
  const r=transport(t,native,p);assert.equal(r.ok,false,action);assert.equal(r.code,'REQUEST_ID_INVALID',action);assert.equal(r.status,422,action);assert.equal(snapshot(t),before,action);
 }
});
for(const native of [false,true])test((native?'native':'REST')+': payload ID aliases and legacy second-argument KDS cannot bypass root validation',()=>{
 for(const slot of ['envelope','body-id','body-request','second-id','second-request']){
  const t=setup();t.manager();const token=t.login('ADMIN'),before=snapshot(t),p={action:slot.startsWith('second')?'comandasSimpleAccion':'cajaSimpleRegistrar',role:'ADMIN',deviceId:'fixture-device',sessionToken:token,args:[{}]};
  if(slot==='envelope')p.requestId='client#part:0';else if(slot==='body-id')p.args=[{id:'client#part:0'}];else if(slot==='body-request')p.args=[{requestId:'client#part:0'}];
  else p.args=['legacy-session',{[slot==='second-id'?'id':'requestId']:'client#part:0',key:'irrelevant',action:'TOMAR'}];
  const r=transport(t,native,p);assert.equal(r.code,'REQUEST_ID_INVALID',slot);assert.equal(r.status,422,slot);assert.equal(snapshot(t),before,slot);
 }
});
test('private Caja status lookup rejects a reserved ID without creating a ledger',()=>{
 const t=setup(),before=snapshot(t);assert.throws(()=>t.request('cajaSimpleEstado',['client#part:0']),invalid);assert.equal(snapshot(t),before);nextSale(t);
});
test('a rejected root cannot alter a pre-existing valid completed request/journal or its ACK',()=>{
 const t=setup(),p=t.sale({id:'valid-root'}),r=t.request('cajaSimpleRegistrar',[p],p.id),before=snapshot(t);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[t.sale({id:'valid-root#part:0'})],'valid-root#part:0'),invalid);assert.equal(snapshot(t),before);
 assert.deepEqual(t.request('cajaSimpleRegistrar',[p],p.id),r);assert.equal(snapshot(t),before);
});
test('generated fragments remain valid, partial writes recover same root, and caller cannot resume a fragment as a root',()=>{
 const t=setup(),target=t.main.insertSheet('QA_TARGET'),writes=[t.ctx.cellWrite_(target,1,1,'x'.repeat(25000)),t.ctx.cellWrite_(target,3,1,'y'.repeat(25000))];
 const call=()=>t.ctx.idempotentExecute_('valid-root','fixtureAction',{},'fixture-device',()=>t.ctx.journalCommit_('valid-root','fixtureAction',t.main,writes,{ok:true}));
 target.failAt='3:1';assert.throws(call,/INJECTED_WRITE_FAILURE/);const root=t.ctx.journalFind_('valid-root',t.main);assert.equal(JSON.parse(root.data[3]).parts,2);
 assert.equal(root.data[2],'PREPARED');assert.equal(t.ctx.journalFind_('valid-root#part:0',t.main).data[1],'JOURNAL_PART');
 assert.equal(call().ok,true);const before=snapshot(t);assert.equal(call().ok,true);assert.equal(snapshot(t),before);
 assert.throws(()=>t.ctx.journalResume_('valid-root#part:0','JOURNAL_PART',t.main),invalid);assert.equal(snapshot(t),before);
});
test('canonical roots keep exact ID and payload/device binding; no trimming or replacement on replay',()=>{
 for(const id of ['plain','UUID-01234567-89ab-cdef','domain:operation.v1_2','client#partial:0']){
  const t=setup(),p=t.sale({id}),r=t.request('cajaSimpleRegistrar',[p],id);assert.equal(r.fulfillment.sourceRequestId,id);assert.deepEqual(t.request('cajaSimpleRegistrar',[p],id),r);
  const before=snapshot(t);assert.throws(()=>t.request('cajaSimpleRegistrar',[{...p,customer:'changed'}],id),/IDEMPOTENCY_KEY_REUSED/);
  assert.throws(()=>t.ctx.idempotentExecute_(id,'cajaSimpleRegistrar',p,'another-device',()=>{}),/IDEMPOTENCY_KEY_REUSED/);assert.equal(snapshot(t),before);
 }
});
test('context-only actions use the same resolved root as REQUESTS when envelope is omitted',()=>{
 const t=setup();t.manager();const token=t.login('ADMIN');let observed;
 t.ctx.sincronizarCartaConCatalogoDOMUS=()=>{observed=t.run('_authContext.requestId');return t.ctx.journalCommit_(observed,'sincronizarCartaConCatalogoDOMUS',t.main,[],{ok:true});};
 const p={action:'sincronizarCartaConCatalogoDOMUS',args:[{id:'resolved-root',requestId:'unused#part:0'}],role:'ADMIN',deviceId:'fixture-device',sessionToken:token};
 const r=transport(t,true,p);assert.equal(r.ok,true);assert.equal(observed,'resolved-root');assert.equal(t.ctx.findRequestRecord_('resolved-root',t.main).status,'COMPLETED');
 assert.equal(t.ctx.journalFind_('resolved-root',t.main).data[2],'COMPLETED');
});
test('already poisoned historical rows are preserved, not renamed, deleted or treated as a safe retry',()=>{
 const t=setup(),s=t.ctx.getOrCreateRequestsSheet_(t.main),j=t.ctx.journalSheet_(t.main);
 s.appendRow(['old#part:0','cajaSimpleRegistrar','a'.repeat(64),'fixture-device','REQUIRES_REVIEW','','','{}']);
 j.appendRow(['old#part:0','cajaSimpleRegistrar','PREPARED','[]','{}','']);const before=snapshot(t);
 assert.throws(()=>t.request('cajaSimpleRegistrar',[t.sale({id:'old#part:0'})],'old#part:0'),invalid);assert.equal(snapshot(t),before);
 const p=t.sale();assert.throws(()=>t.request('cajaSimpleRegistrar',[p],p.id),e=>e.code==='LEDGER_IDENTITY_REQUIRES_REVIEW');assert.equal(snapshot(t),before);
});
for(const environment of ['STAGING','PRODUCTION'])test(environment+' generated bundle enforces the same root guard using mock books only',()=>{
 const t=setup();t.props.set('DOMUS_ENV',environment);
 const context=vm.createContext({...t.ctx});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_'+environment+'_BUNDLE.gs'),'utf8'),context);
 const config=vm.runInContext('CONFIG',context);
 // These IDs label in-memory fixtures; the service has no network implementation.
 t.main.id=config.mainSheetId;t.ops.id=config.opsSheetId;
 context.SpreadsheetApp={flush(){},openById(id){if(id===t.main.id)return t.main;if(id===t.ops.id)return t.ops;throw new Error('NON_FIXTURE_BOOK');}};
 const token=context.executeDomusAction_('authCrearSesion',{args:['CAJA','QA operator','fixture-device','fixture-secret'],role:'CAJA',deviceId:'fixture-device'}).result.token;
 const call=id=>context.executeDomusAction_('cajaSimpleRegistrar',{args:[t.sale({id})],requestId:id,role:'CAJA',deviceId:'fixture-device',sessionToken:token}).result;
 const before=snapshot(t);assert.throws(()=>call('client#part:0'),invalid);assert.equal(snapshot(t),before);
 assert.equal(call('bundle-valid').paid,true);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),7);
});
console.log(JSON.stringify({suite:'request-id-real-source-mocks',passed,liveData:false,liveWrites:0}));
