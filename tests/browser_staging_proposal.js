'use strict';
// Actual generated Index + V13 backend modules in Chromium; no real Google.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {fixture}=require('./staging_opening_isolation_regressions'),root=path.resolve(__dirname,'..');
const copy=v=>JSON.parse(JSON.stringify(v));
const snapshot=b=>JSON.stringify([b.main,b.ops].map(book=>[book.id,[...book.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])]));
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let passed=0;
 try{
  async function pageFixture(options={}){
   const b=fixture('STAGING');if(options.denied)b.ctx.Session.getActiveUser=()=>({getEmail:()=> 'unprivileged@example.invalid'});
   const before=snapshot(b),props=new Map(b.props),calls=[],errors=[];let printCalls=0;
   // A query must never enter a financial write, replay, binding or row growth.
   const denied=()=>assert.fail('QUERY_ATTEMPTED_WRITE_OR_REPLAY');
   for(const book of [b.main,b.ops]){book.insertSheet=denied;for(const s of book.sheets.values()){s.put=denied;s.insertRowsAfter=denied;}}
   for(const name of ['idempotentExecute_','saveRequestRecord_','journalCommit_','journalResume_'])b.ctx[name]=denied;
   const context=await browser.newContext({viewport:{width:1200,height:1100},acceptDownloads:true}),page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   const t={b,context,page,calls,errors,before,props,respond:options.respond,block:null,release:null};
   await context.exposeFunction('__fixtureDispatch',async p=>{
    assert(['health','authCrearSesion','prepararLimiteHistorico'].includes(p.action),'Unexpected action '+p.action);assert.equal(p.role,'GERENCIA');calls.push(copy(p));
    let r=copy(b.ctx.dispatchNativeAction(copy(p)));if(t.respond)r=await t.respond(p,r);
    if(t.block && p.action==='prepararLimiteHistorico')await t.block;
    return r;
   });
   await context.addInitScript(opts=>{
    localStorage.setItem('domus_device_id','fixture-device');localStorage.setItem('unrelated-evidence','keep');
    sessionStorage.setItem('domus_session_token_CAJA','fixture-cashier-token');
    if(opts.queue!==undefined)localStorage.setItem('domus_outbox',opts.queue);
    if(opts.pending)localStorage.setItem('domus_pending_sale','{"id":"fixture-orphan"}');
    if(opts.hold)localStorage.setItem('domus_outbox_review_hold_v1','{"state":"REQUIRES_REVIEW"}');
    if(opts.native!==false){
     window.DOMUS_NATIVE_BOOT={environment:opts.environment||'STAGING',view:'propuesta-inicio'};
     window.google={script:{run:{withSuccessHandler:success=>({withFailureHandler:failure=>({dispatchNativeAction:p=>window.__fixtureDispatch(p).then(success,failure)})})}}};
    }
   },options);
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
    if(u.hostname==='127.0.0.1'&&u.port==='17321')printCalls++;
    return route.abort(); // No REST fallback, Google, fonts, printing or external network.
   });
   await page.goto(origin+'/google-apps-script/Index.html?env=staging&vista=propuesta-inicio');
   await page.locator('#proposalSubmit').waitFor();
   t.storage=await page.evaluate(()=>JSON.stringify({...localStorage}));
   t.fill=async()=>{
    await page.locator('#proposalBackupReference').fill('PRIVATE MOCK archive');await page.locator('#proposalBackupHash').fill('b'.repeat(64));
    await page.locator('#proposalEvidence').fill('PRIVATE MOCK inventory');await page.locator('#proposalStations').fill('fixture-device\nTEST-DEV-PHASE1');
    await page.locator('#proposalQueue').fill('[]');await page.locator('#proposalScopeReviewed').check();
   };
   t.submit=()=>page.locator('#proposalSubmit').click();
   t.check=async()=>{
    assert.equal(snapshot(b),before);assert.deepEqual(errors,[]);assert.equal(printCalls,0);
    assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),t.storage);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('domus_session_token_CAJA')),'fixture-cashier-token');
    for(const [k,v] of props)assert.equal(b.props.get(k),v,'original property '+k);
    assert([...b.props.keys()].filter(k=>!props.has(k)).every(k=>k.startsWith('ses:')),'only normal auth sessions may be added');
    assert.equal(await page.evaluate(()=>Object.keys(window.__domusApp).length),0);
   };
   return t;
  }
  {
   const t=await pageFixture(),p=t.page;await p.waitForTimeout(150);assert.equal(t.calls.length,0);
   await p.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new StorageEvent('storage',{key:'domus_outbox'}));});
   await p.waitForTimeout(50);assert.equal(t.calls.length,0);await t.fill();await t.submit();
   await p.waitForFunction(()=>!document.getElementById('proposalDownload').disabled);
   assert.deepEqual(t.calls.map(c=>c.action),['health','authCrearSesion','prepararLimiteHistorico']);
   assert.equal(t.calls[1].args[3],'');assert.equal(await p.locator('input[type=password]').count(),0);
   assert((await p.locator('#proposalSummary').innerText()).includes('IDs históricos: 9'));
   const downloadPromise=p.waitForEvent('download');await p.locator('#proposalDownload').click();const dl=await downloadPromise;
   const raw=fs.readFileSync(await dl.path(),'utf8'),d=JSON.parse(raw);
   assert.equal(d.proposal.kind,'STAGING_FRESH_START_PROPOSAL');assert.equal(d.proposal.canActivate,false);assert.equal(d.proposal.snapshotHash,t.b.ctx.historyHash_(d.proposal.snapshot));
   assert(!/sessionToken|fixture-secret|fixture-cashier-token|DOMUS_STAGING_FRESH_START_APPROVAL_V1/.test(raw));
   const tokens=await p.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.includes('token')).map(([,v])=>v));for(const token of tokens)assert(!raw.includes(token));
   await t.check();passed++;console.log('PASS native generated UI: explicit normal Gerencia login, real read-only proposal, validated hash and secret-free private download');
   const validate=t.b.ctx.authValidateAction;let expired=false;
   t.b.ctx.authValidateAction=(action,...args)=>{if(action==='prepararLimiteHistorico'&&!expired){expired=true;throw Error('Sesión inválida o expirada');}return validate(action,...args);};
   await t.submit();await p.waitForFunction(()=>!document.getElementById('proposalDownload').disabled);
   assert.equal(t.calls.filter(c=>c.action==='authCrearSesion').length,2);assert(expired);await t.check();passed++;console.log('PASS expired Gerencia renews once without changing cashier session or producing a financial request');
   const count=t.calls.length;await p.reload();await p.locator('#proposalSubmit').waitFor();await p.waitForTimeout(100);
   assert.equal(t.calls.length,count);assert.equal(await p.locator('#proposalDownload').isDisabled(),true);assert.equal(await p.locator('#proposalBackupHash').inputValue(),'');
   await t.check();passed++;console.log('PASS reload/online do not query, migrate, replay, cache proposal or print');await t.context.close();
  }
  for(const options of [{environment:'PRODUCTION'},{native:false},{queue:'[{"clientContract":"domus-outbox-v2","requestId":"prior","status":"RETRY"}]'},{queue:'broken-json'},{pending:true},{hold:true}]){
   const t=await pageFixture(options);assert.equal(await t.page.locator('#proposalSubmit').isDisabled(),true);assert.equal(t.calls.length,0);await t.check();
   passed++;console.log('PASS non-staging/non-native/pending profile blocked with zero traffic and original storage intact');await t.context.close();
  }
  for(const change of [p=>p.locator('#proposalBackupHash').fill('bad'),p=>p.locator('#proposalQueue').fill('[{"requestId":"x","action":"cajaSimpleRegistrar","sessionToken":"DO_NOT_ACCEPT"}]'),p=>p.locator('#proposalScopeReviewed').uncheck()]){
   const t=await pageFixture();await t.fill();await change(t.page);await t.submit();await t.page.waitForTimeout(75);assert.equal(t.calls.length,0);assert.equal(await t.page.locator('#proposalDownload').isDisabled(),true);await t.check();
   passed++;console.log('PASS incomplete/unsafe input rejected before authentication or query');await t.context.close();
  }
  {
   const t=await pageFixture({denied:true});await t.fill();await t.submit();await t.page.waitForFunction(()=>document.getElementById('proposalStatus').textContent.includes('Google no autorizó'));
   assert.deepEqual(t.calls.map(c=>c.action),['health','authCrearSesion']);assert.equal(await t.page.locator('input[type=password]').count(),0);assert.equal(await t.page.locator('#proposalDownload').isDisabled(),true);
   await t.check();passed++;console.log('PASS unauthorized principal denied; no credential prompt, role widening, proposal or writes');await t.context.close();
  }
  for(const kind of ['health-build','health-book','empty','hash','different-backup','activatable']){
   const t=await pageFixture({respond:(p,r)=>{
    if(p.action==='health'&&kind==='health-build')r.data.build.sourceSha256='c'.repeat(64);
    if(p.action==='health'&&kind==='health-book')r.data.mainSheetId='OTHER';
    if(p.action==='prepararLimiteHistorico'){
     if(kind==='empty')r.data={};if(kind==='hash')r.data.snapshotHash='c'.repeat(64);if(kind==='different-backup')r.data.snapshot.freshStart.backup.reference='OTHER';if(kind==='activatable')r.data.canActivate=true;
    }return r;
   }});await t.fill();await t.submit();await t.page.waitForFunction(()=>!document.getElementById('proposalSubmit').disabled);
   assert.equal(await t.page.locator('#proposalDownload').isDisabled(),true);if(kind.startsWith('health')){
    assert.equal(t.calls.length,1);assert((await t.page.locator('#proposalStatus').innerText()).includes('Identidad de backend incompatible'));
   }
   await t.check();passed++;console.log('PASS incompatible health or incomplete/tampered proposal cannot be downloaded: '+kind);await t.context.close();
  }
  for(const change of ['form','queue','none']){
   const t=await pageFixture();t.block=new Promise(resolve=>t.release=resolve);await t.fill();await t.submit();
   await t.page.waitForFunction(()=>document.getElementById('proposalSubmit').disabled);
   for(let n=0;n<200&&!t.calls.some(p=>p.action==='prepararLimiteHistorico');n++)await new Promise(r=>setTimeout(r,10));
   assert(t.calls.some(p=>p.action==='prepararLimiteHistorico'),'read must reach the mocked backend');
   await t.page.locator('#proposalForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   if(change==='form')await t.page.locator('#proposalEvidence').fill('Changed during request');
   if(change==='queue'){
    await t.page.evaluate(()=>{localStorage.setItem('domus_outbox','[{"requestId":"arrived","clientContract":"domus-outbox-v2","status":"RETRY"}]');window.dispatchEvent(new Event('online'));});
    t.storage=await t.page.evaluate(()=>JSON.stringify({...localStorage}));
   }
   t.release();await t.page.waitForFunction(()=>!document.getElementById('proposalSubmit').disabled);
   assert.equal(t.calls.filter(c=>c.action==='prepararLimiteHistorico').length,1);
   assert.equal(await t.page.locator('#proposalDownload').isDisabled(),change!=='none');await t.check();passed++;
   console.log('PASS double submit is one read; concurrent form/queue changes prevent stale export: '+change);await t.context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({suite:'browser-staging-proposal-real-source',passed,liveGoogle:false,financialWrites:0,realActivation:false,secretsExported:false}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
