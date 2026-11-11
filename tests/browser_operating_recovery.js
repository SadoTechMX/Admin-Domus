'use strict';
// Complete candidate UI + actual backend modules. All non-local traffic intercepted.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function main(){
 const b=setup(),week=b.main.getSheetByName('SEMANA');b.main.getSheetByName('CATALOGO').getRange(7,17).setValue(200);
 const expired=()=>week.getRange('B7:B8').setValues([[new Date('2026-10-19T06:00:00Z')],[new Date('2026-10-25T06:00:00Z')]]);
 expired();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 let passed=0;const sends=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
  await context.addInitScript(tokens=>{
    localStorage.setItem('domus_caja_authorized','true');localStorage.setItem('domus_device_id','fixture-device');sessionStorage.setItem('domus_operator','QA');
    for(const [role,token] of Object.entries(tokens))sessionStorage.setItem('domus_session_token_'+role,token);
  },{CAJA:b.login('CAJA'),BARRA:b.login('BARRA')});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   if(url.hostname==='127.0.0.1'&&url.port==='17321')return route.fulfill({json:{ok:true,status:'READY',queued:true}});
   if(url.hostname!=='script.google.com')return route.abort();
   const p=req.postDataJSON();sends.push(p.action);return route.fulfill({json:b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)))});
  });
  await page.goto(origin+'/?env=staging&vista=caja');await page.waitForFunction(()=>document.getElementById('cashPeriodStatus')?.textContent.includes('fuera del periodo'));
  await page.locator('.product-card').first().click();await page.locator('#activitySelect').selectOption('QA event');await page.locator('#customerNameInput').fill('QA');await page.locator('#btnOpenPaymentModal').click();
  assert.equal(await page.locator('#paymentModal').evaluate(el=>el.classList.contains('open')),false);assert.equal(sends.filter(a=>a==='cajaSimpleRegistrar').length,0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
  assert((await page.locator('#cashPeriodStatus').innerText()).includes('2026-10-19'));passed++;console.log('PASS expired operating period is visible and prevents creation of a payment intent');
  week.getRange('B7:B8').setValues([[new Date(Date.now()-86400000)],[new Date(Date.now()+86400000)]]);await page.locator('#btnSyncNow').click();
  await page.waitForFunction(()=>document.getElementById('cashPeriodStatus')?.textContent.startsWith('Periodo operativo'));
  await page.locator('#btnOpenPaymentModal').click();await page.locator('#cashReceivedInput').fill('200');await page.locator('#btnConfirmChargeAndSend').click();
  await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));
  assert.equal(sends.filter(a=>a==='cajaSimpleRegistrar').length,1);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
  const receiptKey=await page.evaluate(()=>localStorage.getItem('domus_last_sale_confirmation'));
  const receiptRaw=await page.evaluate(k=>localStorage.getItem('domus_confirmation_'+k),receiptKey);assert.equal(JSON.parse(receiptRaw).data.total,200);
  passed++;console.log('PASS explicit fixture period correction preserves cart and permits one confirmed $200 sale with original receipt');
  // The receipt is visible before its post-sale Caja/KDS refresh completes.
  // Drain that old document before measuring the review screen's zero traffic.
  await page.waitForFunction(()=>{const p=window.DOMUS_PAUSE_FOR_REVIEW();return !p.readInFlight&&!p.writeClaims;});
  const count=sends.length;await page.goto(origin+'/?env=staging&vista=caja&revision=cola');
  await page.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión persistida'));
  assert.equal(sends.length,count);assert.equal(await page.locator('#queueReviewRelease').isDisabled(),false);await page.locator('#queueReviewRelease').click();
  await page.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión cerrada'));
  assert.equal(sends.length,count);assert.equal(await page.evaluate(k=>localStorage.getItem('domus_confirmation_'+k),receiptKey),receiptRaw);
  const downloading=page.waitForEvent('download');await page.locator('#queueReviewDownload').click();const download=await downloading;
  const archive=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(Object.keys(archive.archives).length,1);
  passed++;console.log('PASS explicit close of empty review archives evidence and exports it without replay or receipt loss');
  expired();await page.locator('#queueReviewContinue a').click();await page.waitForFunction(()=>document.getElementById('cashPeriodStatus')?.textContent.includes('fuera del periodo'));
  assert.equal(new URL(page.url()).searchParams.has('revision'),false);assert.equal(sends.filter(a=>a==='cajaSimpleRegistrar').length,1);
  await page.locator('#btnModeComandas').click();await page.waitForSelector('.order-card');assert.equal(await page.locator('.order-item-block').count(),1);
  assert.equal(await page.evaluate(k=>localStorage.getItem('domus_confirmation_'+k),receiptKey),receiptRaw);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.deepEqual(errors,[]);
  passed++;console.log('PASS explicit return keeps new charges blocked for expired period and displays existing order without another sale');
  await context.close();console.log(JSON.stringify({suite:'browser-operating-period-and-review-release',passed,liveSheets:false,liveSales:0,hardware:false}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
