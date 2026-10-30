'use strict';
// Real Chromium UI, local static app + deterministic network fixtures only.
// All non-local requests are intercepted; never sends fixtures to any live service.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(p!==root && !p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const file=p===root?path.join(root,'index.html'):p;
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const browser=await chromium.launch({headless:true});let passed=0;
 try{
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[],calls=[],chargeBodies=[];let chargeCalls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
  await page.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url());
   if(u.hostname==='127.0.0.1' && u.port===String(port))return route.continue();
   if(u.hostname==='127.0.0.1' && u.port==='17321')return route.fulfill({json:{ok:true,status:'READY',printer:'DOMUS_TICKETS',queued:true}});
   if(u.hostname!=='script.google.com')return route.abort();
   const body=request.postDataJSON()||{},action=body.action||u.searchParams.get('action');calls.push(action);
   let data;
   if(action==='authCrearSesion')data={token:'FIXTURE-ONLY-'+body.role,role:body.role};
   else if(action==='health')data={environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'};
   else if(action==='cajaSimpleDatos')data={phase:'Solar',products:[{name:'QA drink',group:'Bebidas',price:40,priceSolar:40,priceLunar:50,sku:'QA-01',destination:'Barra',provider:'DOMUS'}],accounts:[],activities:['QA event'],staff:['QA'],canCourtesy:false};
   else if(action==='comandasSimpleDatos')data={orders:[],history:[],requests:[],team:['QA'],version:'fixture'};
   else if(action==='accesoSimpleDatos')data={activeActivity:'QA event',activities:[{name:'QA event',date:'2026-10-30',status:'Confirmado',type:'Fiesta',priceGeneral:100,pricePareja:180,priceTrio:250,priceGuardarropa:20,ticketTypes:[{id:'General',name:'General',price:100,persons:1}]}],recentAccess:[],metrics:{totalAttendance:0}};
   else if(action==='cajaSimpleRegistrar'){
    chargeCalls++;chargeBodies.push(body);await new Promise(r=>setTimeout(r,100));const p=body.args[0];
    data={ticket:'FIXTURE-ACCOUNT',receipt:'FIXTURE-RECEIPT',paid:p.method!=='Transferencia',verified:p.method!=='Transferencia',method:p.method,paymentStatus:p.method==='Transferencia'?'PENDIENTE_VERIFICACION':'CONFIRMADA',total:40,customer:'QA',items:[{name:'QA drink',price:40,qty:1}],received:100,tip:0,change:60};
   }else data={ok:true,message:'Fixture response'};
   return route.fulfill({json:{ok:true,data}});
  });
  await page.goto('http://127.0.0.1:'+port+'/?env=staging&vista=caja');
  try {await page.waitForFunction(()=>document.body.textContent.includes('QA drink'));}
  catch(err){console.error('Browser boot diagnostic',{errors,calls,body:(await page.locator('body').innerText()).slice(0,3000)});throw err;}
  assert.deepEqual(errors,[]);passed++;console.log('PASS browser boot + catalog',viewport.width);
  await page.locator('#catalogSearchInput').fill('QA drink');
  const card=page.locator('.product-card').first();await card.click();
  await page.locator('#customerNameInput').fill('QA');await page.locator('#btnOpenPaymentModal').click();
  await page.locator('#cashReceivedInput').fill('100');
  await page.locator('#btnConfirmChargeAndSend').evaluate(el=>{el.click();el.click();});
  await page.waitForFunction(()=>document.querySelector('#receiptModal').classList.contains('open'));
  assert.equal(chargeCalls,1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').length),0);
  assert.deepEqual(errors,[]);passed++;console.log('PASS real UI double click, receipt, cleared Outbox',viewport.width);
  await page.locator('#btnCloseReceipt').click();
  for(const view of ['comandas','accesos']){
    await page.goto('http://127.0.0.1:'+port+'/?env=staging&vista='+view);
    await page.waitForTimeout(250);assert.deepEqual(errors,[]);passed++;console.log('PASS browser route',view,viewport.width);
  }
  // A browser closed during background synchronization must retry the SAME intent.
  const recoveryId='FIXTURE-RECOVERY-'+viewport.width;
  const recoveryPayload={...chargeBodies[0].args[0],id:recoveryId,requestId:recoveryId};
  await page.evaluate(({recoveryId,recoveryPayload})=>{
   localStorage.setItem('domus_outbox',JSON.stringify([{requestId:recoveryId,action:'cajaSimpleRegistrar',args:[recoveryPayload],role:'CAJA',deviceId:'fixture-device',operatorId:'QA',status:'SYNCING',lastAttempt:new Date(Date.now()-100000).toISOString()}]));
  },{recoveryId,recoveryPayload});
  await page.reload();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('domus_outbox')||'[]').length===0);
  assert.equal(chargeCalls,2);assert.equal(chargeBodies[1].requestId,recoveryId);
  assert.deepEqual(chargeBodies[1].args[0],recoveryPayload);assert.deepEqual(errors,[]);
  passed++;console.log('PASS browser reload recovers interrupted synchronization with original ID/payload',viewport.width);
  await context.close();
 }
 console.log(JSON.stringify({suite:'real-chromium-local-fixtures',passed,liveBackend:false,hardware:false,productionWrites:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
