'use strict';
// Two real Chromium tabs, shared localStorage and real Web Locks; fixture transport only.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const exposed=source.slice(0,source.lastIndexOf('})();'))+`
window.__review={getOutbox,STATE,call:(id)=>new Promise((resolve,reject)=>callBackend('cajaSimpleRegistrar',[{id,items:[{sku:'QA',qty:1}]}],resolve,reject))};
})();`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(pathname==='/js/app.js'?exposed:fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 try {
  const context=await browser.newContext(),pending=new Map(),calls=[];
  await context.addInitScript(()=>{localStorage.setItem('domus_caja_authorized','true');sessionStorage.setItem('domus_operator','QA');});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
   if(u.hostname!=='script.google.com')return route.abort();
   const body=req.postDataJSON()||{},action=body.action;
   let data={};
   if(action==='authCrearSesion')data={token:'FIXTURE-'+body.role};
   else if(action==='health')data={environment:'STAGING',mainSheetId:'114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg',opsSheetId:'1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'};
   else if(action==='cajaSimpleDatos')data={phase:'Solar',products:[],accounts:[],activities:['QA event'],staff:['QA']};
   else if(action==='cajaSimpleRegistrar'){
    calls.push(body.requestId);await new Promise(resolve=>pending.set(body.requestId,async json=>{await route.fulfill({json});resolve();}));return;
   }
   return route.fulfill({json:{ok:true,data}});
  });
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  await Promise.all(pages.map(p=>p.goto(`http://127.0.0.1:${port}/?env=staging&vista=caja`)));
  for(const p of pages){await p.waitForFunction(()=>window.__review&&window.__review.STATE.lastSyncTimestamp);await p.evaluate(()=>clearInterval(window.__review.STATE.pollTimer));}
  const [a,b]=pages;
  // Barrier forces both tabs to wait at the exact storage transaction boundary.
  await a.evaluate(()=>{window.barrier=navigator.locks.request('domus-outbox-store',()=>new Promise(resolve=>window.releaseBarrier=resolve));});
  await a.waitForFunction(()=>window.releaseBarrier);
  const first=a.evaluate(()=>window.__review.call('A')),second=b.evaluate(()=>window.__review.call('B'));
  await a.evaluate(()=>window.releaseBarrier());
  await a.waitForFunction(()=>window.__review.getOutbox().length===2);
  const waitForRequest=async id=>{for(let i=0;i<100&&!pending.has(id);i++)await new Promise(r=>setTimeout(r,10));assert(pending.has(id),id);};
  await waitForRequest('A');await waitForRequest('B');
  assert.deepEqual((await a.evaluate(()=>window.__review.getOutbox().map(q=>q.requestId))).sort(),['A','B']);
  await pending.get('A')({ok:true,data:{receipt:'ACK-A'}});await first;
  const third=a.evaluate(()=>window.__review.call('C'));await waitForRequest('C');
  await pending.get('B')({ok:false,status:503,code:'SERVER_ERROR',error:'Unavailable'});assert((await second).localOutbox);
  assert.deepEqual((await b.evaluate(()=>window.__review.getOutbox().map(q=>q.requestId))).sort(),['B','C']);
  await pending.get('C')({ok:true,data:{receipt:'ACK-C'}});await third;
  assert.deepEqual(await a.evaluate(()=>window.__review.getOutbox().map(q=>[q.requestId,q.status])),[['B','RETRY']]);
  assert.deepEqual(calls.sort(),['A','B','C']);
  await b.reload();await b.waitForFunction(()=>window.__review);
  const recovered=await b.evaluate(()=>({a:JSON.parse(localStorage.getItem('domus_confirmation_A')).data.receipt,c:JSON.parse(localStorage.getItem('domus_confirmation_C')).data.receipt,ids:window.__review.getOutbox().map(q=>q.requestId)}));
  assert.equal(recovered.a,'ACK-A');assert.equal(recovered.c,'ACK-C');assert.deepEqual(recovered.ids,['B']);
  // Reload may start a same-ID background recovery; resolve intercepted work before closing.
  if(pending.has('B'))await pending.get('B')({ok:false,status:503,code:'SERVER_ERROR',error:'Unavailable'}).catch(()=>{});
  console.log(JSON.stringify({suite:'real-chromium-two-tab-outbox',passed:1,assertions:'enqueue + ACK + failure + reload',liveBackend:false,hardware:false,productionWrites:0}));
  await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(err=>{console.error(err);server.close();process.exitCode=1;});
