'use strict';
// Actual source/dispatcher; synthetic retained history only, no remote services.
const assert=require('assert/strict'),{fixture}=require('./staging_uncertain_retention_regressions');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const snapshot=t=>JSON.stringify([t.main,t.ops].map(b=>[...b.sheets].map(([n,s])=>[n,[...s.cells],[...s.rules]])));
function setup(env){
 const t=fixture(env);
 for(let r=19;r<=326;r++)if(r<131||r>139)t.s.getRange(r,1,1,8).setValues([['SYNTHETIC-old-'+r,'cajaSimpleRegistrar','a'.repeat(64),'synthetic','COMPLETED','2020-01-01T00:00:00.000Z','','{}']]);
 for(const [n,r,c]of [['COBROS',4569,33],['CAJA 2',194,50],['COMANDAS',194,14]])t.main.getSheetByName(n).put(r,c,'=""');
 t.allowRetention();t.boundary=t.activate();return t;
}
function meter(t){
 let n=0;for(const book of [t.main,t.ops])for(const sheet of book.sheets.values()){
  const get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const range=get(...args);for(const key of ['getValues','getFormulas']){const f=range[key].bind(range);range[key]=()=>{n++;return f();};}return range;};
 }return {get:()=>n,reset:()=>{n=0;}};
}
const normalize=data=>{const c=JSON.parse(JSON.stringify(data));if(c.operatingPeriod)delete c.operatingPeriod.checkedAt;delete c.at;return c;};
for(const env of [undefined,'STAGING'])for(const action of ['cajaSimpleDatos','turnoEstado','comandasSimpleDatos'])test((env||'modules')+' '+action+': activated boundary and retained evidence unchanged, bounded consistent reads',()=>{
 const t=setup(env),before=snapshot(t),m=meter(t),original=t.ctx.operationalRead_;
 t.ctx.operationalRead_=(read,ops,finish)=>{const d=read(t.main,ops?t.ops:null);return finish?finish(d,t.main):d;};
 const baseline=t.call(action),old=m.get();m.reset();t.ctx.operationalRead_=original;
 const result=t.call(action),count=m.get();assert.deepEqual(normalize(result),normalize(baseline));assert.equal(snapshot(t),before);
 assert(count<=64,'bounded read count '+count);assert(count<old/2,JSON.stringify({old,count}));
 if(result.journey)assert.equal(result.journey.historyReview.snapshotHash,t.boundary.snapshotHash);
 assert.equal(t.locks().acquires,t.locks().releases);
 console.log(JSON.stringify({action,environment:env||'modules',baselineServiceReads:old,consistentServiceReads:count,liveLatencyMeasured:false}));
});
for(const action of ['cajaSimpleDatos','turnoEstado','comandasSimpleDatos'])for(const variant of ['journal','request','formula','period'])test(action+' rejects same-dimension changes before response: '+variant,()=>{
 const t=setup(),original=t.ctx.historyReadView_;let injected=false,after;
 t.ctx.historyReadView_=source=>{const view=original(source),check=view.assertDimensions;view.assertDimensions=()=>{
  if(!injected){injected=true;
   if(variant==='journal')t.main.getSheetByName('DOMUS_JOURNAL').put(2,3,'PREPARED');
   if(variant==='request')t.s.put(2,5,'COMPLETED');
   if(variant==='formula')t.main.getSheetByName('COBROS').put(4569,33,'=IF(TRUE,"","")');
   if(variant==='period')t.main.getSheetByName('SEMANA').put(8,2,new Date('2020-01-01T06:00:00Z'));
   after=snapshot(t);
  }check();};return view;};
 // Only Caja consumes SEMANA; other reads do not depend on that sheet.
 if(variant==='period'&&action!=='cajaSimpleDatos')t.call(action);else assert.throws(()=>t.call(action),/evidencia cambió/);
 assert.equal(snapshot(t),after);assert.equal(t.locks().acquires,t.locks().releases);
});
test('invalid retained evidence is not accepted on a later query; orphan journal still blocks',()=>{
 const t=setup();t.call('cajaSimpleDatos');t.main.getSheetByName('DOMUS_JOURNAL').appendRow(['','','PREPARED','[]','','']);const before=snapshot(t);
 for(const action of ['cajaSimpleDatos','turnoEstado','comandasSimpleDatos'])assert.throws(()=>t.call(action));assert.equal(snapshot(t),before);
});
test('query evaluates SEMANA after final revalidation across Nov 10/11 CDMX; no backdating or cell writes',()=>{
 const t=setup(),s=t.main.getSheetByName('SEMANA');s.getRange('B7:B8').setValues([[new Date('2026-11-02T06:00:00Z')],[new Date('2026-11-10T06:00:00Z')]]);
 let now=Date.parse('2026-11-11T05:59:59Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}t.ctx.Date=Clock;
 // Native Date instances must stay recognizable in this VM.
 Object.defineProperty(Clock,Symbol.hasInstance,{value:v=>v instanceof Date});
 const original=t.ctx.historyReadView_;t.ctx.historyReadView_=book=>{const v=original(book),check=v.assertDimensions;v.assertDimensions=()=>{check();now=Date.parse('2026-11-11T06:00:00Z');};return v;};
 const before=snapshot(t),data=t.call('cajaSimpleDatos');assert.equal(data.operatingPeriod.today,'2026-11-11');assert.equal(data.operatingPeriod.allowed,false);assert(data.operatingPeriod.message.includes('2026-11-10'));assert.equal(snapshot(t),before);
});
test('consistent view handles scalar/A1 and numeric ranges with identical cells and rejects unsupported/reversed ranges',()=>{
 const t=fixture(),v=t.ctx.historyReadView_(t.main),s=v.book.getSheetByName('CAJA 2');assert.equal(s.getRange('F2').getValue(),s.getRange(2,6).getValues()[0][0]);
 for(const r of ['A0','A2:A1','B1:A1','SEMANA!B7','B:B','A1:','a1'])assert.throws(()=>s.getRange(r));v.assertDimensions();
});
if(process.env.DOMUS_TEST_LEGACY_BUNDLE)test('immutable V16 synthetic boundary remains valid after runtime upgrade without a new approval/snapshot',()=>{
 const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path'),t=fixture('STAGING');
 const legacy=fs.readFileSync(process.env.DOMUS_TEST_LEGACY_BUNDLE,'utf8');
 assert.equal(crypto.createHash('sha256').update(legacy).digest('hex'),'8ae96ee6cf60332cafbadbf902d2a4501bfe7d7d7dfe32e3ef26dc0ff5bbcf07');
 t.ctx=vm.createContext({...t.ctx});delete t.ctx.historyReadView_;vm.runInContext(legacy,t.ctx);
 t.allowRetention();const boundary=t.activate(),before=snapshot(t),props=JSON.stringify([...t.props]);
 t.ctx=vm.createContext({...t.ctx});vm.runInContext(fs.readFileSync(path.join(__dirname,'../google-apps-script/DOMUS_STAGING_BUNDLE.gs'),'utf8'),t.ctx);
 assert.equal(t.call('cajaSimpleDatos').journey.historyReview.snapshotHash,boundary.snapshotHash);
 assert.equal(t.call('turnoEstado').historyReview.snapshotHash,boundary.snapshotHash);t.call('comandasSimpleDatos');
 assert.equal(snapshot(t),before);assert.equal(JSON.stringify([...t.props]),props);
});
console.log(JSON.stringify({suite:'operational-consistent-reads',passed,liveGoogle:false,deployments:0,realOperations:0}));
