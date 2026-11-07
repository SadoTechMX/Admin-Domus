'use strict';
// Full application in Chromium; every non-local request is intercepted.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
});
let passed=0;
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,origin='http://127.0.0.1:'+port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 async function context(seed){
  const c=await browser.newContext(),network=[];
  await c.addInitScript(seed);
  await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();network.push(route.request().url());return route.abort();});
  return {c,network};
 }
 const wait=p=>p.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión persistida.'));
 try{
  const {c,network}=await context(()=>{
   if(localStorage.getItem('QA-seeded'))return;
   const q=Array.from({length:15},(_,i)=>({requestId:'QA-LEGACY-'+i,action:'cajaSimpleRegistrar',args:[{id:'QA-LEGACY-'+i,items:[{name:'QA fixture',qty:1}]}],status:i%2?'RETRY':'SYNCING',lastAttempt:'2020-01-01T00:00:00Z',keep:{unmodified:i}}));
   const raw=JSON.stringify(q,null,2);localStorage.setItem('domus_outbox',raw);localStorage.setItem('QA-original',raw);
   localStorage.setItem('domus_pending_sale',' {"id":"QA-LEGACY-0","keep":true} ');
   for(let i=0;i<3;i++)localStorage.setItem('domus_confirmation_QA-'+i,JSON.stringify({receipt:'QA-link-'+i}));
   localStorage.setItem('domus_print_token','PRIVATE-FIXTURE');localStorage.setItem('QA-seeded','yes');
  });
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/?env=staging&vista=caja');await wait(p);
  assert.equal(await p.evaluate(()=>window.__domusApp===undefined),true);assert.equal(network.length,0);assert.deepEqual(errors,[]);
  assert.equal(await p.evaluate(()=>localStorage.getItem('domus_outbox')===localStorage.getItem('QA-original')),true);
  assert.equal(await p.locator('#queueReviewRelease').isDisabled(),true);
  passed++;console.log('PASS automatic legacy startup review preserves 15 records and linked evidence, no sessions/health/replay/printer calls');
  const promise=p.waitForEvent('download');await p.locator('#queueReviewDownload').click();const downloaded=await promise;
  const evidence=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8')),snap=JSON.parse(evidence.initialRaw);
  assert.equal(snap.values.domus_outbox,await p.evaluate(()=>localStorage.getItem('QA-original')));
  assert.equal(Object.keys(snap.values).filter(k=>k.startsWith('domus_confirmation_')).length,3);
  assert(!JSON.stringify(evidence).includes('PRIVATE-FIXTURE'));assert.equal(network.length,0);
  passed++;console.log('PASS private JSON export preserves exact strings and does not release or replay the queue');
  const second=await c.newPage();await second.goto(origin+'/?env=staging');await wait(second);
  await p.reload();await wait(p);await p.evaluate(()=>window.dispatchEvent(new Event('online')));
  assert.equal(network.length,0);assert.equal(await p.locator('#btnConfirmChargeAndSend').count(),0);
  assert.equal(await p.evaluate(()=>localStorage.getItem('domus_outbox')===localStorage.getItem('QA-original')),true);
  passed++;console.log('PASS reload, second tab and online event keep unknown queue held without enabling retry, clear or release');
  await c.close();
  for(const native of [false,true]){
   const {c,network}=await context(native?()=>{window.DOMUS_NATIVE_BOOT={queueReview:true,environment:'STAGING'};}:()=>{});
   const p=await c.newPage();await p.goto(origin+(native?'/':'/?revision=cola&env=staging'));await wait(p);
   assert.equal(network.length,0);assert.equal(await p.evaluate(()=>localStorage.getItem('domus_outbox')),null);
   assert.equal(await p.locator('#queueReviewRelease').isDisabled(),false);await p.locator('#queueReviewRelease').click();
   await p.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión cerrada'));
   assert.equal(network.length,0);assert.equal(await p.evaluate(()=>localStorage.getItem('domus_outbox_review_hold_v1')),null);
   const returnUrl=new URL(await p.locator('#queueReviewContinue a').getAttribute('href'));assert.equal(returnUrl.searchParams.has('revision'),false);
   assert.equal(returnUrl.origin,native?'https://script.google.com':origin);
   passed++;console.log('PASS '+(native?'native boot flag':'explicit query')+' enters review before normal initialization with empty storage');await c.close();
  }
  const unknown=await context(()=>{window.DOMUS_NATIVE_BOOT={queueReview:true,environment:'UNKNOWN'};});
  const u=await unknown.c.newPage();await u.goto(origin);await wait(u);await u.locator('#queueReviewRelease').click();
  await u.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.includes('Entorno nativo sin acreditar'));
  assert.equal(unknown.network.length,0);assert.equal(await u.locator('#queueReviewContinue a').count(),0);
  assert.equal(await u.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox_review_hold_v1')).state),'REQUIRES_REVIEW');
  passed++;console.log('PASS unknown native environment cannot close review or redirect to production');await unknown.c.close();
  const failed=await context(()=>{
   localStorage.setItem('domus_outbox','[malformed but must survive');
   const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='domus_outbox_review_initial_v1')throw Error('QA_QUOTA');return set.call(this,k,v);};
  });
  const f=await failed.c.newPage();await f.goto(origin+'/?revision=cola');
  await f.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Bloqueo local sin completar:'));
  assert.equal(failed.network.length,0);assert.equal(await f.evaluate(()=>localStorage.getItem('domus_outbox')),'[malformed but must survive');
  assert.equal(await f.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox_review_hold_v1')).state),'DRAINING');
  await f.evaluate(()=>localStorage.setItem('domus_outbox_review_hold_v1','{BROKEN'));
  const brokenDownload=f.waitForEvent('download');await f.locator('#queueReviewDownload').click();
  const brokenFile=await brokenDownload;assert.equal(JSON.parse(fs.readFileSync(await brokenFile.path(),'utf8')).holdRaw,'{BROKEN');
  passed++;console.log('PASS malformed storage + snapshot quota stays blocked and preserves raw queue');await failed.c.close();

  const live=await browser.newContext(),apiCalls=[],hardware=[],errors2=[];let held;
  await live.addInitScript(()=>{localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
  await live.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
   if(u.hostname==='127.0.0.1'&&u.port==='17321'){hardware.push(req.url());return route.fulfill({json:{ok:true,status:'READY'}});}
   if(u.hostname!=='script.google.com')return route.abort();
   const p=req.postDataJSON();apiCalls.push(p.action);let data={};
   if(p.action==='authCrearSesion')data={token:'QA-'+p.role};
   if(p.action==='health')data={environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'};
   if(p.action==='cajaSimpleDatos')data={phase:'Solar',operatingPeriod:{allowed:true,message:'Fixture period'},products:[{name:'QA drink',group:'Bebidas',price:40,sku:'QA-01',destination:'Barra'}],accounts:[],activities:['QA event'],staff:['QA']};
   if(p.action==='cajaSimpleRegistrar'){
    await new Promise(resolve=>{held={payload:p,finish:async()=>{await route.fulfill({json:{ok:true,requestId:p.requestId,data:{ok:true,ticket:'QA-account',receipt:'QA-receipt',paid:true,verified:true,paymentStatus:'CONFIRMADA',total:40,method:'Efectivo'}}});resolve();}};});return;
   }
   return route.fulfill({json:{ok:true,data}});
  });
  const a=await live.newPage(),b=await live.newPage();for(const p of [a,b])p.on('pageerror',e=>errors2.push(e.message));
  await Promise.all([a,b].map(async p=>{await p.goto(origin+'/?env=staging&vista=caja');await p.waitForFunction(()=>document.body.textContent.includes('QA drink'));}));
  await a.locator('.product-card').first().click();await a.locator('#activitySelect').selectOption('QA event');await a.locator('#customerNameInput').fill('QA');
  await a.locator('#btnOpenPaymentModal').click();await a.locator('#cashReceivedInput').fill('100');await a.locator('#btnConfirmChargeAndSend').click();
  for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,10));assert(held);
  await b.locator('#btnOutboxReview').click();await b.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox_review_hold_v1')||'null')?.state==='DRAINING');
  await a.waitForFunction(()=>document.getElementById('queueReviewStatus'));
  const initial=await b.evaluate(()=>localStorage.getItem('domus_outbox_review_initial_v1'));assert(JSON.parse(initial).values.domus_outbox.includes(held.payload.requestId));
  const apiCount=apiCalls.length,hardwareCount=hardware.length;await held.finish();await Promise.all([wait(a),wait(b)]);
  assert.equal(apiCalls.length,apiCount);assert.equal(hardware.length,hardwareCount);assert.deepEqual(errors2,[]);
  const final=JSON.parse(await b.evaluate(()=>localStorage.getItem('domus_outbox_review_settled_v1'))).values;
  assert.equal(final.domus_outbox,'[]');assert.equal(JSON.parse(final['domus_confirmation_'+held.payload.requestId]).data.receipt,'QA-receipt');
  assert.equal(await a.evaluate(()=>localStorage.getItem('domus_outbox_review_initial_v1')),initial);
  assert.equal(await b.locator('#queueReviewRelease').isDisabled(),false);await b.locator('#queueReviewRelease').click();
  await b.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión cerrada'));
  assert.equal(apiCalls.length,apiCount);assert.equal(hardware.length,hardwareCount);assert.equal(await a.locator('#btnConfirmChargeAndSend').count(),0);
  passed++;console.log('PASS two active tabs drain one in-flight ACK, preserve before/after evidence, stop new traffic and hardware calls');await live.close();
  console.log(JSON.stringify({suite:'browser-outbox-review-real-source',passed,liveIds:false,liveBackend:false,productionWrites:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
