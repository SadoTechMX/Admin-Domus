'use strict';
// Real UI + actual backend modules, controlled asynchronous mocks; no Google.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
const wait=async fn=>{for(let i=0;i<150&&!fn();i++)await new Promise(r=>setTimeout(r,20));assert(fn(),'fixture dispatch absent');};
const policy={version:1,scopes:[{id:'A',projectId:'P',projectName:'QA project',eventId:'E',eventName:'QA event',activity:'QA event'}],stations:[{deviceId:'fixture-device',stationId:'S',registerId:'R',scopeIds:['A']}]};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{for(const native of [false,true])for(const recovery of [false,true]){
  const b=setup();b.manager();b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify(policy));const calls=[],pending=[],errors=[];let busy=false;
  const original={clientContract:'domus-outbox-v2',requestId:'SYNTHETIC-browser-opening',action:'turnoAbrir',args:[{requestId:'SYNTHETIC-browser-opening',scopeId:'A',openingFloat:0}],role:'CAJA',deviceId:'fixture-device',operatorId:'QA',status:'RETRY',errorStatus:500,errorCode:'SERVER_ERROR',lastError:'Synthetic contention',attempts:1};
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const dispatch=async p=>{
   assert(['authCrearSesion','health','cajaSimpleDatos','comandasSimpleDatos','turnoAbrir'].includes(p.action));calls.push(p);
   if(p.action==='turnoAbrir'){assert.equal(busy,false,'write competed with a read');return b.ctx.dispatchNativeAction(p);}
   if((recovery&&p.action==='cajaSimpleDatos')||p.action==='comandasSimpleDatos'){
    busy=true;return new Promise(resolve=>pending.push({action:p.action,finish:()=>{busy=false;resolve(b.ctx.dispatchNativeAction(p));}}));
   }return b.ctx.dispatchNativeAction(p);
  };
  await context.exposeFunction('__fixtureDispatch',dispatch);
  await context.addInitScript(({native,queue})=>{localStorage.setItem('domus_device_id','fixture-device');localStorage.setItem('domus_caja_authorized','true');if(queue&&!localStorage.getItem('domus_outbox'))localStorage.setItem('domus_outbox',JSON.stringify([queue]));if(native)window.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:bad=>({dispatchNativeAction:p=>window.__fixtureDispatch(p).then(ok,bad)})})}}};},{native,queue:recovery?original:null});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.hostname!=='script.google.com')return route.abort();assert.equal(native,false);return route.fulfill({json:await dispatch(route.request().postDataJSON())});});
  await page.goto(origin+(native?'/google-apps-script/Index.html':'/')+'?env=staging&vista=caja');await wait(()=>pending.length===1);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,0);
  await page.clock.install();
  if(recovery){
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox'))[0]),original);
   await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.clock.fastForward(95000);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,0);
   page.once('dialog',async d=>{assert(d.message().includes(original.requestId));assert(d.message().includes('$0'));await d.accept();});await page.locator('#btnOutboxRetry').click();
  }else{
   await page.locator('#journeyScopeSelect').selectOption('A');await page.locator('#journeyOpeningFloat').fill('0');await page.locator('#btnJourneyOpen').click();await page.locator('#btnJourneyOpen').evaluate(el=>el.click());
  }
  await page.clock.fastForward(95000);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,0);assert.equal(pending.length,1);
  pending[0].finish();await wait(()=>calls.filter(p=>p.action==='turnoAbrir').length===1);
  const sent=calls.find(p=>p.action==='turnoAbrir');await page.waitForFunction(id=>!!localStorage.getItem('domus_confirmation_'+id),sent.requestId);
  assert.equal(sent.args[0].openingFloat,0);if(recovery){assert.equal(sent.requestId,original.requestId);assert.deepEqual(sent.args,original.args);assert.equal(sent.deviceId,original.deviceId);assert.equal(sent.role,original.role);}
  // Pause with the automatic post-ACK refresh still in flight; its finally cannot re-arm it.
  await wait(()=>pending.length===2);const paused=await page.evaluate(()=>window.DOMUS_PAUSE_FOR_REVIEW());assert.equal(paused.paused,true);assert.equal(paused.readInFlight,true);assert.equal(paused.cancelledServerExecutions,false);
  const count=calls.length;pending[1].finish();await page.clock.fastForward(360000);await page.locator('#btnSyncNow').click();await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(80);
  assert.equal(calls.length,count);assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox')).length),0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);assert.deepEqual(errors,[]);
  passed++;console.log('PASS',native?'native':'REST',recovery?'explicit original-ID recovery':'new $0 opening','waits for read; one write; review pause survives late completion');await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({suite:'browser-write-priority',passed,liveGoogle:false,realIdsUsed:false,realOperations:0}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
