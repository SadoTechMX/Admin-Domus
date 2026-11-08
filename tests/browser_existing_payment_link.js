'use strict';
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {fixture}=require('./existing_payment_link_regressions'),{fixture:pendingFixture,business}=require('./transfer_cancellation_regressions');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname),file=p===root?path.join(root,'index.html'):p;
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{
  for(const mode of ['double-click','two-tabs','stale','no-payment']){
   const b=mode==='no-payment'?pendingFixture():fixture(),before=business(b),ctx=await browser.newContext({viewport:{width:1280,height:1000}});let links=0,collections=0,prints=0;const errors=[];
   await ctx.addInitScript(()=>{localStorage.setItem('domus_device_id','fixture-device');localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
   await ctx.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
    if(u.hostname==='127.0.0.1'&&u.port==='17321'){if(['/print','/drawer/open'].includes(u.pathname))prints++;return route.fulfill({json:{ok:true,status:'READY'}});}
    if(u.hostname!=='script.google.com')return route.abort();const p=req.postDataJSON();if(!p)return route.abort();
    if(p.action==='vincularPagoExistente')links++;if(['cajaSimpleRegistrar','confirmarTransferencia'].includes(p.action))collections++;
    return route.fulfill({json:b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)))});
   });
   async function open(){const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/?env=staging&vista=caja`);
    await page.locator('#btnTransferReview').click();await page.waitForFunction(()=>document.querySelector('#transferPendingSelect').options.length===2);await page.locator('#transferPendingSelect').selectOption('pending');await page.locator('#btnPrepareExistingPayment').click();return page;}
   async function review(page){await page.waitForFunction(()=>!document.querySelector('#btnLinkExistingPayment').disabled);
    const summary=await page.locator('#existingPaymentSummary').innerText();for(const text of [b.source.ticket,b.source.receipt,b.existing.receipt,'$40.00','Nuevo cobro: $0'])assert(summary.includes(text));
    assert.equal(await page.locator('#btnConfirmTransferReview').isDisabled(),true);assert.equal(await page.locator('#confirmExistingPayment').isChecked(),false);
    await page.locator('#btnLinkExistingPayment').click();assert.equal(links,0);
    await page.locator('#existingPaymentReason').fill('QA same account payment');await page.locator('#existingPaymentEvidence').fill('QA receipt checked');await page.locator('#confirmExistingPayment').check();
   }
   const page=await open();
   if(mode==='no-payment'){
    await page.waitForFunction(()=>document.querySelector('#existingPaymentSummary').textContent.includes('No se puede vincular'));
    assert.equal(await page.locator('#btnLinkExistingPayment').isDisabled(),true);assert.equal(links,0);assert.equal(business(b),before);passed++;console.log('PASS absent compatible existing payment keeps administrative action disabled, with zero collections');
   }else{
    await review(page);let second;if(mode==='two-tabs'){second=await open();await review(second);}
    if(mode==='stale')b.command('Lista');
    const accept=p=>p.once('dialog',d=>{assert(d.message().includes(b.source.ticket)&&d.message().includes(b.existing.receipt)&&d.message().includes('Nuevo cobro: $0'));return d.accept();});
    accept(page);if(second)accept(second);
    if(mode==='double-click')await page.screenshot({path:'/tmp/domus-existing-payment-link.png',fullPage:true});
    await Promise.all([page.locator('#btnLinkExistingPayment').evaluate(el=>{el.click();el.click();}),...(second?[second.locator('#btnLinkExistingPayment').evaluate(el=>el.click())]:[])]);
    if(mode==='stale'){
     await page.waitForFunction(()=>document.querySelector('#existingPaymentSummary').textContent.includes('Rechazo sin efectos'));
     assert.equal(b.ctx.transferExistingPaymentRecords_(b.main).length,0);assert.equal(b.ctx.journalFind_(b.ctx.dataRows_(b.main.getSheetByName('REQUESTS'),2,8).at(-1)[0],b.main),null);
     passed++;console.log('PASS changed account is rejected without linking or collecting; rejected intention retained');
    }else{
     await page.waitForFunction(()=>document.querySelector('#existingPaymentHistory').textContent.includes('nuevo cobro $0'));
     assert.equal(b.ctx.transferExistingPaymentRecords_(b.main).length,1);assert.equal(business(b),before);assert.equal(b.item().state,'Pendiente');assert.equal(b.decision().allowed,true);
     assert(links>=1&&links<=2);assert.equal(await page.evaluate(()=>localStorage.getItem('domus_last_sale_confirmation')),null);assert.equal(await page.locator('#receiptModal').evaluate(el=>el.classList.contains('open')),false);
     passed++;console.log('PASS '+mode+': explicit account/amount/folio confirmation, one durable link, original rows and undelivered state preserved');
    }
   }
   assert.equal(collections,0);assert.equal(prints,0);assert.deepEqual(errors,[]);await ctx.close();
  }
  console.log(JSON.stringify({suite:'browser-existing-payment-link',passed,liveGoogle:false,liveBank:false,hardware:false,newCollections:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
