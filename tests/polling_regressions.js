'use strict';
const assert=require('assert/strict'),{setup,tick}=require('./reconciliation_regressions');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function fixture(){
 const t=setup(),pending=[],timers=new Map();let timer=0,now=0;
 Object.assign(t.ctx,{performance:{now:()=>now},document:{hidden:false},setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),
  renderJourney_(){},renderCatalog(){},updateKdsBadgeCount(){},renderComandasBoard(){}});
 t.ctx.$('cajaLockModal').classList.contains=()=>false;
 t.ctx.callBackend=(action,args,ok,fail)=>pending.push({action,ok,fail,role:t.ctx.getStationRole()});
 t.load('syncBackendData');t.load('startPolling');t.ctx.STATE.seenOrderKeys=new Set();
 return {...t,pending,timers,advance:n=>{now+=n;},fire:()=>{const e=[...timers.entries()][0];assert(e);timers.delete(e[0]);e[1].fn();}};
}
const period=(at='2026-11-11T05:59:59Z')=>({allowed:true,checkedAt:Date.parse(at),timeZone:'America/Mexico_City',today:'2026-11-10',start:'2026-11-02',end:'2026-11-10',message:'Synthetic period'});
(async()=>{
await test('manual/poll calls share one pending read; Caja then KDS, next timer only after completion',async()=>{
 const t=fixture(),p=t.ctx.syncBackendData();t.ctx.startPolling();await tick();
 for(let n=0;n<36;n++){t.advance(10000);assert.equal(t.ctx.syncBackendData(),p);t.ctx.startPolling();assert.equal(t.timers.size,0);}
 assert.deepEqual(t.pending.map(p=>p.action),['cajaSimpleDatos']);assert.equal(t.ctx.STATE.operatingPeriod.allowed,false);
 t.pending[0].ok({phase:'Solar',operatingPeriod:period()});await tick();assert.deepEqual(t.pending.map(p=>p.action),['cajaSimpleDatos','comandasSimpleDatos']);assert.equal(t.timers.size,0);
 t.pending[1].ok({orders:[]});await p;assert.equal(t.timers.size,1);assert.equal([...t.timers.values()][0].ms,10000);
 t.fire();await tick();assert.equal(t.pending.length,3);t.pending[2].fail(Error('synthetic failure'));await t.ctx.STATE.backendReadPromise;assert.equal(t.timers.size,0);
});
await test('failure stops automatic polling, shows cause, preserves cart/queue; explicit retry restarts reads only',async()=>{
 const t=fixture();t.ctx.STATE.cart=[{name:'QA',qty:1,price:40}];const before=JSON.stringify(t.ctx.STATE.cart);t.localStorage.setItem('sentinel','original');
 const p=t.ctx.syncBackendData();t.ctx.startPolling();await tick();t.pending[0].fail(Error('Synthetic timeout'));await p;
 assert.equal(t.ctx.STATE.pollFailed,true);assert.equal(t.timers.size,0);assert.equal(t.ctx.STATE.operatingPeriod.allowed,false);assert(t.ctx.$('cashPeriodStatus').textContent.includes('Synthetic timeout'));
 await t.ctx.confirmPaymentAndDispatch(true);assert.equal(t.pending.length,1);assert.equal(t.localStorage.getItem('domus_pending_sale'),null);assert.equal(JSON.stringify(t.ctx.STATE.cart),before);assert.equal(t.localStorage.getItem('sentinel'),'original');
 const retry=t.ctx.syncBackendData();await tick();t.pending[1].ok({phase:'Solar'});await tick();t.pending[2].ok({orders:[]});await retry;assert.equal(t.ctx.STATE.pollFailed,false);assert.equal(t.timers.size,1);assert.equal(t.ctx.STATE.operatingPeriod.allowed,false);
});
await test('late previous-mode response cannot update Caja or launch KDS with another role',async()=>{
 const t=fixture(),p=t.ctx.syncBackendData();await tick();t.ctx.STATE.mode='accesos';t.pending[0].ok({phase:'Lunar',journey:{active:{openingRequestId:'stale'}},operatingPeriod:period()});await p;
 assert.equal(t.pending.length,1);assert.equal(t.ctx.STATE.phase,undefined);assert.equal(t.ctx.STATE.journey,undefined);
});
await test('hidden tabs reschedule a timer without sending a query',async()=>{
 const t=fixture();t.ctx.document.hidden=true;t.ctx.startPolling();t.fire();assert.equal(t.pending.length,0);assert.equal(t.timers.size,1);
});
await test('Nov 10 to 11 CDMX invalidates a prior OPEN read before intent creation; local clock rollback cannot extend it',async()=>{
 const t=fixture();t.ctx.setCashPeriod_(period());assert.equal(t.ctx.cashPeriodAllowed_(),true);t.advance(1001);
 t.ctx.STATE.cart=[{name:'QA',qty:1,price:40}];await t.ctx.confirmPaymentAndDispatch(true);assert.equal(t.ctx.STATE.operatingPeriod.allowed,false);assert(t.ctx.$('cashPeriodStatus').textContent.includes('Cambió la fecha'));assert.equal(t.pending.length,0);assert.equal(t.localStorage.getItem('domus_pending_sale'),null);
});
await test('slow delivery across midnight and missing/invalid date contracts fail closed',()=>{
 const t=fixture();t.ctx.setCashPeriod_(period(),1001);assert.equal(t.ctx.cashPeriodAllowed_(),false);
 for(const p of [{allowed:true},{...period(),checkedAt:NaN},{...period(),timeZone:'INVALID'},{...period(),end:'2026-11-09'}]){t.ctx.setCashPeriod_(p);assert.equal(t.ctx.cashPeriodAllowed_(),false);}
});
console.log(JSON.stringify({suite:'polling-and-midnight-real-client',passed,realOperations:0,remoteCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
