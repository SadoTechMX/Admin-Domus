'use strict';
// Execute the actual Apps Script modules against an isolated in-memory spreadsheet service.
// No network, no production credentials, no simulated claim of deployed or hardware verification.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const root = require('path').resolve(__dirname, '..');
let passed = 0;
function test(name, f) { f(); passed++; console.log('PASS', name); }

class CellRange {
  constructor(s,r,c,h=1,w=1){Object.assign(this,{s,r,c,h,w});}
  getValues(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.s.value(this.r+i,this.c+j)));}
  getValue(){return this.getValues()[0][0];}
  getFormula(){const v=this.s.raw(this.r,this.c);return typeof v==='string'&&v[0]==='='?v:'';}
  getFormulas(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>new CellRange(this.s,this.r+i,this.c+j).getFormula()));}
  setValues(rows){rows.forEach((row,i)=>row.forEach((v,j)=>this.s.put(this.r+i,this.c+j,v)));return this;}
  setValue(v){this.s.put(this.r,this.c,v);return this;}
  setFontWeight(){return this;}
  getDataValidation(){return this.s.rules.get(this.r+':'+this.c)||null;}
  getDataValidations(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.s.rules.get((this.r+i)+':'+(this.c+j))||null));}
}
class Sheet {
  constructor(book,name){this.book=book;this.name=name;this.cells=new Map();this.rules=new Map();this.maxRows=6000;this.failAt=null;}
  getName(){return this.name;} getParent(){return this.book;} getMaxRows(){return this.maxRows;}
  insertRowsAfter(_,n){this.maxRows+=n;}
  raw(r,c){return this.cells.get(r+':'+c)??'';}
  put(r,c,v){if(this.failAt===r+':'+c){this.failAt=null;throw new Error('INJECTED_WRITE_FAILURE');}this.cells.set(r+':'+c,v);}
  value(r,c){
    const raw=this.raw(r,c);
    if(typeof raw!=='string'||raw[0]!=='=')return raw;
    if(this.name==='COBROS'){
      if(c===14)return this.raw(r,11)==='Confirmado'?Number(this.raw(r,6)):0;
      if(c===8)return Number(this.raw(r,6))-Number(this.raw(r,7));
      if(c===15)return this.value(r,14)>0?this.value(r,14)-Number(this.raw(r,7)):0;
    }
    if(this.name==='CAJA 2'&&c===12)return this.raw(r,16)==='Cancelado'||this.raw(r,9)==='Cortesía'?0:Number(this.raw(r,10))*Number(this.raw(r,8));
    return '';
  }
  getLastRow(){return Math.max(0,...Array.from(this.cells.keys(),k=>Number(k.split(':')[0])));}
  getLastColumn(){return Math.max(1,...Array.from(this.cells.keys(),k=>Number(k.split(':')[1])));}
  getRange(r,c,h,w){
    if(typeof r==='string'){
      const m=r.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);if(!m)throw new Error('Unsupported A1 '+r);
      const n=s=>[...s].reduce((v,x)=>v*26+x.charCodeAt(0)-64,0);
      return new CellRange(this,Number(m[2]),n(m[1]),m[4]?Number(m[4])-Number(m[2])+1:1,m[3]?n(m[3])-n(m[1])+1:1);
    }
    return new CellRange(this,r,c,h,w);
  }
  appendRow(row){this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);}
  setFrozenRows(){}
}
class Book {
  constructor(id){this.id=id;this.sheets=new Map();}
  getId(){return this.id;}getSheetByName(n){return this.sheets.get(n)||null;}
  insertSheet(n){const s=new Sheet(this,n);this.sheets.set(n,s);return s;}
}
function setup(){
  const props=new Map([['DOMUS_ENV','STAGING'],['DOMUS_STATION_SECRET_CAJA','fixture-secret'],['DOMUS_STATION_SECRET_BARRA','fixture-secret'],['DOMUS_STATION_SECRET_ACCESOS','fixture-secret']]);
  const main=new Book('114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg');
  const ops=new Book('1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE');
  const books=new Map([[main.id,main],[ops.id,ops]]), cache=new Map();
  let email='',held=false,acquires=0,releases=0;
  const ctx=vm.createContext({console,Date,Math,Map,Set,JSON,Object,Array,Number,String,Boolean,Error,RegExp,
    Session:{getActiveUser:()=>({getEmail:()=>email})},
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>new Date().toISOString().slice(0,10),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},
    LockService:{getScriptLock:()=>({waitLock:()=>{if(held)throw new Error('Nested physical lock');held=true;acquires++;},releaseLock:()=>{assert(held);held=false;releases++;}})},
    SpreadsheetApp:{openById:id=>{if(!books.has(id))throw new Error('Non-fixture book '+id);return books.get(id);},flush:()=>{}}
  });
  for(const f of ['Config','Data','Schema','Auth','Idempotency','Accounts','Payments','POS','Access','KDS','Inventory','Events','Operations','Api'])vm.runInContext(fs.readFileSync(root+'/google-apps-script/'+f+'.gs','utf8'),ctx,{filename:f+'.gs'});
  const headers=JSON.parse(fs.readFileSync(root+'/tests/fixtures/schema_headers.json','utf8'));
  for(const [name,values] of Object.entries(headers)){main.insertSheet(name).getRange(name==='RECETAS CARTA'?1:6,1,1,values.length).setValues([values]);}
  main.getSheetByName('CAJA 2').getRange('F2').setValue('Solar');
  const catalog=['QA drink','Bebidas',40,0.3,'DOMUS',0,'QA-01','Barra','Sí','','DOMUS','pieza',0,'','','B01',40,50,'Sí',''];
  main.getSheetByName('CATALOGO').getRange(7,1,1,20).setValues([catalog]);
  main.getSheetByName('ACTIVIDADES').getRange(7,1,1,13).setValues([['QA event',new Date(),'Fiesta','DOMUS',100,180,250,20,150,'','','Confirmado','']]);
  main.getSheetByName('CAJA 2').getRange(7,1,1,32).setValues([Array(32).fill('')]);
  main.getSheetByName('INVENTARIO').getRange(7,1,1,16).setValues([['QA drink','Bebidas','pieza',10,0,0,0,10,'','','','Propio','DOMUS','','Conteo físico','QA']]);
  ops.insertSheet('RESURTIDO');
  function run(code){return vm.runInContext(code,ctx);}
  function login(role='CAJA',device='fixture-device'){
    return ctx.executeDomusAction_('authCrearSesion',{args:[role,'QA operator',device,'fixture-secret'],role,deviceId:device}).result.token;
  }
  let token=login();
  function request(action,args,id=crypto.randomUUID(),role='CAJA',otherToken){
    return ctx.executeDomusAction_(action,{args,requestId:id,role,deviceId:'fixture-device',sessionToken:otherToken||token}).result;
  }
  return {ctx,main,ops,props,run,login,request,manager:()=>email='direccion@domusccc.net',locks:()=>({held,acquires,releases}),sale:(extra={})=>({id:crypto.randomUUID(),phase:'Solar',customer:'QA',activity:'QA event',paid:true,method:'Efectivo',received:100,expectedTotal:40,items:[{name:'QA drink',sku:'QA-01',qty:1}],...extra})};
}

