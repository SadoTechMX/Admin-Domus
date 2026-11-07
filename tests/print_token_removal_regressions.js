'use strict';
// Actual client functions with isolated storage. All credentials are test fixtures.
const assert=require('assert/strict'),{setup,tick}=require('./reconciliation_regressions');
let passed=0;
function app(options){
 const t=setup(options);for(const name of ['getPrintToken','setPrintToken','clearPrintTokenView_','removePrintToken_','openConfigModal','saveConfig','checkPrinterStatus'])t.load(name);
 t.ctx.$('printerStatusMsg').style={};t.ctx.updatePrinterPill=()=>{};
 t.ctx.fetch=()=>{throw Error('Unexpected network');};return t;
}
const snapshot=s=>[...s.data].sort(([a],[b])=>a.localeCompare(b));
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
(async()=>{
 await test('explicit removal deletes only print token, preserves exact queue/receipts/pending/session bytes and sends nothing',()=>{
  const t=app(),fixture='fixture-print-only';
  for(const [k,v] of Object.entries({domus_print_token:fixture,domus_outbox:'[UNREADABLE FIXTURE]',domus_pending_sale:'pending bytes',domus_confirmation_QA:'receipt bytes',domus_outbox_review_hold_v1:'hold bytes',domus_outbox_review_archive_QA:'archive bytes',domus_gas_url:'fixture-url',domus_session_token_CAJA:'fixture-station'}))t.localStorage.setItem(k,v);
  t.ctx.$('printBridgeTokenInput').value=fixture;const expected=snapshot(t.localStorage).filter(([k])=>k!=='domus_print_token'),sessions=snapshot(t.sessionStorage),removed=[];
  const remove=t.localStorage.removeItem.bind(t.localStorage);t.localStorage.removeItem=k=>{removed.push(k);remove(k);};
  t.ctx.syncBackendData=t.ctx.callBackend=()=>{throw Error('Unexpected sync');};
  assert.equal(t.ctx.removePrintToken_(),true);assert.deepEqual(removed,['domus_print_token']);assert.deepEqual(snapshot(t.localStorage),expected);assert.deepEqual(snapshot(t.sessionStorage),sessions);
  assert.equal(t.ctx.$('printBridgeTokenInput').value,'');assert.equal(t.ctx.getPrintToken(),'');assert.equal(t.ctx.STATE.printerStatus,'offline');assert(!JSON.stringify(t.notices).includes(fixture));
 });
 await test('already absent token can be removed repeatedly without touching unrelated storage',()=>{
  const t=app();t.localStorage.setItem('receipt','preserve');const before=snapshot(t.localStorage);assert.equal(t.ctx.removePrintToken_(),true);assert.equal(t.ctx.removePrintToken_(),true);assert.deepEqual(snapshot(t.localStorage),before);
 });
 await test('storage denial or unconfirmed deletion does not claim success or echo secret-bearing errors',()=>{
  for(const fail of ['throw','noop']){
   const t=app();t.localStorage.setItem('domus_print_token','fixture-private');const before=snapshot(t.localStorage);
   t.localStorage.removeItem=()=>{if(fail==='throw')throw Error('fixture-private');};
   assert.equal(t.ctx.removePrintToken_(),false);assert.deepEqual(snapshot(t.localStorage),before);assert.equal(t.notices[0][1],'error');assert(!JSON.stringify(t.notices).includes('fixture-private'));
  }
 });
 await test('opening settings never loads stored secret into DOM; saving blank preserves it until explicit removal',()=>{
  const t=app();t.ctx.checkPrinterStatus=()=>{};t.localStorage.setItem('domus_print_token','fixture-private');t.ctx.openConfigModal();
  assert.equal(t.ctx.$('printBridgeTokenInput').value,'');assert(t.ctx.$('printBridgeTokenInput').placeholder.includes('Token guardado'));
  t.ctx.saveConfig();assert.equal(t.ctx.getPrintToken(),'fixture-private');t.ctx.removePrintToken_();t.ctx.saveConfig();assert.equal(t.ctx.getPrintToken(),'');
  const reload=app({storage:t.localStorage});reload.ctx.openConfigModal();assert.equal(reload.ctx.getPrintToken(),'');assert.equal(reload.ctx.$('printBridgeTokenInput').value,'');assert.equal(reload.ctx.$('printBridgeTokenInput').placeholder,'Sin token guardado');
 });
 await test('late health response cannot restore ready state after token removal',async()=>{
  const t=app();t.ctx.PRINT_BRIDGE_URL='http://fixture.invalid';t.localStorage.setItem('domus_print_token','fixture-private');let resolve,headers,callback;
  t.ctx.fetch=(_,p)=>{headers=p.headers;return new Promise(r=>resolve=r);};t.ctx.checkPrinterStatus((ok,data)=>callback={ok,data});assert.equal(headers['X-Domus-Print-Token'],'fixture-private');
  t.ctx.removePrintToken_();resolve({json:async()=>({ok:true,status:'READY'})});await tick();await tick();
  assert.equal(callback.ok,false);assert.equal(callback.data.status,'TOKEN_REQUIRED');assert.equal(t.ctx.STATE.printerStatus,'offline');assert.equal(t.ctx.getPrintToken(),'');
 });
 console.log(JSON.stringify({suite:'print-token-removal',passed,liveCredentials:false,network:false,profileCleared:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
