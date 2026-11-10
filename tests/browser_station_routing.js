'use strict';
// Chromium + real app/backend auth; every remote request intercepted, no Google.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
const snapshot=b=>JSON.stringify([b.main,b.ops].map(book=>[...book.sheets].map(([n,s])=>[n,[...s.cells]])));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{for(const native of [false,true]){
  async function session(manager,view){
   const b=setup();if(manager)b.manager();b.ctx.console={error(){},warn(){}};const before=snapshot(b),calls=[],errors=[];
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const dispatch=p=>{assert(['authCrearSesion','health','cajaSimpleDatos','comandasSimpleDatos','accesoSimpleDatos'].includes(p.action),'Unexpected action '+p.action);calls.push({action:p.action,role:p.role});return b.ctx.dispatchNativeAction(p);};
   await context.exposeFunction('__fixtureDispatch',dispatch);
   await context.addInitScript(isNative=>{
    if(!localStorage.getItem('domus_device_id'))localStorage.setItem('domus_device_id','fixture-device');
    if(isNative)window.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>window.__fixtureDispatch(p).then(success,failure)})})}}};
   },native);
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
    if(url.hostname!=='script.google.com')return route.abort();assert.equal(native,false,'Native test must not fall back to REST');
    return route.fulfill({json:dispatch(req.postDataJSON())});
   });
   await page.goto(origin+(native?'/google-apps-script/Index.html':'/')+'?env=staging&vista='+view);
   return {b,before,calls,errors,context,page,check(){assert.equal(snapshot(b),before);assert.deepEqual(errors,[]);assert(!calls.some(p=>p.action==='cajaSimpleDatos' && p.role!=='CAJA'));}};
  }
  const label=native?'native generated HTML':'REST static HTML';
  {
   const t=await session(true,'caja'),{page,calls,b}=t;
   await page.locator('#cajaLockModal.open').waitFor();await page.waitForTimeout(200);
   assert.equal(calls.length,0,'locked Caja must not start background authentication');assert.equal(await page.locator('.modal-overlay.open').count(),1);
   assert.equal(await page.locator('#currentPhaseBadge').textContent(),'Fase sin consultar');
   await page.locator('#btnSubmitCajaPin').click();await page.waitForFunction(()=>!document.getElementById('cajaLockModal').classList.contains('open') && document.querySelector('.product-card')?.textContent.includes('QA drink'));
   assert.equal(await page.locator('.modal-overlay.open').count(),0);assert.equal(new URL(page.url()).searchParams.get('vista'),'caja');assert.equal(calls.filter(p=>p.action==='authCrearSesion').length,1);
   assert(calls.every(p=>p.role==='CAJA'));t.check();passed++;console.log('PASS',label,'clean manager identity: one explicit empty-credential unlock, no hidden dialog or foreign-role read');
   await page.reload();await page.waitForFunction(()=>document.querySelector('.product-card')?.textContent.includes('QA drink'));
   assert.equal(await page.locator('.modal-overlay.open').count(),0);assert.equal(calls.filter(p=>p.action==='authCrearSesion').length,1);
   // Expire only mock sessions; existing server allowlist renews the captured CAJA role.
   for(const k of [...b.props.keys()])if(k.startsWith('ses:')){const data=JSON.parse(b.props.get(k));if(data.role==='CAJA'){data.expires=0;b.props.set(k,JSON.stringify(data));}}
   // Cache contains the same mock sessions, so force an explicit server rejection once.
   const validate=b.ctx.authValidateAction;let expired=false;
   b.ctx.authValidateAction=(action,...args)=>{if(action==='cajaSimpleDatos'&&!expired){expired=true;throw Error('Sesión inválida o expirada');}return validate(action,...args);};
   await page.locator('#btnSyncNow').click();await page.waitForFunction(()=>document.getElementById('syncLabel')?.textContent.startsWith('Sinc:'));await page.waitForTimeout(200);
   assert.equal(expired,true);assert.equal(calls.filter(p=>p.action==='authCrearSesion').length,2);assert(calls.every(p=>p.role==='CAJA'));assert.equal(await page.locator('.modal-overlay.open').count(),0);t.check();passed++;console.log('PASS',label,'reload and explicit expiry renew CAJA without BARRA prompts or business writes');
   await t.context.close();
  }
  {
   const t=await session(false,'caja'),{page,calls}=t;await page.locator('#cajaLockModal.open').waitFor();
   await page.locator('#btnSubmitCajaPin').click();await page.waitForFunction(()=>document.getElementById('cajaPinError').textContent.includes('no autorizó'));
   assert.equal(await page.locator('.modal-overlay.open').count(),1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('domus_caja_session')),null);
   assert.equal(calls.length,1);assert.equal(calls[0].action,'authCrearSesion');
   await page.locator('#cajaPinInput').fill('fixture-secret');await page.locator('#btnSubmitCajaPin').click();
   await page.waitForFunction(()=>!document.getElementById('cajaLockModal').classList.contains('open') && document.querySelector('.product-card')?.textContent.includes('QA drink'));
   assert.equal(await page.locator('.modal-overlay.open').count(),0);assert.equal(await page.locator('#cajaPinInput').inputValue(),'');t.check();passed++;console.log('PASS',label,'anonymous empty credential rejected; existing fixture station credential unlocks the same dialog');
   await t.context.close();
  }
  for(const [view,role,action] of [['comandas','BARRA','comandasSimpleDatos'],['accesos','ACCESOS','accesoSimpleDatos']]){
   const t=await session(true,view);await t.page.waitForFunction(()=>document.getElementById('syncLabel')?.textContent.startsWith('Sinc:'));
   await t.page.locator('#btnSyncNow').click();await t.page.waitForTimeout(150);await t.page.reload();await t.page.waitForFunction(()=>document.getElementById('syncLabel')?.textContent.startsWith('Sinc:'));
   assert(t.calls.some(p=>p.action===action));assert(t.calls.every(p=>p.role===role));assert(!t.calls.some(p=>p.action==='cajaSimpleDatos'));assert.equal(await t.page.locator('.modal-overlay.open').count(),0);t.check();passed++;console.log('PASS',label,view,'boot/manual sync/reload use only their existing permitted role');await t.context.close();
  }
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({suite:'browser-station-routing',passed,liveSheets:false,realCredentialsCreated:0,liveSales:0,permissionsChanged:false}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
