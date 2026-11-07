'use strict';
// Real two-tab Chromium, actual app/backend with fixture services, no real token.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const b=setup(),calls=[],errors=[],messages=[];let passed=0;
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1100}}),one=await context.newPage(),two=await context.newPage();
  await context.addInitScript(token=>{
   localStorage.setItem('domus_caja_authorized','true');localStorage.setItem('domus_device_id','fixture-device');sessionStorage.setItem('domus_operator','QA');sessionStorage.setItem('domus_session_token_CAJA',token);
  },b.login());
  for(const page of [one,two]){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>messages.push(m.text()));}
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   if(url.hostname==='127.0.0.1'&&url.port==='17321'){calls.push({kind:'bridge'});return route.fulfill({json:{ok:true,status:'READY'}});}
   if(url.hostname!=='script.google.com')return route.abort();
   const p=req.postDataJSON();calls.push({kind:'backend',action:p.action});return route.fulfill({json:b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)))});
  });
  for(const page of [one,two]){await page.goto(origin+'/?env=staging&vista=caja');await page.waitForSelector('.product-card');}
  await one.evaluate(()=>localStorage.setItem('domus_print_token','fixture-print-private'));
  for(const page of [one,two]){await page.locator('#btnOpenSettings').click();assert.equal(await page.locator('#printBridgeTokenInput').inputValue(),'');assert((await page.locator('#printBridgeTokenInput').getAttribute('placeholder')).includes('Token guardado'));}
  assert(!(await one.locator('body').innerText()).includes('fixture-print-private'));passed++;console.log('PASS saved print credential is not copied into settings input or visible page');
  // Unconfirmed historical fixture: removal must preserve every byte, never replay it.
  const evidence={domus_outbox:JSON.stringify([{requestId:'QA-held',action:'cajaSimpleRegistrar',args:[{id:'QA-held'}],status:'REQUIRES_REVIEW'}]),domus_pending_sale:'{"id":"QA-held"}',domus_confirmation_QA:'{"receipt":"QA-receipt"}',domus_outbox_review_archive_QA:'{"original":"QA archive"}'};
  await one.evaluate(e=>Object.entries(e).forEach(([k,v])=>localStorage.setItem(k,v)),evidence);
  await two.locator('#printBridgeTokenInput').fill('fixture-print-private');
  const before=await one.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),count=calls.length;
  await one.locator('#btnRemovePrintToken').click();await two.waitForFunction(()=>document.getElementById('printerStatusMsg').textContent.includes('Token retirado'));
  const expected={...before};delete expected.domus_print_token;assert.deepEqual(await one.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),expected);assert.equal(calls.length,count);
  for(const page of [one,two]){assert.equal(await page.locator('#printBridgeTokenInput').inputValue(),'');assert.equal(await page.evaluate(()=>localStorage.getItem('domus_print_token')),null);assert((await page.locator('#printerStatusMsg').innerText()).includes('Colas y comprobantes conservados'));}
  passed++;console.log('PASS removal changes only token key, makes no request, preserves queue/receipt bytes and clears the other tab');
  await two.locator('#btnSaveConfig').click();assert.equal(await two.evaluate(()=>localStorage.getItem('domus_print_token')),null);
  assert(!calls.some(p=>p.action==='cajaSimpleRegistrar'));assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);passed++;console.log('PASS saving another tab cannot restore removed token or replay held sale');
  await one.reload();await one.waitForFunction(()=>!!document.getElementById('queueReviewStatus'));
  assert.equal(await one.evaluate(()=>localStorage.getItem('domus_print_token')),null);for(const [k,v] of Object.entries(evidence))assert.equal(await one.evaluate(k=>localStorage.getItem(k),k),v);
  assert(!messages.join('\n').includes('fixture-print-private'));assert.deepEqual(errors,[]);passed++;console.log('PASS reload preserves removal and held evidence without exposing fixture credential');
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({suite:'browser-print-token-removal',passed,liveCredentials:false,liveSheets:false,hardware:false}));
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
