'use strict';
// Real diagnostic/proposal code, synthetic dimensions only; no Google calls.
const assert=require('assert/strict');
const {fixture}=require('./staging_uncertain_retention_regressions');
const copy=v=>JSON.parse(JSON.stringify(v));
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function scaled(){
 const t=fixture('STAGING');
 for(let row=19;row<=326;row++){
  if(row>=131 && row<=139)continue;
  t.s.getRange(row,1,1,8).setValues([['SYNTHETIC-completed-'+row,'cajaSimpleRegistrar','a'.repeat(64),'synthetic-device','COMPLETED','2020-01-01T00:00:00.000Z','','{}']]);
 }
 t.ctx.journalSheet_(t.main).appendRow(['SYNTHETIC-completed-19','cajaSimpleRegistrar','COMPLETED','[]','{}','2020-01-01T00:00:00.000Z']);
 // Historical documented ranges, not a claim of current full sheet dimensions.
 for(const [name,row,col] of [['COBROS',4569,33],['CAJA 2',194,50],['COMANDAS',194,14]])t.main.getSheetByName(name).put(row,col,'=""');
 return t;
}
function measure(t){
 let counts={};const reset=()=>{counts={getValues:0,getFormulas:0,valueCells:0,formulaCells:0,metadata:0};};reset();
 for(const book of [t.main,t.ops])for(const s of book.sheets.values()){
  for(const method of ['getLastRow','getLastColumn','getName']){const f=s[method].bind(s);s[method]=(...args)=>{counts.metadata++;return f(...args);};}
  const get=s.getRange.bind(s);s.getRange=(...args)=>{const range=get(...args);
   for(const method of ['getValues','getFormulas']){const f=range[method].bind(range);range[method]=()=>{const v=f();counts[method]++;counts[method==='getValues'?'valueCells':'formulaCells']+=v.length*(v[0]?.length||0);return v;};}
   return range;
  };
 }
 return {reset,counts:()=>({...counts})};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
test('scaled diagnostic and approved proposal are byte-identical with and without the per-query view; reads are bounded',()=>{
 const t=scaled(),before=snapshot(t),original=t.ctx.historyReadView_,m=measure(t),uncached=s=>({book:s,assertDimensions(){}});
 t.ctx.historyReadView_=uncached;const old=t.propose(),baseline=m.counts();
 t.ctx.historyReadView_=original;m.reset();const result=t.propose(),optimized=m.counts();
 assert.equal(JSON.stringify(result),JSON.stringify(old));assert.equal(snapshot(t),before);
 assert(optimized.getValues+optimized.getFormulas<=40);assert(optimized.getValues+optimized.getFormulas<(baseline.getValues+baseline.getFormulas)/20);
 assert(optimized.valueCells<baseline.valueCells);assert(optimized.formulaCells<baseline.formulaCells);
 t.allowRetention();t.ctx.historyReadView_=uncached;const oldProposal=t.propose();t.ctx.historyReadView_=original;const proposal=t.propose();
 assert.equal(JSON.stringify(proposal),JSON.stringify(oldProposal));assert.equal(snapshot(t),before);
 console.log(JSON.stringify({measurement:'synthetic-scaled-service-reads',baseline,optimized,hashesEqual:true,realLatencyMeasured:false}));
});
test('range copies preserve dates, blank formulas and identities without letting a reader mutate captured evidence',()=>{
 const t=fixture('STAGING'),date=new Date('2020-01-01T06:00:00.000Z');
 t.main.getSheetByName('TURNOS').put(2,3,date);t.main.getSheetByName('COBROS').put(22,33,'=""');
 const read=t.ctx.historyReadView_(t.main),turnos=read.book.getSheetByName('TURNOS'),range=turnos.getRange(2,3);
 const values=range.getValues();assert.equal(values[0][0].getTime(),date.getTime());values[0][0].setTime(0);values.push(['changed']);
 assert.equal(range.getValues()[0][0].getTime(),date.getTime());assert.equal(date.getTime(),Date.parse('2020-01-01T06:00:00.000Z'));
 const r=read.book.getSheetByName('COBROS').getRange(22,33);assert.equal(r.getValues()[0][0],'');const f=r.getFormulas();f[0][0]='CHANGED';assert.equal(r.getFormulas()[0][0],'=""');
 assert.equal(typeof range.setValue,'undefined');assert.equal(typeof turnos.insertRowsAfter,'undefined');assert.equal(typeof read.book.insertSheet,'undefined');read.assertDimensions();
});
for(const change of ['response','formula','added-row','missing-sheet'])test('a later query creates a fresh view and cannot reuse stale evidence: '+change,()=>{
 const t=fixture('STAGING');
 if(change==='formula')t.main.getSheetByName('COBROS').put(20,33,'=""');
 const first=t.propose();
 if(change==='response')t.s.put(2,8,'{"error":"changed"}');
 if(change==='formula')t.main.getSheetByName('COBROS').put(20,33,'=IF(TRUE,"","")');
 if(change==='added-row')t.s.appendRow(['SYNTHETIC-extra','cajaSimpleRegistrar','a'.repeat(64),'synthetic','COMPLETED','','','{}']);
 if(change==='missing-sheet')t.main.sheets.delete('ACCESO');
 const before=snapshot(t);
 if(change==='missing-sheet')assert.throws(t.propose);else assert.notEqual(t.propose().evidenceHash,first.evidenceHash);
 assert.equal(snapshot(t),before);
});
for(const change of ['new-row','new-column','new-sheet','deleted-sheet'])test('dimensions changing during a query prevent a diagnosis/proposal: '+change,()=>{
 const t=fixture('STAGING'),original=t.ctx.historySnapshot_;let after;
 t.ctx.historySnapshot_=(...args)=>{
  const result=original(...args);
  if(change==='new-row')t.s.appendRow(['SYNTHETIC-concurrent','cajaSimpleRegistrar','a'.repeat(64),'synthetic','COMPLETED','','','{}']);
  if(change==='new-column')t.main.getSheetByName('COBROS').put(6,80,'SYNTHETIC EXTRA');
  if(change==='new-sheet')t.main.insertSheet('AJUSTES_Z').put(1,1,'SYNTHETIC EXTRA');
  if(change==='deleted-sheet')t.main.sheets.delete('ACCESO');
  after=snapshot(t);return result;
 };
 assert.throws(t.propose,/dimensiones/);assert.equal(snapshot(t),after);assert.equal(t.props.has('DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1'),false);
});
for(const change of ['journal-orphan','reserved-id','formula-id','unicode-reference'])test('read optimization preserves rejection of corrupt or linked evidence: '+change,()=>{
 const t=fixture('STAGING');
 if(change==='journal-orphan')t.ctx.journalSheet_(t.main).appendRow(['SYNTHETIC-orphan#part:0','JOURNAL_PART','COMPLETED','[]','','']);
 if(change==='reserved-id')t.s.put(2,1,'SYNTHETIC#part:0');
 if(change==='formula-id')t.s.put(2,1,'="synthetic"');
 if(change==='unicode-reference')t.main.getSheetByName('COBROS').put(19,1,'  {"id":"fixture-opening-\\u0030"}');
 const before=snapshot(t);assert.throws(t.propose);assert.equal(snapshot(t),before);
});
test('registration never uses the cached read view and still rejects changed source evidence',()=>{
 const t=fixture('STAGING');t.allowRetention();const body=t.approveBoundary();t.s.put(2,8,'{"error":"changed after approval"}');
 t.ctx.historyReadView_=()=>assert.fail('REGISTRATION_MUST_NOT_USE_QUERY_VIEW');
 const original=t.s.getRange(1,1,139,8).getValues();assert.throws(()=>t.call('registrarLimiteHistorico',body,'SYNTHETIC-stale-registration'));
 assert.deepEqual(t.s.getRange(1,1,139,8).getValues(),original);assert.equal(t.ctx.journalFind_('SYNTHETIC-stale-registration',t.main),null);
});
test('exceptions discard the view; a later diagnostic reads the current journal again',()=>{
 const t=fixture('STAGING'),j=t.ctx.journalSheet_(t.main);j.appendRow(['SYNTHETIC-incomplete','cajaSimpleRegistrar','PREPARED','[]','{}','']);assert.throws(t.propose);
 j.getRange(2,1,1,6).setValues([Array(6).fill('')]); // Synthetic repair only, never a proposed operation on real records.
 assert.equal(t.propose().kind,'STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1');
});
console.log(JSON.stringify({suite:'history-read-view',passed,syntheticOnly:true,liveGoogle:false,realLatencyMeasured:false,realQueriesRepeated:0}));
