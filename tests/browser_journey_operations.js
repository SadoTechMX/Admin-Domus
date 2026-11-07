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
 const b=setup();b.manager();const manager=b.login('GERENCIA');
 b.props.set('DOMUS_JOURNEY_POLICY_V1',JSON.stringify({version:1,scopes:[{id:'A',projectId:'P-A',projectName:'QA project',eventId:'E-A',eventName:'QA event',activity:'QA event'}],
 stations:[{deviceId:'fixture-device',stationId:'CAJA_1',registerId:'GAVETA_1',scopeIds:['A']}]}));
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
  await context.close();console.log(JSON.stringify({suite:'browser-journey-operations',passed,liveSheets:false,liveSales:0,hardware:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
