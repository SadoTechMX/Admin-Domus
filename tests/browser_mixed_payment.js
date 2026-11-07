'use strict';
// Real Chromium UI + real backend modules; every external request intercepted.
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
 let passed=0;
 try{for(const lose of [false,true]){
  const b=setup();b.main.getSheetByName('CATALOGO').getRange(7,17).setValue(200);
  const sends=[],prints=[],drawers=[],errors=[];let corrupt=lose;
  const context=await browser.newContext({viewport:{width:1280,height:1100}}),page=await context.newPage();
  await context.addInitScript(token=>{
   localStorage.setItem('domus_caja_authorized','true');localStorage.setItem('domus_device_id','fixture-device');sessionStorage.setItem('domus_operator','QA');sessionStorage.setItem('domus_session_token_CAJA',token);
  },b.login());
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   if(url.hostname==='127.0.0.1'&&url.port==='17321'){
    if(url.pathname==='/print')prints.push(req.postDataJSON());if(url.pathname==='/drawer/open')drawers.push(req.postDataJSON());
    return route.fulfill({json:{ok:true,status:'READY',queued:true}});
   }
   if(url.hostname!=='script.google.com')return route.abort();
   const p=req.postDataJSON();if(p.action==='cajaSimpleRegistrar')sends.push(p);
   const result=b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)));
   if(p.action==='cajaSimpleRegistrar' && corrupt){corrupt=false;result.data.payments=[];}
   return route.fulfill({json:result});
  });
  await page.goto(origin+'/?env=staging&vista=caja');await page.waitForSelector('.product-card');
  await page.locator('.product-card').first().click();await page.locator('#activitySelect').selectOption('QA event');await page.locator('#customerNameInput').fill('QA');await page.locator('#btnOpenPaymentModal').click();
  await page.locator('[data-method="Mixto"]').click();await page.locator('#mixedTerminalAmount').fill('120');await page.locator('#cashTipInput').fill('5');await page.locator('.btn-cash-preset[data-val="exact"]').click();
  assert.equal(await page.locator('#cashReceivedInput').inputValue(),'85.00');assert((await page.locator('#mixedCashAmount').innerText()).includes('80.00'));
  await page.locator('#btnConfirmChargeAndSend').click();assert.equal(sends.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('domus_pending_sale')),null);
  await page.locator('#mixedTerminalReference').fill('QA-APPROVED-120');await page.locator('#mixedTerminalConfirmed').check();
  await page.locator('#mixedTerminalAmount').fill('119');assert.equal(await page.locator('#mixedTerminalConfirmed').isChecked(),false);await page.locator('#mixedTerminalAmount').fill('120');await page.locator('#mixedTerminalConfirmed').check();
  await page.locator('#cashReceivedInput').fill('84');await page.locator('#btnConfirmChargeAndSend').click();assert.equal(sends.length,0);
  if(!lose){passed++;console.log('PASS mixed UI requires terminal approval/reference, exact cash portion plus tip, and blocks insufficient cash before an intention');}
  await page.locator('#cashReceivedInput').fill('100');await page.locator('#btnConfirmChargeAndSend').dblclick();
  if(lose){
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').some(q=>q.status==='RETRY'));
   assert.equal(sends.length,1);assert.equal(prints.length,0);assert.equal(drawers.length,0);assert.equal(await page.locator('.cart-item').count(),1);
   const id=sends[0].requestId;assert.equal(await page.evaluate(id=>localStorage.getItem('domus_confirmation_'+id),id),null);
   await page.locator('#btnOutboxRetry').click();await page.waitForFunction(id=>!!localStorage.getItem('domus_confirmation_'+id),id);
   assert.equal(sends.length,2);assert.deepEqual(sends[1].args,sends[0].args);assert.equal(sends[1].requestId,id);assert.equal(prints.length,0);assert.equal(drawers.length,0);
   page.once('dialog',dialog=>dialog.accept(id));await page.locator('#btnRecoverReceipt').click();
   await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));
   assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);passed++;console.log('PASS incomplete mixed ACK retains cart/ID and recovers original receipt with no second payment or automatic drawer/print');
  }else{
   await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));
   await page.waitForFunction(()=>document.getElementById('receiptPaymentDetails').textContent.includes('Terminal 1'));
   assert.equal(sends.length,1);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(b.main.getSheetByName('COMANDAS').getLastRow(),7);
   assert.equal(prints.length,1);assert.equal(drawers.length,1);assert.equal(drawers[0].method,'Efectivo');assert.equal(drawers[0].requestId,'DRAWER-'+prints[0].receipt);
   assert.equal(prints[0].method,'Mixto');assert.deepEqual(prints[0].payments.map(p=>p.amount),[80,120]);assert.equal(prints[0].change,15);assert.equal(prints[0].tip,5);
   assert.equal(await page.locator('.cart-item').count(),0);passed++;console.log('PASS double click records one mixed intention, two ledger rows, one receipt/print and one cash drawer request');
  }
  const details=await page.locator('#receiptPaymentDetails').innerText();for(const value of ['Efectivo','80.00','Terminal 1','120.00','15.00','QA-APPROVED-120'])assert(details.includes(value),value);
  const before=sends.length,drawerBefore=drawers.length;const downloading=page.waitForEvent('download');await page.locator('#btnDownloadReceipt').click();const download=await downloading;
  const html=fs.readFileSync(await download.path(),'utf8');assert(html.includes('Terminal 1'));assert(html.includes('QA-APPROVED-120'));assert(html.includes('120.00'));assert.equal(sends.length,before);
  await page.locator('#btnPrintReceipt').click();await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));
  assert.equal(drawers.length,drawerBefore);assert.equal(sends.length,before);assert.deepEqual(errors,[]);
  if(!lose){passed++;console.log('PASS digital mixed ticket includes split and cash change; reprint/download do not recharge or reopen drawer');}
  await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({suite:'browser-mixed-payment',passed,liveSheets:false,terminalCharged:false,hardware:false}));
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
