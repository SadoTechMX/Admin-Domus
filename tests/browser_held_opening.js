'use strict';
// Full native Index review boot + actual backend fixtures, no Google/real IDs.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {fixture}=require('./history_boundary_regressions'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{for(const variant of ['new','existing','malformed','lost','wrong-target','auth-denied']){
  const b=fixture(0,0);b.activate();const context=await browser.newContext({acceptDownloads:true}),calls=[],errors=[],network=[];
  const item={clientContract:'domus-outbox-v2',action:'turnoAbrir',requestId:'SYNTHETIC-browser-held',args:[{id:'SYNTHETIC-browser-held',requestId:'SYNTHETIC-browser-held',scopeId:'A',openingFloat:0,historyBoundaryId:'boundary'}],role:'CAJA',deviceId:'fixture-device',operatorId:'Fixture',status:'RETRY',errorStatus:500,errorCode:'SERVER_ERROR',lastError:'Synthetic contention',attempts:1};
  if(variant==='existing')b.request('turnoAbrir',item.args,item.requestId);
  await context.exposeBinding('__fixtureDispatch',async(_,p)=>{
   calls.push(p);assert(['health','authCrearSesion','turnoAbrir'].includes(p.action));const r=b.ctx.dispatchNativeAction(p);
   if(p.action==='health'){r.data.build={sourceSha256:require('../release-manifest.json').build.sourceSha256};if(variant==='wrong-target')r.data.environment='PRODUCTION';}
   if(p.action==='authCrearSesion'&&variant==='auth-denied')return {ok:false,error:'Denied'};
   if(p.action==='turnoAbrir'&&variant==='malformed')return {ok:true,requestId:p.requestId,data:{}};
   if(p.action==='turnoAbrir'&&variant==='lost')throw Error('Synthetic lost reply');return r;
  });
  await context.addInitScript(item=>{
   if(!localStorage.getItem('synthetic-seeded')){localStorage.setItem('domus_outbox',JSON.stringify([item],null,2));localStorage.setItem('domus_device_id',item.deviceId);localStorage.setItem('synthetic-seeded','yes');}
   window.DOMUS_NATIVE_BOOT={environment:'STAGING',view:'caja',queueReview:true};
   window.google={script:{run:{withSuccessHandler:ok=>({withFailureHandler:bad=>({dispatchNativeAction:p=>window.__fixtureDispatch(p).then(ok,bad)})})}}};
  },item);
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();if(r.request().url()==='https://sadotechmx.github.io/Admin-Domus/assets/LOGO%20DOMUS-01.png')return r.fulfill({path:path.join(root,'assets/LOGO DOMUS-01.png')});network.push(r.request().url());return r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const ready=p=>p.waitForFunction(()=>document.getElementById('queueReviewStatus')?.textContent.startsWith('Revisión persistida.'));
  await page.goto(origin+'/google-apps-script/Index.html');await ready(page);assert.deepEqual(calls,[]);assert.equal(await page.locator('#queueJourneyRecovery').isVisible(),true);assert.equal(await page.locator('#queueReviewRelease').isDisabled(),true);
  const original=await page.evaluate(()=>Object.fromEntries(['domus_outbox','domus_outbox_review_hold_v1','domus_outbox_review_initial_v1','domus_outbox_review_settled_v1'].map(k=>[k,localStorage.getItem(k)])));
  await page.locator('#queueJourneyRecover').click();assert.deepEqual(calls,[]);await page.locator('#queueJourneyReference').fill('Synthetic audit reference');await page.locator('#queueJourneyAttested').check();
  page.once('dialog',d=>d.dismiss());await page.locator('#queueJourneyRecover').click();assert.deepEqual(calls,[]);
  const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(origin+'/google-apps-script/Index.html');await ready(second);assert.deepEqual(calls,[]);
  page.once('dialog',async d=>{assert(d.message().includes(item.requestId));assert(d.message().includes('$0'));await d.accept();});await page.locator('#queueJourneyRecover').click();
  if(['wrong-target','auth-denied'].includes(variant)){
   await page.waitForFunction(()=>/no coinciden|no autorizó CAJA/.test(document.getElementById('queueReviewStatus').textContent));assert(!calls.some(p=>p.action==='turnoAbrir'));
  }else{
   await page.waitForFunction(()=>/Apertura confirmada|Apertura sin confirmar/.test(document.getElementById('queueReviewStatus').textContent));
   assert.deepEqual(await page.evaluate(()=>Object.fromEntries(['domus_outbox','domus_outbox_review_hold_v1','domus_outbox_review_initial_v1','domus_outbox_review_settled_v1'].map(k=>[k,localStorage.getItem(k)]))),original);
   assert.equal(calls.filter(p=>p.action==='turnoAbrir').length,1);assert.deepEqual(calls.find(p=>p.action==='turnoAbrir').args,item.args);
   await second.reload();await ready(second);assert.equal(await second.locator('#queueJourneyRecover').isDisabled(),true);
   await page.reload();await ready(page);await page.evaluate(()=>window.dispatchEvent(new Event('online')));assert.equal(calls.length,3);
   const download=page.waitForEvent('download');await page.locator('#queueReviewDownload').click();const json=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
   assert.equal(json.initialRaw,original.domus_outbox_review_initial_v1);assert(!JSON.stringify(json).includes(calls[2].sessionToken));
   if(['new','existing'].includes(variant)){
    assert.equal(await page.locator('#queueReviewRelease').isDisabled(),false);await page.locator('#queueReviewRelease').click();await page.waitForFunction(()=>document.getElementById('queueReviewStatus').textContent.startsWith('Revisión cerrada'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('domus_outbox')),'[]');assert.equal(await page.evaluate(()=>localStorage.getItem('domus_outbox_review_hold_v1')),null);assert.equal(await page.locator('#queueReviewContinue a').count(),1);
    // The other held page cannot send even though it still displays old controls.
    assert.equal(await second.locator('#queueJourneyRecover').isDisabled(),true);
   }else{assert.equal(await page.locator('#queueReviewRelease').isDisabled(),true);assert.equal(await page.locator('#queueJourneyRecover').isDisabled(),true);}
  }
  assert.equal(b.main.getSheetByName('COBROS').getLastRow(),6);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();passed++;console.log('PASS native held opening '+variant+'; no boot polling, normal app, secrets, sales or automatic replay');
 }
 console.log(JSON.stringify({suite:'browser-held-opening',passed,liveGoogle:false,realIds:false,productionWrites:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

