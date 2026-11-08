'use strict';
// Actual browser UI and backend modules with in-memory, fictitious records only.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {fixture,originals,preserved}=require('./transfer_cancellation_regressions');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname),file=p===root?path.join(root,'index.html'):p;
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{
  for(const mode of ['prepared-waste-pending','other-payment','delivered']){
   const b=fixture();if(mode==='prepared-waste-pending')b.command('Lista',7,{ready:'2026-11-08T00:00:00.000Z'});
   if(mode==='delivered')b.command('Entregada');
   if(mode==='other-payment'){const p=b.sale({id:'other',ticket:b.source.ticket,items:[],method:'Efectivo',openingRequestId:'open'});b.request('cajaSimpleRegistrar',[p],p.id);}
   const before=originals(b),context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();let cancels=0,confirms=0,prints=0,drawers=0;const errors=[];
   await context.addInitScript(()=>{localStorage.setItem('domus_device_id','fixture-device');localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1'&&url.port===String(port))return route.continue();
    if(url.hostname==='127.0.0.1'&&url.port==='17321'){if(url.pathname==='/print')prints++;if(url.pathname==='/drawer/open')drawers++;return route.fulfill({json:{ok:true,status:'READY'}});}
    if(url.hostname!=='script.google.com')return route.abort();const p=req.postDataJSON();if(!p)return route.abort();
    if(p.action==='cancelarTransferenciaNoRecibida')cancels++;if(p.action==='confirmarTransferencia')confirms++;
    return route.fulfill({json:b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)))});
   });
   await page.goto(`http://127.0.0.1:${port}/?env=staging&vista=caja`);await page.locator('#btnTransferReview').click();
   await page.waitForFunction(()=>document.querySelector('#transferPendingSelect').options.length===2);
   await page.locator('#transferPendingSelect').selectOption('pending');await page.locator('#btnPrepareTransferCancellation').click();
   if(mode==='prepared-waste-pending'){
    await page.waitForFunction(()=>!document.querySelector('#btnCancelUnreceivedTransfer').disabled);
    assert.equal(await page.locator('#btnConfirmTransferReview').isDisabled(),true);
    assert((await page.locator('#transferCancellationSummary').innerText()).includes(b.source.receipt));assert.equal(await page.locator('#transferWasteStatus').inputValue(),'');
    await page.locator('#btnCancelUnreceivedTransfer').click();assert.equal(cancels,0);passed++;console.log('PASS no default waste/bank/delivery attestation; incomplete cancellation sends nothing');
    await page.locator('#transferCancellationReason').fill('Fixture cancellation after preparation');await page.locator('#transferCancellationEvidence').fill('Fixture manual observation');
    await page.locator('#transferNoBankReceipt').check();await page.locator('#transferNoDelivery').check();await page.locator('#transferWasteStatus').selectOption('PENDING_REVIEW');await page.locator('#transferWasteNote').fill('Physical waste has not been determined in this fixture');
    await page.screenshot({path:'/tmp/domus-transfer-cancellation-ui.png',fullPage:true});
    page.once('dialog',d=>d.accept());await page.locator('#btnCancelUnreceivedTransfer').evaluate(el=>{el.click();el.click();});
    await page.waitForFunction(()=>document.querySelector('#transferCancellationHistory').textContent.includes('corte bloqueado'));
    assert.equal(cancels,1);assert.equal(confirms,0);preserved(b,before);assert.equal(JSON.parse(b.main.getSheetByName('COMANDAS').raw(7,13)).state,'Cancelada');
    assert.equal(await page.locator('#receiptModal').evaluate(el=>el.classList.contains('open')),false);assert.equal(prints,0);assert.equal(drawers,0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').length),0);assert.equal(await page.evaluate(()=>localStorage.getItem('domus_last_sale_confirmation')),null);
    assert.throws(()=>b.cut(),e=>e.code==='JOURNEY_VALIDATION_NO_EFFECTS');passed++;console.log('PASS double-click records one administrative cancellation, no collection, no stock change; waste keeps cut blocked');
   }else{
    await page.waitForFunction(()=>document.querySelector('#transferCancellationSummary').textContent.includes('Requiere conciliación'));
    assert.equal(await page.locator('#btnCancelUnreceivedTransfer').isDisabled(),true);assert.equal(cancels,0);assert.equal(confirms,0);preserved(b,before);
    passed++;console.log('PASS '+mode+' keeps the cancellation view blocked without any collection');
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({suite:'browser-transfer-cancellation',passed,liveSheets:false,liveBank:false,productionWrites:0,hardware:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
