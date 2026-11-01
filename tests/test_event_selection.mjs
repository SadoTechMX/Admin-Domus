import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = await fs.readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../google-apps-script/Index.html', import.meta.url), 'utf8');
new vm.Script(src);
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
const calls=[], notices=[], saved={};
const selector={value:'', disabled:false, innerHTML:''};
const STATE={activeActivity:'previous',eventChangePending:false,eventChangeRevision:0,eventsList:['Gallery','Party','After'].map(name=>({name})),activities:['Gallery','Party','After'],openAccounts:[],selectedAccountTicket:''};
const ctx=vm.createContext({STATE,toast:(...x)=>notices.push(x),localStorage:{getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v},callBackend:(...x)=>calls.push(x),getActiveEvent:()=>STATE.eventsList.find(e=>e.name===STATE.activeActivity),renderAccesosView:()=>{},console:{warn:()=>{}},$:()=>selector,escapeHtml:x=>x});
function load(name,end){const a=src.indexOf('  function '+name+'('),b=src.indexOf(end,a);assert(a>=0&&b>a);vm.runInContext(src.slice(a,b),ctx);}
load('changeActiveEvent','\n  function returnWardrobeItems');
load('renderActivityDropdown','\n  // --- CARRITO');
for(const project of STATE.activities){
 STATE.activeActivity='previous';vm.runInContext(`changeActiveEvent(${JSON.stringify(project)})`,ctx);
 assert.equal(STATE.activeActivity,'previous');assert.equal(STATE.eventChangePending,true);
 const count=calls.length;vm.runInContext(`changeActiveEvent(${JSON.stringify(project)})`,ctx);assert.equal(calls.length,count);
 calls.at(-1)[2]({ok:true,activeActivity:project});assert.equal(saved.domus_active_event,project);
 STATE.activity=project;for(let i=0;i<4;i++)vm.runInContext('renderActivityDropdown()',ctx);assert.equal(selector.value,project);
}
const previous=STATE.activeActivity;
vm.runInContext("changeActiveEvent('Gallery')",ctx);calls.at(-1)[2]({ok:true,localOutbox:true});assert.equal(STATE.activeActivity,previous);assert.equal(STATE.eventChangePending,false);
vm.runInContext("changeActiveEvent('Gallery')",ctx);calls.at(-1)[3](new Error('offline'));assert.equal(STATE.activeActivity,previous);
const a=src.indexOf('        if (STATE.eventChangePending || eventReadRevision'),b=src.indexOf('        if (data.recentAccess)',a);
const poll=vm.runInContext('(function(data,eventReadRevision){'+src.slice(a,b)+'})',ctx);
STATE.eventChangePending=true;poll({activeActivity:'old'},STATE.eventChangeRevision);assert.equal(STATE.activeActivity,previous);
STATE.eventChangePending=false;poll({activeActivity:'old'},STATE.eventChangeRevision-1);assert.equal(STATE.activeActivity,previous);
const count=calls.length;poll({activeActivity:'Party'},STATE.eventChangeRevision);assert.equal(calls.length,count);assert.equal(STATE.activeActivity,'Party');
STATE.openAccounts=[{ticket:'historical',activity:'Previous event'}];STATE.selectedAccountTicket='historical';vm.runInContext('renderActivityDropdown()',ctx);assert.equal(selector.value,'Previous event');assert.equal(selector.disabled,true);
load('confirmAccessAndRegister','\n  function setAccessTab');STATE.eventChangePending=true;vm.runInContext('confirmAccessAndRegister()',ctx);assert(notices.at(-1)[0].includes('Espera'));
console.log('PASS: syntax; 3 projects; ACK; duplicate; offline; stale/pending polling; account attribution; pending access guard.');