test('event-specific price is server-authoritative and preserves DOMUS base',()=>{
  const t=setup(),m=t.main;
  m.insertSheet('DOMUS_SETTINGS').getRange(1,1,1,2).setValues([['ACTIVE_ACTIVITY','Del Crepúsculo al Amanecer']]);
  m.insertSheet('EVENTO_30OCT_PRECIOS').getRange(3,1,1,9).setValues([['Producto','Categoría','Clave técnica','SKU carta','Proveedor / operación','Precio Lunar DOMUS','Precio evento','Extra evento','Observaciones / excluir']]);
  m.getSheetByName('EVENTO_30OCT_PRECIOS').getRange(4,1,1,9).setValues([['QA drink','Bebidas','QA-01','B01','DOMUS',50,60,10,'']]);
  m.getSheetByName('CAJA 2').getRange('F2').setValue('Lunar');
  const data=t.request('cajaSimpleDatos',[]);
  assert.equal(data.activeActivity,'Del Crepúsculo al Amanecer');assert.equal(data.activityLocked,true);
  assert.equal(data.products[0].basePrice,50);assert.equal(data.products[0].price,60);assert.equal(data.products[0].eventExtra,10);
  const s=t.sale({phase:'Lunar',activity:'Del Crepúsculo al Amanecer',expectedTotal:60,received:100});
  const r=t.request('cajaSimpleRegistrar',[s],s.id);assert.equal(r.total,60);assert.equal(r.items[0].basePrice,50);assert.equal(r.items[0].eventExtra,10);
  const cash=m.getSheetByName('CAJA 2');assert.equal(cash.raw(7,10),50);assert.equal(cash.raw(7,11),60);assert.equal(cash.raw(7,48),10);assert.equal(cash.raw(7,49),'Universidad del Swinger');
});
test('event profile rejects sale assigned to another activity',()=>{
  const t=setup(),m=t.main;
  m.insertSheet('DOMUS_SETTINGS').getRange(1,1,1,2).setValues([['ACTIVE_ACTIVITY','Del Crepúsculo al Amanecer']]);
  m.insertSheet('EVENTO_30OCT_PRECIOS').getRange(4,1,1,9).setValues([['QA drink','Bebidas','QA-01','B01','DOMUS',50,60,10,'']]);
  m.getSheetByName('CAJA 2').getRange('F2').setValue('Lunar');
  const s=t.sale({phase:'Lunar',activity:'QA event',expectedTotal:60,received:100});
  assert.throws(()=>t.request('cajaSimpleRegistrar',[s],s.id),/ACTIVE_EVENT_MISMATCH/);
});

