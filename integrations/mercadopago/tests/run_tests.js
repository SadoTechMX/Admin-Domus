'use strict';
// Tests of the exact .gs source, with local standard-library shims. No network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const bridge = path.join(__dirname, 'bridge.py');
const code = fs.readFileSync(path.join(__dirname, '..', 'DOMUS_MercadoPagoSync.gs'), 'utf8');
function py(mode, data) {
  return JSON.parse(cp.execFileSync('python3', [bridge, mode], {
    input: JSON.stringify(data), maxBuffer: 15 * 1024 * 1024, encoding: 'utf8'
  }));
}
class Blob {
  constructor(data, mime = '', name = '') { this.data = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data); this.mime = mime; this.name = name; }
  getBytes() { return Array.from(this.data); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  setContentType(m) { this.mime = m; return this; }
  getDataAsString() { return this.data.toString('utf8'); }
}
function local(tag) { return tag.replace(/^\{[^}]*\}/, ''); }
function uri(tag) { return tag.startsWith('{') ? tag.slice(1, tag.indexOf('}')) : ''; }
class Element {
  constructor(node) { this.node = node; }
  getName() { return local(this.node.tag); }
  getNamespace() { return { getURI: () => uri(this.node.tag) }; }
  getText() { return this.node.text; }
  getChildren(name, ns) { return this.node.children.filter(x => (!name || local(x.tag) === name) && (!ns || uri(x.tag) === ns.uri)).map(x => new Element(x)); }
  getChild(name, ns) { return this.getChildren(name, ns)[0] || null; }
  getAttribute(name, ns) { const key = ns ? '{' + ns.uri + '}' + name : name; const val = this.node.attrs[key]; return val === undefined ? null : { getValue: () => val }; }
}
const util = {
  newBlob: (value, mime, name) => new Blob(typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value), mime, name),
  unzip: b => py('unzip', b.data.toString('base64')).map(x => new Blob(Buffer.from(x.data, 'base64'), '', x.name)),
  zip: (blobs, name) => new Blob(Buffer.from(py('zip', blobs.map(b => ({ name: b.name, data: b.data.toString('base64') }))), 'base64'), '', name),
  DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
  computeDigest: (a, b) => Array.from(crypto.createHash(a).update(Buffer.from(b)).digest()),
  getUuid: () => crypto.randomUUID(),
  formatDate: date => new Intl.DateTimeFormat('sv-SE', { timeZone:'America/Mexico_City', dateStyle:'short', timeStyle:'medium' }).format(date)
};
function context() {
  const props = new Map(), env = { props, writes: 0, version: 1, triggers: [], logs: [], sourcesRead: 0 };
  props.set('DOMUS_MP_SOURCE_ID', 'source_' + 'a'.repeat(25));
  props.set('DOMUS_MP_TARGET_ID', 'target_' + 'b'.repeat(25));
  const propertyApi = { getProperty: k => props.has(k) ? props.get(k) : null,
    setProperty: (k, v) => { props.set(k, String(v)); return propertyApi; } };
  class Range {
    constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
    getValues() { return Array.from({length:this.rows}, (_, i) => Array.from({length:this.cols}, (_, j) => this.sheet.data[this.row + i - 1]?.[this.col + j - 1] ?? '')); }
    setValues(values) { values.forEach((r, i) => { const row = this.sheet.data[this.row + i - 1] ||= []; r.forEach((v, j) => { if (typeof v === 'string' && v.startsWith('=')) throw new Error('UNSAFE_FORMULA'); row[this.col + j - 1] = v; }); }); return this; }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; }
    getName() { return this.name; }
    getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
    getLastRow() { let n=this.data.length; while(n && (!this.data[n-1] || this.data[n-1].every(v=>v==='' || v===null || v===undefined))) n--; return n; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    setFrozenRows() {}
    setColumnWidth() {}
  }
  env.source = new Sheet('Menú & Precios');
  env.source.data = [[],[],Array(17).fill('')];
  Object.entries({0:'Código',1:'Producto',3:'Categoría',9:'Precio Solar/Eclipse ($)',12:'Precio Lunar ($)',16:'Estado de Revisión'}).forEach(([i,v])=>env.source.data[2][i]=v);
  env.sheets = new Map([['Menú & Precios',env.source]]);
  env.ss = { getSheetByName:n=>env.sheets.get(n)||null, insertSheet:n=>{const s=new Sheet(n);env.sheets.set(n,s);return s;}, getId:()=>props.get('DOMUS_MP_SOURCE_ID') };
  const trigger = (handler,event,source) => { const id = crypto.randomUUID(); return {getHandlerFunction:()=>handler,getEventType:()=>event,getTriggerSourceId:()=>source,getUniqueId:()=>id}; };
  const ctx = {
    Utilities:util, console:{log:s=>env.logs.push(s)},
    XmlService:{parse:xml=>{const root=new Element(py('xml',xml));return {getRootElement:()=>root};},getNamespace:(a,b)=>({uri:b||a})},
    PropertiesService:{getScriptProperties:()=>propertyApi},
    Session:{getEffectiveUser:()=>({getEmail:()=>env.email||'installer@example.invalid'})},
    SpreadsheetApp:{openById:()=>env.ss,flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(env.onLock)env.onLock();return true;},releaseLock:()=>{}})},
    ScriptApp:{getOAuthToken:()=>'<test-token>',EventType:{ON_EDIT:'EDIT',ON_CHANGE:'CHANGE',CLOCK:'CLOCK'},
      getProjectTriggers:()=>env.triggers.slice(),deleteTrigger:t=>{env.triggers=env.triggers.filter(x=>x!==t);},
      newTrigger:handler=>{let event,source=null; const b={forSpreadsheet:s=>{source=s;return b;},onEdit:()=>{event='EDIT';return b;},onChange:()=>{event='CHANGE';return b;},timeBased:()=>{event='CLOCK';return b;},everyMinutes:m=>{assert.equal(m,5);return b;},create:()=>{const t=trigger(handler,event,source);env.triggers.push(t);return t;}};return b;}}
  };
  env.unrelatedTrigger=()=>{env.triggers.push(trigger('existing_POS_handler','EDIT',props.get('DOMUS_MP_SOURCE_ID')));};
  ctx.UrlFetchApp={fetch:(url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer <test-token>');
    if(opts.method==='patch') {
      if(env.uploadFailure==='before') {env.uploadFailure=null;throw new Error('network');}
      env.target=new Blob(Buffer.from(opts.payload));env.version++;env.writes++;
      if(env.uploadFailure==='after') {env.uploadFailure=null;throw new Error('timeout');}
      if(env.afterUpload)env.afterUpload();
      return response({id:props.get('DOMUS_MP_TARGET_ID')});
    }
    if(url.includes('alt=media'))return {getResponseCode:()=>200,getBlob:()=>new Blob(env.target.data),getContentText:()=>''};
    return response({id:props.get('DOMUS_MP_TARGET_ID'),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',trashed:false,size:String(env.target.data.length),version:String(env.version),md5Checksum:crypto.createHash('md5').update(env.target.data).digest('hex'),capabilities:{canEdit:true}});
  }};
  function response(v){return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(v)};}
  vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'DOMUS_MercadoPagoSync.gs'});
  env.ctx=ctx;
  env.setSource=rows=>{env.source.data=env.source.data.slice(0,3);rows.forEach(r=>{const full=Array(17).fill('');[0,1,3,9,12,16].forEach((n,i)=>full[n]=r[i]);env.source.data.push(full);});};
  return env;
}
const example = () => [['PROD-001','Artículo A','Grupo Alfa',12.5,15,'Aprobado'],['PROD-002','Artículo B','Grupo Beta',25,30,'Aprobado']];
function model(ctx, rows=example()) {
  const source=ctx.DMP_source_(rows),products={},categories={};
  for(let n=5;n<=997;n++)products[n]={row:n,name:'',price:'',category:'',empty:true};
  for(let n=6;n<=205;n++)categories[n]='';
  source.variants.forEach((v,i)=>products[5+i]={row:5+i,name:v.name,price:v.price,category:v.category,empty:false});
  [...new Set(source.variants.map(v=>v.category))].forEach((v,i)=>categories[i+6]=v);
  return {source,wb:{products,categories}};
}
function xmlEscape(v) {return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cell(address,v,extra='') {return typeof v==='number'?`<c r="${address}" s="9" t="n"><v>${v}</v></c>`:v===''?`<c r="${address}" s="9">${extra}</c>`:`<c r="${address}" s="9" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;}
function fixture(ctx,wb) {
  const ns=ctx.DMP.ns,rns=ctx.DMP.relNs;let product='<row r="3">'+Object.entries({B3:'Nombre del producto',C3:'Precio de venta',F3:'Código del producto (SKU)',I3:'Categorías'}).map(([a,v])=>cell(a,v)).join('')+'</row>';
  for(let r=5;r<=997;r++){let p=wb.products[r];product+=`<row r="${r}">`+['A','B','C','D','E','F','G','H','I','J','K'].map(c=>cell(c+r,({B:p.name,C:p.price,I:p.category}[c]??''),c==='K'?'<f t="shared" si="1"/>':'')).join('')+'</row>';}
  let cats='<row r="5">'+cell('B5','Tus categorías')+'</row>';
  for(let r=6;r<=205;r++)cats+=`<row r="${r}">${cell('A'+r,r-5)}${cell('B'+r,wb.categories[r])}</row>`;
  const sheet=content=>`<?xml version="1.0"?><worksheet xmlns="${ns}"><sheetData>${content}</sheetData><dataValidations count="1"><dataValidation sqref="I5:I997" type="list"><formula1>'Tus categorías'!$B$6:B$205</formula1></dataValidation></dataValidations></worksheet>`;
  const parts=new Map(ctx.DMP.parts.map(n=>[n,Buffer.from('unchanged:'+n)]));
  parts.set('xl/workbook.xml',Buffer.from(`<workbook xmlns="${ns}" xmlns:r="${rns}"><sheets><sheet name="Tus productos" sheetId="1" r:id="r1"/><sheet name="extra_data" sheetId="2" r:id="r2" state="hidden"/><sheet name="Tus categorías" sheetId="3" r:id="r3"/></sheets></workbook>`));
  parts.set('xl/_rels/workbook.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3].map(i=>`<Relationship Id="r${i}" Target="worksheets/sheet${i}.xml"/>`).join('')+'</Relationships>'));
  parts.set('xl/sharedStrings.xml',Buffer.from(`<sst xmlns="${ns}"><si><t>texto anónimo sin usar</t></si></sst>`));
  parts.set('xl/worksheets/sheet1.xml',Buffer.from(sheet(product)));
  parts.set('xl/worksheets/sheet3.xml',Buffer.from(sheet(cats)));
  parts.set('xl/worksheets/sheet2.xml',Buffer.from(sheet('<row r="1">'+cell('A1','template_id')+cell('B1','MLM_DEFAULT_DOCUMENT')+'</row><row r="2">'+cell('A2','doc_version')+cell('B2','1.0.6')+'</row>')));
  return util.zip(Array.from(parts,([n,b])=>new Blob(b,'',n)),'anonymous.xlsx');
}
const plain=v=>JSON.parse(JSON.stringify(v));
const tests=[];function test(name,fn){tests.push([name,fn]);}
function throws(fn,code){assert.throws(fn,new RegExp(code));}
function planSetup(){const env=context(),{source,wb}=model(env.ctx);const initial=env.ctx.DMP_plan_(source,wb,null);env.catalogSource=source;env.wb=wb;env.manifest=initial.manifest;return env;}

test('Bootstrap exacto, 2 productos/4 variantes, cero cambios',()=>{const e=planSetup();const p=e.ctx.DMP_plan_(e.catalogSource,e.wb,null);assert.equal(p.changes.length,0);assert.equal(p.baseline.products.length,4);});
test('Alta en dos fases y categoría nueva, sin alterar filas existentes',()=>{const e=planSetup();const rows=example().concat([['PROD-003','Artículo C','Grupo Gamma',40,45,'Aprobado']]);const p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.equal(p.added,2);assert.equal(p.changes.length,7);assert.equal(p.manifest.products.find(x=>x.key==='PROD-003|SOLAR').row,9);});
test('Cambio de precio modifica solo C; renombrar conserva ID y fila',()=>{const e=planSetup(),rows=example();rows[0][3]=13.5;let p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.deepEqual(plain(p.changes),[{part:e.ctx.DMP.productPart,cell:'C5',value:13.5}]);rows[0][3]=12.5;rows[0][1]='Artículo renovado';p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.deepEqual(plain(p.changes.map(x=>x.cell).sort()),['B5','B6']);assert.equal(p.manifest.products.find(x=>x.key==='PROD-001|SOLAR').row,5);});
test('ID duplicado y nombre duplicado abortan sin inferir identidad',()=>{const c=context().ctx,rows=example();rows[1][0]='PROD-001';throws(()=>c.DMP_source_(rows),'SOURCE_ID_DUPLICATE');rows[1][0]='PROD-002';rows[1][1]='Artículo A';throws(()=>c.DMP_source_(rows),'SOURCE_NAME_DUPLICATE');});
test('Baja en origen retiene ambas variantes y valores anteriores',()=>{const e=planSetup(),rows=example().slice(1);const p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.equal(p.held,2);assert.equal(p.changes.length,0);assert.equal(p.manifest.products.length,4);});
test('No aprobado retiene anteriores; nuevos no aprobados no se exportan',()=>{const e=planSetup(),rows=example();rows[0][5]='Pendiente';rows[0][3]='';rows.push(['PROD-003','Nuevo','Grupo',10,12,'Pendiente']);const p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.equal(p.held,2);assert.equal(p.changes.length,0);assert.equal(p.manifest.products.length,4);});
test('Solo texto Aprobado, no booleano true ni Sí, habilita exportación',()=>{const c=context().ctx;for(const status of [true,'Sí','TRUE',1]){const rows=example();rows[0][5]=status;assert.equal(c.DMP_source_(rows).variants.length,2);}});
test('Precio faltante, texto, cero, NaN, Infinity o más de dos decimales aborta',()=>{const c=context().ctx;for(const value of ['',null,'12',0,NaN,Infinity,true,-1,1000000000,12.345]){const rows=example();rows[0][3]=value;throws(()=>c.DMP_source_(rows),'SOURCE_PRICE_INVALID');}});
test('Nombre exportado límite60; exceder aborta sin truncar',()=>{const c=context().ctx,rows=example();rows[0][1]='X'.repeat(60-c.DMP.phases[0].suffix.length);assert.equal(c.DMP_source_(rows).variants[0].name.length,60);rows[0][1]+='X';throws(()=>c.DMP_source_(rows),'EXPORTED_NAME_TOO_LONG');});
test('Bootstrap rechaza precio o categoría discordante y nombres ambiguos',()=>{const e=planSetup();e.wb.products[5].price=99;throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,null),'BOOTSTRAP_MISMATCH');e.wb.products[6].name=e.wb.products[5].name;throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,null),'DEST_NAME_DUPLICATE');});
test('Cambio manual de precio y movimiento de fila bloquean manifiesto',()=>{const e=planSetup();e.wb.products[5].price=99;throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,e.manifest),'DEST_MANUAL_CONFLICT');e.wb.products[5].price=12.5;[e.wb.products[5],e.wb.products[6]]=[e.wb.products[6],e.wb.products[5]];throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,e.manifest),'DEST_MANUAL_CONFLICT');});
test('Cambio manual de categoría existente bloquea escritura',()=>{const e=planSetup();e.wb.categories[6]='Cambio manual';throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,e.manifest),'CATEGORY_MANUAL_CONFLICT');});
test('Fila huérfana con SKU/stock y sin nombre no es reutilizable',()=>{const e=planSetup();e.wb.products[9].empty=false;throws(()=>e.ctx.DMP_plan_(e.catalogSource,e.wb,e.manifest),'DEST_PARTIAL_ROW');});
test('Capacidad: 993 filas ocupadas y categoría201 abortan',()=>{const e=planSetup();for(let n=9;n<=997;n++)e.wb.products[n]={row:n,name:'Manual '+n,price:10,category:'Grupo Alfa',empty:false};const rows=example().concat([['PROD-003','Nuevo','Grupo Alfa',10,12,'Aprobado']]);throws(()=>e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest),'PRODUCT_CAPACITY_EXCEEDED');const e2=planSetup();for(let n=8;n<=205;n++)e2.wb.categories[n]='Grupo '+n;const r=example();r[0][2]='Grupo nuevo';throws(()=>e2.ctx.DMP_plan_(e2.ctx.DMP_source_(r),e2.wb,e2.manifest),'CATEGORY_CAPACITY_EXCEEDED');});
test('Claves especiales de objetos no causan colisión de categorías',()=>{const e=planSetup(),rows=example();rows[0][2]='constructor';const p=e.ctx.DMP_plan_(e.ctx.DMP_source_(rows),e.wb,e.manifest);assert.equal(p.changes.filter(x=>x.part===e.ctx.DMP.categoryPart).length,1);});
test('Recuperación solo confirma after, aborta before y bloquea tercer estado',()=>{const c=context().ctx,p={beforeHash:'before',afterHash:'after'};assert.equal(c.DMP_recovery_(p,'after'),'CONFIRMAR');assert.equal(c.DMP_recovery_(p,'before'),'NO_APLICADO');assert.equal(c.DMP_recovery_(p,'other'),'CONFLICTO_INCIERTO');});
test('Journal exige PREPARE y COMMIT con hash correcto',()=>{const c=context().ctx,manifest={products:[],categories:[]};throws(()=>c.DMP_reduceJournal_([{type:'COMMIT',id:'1',payload:{}}]),'JOURNAL_SEQUENCE_INVALID');const records=[{type:'STATE',id:'0',payload:{schema:1,manifest}},{type:'PREPARE',id:'1',payload:{schema:1,id:'1',afterHash:'yes',manifest}},{type:'COMMIT',id:'1',payload:{targetHash:'no'}}];throws(()=>c.DMP_reduceJournal_(records),'JOURNAL_COMMIT_HASH_INVALID');});
test('ZIP anónimo preserva 20 partes, fórmulas, estilos y columnas no autorizadas',()=>{const e=planSetup(),blob=fixture(e.ctx,e.wb),wb=e.ctx.DMP_unpack_(blob);const changes=[{part:e.ctx.DMP.productPart,cell:'B5',value:'Artículo & <especial> - Solar/Eclipse'},{part:e.ctx.DMP.productPart,cell:'C5',value:13.5},{part:e.ctx.DMP.categoryPart,cell:'B8',value:'Grupo Gamma'}];const built=e.ctx.DMP_build_(wb,changes),after=e.ctx.DMP_unpack_(built);assert.equal(Object.keys(after.parts).length,20);for(const p of e.ctx.DMP.parts){if(!changes.some(c=>c.part===p))assert.equal(after.parts[p].data.toString('hex'),wb.parts[p].data.toString('hex'));}for(const part of [e.ctx.DMP.productPart,e.ctx.DMP.categoryPart]){const refs=changes.filter(x=>x.part===part).map(x=>x.cell);const mask=s=>s.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,m=>refs.some(r=>m.includes(`r="${r}"`))?'[CELL]':m);assert.equal(mask(after.texts[part]),mask(wb.texts[part]));}assert.equal(after.products[5].name,changes[0].value);throws(()=>e.ctx.DMP_build_(wb,[{part:e.ctx.DMP.productPart,cell:'K5',value:'bad'}]),'WRITE_OUTSIDE_ALLOWLIST');});
test('Plantilla con otra versión o headers intercambiados aborta',()=>{const e=planSetup(),wb=e.ctx.DMP_unpack_(fixture(e.ctx,e.wb));wb.parts['xl/worksheets/sheet2.xml']=new Blob(wb.parts['xl/worksheets/sheet2.xml'].getDataAsString().replace('1.0.6','1.0.7'),'','xl/worksheets/sheet2.xml');const blob=util.zip(e.ctx.DMP.parts.map(p=>wb.parts[p]));throws(()=>e.ctx.DMP_unpack_(blob),'XLSX_TEMPLATE_VERSION_CHANGED');});

function runtimeSetup(){const e=planSetup();e.target=fixture(e.ctx,e.wb);e.setSource(example());return e;}
test('Simular es solo lectura, incluso ante error de encabezado',()=>{const e=runtimeSetup();const before=Array.from(e.props);assert.equal(e.ctx.DOMUS_MP_Simular().status,'SIMULADO');assert.deepEqual(Array.from(e.props),before);assert.equal(e.sheets.size,1);e.source.data[2][9]='Precio Lunar ($)';throws(()=>e.ctx.DOMUS_MP_Simular(),'SOURCE_HEADERS_CHANGED');assert.deepEqual(Array.from(e.props),before);});
test('Instalar valida, queda pausado, es idempotente y preserva triggers ajenos',()=>{const e=runtimeSetup();e.unrelatedTrigger();e.ctx.DOMUS_MP_Instalar();assert.equal(e.writes,0);assert.equal(e.props.get('DOMUS_MP_ENABLED'),'0');assert.equal(e.triggers.length,4);const ids=e.triggers.map(x=>x.getUniqueId());const rows=e.sheets.get('MP_SYNC_CONTROL').getLastRow();e.ctx.DOMUS_MP_Instalar();assert.deepEqual(e.triggers.map(x=>x.getUniqueId()),ids);assert.equal(e.sheets.get('MP_SYNC_CONTROL').getLastRow(),rows);assert.equal(e.writes,0);});
test('Ejecución verificada habilita automatización y precio se modifica una sola vez',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.props.get('DOMUS_MP_ENABLED'),'1');assert.equal(e.writes,0);e.source.data[3][9]=14;e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.writes,1);assert.equal(e.ctx.DMP_unpack_(e.target).products[5].price,14);e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.writes,1);assert.equal(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending,null);});
test('Timeout después de aplicar: recovery confirma, no repite PATCH',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.source.data[3][9]=14;e.uploadFailure='after';throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'UNEXPECTED_ERROR_REVIEW_REQUIRED');assert.equal(e.writes,1);assert.ok(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending);e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.writes,1);assert.equal(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending,null);});
test('Fallo antes de aplicar: recovery aborta anterior y replantea, sin duplicar',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.source.data[3][9]=14;e.uploadFailure='before';throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'UNEXPECTED_ERROR_REVIEW_REQUIRED');assert.equal(e.writes,0);e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.writes,1);assert.equal(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending,null);});
test('Tercer estado después de timeout queda bloqueado y conserva evidencia',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.source.data[3][9]=14;e.uploadFailure='after';throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'UNEXPECTED_ERROR_REVIEW_REQUIRED');const wb=e.ctx.DMP_unpack_(e.target);e.target=e.ctx.DMP_build_(wb,[{part:e.ctx.DMP.productPart,cell:'C5',value:99}]);throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'UNCERTAIN_WRITE_REVIEW_REQUIRED');assert.equal(e.writes,1);assert.ok(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending);});
test('Relectura de fuente y destino antes de PATCH bloquea carreras observables',()=>{for(const side of ['source','target']){const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.source.data[3][9]=14;const original=e.ctx.DMP_appendRecord_;e.ctx.DMP_appendRecord_=function(c,type,id,p){const result=original(c,type,id,p);if(type==='PREPARE'){if(side==='source')e.source.data[3][9]=15;else{const w=e.ctx.DMP_unpack_(e.target);e.target=e.ctx.DMP_build_(w,[{part:e.ctx.DMP.productPart,cell:'C5',value:88}]);}}return result;};throws(()=>e.ctx.DOMUS_MP_Ejecutar(),side==='source'?'SOURCE_CHANGED_RETRY':'DEST_CHANGED_RETRY');assert.equal(e.writes,0);assert.equal(e.ctx.DMP_readState_(e.ctx.DMP_config_()).pending,null);}});
test('Pausa revalidada dentro de lock impide escritura de trigger previamente iniciado',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.props.set('DOMUS_MP_ENABLED','1');e.source.data[3][9]=14;e.onLock=()=>e.props.set('DOMUS_MP_ENABLED','0');assert.equal(e.ctx.DOMUS_MP_Recuperar().status,'PAUSADO');assert.equal(e.writes,0);});
test('Journal usa prefijo seguro aunque fragmento empiece por signo igual',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();const c=e.ctx.DMP_config_(),str='x'.repeat(7500-'{"padding":"'.length)+'=SUM(A1)';const payload={padding:str};assert.equal(e.ctx.DMP_chunks_(JSON.stringify(payload))[1][0],'=');e.ctx.DMP_appendRecord_(c,'ABORT','test',payload);const rows=e.sheets.get('MP_SYNC_CONTROL').data.slice(2);assert.ok(rows.every(r=>String(r[5]).startsWith('JSON:')));});
test('Simulación con configuración ausente no toca datos ni hace solicitudes',()=>{const e=context();e.props.delete('DOMUS_MP_SOURCE_ID');throws(()=>e.ctx.DOMUS_MP_Simular(),'CONFIG_REQUIRED');assert.equal(e.writes,0);});


test('SKU manual duplicado bloquea preflight, no escribe F',()=>{const e=planSetup(),blob=fixture(e.ctx,e.wb),parts=util.unzip(blob);const p=parts.find(x=>x.name==='xl/worksheets/sheet1.xml');p.data=Buffer.from(p.getDataAsString().replace('<c r="F5" s="9"></c>',cell('F5','SKU-TEST')).replace('<c r="F6" s="9"></c>',cell('F6','SKU-TEST')));throws(()=>e.ctx.DMP_unpack_(util.zip(parts)),'DEST_SKU_DUPLICATE');});
test('Control perdido o vaciado tras instalación no rebootstrap silencioso',()=>{for(const lost of ['sheet','manifest']){const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();if(lost==='sheet')e.sheets.delete('MP_SYNC_CONTROL');else e.sheets.get('MP_SYNC_CONTROL').data=e.sheets.get('MP_SYNC_CONTROL').data.slice(0,2);throws(()=>e.ctx.DOMUS_MP_Instalar(),'CONTROL_LOST_REVIEW_REQUIRED');assert.equal(e.writes,0);}});
test('Diario corrupto conserva evidencia y bloquea antes de PATCH',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.sheets.get('MP_SYNC_CONTROL').data[2][5]='altered';throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'JOURNAL_PREFIX_INVALID');assert.equal(e.writes,0);});
test('Timer detecta cambio por API sin depender de evento de edición',()=>{const e=runtimeSetup();e.ctx.DOMUS_MP_Instalar();e.ctx.DOMUS_MP_Ejecutar();e.source.data[3][9]=14;e.ctx.DOMUS_MP_Recuperar();assert.equal(e.writes,1);assert.equal(e.ctx.DMP_unpack_(e.target).products[5].price,14);});

test('Instalación parcial conserva propietario antes del primer trigger',()=>{const e=runtimeSetup();const original=e.ctx.ScriptApp.newTrigger;let calls=0;e.ctx.ScriptApp.newTrigger=handler=>{const builder=original(handler),create=builder.create;builder.create=()=>{if(++calls===2)throw new Error('quota');return create();};return builder;};throws(()=>e.ctx.DOMUS_MP_Instalar(),'UNEXPECTED_ERROR_REVIEW_REQUIRED');assert.ok(e.props.get('DOMUS_MP_INSTALLER_HASH'));assert.equal(e.triggers.length,1);e.email='other@example.invalid';throws(()=>e.ctx.DOMUS_MP_Instalar(),'DIFFERENT_TRIGGER_OWNER');assert.equal(e.triggers.length,1);e.email='installer@example.invalid';e.source.data[3][9]=14;throws(()=>e.ctx.DOMUS_MP_Ejecutar(),'INSTALL_INCOMPLETE_REPEAT_INSTALL');assert.equal(e.props.get('DOMUS_MP_ENABLED'),'0');assert.equal(e.writes,0);e.ctx.ScriptApp.newTrigger=original;e.ctx.DOMUS_MP_Instalar();e.ctx.DOMUS_MP_Ejecutar();assert.equal(e.writes,1);assert.equal(e.props.get('DOMUS_MP_ENABLED'),'1');});

let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(JSON.stringify({tests:tests.length,passed:tests.length-failed,failed,network:false}));
if(failed)process.exitCode=1;

// Optional compatibility check, only read, no source fixture is copied into this project.
if(process.argv[2]&&process.argv[3]){
  const env=context(),raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const items=raw.products||raw;
  const rows=items.map(p=>[p.code,p.name,p.category,p.solar,p.lunar,p.status]);
  const workbook=env.ctx.DMP_unpack_(new Blob(fs.readFileSync(process.argv[3])));
  const p=env.ctx.DMP_plan_(env.ctx.DMP_source_(rows),workbook,null);
  assert.equal(p.changes.length,0,'Actual snapshot must bootstrap without writes');
  console.log('COMPATIBILITY '+JSON.stringify({approvedProducts:p.approved,variants:p.manifest.products.length,categories:p.manifest.categories.length,changes:p.changes.length,zipParts:Object.keys(workbook.parts).length}));
}
