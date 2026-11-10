'use strict';
// Full existing UI and actual backend; all remote traffic intercepted, fixture books only.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./recovery_regressions'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function main(){
 const withHistory=process.env.DOMUS_TEST_HISTORY==='1';
 const b=withHistory?require('./history_boundary_regressions').fixture():setup();b.manager();const manager=b.login('GERENCIA');
 b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify({version:1,scopes:[{id:'A',projectId:'P-A',projectName:'QA project',eventId:'E-A',eventName:'QA event',activity:'QA event'}],
 stations:[{deviceId:'fixture-device',stationId:'CAJA_1',registerId:'GAVETA_1',scopeIds:['A']}]}));
 if(withHistory)b.activate();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const sends=[],errors=[];let passed=0,loseOpening=true;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await context.addInitScript(tokens=>{
   localStorage.setItem('domus_caja_authorized','true');localStorage.setItem('domus_device_id','fixture-device');sessionStorage.setItem('domus_operator','QA');
   for(const [role,token] of Object.entries(tokens))sessionStorage.setItem('domus_session_token_'+role,token);
  },{CAJA:b.login(),GERENCIA:manager});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   if(url.hostname==='127.0.0.1'&&url.port==='17321')return route.fulfill({json:{ok:true,status:'READY',queued:true}});
   if(url.hostname!=='script.google.com')return route.abort();
   const p=req.postDataJSON();sends.push(JSON.parse(JSON.stringify(p)));const result=b.ctx.dispatchNativeAction(JSON.parse(JSON.stringify(p)));
   if(p.action==='turnoAbrir' && loseOpening){loseOpening=false;return route.fulfill({json:{...result,data:{}}});}
   return route.fulfill({json:result});
  });
  await page.goto(origin+'/?env=staging&vista=caja');await page.waitForFunction(()=>document.getElementById('journeyStatus')?.textContent.includes('Sin jornada'));
  if(withHistory)assert((await page.locator('#journeyStatus').innerText()).includes('149 ID(s) inciertos'));
  await page.locator('.product-card').first().click();await page.locator('#activitySelect').selectOption('QA event');await page.locator('#customerNameInput').fill('QA');
  await page.locator('#btnOpenPaymentModal').click();await page.locator('#cashReceivedInput').fill('100');await page.locator('#btnConfirmChargeAndSend').click();
  assert.equal(sends.filter(p=>p.action==='cajaSimpleRegistrar').length,0);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);await page.locator('#btnCancelPayment').click();
  passed++;console.log('PASS enabled journey without opening prevents new sale before transport');
  await page.locator('#journeyScopeSelect').selectOption('A');await page.locator('#journeyOpeningFloat').fill('100');await page.locator('#btnJourneyOpen').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').some(q=>q.action==='turnoAbrir' && q.status==='RETRY'));
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox')).find(q=>q.action==='turnoAbrir'));
  assert.equal(await page.evaluate(id=>localStorage.getItem('domus_confirmation_'+id),pending.requestId),null);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);
  await page.locator('#btnOutboxRetry').click();await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('domus_outbox')||'[]').length);
  await page.locator('#btnSyncNow').click();await page.waitForFunction(()=>document.getElementById('journeyStatus')?.textContent.startsWith('Jornada abierta'));
  const opens=sends.filter(p=>p.action==='turnoAbrir');assert.equal(opens.length,2);assert.equal(opens[0].requestId,opens[1].requestId);assert.deepEqual(opens[0].args,opens[1].args);
  passed++;console.log('PASS malformed opening ACK preserves same intent; recovery creates no payment and no duplicate opening');
  await page.locator('#btnOpenPaymentModal').click();await page.locator('#cashReceivedInput').fill('100');await page.locator('#btnConfirmChargeAndSend').click();
  await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));
  const sale=sends.find(p=>p.action==='cajaSimpleRegistrar');assert.equal(sale.args[0].openingRequestId,pending.requestId);assert.equal(b.main.getSheetByName('COBROS').getLastRow(),7);
  const confirmed=await page.evaluate(id=>JSON.parse(localStorage.getItem('domus_confirmation_'+id)),sale.requestId);assert.equal(confirmed.data.journey.openingRequestId,pending.requestId);
  await page.locator('#btnCloseReceipt').click();passed++;console.log('PASS full cashier UI sends one sale bound to current opening and retains matching confirmation');
  await page.locator('#journeyCountedCash').fill('140');await page.locator('#btnJourneyClose').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').some(q=>q.action==='corteZCerrar' && q.status==='REJECTED'));
  await page.getByText('Cierre bloqueado: 0 transferencia(s) sin confirmar y 1 comanda(s) sin resolver.',{exact:false}).waitFor();
  assert(b.request('turnoEstado',[]).active);passed++;console.log('PASS unresolved delivery blocks cut without silently closing or discarding its evidence');
  // Exercise real KDS with explicit mock formula outputs, not a real stock test.
  const inv=b.main.getSheetByName('INVENTARIO');inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');const read=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:read(r,c);
  const item=JSON.parse(b.main.getSheetByName('COMANDAS').raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=b.login('BARRA');
  for(const action of ['TOMAR','LISTA','ENTREGAR'])b.request('comandasSimpleAccion',[{key,action}],action,'BARRA',token);
  await page.locator('#btnJourneyClose').click();await page.waitForFunction(()=>document.getElementById('journeyStatus')?.textContent.includes('Sin jornada'));
  assert((await page.locator('#journeyCutSummary').innerText()).includes('ventas en efectivo $40.00'));
  const closed=b.request('turnoEstado',[]);assert.equal(closed.active,null);assert.equal(closed.lastCut.snapshot.totals.Efectivo,40);assert.equal(closed.lastCut.financialFinal,false);
  await page.reload();await page.waitForFunction(()=>document.getElementById('journeyCutSummary')?.textContent.includes('Último corte'));
  assert.equal(sends.filter(p=>p.action==='cajaSimpleRegistrar').length,1);assert.deepEqual(errors,[]);
  passed++;console.log('PASS manager cut closes only its journey; read-only reload recovers original totals without another sale');
  // Second isolated journey: prove both independent prerequisites in the UI.
  await page.locator('#journeyScopeSelect').selectOption('A');await page.locator('#journeyOpeningFloat').fill('100');await page.locator('#btnJourneyOpen').click();
  await page.waitForFunction(()=>document.getElementById('journeyStatus')?.textContent.startsWith('Jornada abierta'));
  await page.locator('.product-card').first().click();await page.locator('#activitySelect').selectOption('QA event');await page.locator('#customerNameInput').fill('QA second journey');
  await page.locator('#btnOpenPaymentModal').click();await page.waitForFunction(()=>document.getElementById('paymentModal')?.classList.contains('open'));
  await page.locator('[data-method="Transferencia"]').click();await page.locator('#btnConfirmChargeAndSend').click();
  await page.waitForFunction(()=>document.getElementById('receiptModal')?.classList.contains('open'));await page.locator('#btnCloseReceipt').click();
  const transferSale=sends.filter(p=>p.action==='cajaSimpleRegistrar').at(-1),source=b.ctx.findRequestRecord_(transferSale.requestId,b.main).response;
  assert.equal(source.verified,false);const cob=b.main.getSheetByName('COBROS'),pendingRow=cob.getRange(8,1,1,31).getValues();
  await page.locator('#journeyCountedCash').fill('100');await page.locator('#btnJourneyClose').click();
  await page.getByText('Cierre bloqueado: 1 transferencia(s) sin confirmar y 1 comanda(s) sin resolver.',{exact:false}).waitFor();assert(b.request('turnoEstado',[]).active);
  b.props.set('DOMUS_TRANSFER_REVIEW_POLICY',JSON.stringify({version:1,approved:true,receivers:['DOMUS_QA']}));
  b.request('confirmarTransferencia',[{openingRequestId:source.journey.openingRequestId,sourceRequestId:source.sourceRequestId,sourceReceipt:source.receipt,ticket:source.ticket,
   receiver:'DOMUS_QA',bankTransactionId:'QA-BROWSER-CLOSE-001',receivedDate:new Date().toISOString().slice(0,10),evidenceReference:'QA mock bank assertion',amount:40,currency:'MXN'}],'bank-journey-2','GERENCIA',manager);
  await page.locator('#btnJourneyClose').click();await page.getByText('Cierre bloqueado: 0 transferencia(s) sin confirmar y 1 comanda(s) sin resolver.',{exact:false}).last().waitFor();
  const secondItem=JSON.parse(b.main.getSheetByName('COMANDAS').raw(8,13)),secondKey='DCS-'+secondItem.row+'-'+secondItem.batch;
  for(const action of ['TOMAR','LISTA','ENTREGAR'])b.request('comandasSimpleAccion',[{key:secondKey,action}],action+'-second','BARRA',token);
  await page.locator('#btnJourneyClose').click();await page.waitForFunction(()=>document.getElementById('journeyStatus')?.textContent.includes('Sin jornada'));
  const final=b.request('turnoEstado',[]).lastCut;assert.equal(final.closurePolicy,'RESOLVE_PENDING_TRANSFERS_AND_DELIVERIES');assert.equal(final.snapshot.totals.Transferencia,40);
  assert.equal(final.snapshot.pendingTransfers.length,0);assert.equal(final.snapshot.pendingDeliveries.length,0);assert.deepEqual(cob.getRange(8,1,1,31).getValues(),pendingRow);
  assert.equal(cob.getLastRow(),9);assert.equal(sends.filter(p=>p.action==='cajaSimpleRegistrar').length,2);assert.deepEqual(errors,[]);
  passed++;console.log('PASS UI permits closure only after bank confirmation and delivery, preserving the original pending payment');
  if(withHistory){
   assert.equal(final.historyBoundaryId,'boundary');assert.equal(final.snapshot.historyReview.counts.uncertainIds,149);
   assert(!sends.some(p=>b.input.queue.some(q=>q.requestId===p.requestId)));
   assert.equal(b.ctx.paymentRequestIndex_(b.main).get('legacy-0')[0][4],'FAILED');
   passed++;console.log('PASS UI keeps historical warning and explicit boundary after reload; no historical ID was sent');
  }
  await context.close();console.log(JSON.stringify({suite:withHistory?'browser-journey-history-boundary':'browser-journey-operations',passed,liveSheets:false,liveSales:0,hardware:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