test('full financial history: payment at row 4565 clears old account',()=>{
  const t=setup(),c=t.main.getSheetByName('CAJA 2'),p=t.main.getSheetByName('COBROS');
  const cash=Array(32).fill('');Object.assign(cash,{1:'old',4:'QA',6:'QA drink',11:145});c.getRange(7,1,1,32).setValues([cash]);
  const pay=Array(14).fill('');Object.assign(pay,{0:'receipt',2:'Caja',3:'old',4:'Terminal 1',10:'Confirmado',13:145});p.getRange(4565,1,1,14).setValues([pay]);
  assert.equal(t.request('cajaSimpleDatos',[]).accounts.length,0);
  assert.equal(t.ctx.posBalanceFast_({m:t.main,c},'old').due,0);
});
test('transfer draft never reduces debt even with corrupt historical applied amount',()=>{
  const t=setup(),c=t.main.getSheetByName('CAJA 2'),p=t.main.getSheetByName('COBROS');
  const cash=Array(32).fill('');Object.assign(cash,{1:'old',4:'QA',6:'QA drink',11:40});c.getRange(7,1,1,32).setValues([cash]);
  const pay=Array(14).fill('');Object.assign(pay,{0:'r',2:'Caja',3:'old',4:'Transferencia',10:'Borrador',13:40});p.getRange(4565,1,1,14).setValues([pay]);
  assert.equal(t.request('cajaSimpleDatos',[]).accounts[0].due,40);
});
for(const method of ['Efectivo','Terminal 1','Terminal 2','Transferencia'])test('sale, semantic payment columns and durable replay: '+method,()=>{
  const t=setup(),sale=t.sale({method}),id=sale.id;
  const result=t.request('cajaSimpleRegistrar',[sale],id);
  assert(result.receipt);assert.equal(result.total,40);assert.equal(result.paid,method!=='Transferencia');
  const cob=t.main.getSheetByName('COBROS');const row=cob.getLastRow();
  assert.equal(cob.raw(row,3),'Caja');assert.equal(cob.raw(row,6),40);
  assert.equal(cob.value(row,14),method==='Transferencia'?0:40);
  assert(cob.getRange(row,13).getFormula());assert.notEqual(cob.raw(row,8),'QA');
  const replay=t.request('cajaSimpleRegistrar',[sale],id);assert.equal(replay.receipt,result.receipt);assert.equal(cob.getLastRow(),row);
  assert.equal(t.ctx.dataRows_(t.main.getSheetByName('REQUESTS'),2,8).length,1);
  assert.equal(t.request('cajaSimpleEstado',[id]).result.receipt,result.receipt);
  assert(t.main.getSheetByName('CAJA 2').getRange(7,13).getFormula());
  assert.equal(t.locks().acquires,t.locks().releases);assert.equal(t.locks().held,false);
});
test('same request with mutated payload or another device rejected',()=>{
  const t=setup(),sale=t.sale();t.request('cajaSimpleRegistrar',[sale],sale.id);
  assert.throws(()=>t.request('cajaSimpleRegistrar',[{...sale,customer:'changed'}],sale.id),/IDEMPOTENCY_KEY_REUSED/);
  const other=t.login('CAJA','other-device');
  assert.throws(()=>t.ctx.executeDomusAction_('cajaSimpleRegistrar',{args:[sale],requestId:sale.id,role:'CAJA',deviceId:'other-device',sessionToken:other}),/IDEMPOTENCY_KEY_REUSED/);
});
test('direct native legacy entry cannot bypass authentication',()=>{
  const t=setup();assert.throws(()=>t.ctx.cajaSimpleDatos(),/Acceso denegado/);assert.throws(()=>t.ctx.cajaSimpleRegistrar(t.sale()),/Acceso denegado/);
  assert.throws(()=>t.ctx.handleApiGetRequest_('cajaSimpleDatos',{})); // ContentService intentionally absent in pure harness.
});
test('requested ADMIN without verified Workspace identity cannot obtain session',()=>{
  const t=setup();assert.throws(()=>t.login('ADMIN'),/Acceso denegado/);t.manager();assert(t.login('ADMIN'));
});
for(const bad of [{qty:0},{qty:-1},{qty:1.5},{name:'unknown',sku:'unknown',qty:1},{qty:1,courtesy:true}])test('server rejects invalid catalog or unauthorized courtesy '+JSON.stringify(bad),()=>{
  const t=setup(),s=t.sale();s.items=[{...s.items[0],...bad}];assert.throws(()=>t.request('cajaSimpleRegistrar',[s],s.id));assert.equal(t.main.getSheetByName('COBROS').getLastRow(),6);
});
test('disabled catalog reference cannot be reconstructed from client price',()=>{
  const t=setup();t.main.getSheetByName('CATALOGO').getRange(7,9).setValue('No');const s=t.sale();assert.throws(()=>t.request('cajaSimpleRegistrar',[s],s.id),/PRODUCT_NOT_FOUND/);
});
test('pay existing account without adding or duplicating consumption',()=>{
  const t=setup(),s=t.sale({paid:false,credit:'Amigo',method:''});const open=t.request('cajaSimpleRegistrar',[s],s.id);
  const cash=t.main.getSheetByName('CAJA 2'),before=cash.getLastRow();
  const settle=t.sale({ticket:open.ticket,items:[],expectedTotal:40});const done=t.request('cajaSimpleRegistrar',[settle],settle.id);
  assert(done.paid && done.receipt);assert.equal(done.total,40);assert.equal(cash.getLastRow(),before);
  assert.equal(t.request('cajaSimpleDatos',[]).accounts.length,0);
  const second=t.sale({ticket:open.ticket,items:[]});assert.throws(()=>t.request('cajaSimpleRegistrar',[second],second.id),/sin saldo/);
});
test('partial write resumes same journal after process restart, no second receipt',()=>{
  const t=setup(),s=t.sale(),cob=t.main.getSheetByName('COBROS');cob.failAt='7:6';
  assert.throws(()=>t.request('cajaSimpleRegistrar',[s],s.id),/INJECTED_WRITE_FAILURE/);
  assert(t.main.getSheetByName('DOMUS_JOURNAL'));
  const recovered=t.request('cajaSimpleRegistrar',[s],s.id);assert(recovered.receipt && recovered.paid);
  assert.equal(cob.getLastRow(),7);assert.equal(t.ctx.dataRows_(t.main.getSheetByName('REQUESTS'),2,8).length,1);
});
test('journal prevalidation rejects invalid enum before writing access or payment',()=>{
  const t=setup(),cob=t.main.getSheetByName('COBROS');cob.rules.set('7:3',{getAllowInvalid:()=>false,getCriteriaType:()=> 'VALUE_IN_LIST',getCriteriaValues:()=>[['Caja']]});
  const token=t.login('ACCESOS'),a={id:'access-reject',customer:'QA',activity:'QA event',ticketTypeId:'General',persons:1,wardrobeQty:0,paymentMethod:'Efectivo',externalTicketId:'qr',salesChannel:'TAQUILLA_DOMUS'};
  assert.throws(()=>t.request('accesoSimpleRegistrar',[a],a.id,'ACCESOS',token),/SCHEMA_VALIDATION/);
  assert.equal(t.main.getSheetByName('ACCESO').getLastRow(),6);assert.equal(cob.getLastRow(),6);
});
test('access replay and duplicate QR are bounded to real event records',()=>{
  const t=setup(),token=t.login('ACCESOS'),a={id:'access-success',customer:'QA',activity:'QA event',ticketTypeId:'General',wardrobeQty:2,paymentMethod:'Efectivo',externalTicketId:'qr',salesChannel:'TAQUILLA_DOMUS'};
  const r=t.request('accesoSimpleRegistrar',[a],a.id,'ACCESOS',token);assert.equal(r.doorCollected,140);
  assert.equal(t.request('accesoSimpleRegistrar',[a],a.id,'ACCESOS',token).rowId,r.rowId);
  assert.equal(t.main.getSheetByName('ACCESO').getLastRow(),7);assert.equal(t.main.getSheetByName('COBROS').getLastRow(),8);
  assert.throws(()=>t.request('accesoSimpleRegistrar',[{...a,id:'another'}],'another','ACCESOS',token),/Boleto ya utilizado/);
});
test('access cannot claim bank transfer verified via browser flag',()=>{
  const t=setup(),token=t.login('ACCESOS'),a={id:'transfer-access',customer:'QA',activity:'QA event',ticketTypeId:'General',wardrobeQty:0,paymentMethod:'Transferencia',isTransferVerified:true};
  const r=t.request('accesoSimpleRegistrar',[a],a.id,'ACCESOS',token);assert.equal(r.paymentStatus,'PENDIENTE_VERIFICACION');assert.equal(r.doorCollected,0);
});
test('new access after row 5000 is visible, template folios do not inflate attendance',()=>{
  const t=setup(),s=t.main.getSheetByName('ACCESO'),row=Array(32).fill('');s.getRange(7,1).setValue('template');
  Object.assign(row,{0:'A-real',1:new Date(),2:'QA event',3:'QA',7:2,16:'CONFIRMADA'});s.getRange(5051,1,1,32).setValues([row]);
  const token=t.login('ACCESOS'),r=t.request('accesoSimpleDatos',[],undefined,'ACCESOS',token);assert.equal(r.recentAccess.length,1);assert.equal(r.metrics.totalAttendance,2);
});
test('KDS state machine, legacy body, repeat delivery and formula preservation',()=>{
  const t=setup(),s=t.sale(),sale=t.request('cajaSimpleRegistrar',[s],s.id),board=t.main.getSheetByName('COMANDAS'),inv=t.main.getSheetByName('INVENTARIO');
  inv.getRange(7,7).setValue('=SUMIF(example)');inv.getRange(7,8).setValue('=D7-G7');
  // Fixture expected availability remains numeric; mock only this calculated value.
  const original=inv.value.bind(inv);inv.value=(r,c)=>r===7&&c===8?10:original(r,c);
  const item=JSON.parse(board.raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=t.login('BARRA');
  assert.throws(()=>t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'early','BARRA',token),/INVALID_KDS_TRANSITION/);
  t.request('comandasSimpleAccion',[{key,action:'TOMAR'}],'take','BARRA',token);
  t.request('comandasSimpleAccion',[token,{key,action:'LISTA'}],'ready','BARRA',token);
  assert.equal(JSON.parse(board.raw(7,13)).state,'Lista');
  const before=inv.getRange(7,1,1,16).getValues()[0];
  const result=t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'deliver','BARRA',token);
  assert.equal(result.state,'Entregada');assert.equal(board.raw(7,8),'Entregada');
  assert.equal(t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'deliver-again','BARRA',token).state,'Entregada');
  assert.deepEqual(inv.getRange(7,1,1,16).getValues()[0],before);assert.equal(sale.total,40);
});
test('stock without initial count cannot be turned into a delivered order',()=>{
  const t=setup(),s=t.sale();t.request('cajaSimpleRegistrar',[s],s.id);
  const board=t.main.getSheetByName('COMANDAS'),item=JSON.parse(board.raw(7,13)),key='DCS-'+item.row+'-'+item.batch,token=t.login('BARRA');
  t.request('comandasSimpleAccion',[{key,action:'TOMAR'}],'take','BARRA',token);
  t.request('comandasSimpleAccion',[{key,action:'LISTA'}],'ready','BARRA',token);
  t.main.getSheetByName('INVENTARIO').getRange(7,4).setValue('');
  assert.throws(()=>t.request('comandasSimpleAccion',[{key,action:'ENTREGAR'}],'deliver','BARRA',token),/STOCK_COUNT_REQUIRED/);
  assert.equal(JSON.parse(board.raw(7,13)).state,'Lista');
});
test('restock create and resolve persist into the operational book, replay does not duplicate',()=>{
  const t=setup(),token=t.login('BARRA');
  const r=t.request('solicitarResurtido',[{product:'QA ingredient',type:'Reposición'}],'restock','BARRA',token);
  const rows=t.ctx.dataRows_(t.ops.getSheetByName('RESURTIDO'),7,8);assert.equal(rows.length,1);assert.equal(rows[0][0],r.id);
  t.request('comandasSimpleResolver',[{id:r.id}],'resolve','BARRA',token);
  t.request('comandasSimpleResolver',[{id:r.id}],'resolve','BARRA',token);
  assert.equal(t.ops.getSheetByName('RESURTIDO').raw(7,6),true);
});
test('wardrobe return is durable, preserves admission activity, and prevents second return',()=>{
  const t=setup(),token=t.login('ACCESOS'),a={id:'coat',customer:'QA',activity:'QA event',ticketTypeId:'General',wardrobeQty:1,paymentMethod:'Efectivo'};
  const r=t.request('accesoSimpleRegistrar',[a],a.id,'ACCESOS',token);
  t.request('guardarropaDevolver',[{ticket:r.ticketGuardarropa}],'return','ACCESOS',token);
  assert.equal(t.main.getSheetByName('ACCESO').raw(7,32),true);assert.equal(t.main.getSheetByName('ACCESO').raw(7,29),true);
  assert.throws(()=>t.request('guardarropaDevolver',[{ticket:r.ticketGuardarropa}],'return2','ACCESOS',token),/ya fue devuelta/);
});
test('50 units use chunked durable journal without cell-size overflow or lost receipt',()=>{
  const t=setup(),s=t.sale({items:[{name:'QA drink',sku:'QA-01',qty:20},{name:'QA drink',sku:'QA-01',qty:20},{name:'QA drink',sku:'QA-01',qty:10}],received:2000,expectedTotal:2000});
  const result=t.request('cajaSimpleRegistrar',[s],s.id);assert.equal(result.total,2000);assert(result.receipt);
  const journal=t.main.getSheetByName('DOMUS_JOURNAL');
  for(const row of t.ctx.dataRows_(journal,2,6))assert(String(row[3]).length<50000);
  assert.equal(t.request('cajaSimpleRegistrar',[s],s.id).receipt,result.receipt);
});
console.log(JSON.stringify({suite:'local-real-modules-mocked-services',passed,network:false,production:false,hardware:false}));
