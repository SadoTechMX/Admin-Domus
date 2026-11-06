'use strict';
// Real Chromium + actual API/backend modules, entirely isolated in-memory services.
// The bank policy, bank evidence, print bridge and inventory formulas are fixtures.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname),file=p===root?path.join(root,'index.html'):p;
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function main(){
 const b=setup();b.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['DOMUS_QA']}));
 const sale=b.sale({method:'Transferencia'}),source=b.request('cajaSimpleRegistrar',[sale],sale.id);
 const board=b.main.getSheetByName('COMANDAS'),item=JSON.parse(board.raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=b.login('BARRA');
 for(const action of ['TOMAR','LISTA'])b.request('comandasSimpleAccion',[{key,action}],action,'BARRA',token);
 const inv=b.main.getSheetByName('INVENTARIO');inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');
 const stockValue=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:stockValue(r,c);
 b.manager(); // Verified Workspace identity in the fixture only.
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 let confirmations=0,drawers=0,prints=0,passed=0;const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
  await context.addInitScript(()=>{localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='127.0.0.1'&&url.port===String(port))return route.continue();
   if(url.hostname==='127.0.0.1'&&url.port==='17321'){
    if(url.pathname==='/print')prints++;if(url.pathname==='/drawer/open')drawers++;
    return route.fulfill({json:{ok:true,status:'READY',queued:true}});
   }
   if(url.hostname!=='script.google.com')return route.abort();
   const payload=request.postDataJSON();if(!payload)return route.abort();
   if(payload.action==='confirmarTransferencia')confirmations++;
   return route.fulfill({json:b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(payload)))});
  });
  await page.goto(`http://127.0.0.1:${port}/?env=staging&vista=comandas`);
  await page.waitForSelector('.btn-deliver');assert.equal(await page.locator('.btn-deliver').isDisabled(),true);assert((await page.locator('#ordersBoard').innerText()).includes('Transferencia pendiente'));
  passed++;console.log('PASS pending transfer disables physical delivery in real KDS UI');
  await page.locator('#btnModeCaja').click();await page.locator('#btnTransferReview').click();
  await page.waitForFunction(()=>document.querySelector('#transferPendingSelect').options.length===2);
  await page.locator('#transferPendingSelect').selectOption(sale.id);await page.locator('#transferReceiverSelect').selectOption('DOMUS_QA');
  await page.locator('#transferReviewAmount').fill('40');await page.locator('#transferReceivedDate').fill('2026-11-05');await page.locator('#transferBankReference').fill('QA-BROWSER-0001');await page.locator('#transferEvidenceReference').fill('Fixture bank entry');
  await page.locator('#btnConfirmTransferReview').click();assert.equal(confirmations,0);
  await page.locator('#transferBankReviewed').check();await page.locator('#transferReceivedDate').fill('2099-01-01');await page.locator('#btnConfirmTransferReview').click();
  await page.waitForFunction(()=>document.querySelector('#transferReviewStatus').textContent.includes('Rechazo sin efectos'));
  assert.equal(confirmations,1);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);assert.equal(await page.locator('#btnConfirmTransferReview').isDisabled(),false);
  passed++;console.log('PASS pre-effect date rejection can be corrected without erasing history or changing the rejected intent');
  await page.locator('#transferReceivedDate').fill('2026-11-05');await page.locator('#btnConfirmTransferReview').evaluate(el=>{el.click();el.click();});
  await page.waitForFunction(()=>document.querySelector('#receiptModal').classList.contains('open'));
  assert.equal(confirmations,2);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(b.main.getSheetByName('COBROS').raw(7,11),'Borrador');assert.equal(b.main.getSheetByName('COBROS').value(8,14),40);
  assert.equal(await page.locator('#receiptTotal').innerText(),'$40.00');assert((await page.locator('#receiptPaymentDetails').innerText()).includes('COBRADO Y VERIFICADO'));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').map(q=>q.status)),['REJECTED']);
  passed++;console.log('PASS Gerencia attestation + double-click confirms one actual fixture payment and preserves original pending row');
  const downloadPromise=page.waitForEvent('download');await page.locator('#btnDownloadReceipt').click();const download=await downloadPromise;
  const html=fs.readFileSync(await download.path(),'utf8');assert(html.includes('COBRO CONFIRMADO'));assert(html.includes(source.ticket));assert(!html.includes('<script'));assert.equal(drawers,0);
  passed++;console.log('PASS confirmed transfer ticket downloads without a cash-drawer action or second collection');
  await page.locator('#btnCloseReceipt').click();await page.locator('#btnModeComandas').click();
  await page.waitForFunction(()=>{const button=document.querySelector('.btn-deliver');return button&&!button.disabled;});
  page.once('dialog',dialog=>dialog.accept());await page.locator('.btn-deliver').click();
  await page.waitForFunction(()=>!document.querySelector('.btn-deliver'));
  assert.equal(JSON.parse(board.raw(7,13)).state,'Entregada');assert.equal(confirmations,2);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),8);assert.equal(prints,1);assert.deepEqual(errors,[]);
  passed++;console.log('PASS KDS delivery becomes available only after durable confirmation; backend records one delivery');
  await context.close();
  console.log(JSON.stringify({suite:'browser-transfer-review-real-source',passed,liveBank:false,liveSheets:false,hardware:false,productionWrites:0}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
