'use strict';
// Real frontend functions + backend auth, in-memory services only.
const assert=require('assert/strict'),{setup,tick,copy}=require('./reconciliation_regressions'),backend=require('./recovery_regressions');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function ui(){
 const t=setup(),classes=new Set(['open']);
 t.ctx.$('cajaLockModal').classList={contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)};
 for(const name of ['isCajaAuthorized','closeCajaLockModal','unlockCajaWithPin','setMode'])t.load(name);
 Object.assign(t.ctx,{URL,renderComandasBoard(){},renderCatalog(){},renderAccesosView(){}});
 t.ctx.window.location=new URL('https://fixture.invalid/?vista=comandas');t.ctx.window.history={replaceState:(_,__,url)=>{t.ctx.window.location=new URL(url);}};
 t.ctx.STATE.mode='comandas';t.ctx.clearSessionToken('CAJA');t.ctx.clearSessionToken('BARRA');return t;
}
const books=b=>JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([name,s])=>[name,[...s.cells]])));
(async()=>{
for(const [mode,destination,role,actions] of [['caja','','CAJA',['cajaSimpleDatos','comandasSimpleDatos']],['comandas','','BARRA',['comandasSimpleDatos']],['comandas','Cocina','COCINA',['comandasSimpleDatos']],['accesos','','ACCESOS',['accesoSimpleDatos']]])await test('sync '+mode+'/'+role+' only requests its permitted data, even before phase initialization',async()=>{
 const t=ui(),calls=[];t.ctx.closeCajaLockModal();t.load('syncBackendData');Object.assign(t.ctx.STATE,{mode,kdsFilterDest:destination,phaseSyncedFromServer:false});
 t.ctx.callBackend=(action,args,ok)=>{calls.push({action,role:t.ctx.getStationRole()});ok({activeActivity:"QA event"});};t.ctx.renderJourney_=()=>{};t.ctx.renderCatalog=()=>{};t.ctx.updateKdsBadgeCount=()=>{};t.ctx.updateAccesosBadge=()=>{};await t.ctx.syncBackendData();assert.deepEqual(calls,actions.map(action=>({action,role})));
 calls.length=0;t.ctx.STATE.phaseSyncedFromServer=true;await t.ctx.syncBackendData();assert.deepEqual(calls,actions.map(action=>({action,role})));
});
await test('visible Caja unlock pauses polling in every mode, without requesting another role',()=>{
 const t=ui();t.load('syncBackendData');let calls=0;t.ctx.callBackend=()=>calls++;
 for(const mode of ['caja','comandas','accesos']){t.ctx.STATE.mode=mode;t.ctx.syncBackendData();}assert.equal(calls,0);
});
for(const kind of ['manager-empty','station-empty','station-valid','station-wrong'])await test(kind+': unlock follows existing server auth without broadening roles or changing books',async()=>{
 const t=ui(),b=backend.setup(),sends=[],before=books(b);if(kind==='manager-empty')b.manager();
 b.ctx.console={error(){},warn(){}};t.ctx.transport_=async p=>{sends.push(copy(p));return b.ctx.dispatchNativeAction(copy(p));};
 t.ctx.$('cajaPinInput').value=kind==='station-valid'?'fixture-secret':kind==='station-wrong'?'wrong-fixture':'';
 await t.ctx.unlockCajaWithPin();const allowed=['manager-empty','station-valid'].includes(kind);
 assert.equal(t.ctx.isCajaAuthorized(),allowed);assert.equal(t.ctx.STATE.mode,allowed?'caja':'comandas');assert.equal(t.ctx.$('cajaLockModal').classList.contains('open'),!allowed);
 assert.equal(t.ctx.window.location.search,allowed?'?vista=caja':'?vista=comandas');assert.equal(!!t.ctx.getSessionToken('CAJA'),allowed);assert.equal(t.ctx.getSessionToken('BARRA'),'');
 assert.equal(t.ctx.$('cajaPinInput').value,'');assert.equal(t.ctx.$('btnSubmitCajaPin').disabled,false);assert.equal(sends.length,1);assert.equal(sends[0].role,'CAJA');assert.equal(books(b),before);
});
await test('a token labelled as BARRA cannot unlock or be saved under CAJA',async()=>{
 const t=ui();t.ctx.transport_=async()=>({ok:true,data:{token:'fixture-bar-only',role:'BARRA'}});await t.ctx.unlockCajaWithPin();
 assert.equal(t.ctx.getSessionToken('CAJA'),'');assert.equal(t.ctx.isCajaAuthorized(),false);assert.equal(t.ctx.STATE.mode,'comandas');assert(t.ctx.$('cajaLockModal').classList.contains('open'));
});
await test('double submit uses one login and a cancelled dialog does not change the route on late success',async()=>{
 for(const cancel of [false,true,'reopened']){
  const t=ui();let resolve,calls=0;t.ctx.transport_=()=>{calls++;return new Promise(r=>resolve=r);};
  const first=t.ctx.unlockCajaWithPin();await t.ctx.unlockCajaWithPin();assert.equal(calls,1);assert(t.ctx.$('btnSubmitCajaPin').disabled);
  if(cancel)t.ctx.closeCajaLockModal();if(cancel==='reopened')t.ctx.$('cajaLockModal').classList.add('open');resolve({ok:true,data:{token:'fixture-caja',role:'CAJA'}});await first;
  assert.equal(t.ctx.isCajaAuthorized(),!cancel);assert.equal(t.ctx.STATE.mode,cancel?'comandas':'caja');assert.equal(t.ctx.$('btnSubmitCajaPin').disabled,false);
 }
});
for(const ok of [false,true])await test('late background login '+(ok?'success':'rejection')+' uses the already established same-role token without another dialog',async()=>{
 const t=ui(),b=backend.setup();b.manager();let resolve,asks=0,calls=0;
 t.ctx.transport_=p=>++calls===1?new Promise(r=>resolve=r):Promise.resolve(b.ctx.dispatchNativeAction(copy(p)));
 t.ctx.requestStationSecret_=()=>{asks++;throw Error('Unexpected second credential prompt');};
 const pending=t.ctx.ensureSessionToken(null,'CAJA');await tick();await t.ctx.unlockCajaWithPin();const established=t.ctx.getSessionToken('CAJA');assert(established);
 resolve(ok?{ok:true,data:{token:'obsolete-background',role:'CAJA'}}:{ok:false,error:'Acceso denegado'});
 assert.equal(await pending,established);assert.equal(t.ctx.getSessionToken('CAJA'),established);assert.equal(asks,0);assert.equal(calls,2);assert.equal(t.ctx.sessionRequests.size,0);
});
await test('renewal cannot borrow a token from another role; BARRA remains forbidden to read Caja',async()=>{
 const t=ui(),b=backend.setup();let prompts=[];t.ctx.setSessionToken('fixture-caja','CAJA');t.ctx.transport_=async()=>({ok:false,error:'Acceso denegado'});
 t.ctx.requestStationSecret_=async role=>{prompts.push(role);throw Error('Autenticación cancelada.');};
 await assert.rejects(t.ctx.ensureSessionToken(null,'BARRA'),/cancelada/);assert.deepEqual(prompts,['BARRA']);assert.equal(t.ctx.getSessionToken('CAJA'),'fixture-caja');assert.equal(t.ctx.getSessionToken('BARRA'),'');
 const before=books(b);assert.throws(()=>b.request('cajaSimpleDatos',[],undefined,'BARRA',b.login('BARRA')),/no tiene autorización/);assert.equal(books(b),before);
});
console.log(JSON.stringify({suite:'station-routing-real-source-mocks',passed,realCredentialsCreated:0,liveSheets:false,permissionsChanged:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
