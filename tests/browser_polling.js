'use strict';
// Native and REST application in Chromium, delayed mocked service, zero Google.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
const snapshot=b=>JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([n,s])=>[n,[...s.cells]])));
const wait=async condition=>{for(let n=0;n<100;n++){if(condition())return;await new Promise(r=>setTimeout(r,20));}assert(condition(),'fixture dispatch did not arrive');};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{for(const native of [false,true]){
  const b=setup();b.manager();const before=snapshot(b),calls=[],pending=[],errors=[];let active=0,max=0;
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const dispatch=async p=>{
   assert(['authCrearSesion','health','cajaSimpleDatos','comandasSimpleDatos'].includes(p.action),'Unexpected mutation '+p.action);calls.push(p.action);
   if(!['cajaSimpleDatos','comandasSimpleDatos'].includes(p.action))return b.ctx.dispatchNativeAction(p);
   active++;max=Math.max(max,active);
   return new Promise(resolve=>pending.push({action:p.action,done:failure=>{active--;resolve(failure?{ok:false,error:'Synthetic query timeout',code:'SERVER_ERROR',status:500}:b.ctx.dispatchNativeAction(p));}}));
  };
  await context.exposeFunction('__fixtureDispatch',dispatch);
  await context.addInitScript(native=>{localStorage.setItem('domus_device_id','fixture-device');if(native)window.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:fail=>({dispatchNativeAction:p=>window.__fixtureDispatch(p).then(ok,fail)})})}}};},native);
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();if(url.hostname!=='script.google.com')return route.abort();assert.equal(native,false);return route.fulfill({json:await dispatch(route.request().postDataJSON())});});
  await page.goto(origin+(native?'/google-apps-script/Index.html':'/')+'?env=staging&vista=caja');await page.locator('#cajaLockModal.open').waitFor();await page.locator('#btnSubmitCajaPin').click();await wait(()=>pending.length===1);
  await page.clock.install();await page.clock.fastForward(360000);
  for(let n=0;n<3;n++)await page.locator('#btnSyncNow').click();
  assert.equal(pending.length,1);assert.equal(active,1);assert((await page.locator('#cashPeriodStatus').textContent()).includes('Consultando Caja'));
  pending[0].done(false);await wait(()=>pending.length===2);assert.equal(pending[1].action,'comandasSimpleDatos');assert.equal(max,1);
  await page.clock.fastForward(360000);assert.equal(pending.length,2);pending[1].done(false);await page.waitForTimeout(80);
  await page.clock.fastForward(9999);assert.equal(pending.length,2);await page.clock.fastForward(1);await wait(()=>pending.length===3);
  pending[2].done(true);await page.waitForFunction(()=>document.getElementById('cashPeriodStatus').textContent.includes('Sondeo detenido'));
  await page.clock.fastForward(360000);assert.equal(pending.length,3);assert.equal(active,0);
  await page.locator('#btnSyncNow').click();await wait(()=>pending.length===4);pending[3].done(false);await wait(()=>pending.length===5);pending[4].done(false);
  await page.waitForFunction(()=>document.getElementById('currentPhaseBadge').textContent==='Fase Solar');assert.equal(max,1);assert.deepEqual(errors,[]);assert.equal(snapshot(b),before);
  assert.equal(await page.evaluate(()=>localStorage.getItem('domus_pending_sale')),null);
  passed++;console.log('PASS',native?'native generated':'REST static','360s delay/manual clicks keep one read; serial KDS, completion-based polling, error pause/manual recovery; no operations');await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({suite:'browser-polling',passed,liveGoogle:false,operations:0,deployments:0}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
