import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
for(const name of ['../js/app.js','../google-apps-script/Index.html']) {
 const src=await fs.readFile(new URL(name,import.meta.url),'utf8');
 const a=src.indexOf('  function renderAccessChannels()'),b=src.indexOf('\n  function setAccessSalesChannel',a);
 const state={};let event={name:'Forza · sábado',salesChannel:'BOLETERA_EXTERNA'};
 const ctx=vm.createContext({STATE:state,$:()=>({querySelectorAll:()=>[]}),getActiveEvent:()=>event});
 vm.runInContext(src.slice(a,b),ctx);
 const render=()=>vm.runInContext('renderAccessChannels()',ctx);
 render();assert.equal(state.accessSalesChannel,'BOLETERA_EXTERNA');
 event={name:'DARMIINIGHT Costume Party'};render();assert.equal(state.accessSalesChannel,'TAQUILLA_DOMUS');
 state.accessSalesChannel='PREVENTA_DOMUS';render();assert.equal(state.accessSalesChannel,'PREVENTA_DOMUS');
 state.accessSelectedType='PREV_F1_PAREJA';event={name:'Horror After Rave'};render();assert.equal(state.accessSalesChannel,'TAQUILLA_DOMUS');assert.equal(state.accessSelectedType,'General');
}
console.log('PASS channel follows resolved event, preserves same-event manual choice and resets ticket type.');
