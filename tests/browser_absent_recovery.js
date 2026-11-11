'use strict';
// Prepared integration harness. Run only in an authorized Chromium environment.
// Full generated Index + actual server modules; every datum and service is synthetic.
// External network is blocked, and no Google/deployment/real opening is possible.
const assert=require('assert/strict'),fs=require('fs'),http=require('http'),path=require('path');
const {chromium}=require('playwright');
const {client}=require('./audited_release_client_regressions');
const {snapshot,copy}=require('./unconfirmed_observation_regressions');
const {APPROVAL}=require('./audited_release_regressions');
const root=path.resolve(__dirname,'..'),K={hold:'domus_outbox_review_hold_v1',attempt:'domus_outbox_review_journey_v1',intent:'domus_outbox_qa_release_intent_v1',prepared:'domus_outbox_qa_release_prepared_v1',commit:'domus_outbox_qa_release_commit_v1',receipt:'domus_outbox_qa_release_receipt_v1',resolution:'domus_outbox_qa_release_resolution_v1'};
const html=fs.readFileSync(root+'/google-apps-script/Index.html','utf8').replace('</head>','<script>window.DOMUS_NATIVE_BOOT={environment:"STAGING",queueReview:true,view:"caja"};</script></head>');
let passed=0;async function test(n,f){await f();console.log('PASS',n);passed++;}
function approval(b,proposal){const now=Date.now();b.props.set(APPROVAL,JSON.stringify({version:1,approved:true,approvalId:'SYNTHETIC-browser-release',approvedBy:'direccion@domusccc.net',approvalReference:'SYNTHETIC browser scoped approval',evidenceHash:proposal.evidenceHash,issuedAt:now,expiresAt:now+600000,confirmStationsHeld:true,confirmOldExecutionsTerminated:true,confirmIncompatibleWritersDisabled:true,confirmOnlyBoundStation:true,executorBarrierEvidenceHash:'d'.repeat(64)}));}
(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  async function fixture(mode='EXISTING_ACK',behavior={}){
   const {t,b}=await client(mode,{origin}),context=await browser.newContext(),calls=[],errors=[],external=[],state={};
   const before=t.localStorage.getItem(K.attempt);
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
   await context.exposeBinding('syntheticDispatch',async(_,p)=>{
    assert(['consultarAperturaQa','prepararRecuperacionQaAusente','recuperarAperturaQaAusente','prepararLiberacionQa','reservarLiberacionQa','consultarLiberacionQa','confirmarLiberacionQa'].includes(p.action),'Forbidden RPC: '+p.action);calls.push(copy(p));
    const r=b.ctx.dispatchNativeAction(copy(p));if(p.action==='prepararLiberacionQa' && r.ok)state.proposal=copy(r.data);
    if(behavior[p.action])return behavior[p.action](r,p,state);return r;
   });
   await context.addInitScript(({values,token})=>{
    if(localStorage.getItem('synthetic-audited-seeded')===null){for(const [k,v] of values)localStorage.setItem(k,v);localStorage.setItem('synthetic-audited-seeded','yes');}
    sessionStorage.setItem('domus_session_token_CAJA',token);
    window.google={script:{run:{withSuccessHandler:resolve=>({withFailureHandler:reject=>({dispatchNativeAction:p=>window.syntheticDispatch(p).then(resolve,reject)})})}}};
   },{values:[...t.localStorage.data],token:b.observationToken});
   const open=async()=>{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/?revision=cola');await page.locator('#queueAuditedRelease').waitFor({state:'visible'});return page;};
   const page=await open();
   const click=async(id,accept=true,p=page)=>{p.once('dialog',d=>accept?d.accept():d.dismiss());await p.locator('#'+id).click();};
   const prepare=async(p=page)=>{
    await p.locator('#qaReleaseAttested').check();await p.locator('#qaPrepareAck').click();await p.waitForFunction(()=>document.getElementById('qaReleaseProof').textContent.includes('QA_RELEASE_PROPOSAL_V1'));
    approval(b,state.proposal);await p.locator('#qaReleaseApproval').fill('SYNTHETIC-browser-release');await p.locator('#qaReleaseEvidence').fill(state.proposal.evidenceHash);
   };
   const held=async()=>{assert.equal(await page.evaluate(k=>localStorage.getItem(k),K.attempt),before);assert(await page.evaluate(k=>localStorage.getItem(k)!==null,K.hold));};
   const finish=async()=>{await click('qaCommitRelease');await page.waitForFunction(k=>localStorage.getItem(k)!==null,K.receipt);await held();await click('qaFinalizeRelease');await page.waitForFunction(k=>localStorage.getItem(k)===null,K.hold);assert.equal(await page.evaluate(k=>localStorage.getItem(k),K.attempt),before);};
   const clean=async()=>{assert.deepEqual(errors,[]);assert(!calls.some(p=>['authCrearSesion','turnoAbrir','cajaSimpleRegistrar'].includes(p.action)));assert(!(await page.evaluate(()=>JSON.stringify(Object.values(localStorage)))).includes(b.observationToken));await context.close();};
   return {t,b,page,context,calls,state,before,open,click,prepare,held,finish,clean,external};
  }
  await test('review boot, unchecked prepare, cancelled reserve and reload never mutate',async()=>{
   const f=await fixture(),books=snapshot(f.b);assert.equal(f.calls.length,0);await f.page.locator('#qaPrepareAck').click();assert.equal(f.calls.length,0);
   await f.prepare();await f.click('qaReserveRelease',false);assert(!f.calls.some(p=>p.action==='reservarLiberacionQa'));await f.held();await f.page.reload();await f.page.locator('#queueAuditedRelease').waitFor();assert.equal(await f.page.locator('#qaReserveRelease').isDisabled(),true);assert.equal(snapshot(f.b),books);await f.clean();
  });
  for(const mode of ['EXISTING_ACK','ABSENT'])await test('full explicit '+mode+' convergence preserves original and forbids legacy release',async()=>{
   const f=await fixture(mode);if(mode==='ABSENT'){
    await f.page.locator('#qaReleaseAttested').check();await f.page.locator('#qaPrepareAbsent').click();await f.page.waitForFunction(()=>document.getElementById('qaReleaseProof').textContent.includes('QA_ABSENT_RECOVERY_PROPOSAL_V1'));assert.equal(await f.page.locator('#qaRecoverAbsent').isDisabled(),true);
    await f.page.locator('#queueObservationAttested').check();await f.click('queueObserveOpening');await f.page.waitForFunction(()=>localStorage.getItem('domus_outbox_review_journey_observation_v1')!==null);
    await f.page.locator('#qaPrepareAbsent').click();f.b.approve();await f.page.locator('#qaReleaseApproval').fill(f.b.approval.approvalId);await f.page.locator('#qaReleaseEvidence').fill(f.b.recovery.confirmEvidenceHash);await f.click('qaRecoverAbsent');
    await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox_qa_absent_recovery_v1'))?.state==='CONFIRMED_HELD');await f.held();assert.equal(await f.page.locator('#queueReviewRelease').isDisabled(),true);
   }
   const books=snapshot(f.b);await f.prepare();await f.click('qaReserveRelease');await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.prepared);await f.held();await f.finish();assert.equal(snapshot(f.b),books);assert.equal(await f.page.locator('#queueReviewContinue a').count(),1);await f.clean();
  });
  for(const action of ['reservarLiberacionQa','confirmarLiberacionQa'])await test('lost '+action+' reply is recovered only by read-only ticket query',async()=>{
   const f=await fixture('EXISTING_ACK',{[action]:()=>{throw Error('SYNTHETIC_LOST_REPLY');}});await f.prepare();await f.click('qaReserveRelease');
   if(action==='confirmarLiberacionQa'){await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.prepared);await f.click('qaCommitRelease');}
   await f.page.waitForFunction(()=>document.getElementById('queueReviewStatus').textContent.startsWith('No se completó el paso auditado.'));await f.held();await f.page.locator('#qaQueryRelease').click();await f.page.waitForFunction(()=>document.getElementById('queueReviewStatus').textContent.startsWith('Consulta sin reenviar:'));
   assert.equal(f.calls.filter(p=>p.action===action).length,1);if(action==='reservarLiberacionQa')await f.finish();else{await f.click('qaFinalizeRelease');await f.page.waitForFunction(k=>localStorage.getItem(k)===null,K.hold);}await f.clean();
  });
  await test('two held tabs compete for one reservation, and background tab cannot retry it',async()=>{
   const f=await fixture(),second=await f.open();await f.prepare();await f.prepare(second);f.page.on('dialog',d=>d.accept());second.on('dialog',d=>d.accept());
   await Promise.all([f.page.evaluate(()=>document.getElementById('qaReserveRelease').onclick()),second.evaluate(()=>document.getElementById('qaReserveRelease').onclick())]);
   await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.prepared);assert.equal(f.calls.filter(p=>p.action==='reservarLiberacionQa').length,1);await second.reload();await second.locator('#queueAuditedRelease').waitFor();assert.equal(await second.locator('#qaReserveRelease').isDisabled(),true);await f.held();await f.clean();
  });
  await test('navigation during reserve retains sent intent and query alone recovers ticket',async()=>{
   let answer;const f=await fixture('EXISTING_ACK',{reservarLiberacionQa:r=>new Promise(resolve=>answer=()=>resolve(r))});await f.prepare();await f.click('qaReserveRelease');while(!answer)await new Promise(r=>setImmediate(r));
   await f.page.reload();await f.page.locator('#queueAuditedRelease').waitFor();answer();await f.held();assert.equal(await f.page.locator('#qaReserveRelease').isDisabled(),true);await f.page.locator('#qaQueryRelease').click();await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.prepared);assert.equal(f.calls.filter(p=>p.action==='reservarLiberacionQa').length,1);await f.clean();
  });
  await test('interrupted local cleanup resumes only its exact prefix after reload',async()=>{
   const f=await fixture();await f.prepare();await f.click('qaReserveRelease');await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.prepared);await f.click('qaCommitRelease');await f.page.waitForFunction(k=>localStorage.getItem(k)!==null,K.receipt);
   await f.page.evaluate(()=>{const remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(k==='domus_outbox_review_settled_v1'){Storage.prototype.removeItem=remove;throw Error('SYNTHETIC_QUOTA');}return remove.call(this,k);};});
   await f.click('qaFinalizeRelease');await f.page.waitForFunction(()=>document.getElementById('queueReviewStatus').textContent.startsWith('No se completó el paso auditado.'));await f.held();await f.page.reload();await f.page.locator('#queueAuditedRelease').waitFor();await f.click('qaFinalizeRelease');await f.page.waitForFunction(k=>localStorage.getItem(k)===null,K.hold);assert.equal(f.calls.filter(p=>p.action==='confirmarLiberacionQa').length,1);await f.clean();
  });
  console.log(JSON.stringify({suite:'browser-absent-audited-release',passed,browser:browser.version(),generatedPair:true,realGoogle:false,realOperations:0,deployments:0,automaticRetries:0}));
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
