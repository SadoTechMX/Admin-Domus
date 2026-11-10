'use strict';

// Full history, including rows beyond preformatted templates. Never truncate finance.
function dataRows_(sheet, first, width, column) {
  if (!sheet) throw new Error('SCHEMA_MISSING_SHEET');
  const count = sheet.getLastRow() - first + 1;
  return count > 0 ? sheet.getRange(first, column || 1, count, width).getValues() : [];
}

function schemaColumns_(sheet, required, headerRow) {
  if (!sheet) throw new Error('SCHEMA_MISSING_SHEET');
  const headers = sheet.getRange(headerRow || 6, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim();
    if (key && map[key]) throw new Error('SCHEMA_DUPLICATE_HEADER: ' + key);
    if (key) map[key] = i + 1;
  });
  required.forEach(h => { if (!map[h]) throw new Error('SCHEMA_MISSING_HEADER: ' + h); });
  return map;
}

function paymentApplied_(row) {
  const state = String(row[10] || '').trim().toLowerCase();
  if (['borrador', 'pendiente', 'pendiente_verificacion', 'rechazado', 'anulado', 'cancelado'].includes(state)) return 0;
  if (String(row[4]) === 'Transferencia' && !['confirmado', 'verificado', 'confirmada'].includes(state)) return 0;
  return Number(row[13]) || 0;
}

// Build exact, narrow input writes; never blank calculated columns in CAJA/COBROS.
function cellWrite_(sheet, row, column, value, formula) {
  if (!sheet) throw new Error('SCHEMA_MISSING_SHEET');
  if (typeof value === 'string' && value[0] === '=' && !formula) throw new Error('Texto inválido: no se aceptan fórmulas del cliente.');
  return { sheet: sheet.getName(), book: sheet.getParent().getId(), row: row, column: column, value: value };
}

function journalSheet_(m) {
  let s = m.getSheetByName('DOMUS_JOURNAL');
  if (!s) {
    s = m.insertSheet('DOMUS_JOURNAL');
    s.getRange(1, 1, 1, 6).setValues([['REQUEST_ID', 'ACTION', 'STATUS', 'PLAN', 'RESULT', 'CREATED_AT']]);
  }
  return s;
}

function journalRowHasContent_(row) {
  return row.some(v=>v!=='' && v!==null);
}

// Validate every populated row, including formulas whose displayed value is empty.
// Return physical rows unchanged: filtering blank rows would shift replay addresses.
// A fragment is evidence only with one parent and the exact complete part set.
function journalRows_(sheet) {
  const fail=(row,message)=>{
    const e=new Error('JOURNAL_INTEGRITY_REQUIRES_REVIEW: fila '+row+'. '+message+' Conservar el original; no reanudar ni reconstruir.');
    e.code='JOURNAL_INTEGRITY_REQUIRES_REVIEW';e.status=409;throw e;
  };
  if(!sheet)return [];
  const header=sheet.getRange(1,1,1,6);
  if(journalRowHasContent_(header.getFormulas()[0]) || JSON.stringify(header.getValues()[0])!==JSON.stringify(['REQUEST_ID','ACTION','STATUS','PLAN','RESULT','CREATED_AT']))fail(1,'Encabezados incompatibles.');
  if(sheet.getLastRow()<2)return [];
  const range=sheet.getRange(2,1,sheet.getLastRow()-1,6),rows=range.getValues(),formulas=range.getFormulas();
  const index=new Map(),roots=[],chunks=[];
  const identity=v=>typeof v==='string' && !!v && v.trim()===v;
  rows.forEach((r,i)=>{
    const row=i+2;
    if(!journalRowHasContent_(r) && !journalRowHasContent_(formulas[i]))return;
    if(journalRowHasContent_(formulas[i]) || !identity(r[0]) || !identity(r[1]) || !['PREPARED','COMPLETED'].includes(r[2]))fail(row,'Identidad, estado o fórmula incompatible.');
    if(index.has(r[0]))fail(row,'ID de journal duplicado.');
    const entry={id:r[0],action:r[1],status:r[2],row:row};index.set(entry.id,entry);
    try{entry.plan=JSON.parse(r[3]);}catch(_){fail(row,'Plan ilegible.');}
    if(entry.action==='JOURNAL_PART') {
      const match=entry.id.match(/^(.+)#part:(0|[1-9]\d*)$/);
      if(!match || !Number.isSafeInteger(Number(match[2])) || entry.status!=='COMPLETED' || !Array.isArray(entry.plan))fail(row,'Fragmento sin identidad/estado/plan válido.');
      entry.parentId=match[1];entry.part=Number(match[2]);chunks.push(entry);
    } else {
      if(entry.id.includes('#part:'))fail(row,'Identidad reservada para fragmentos.');
      if(!Array.isArray(entry.plan) && (!entry.plan || typeof entry.plan!=='object' || Object.keys(entry.plan).length!==1 ||
        !Number.isSafeInteger(entry.plan.parts) || entry.plan.parts<0 || entry.plan.parts>rows.length))fail(row,'Descriptor de plan incompatible.');
      roots.push(entry);
    }
  });
  const children=new Map();
  chunks.forEach(c=>{
    const parent=index.get(c.parentId);
    if(!parent || parent.action==='JOURNAL_PART' || Array.isArray(parent.plan) || c.part>=parent.plan.parts)fail(c.row,'Fragmento huérfano o fuera del descriptor de su padre.');
    const list=children.get(parent.id)||[];list.push(c);children.set(parent.id,list);
  });
  roots.forEach(parent=>{
    const parts=children.get(parent.id)||[],expected=Array.isArray(parent.plan)?0:parent.plan.parts;
    if(parts.length!==expected || parts.some(c=>index.get(parent.id+'#part:'+c.part)!==c))fail(parent.row,'Conjunto de fragmentos incompleto.');
  });
  return rows;
}

function journalFind_(id, m) {
  const s = m.getSheetByName('DOMUS_JOURNAL');
  if (!s) return null;
  const rows = journalRows_(s);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return { sheet: s, row: i + 2, data: rows[i] };
  }
  return null;
}

function journalResume_(id, action, m) {
  historyGuard_(m,id,action); // Includes direct readers/recovery paths outside the dispatcher.
  const record=journalFind_(id,m);
  if(!record)return null;
  if(record.data[1]!==action)throw new Error('IDEMPOTENCY_KEY_REUSED');
  const result=JSON.parse(record.data[4]);
  if(record.data[2]==='COMPLETED')return result;
  const descriptor=JSON.parse(record.data[3]);
  let plan;
  if(Array.isArray(descriptor))plan=descriptor;
  else {
    const all=journalRows_(record.sheet);plan=[];
    for(let part=0;part<descriptor.parts;part++) {
      const chunks=all.filter(r=>r[0]===id+'#part:'+part && r[1]==='JOURNAL_PART');
      if(chunks.length!==1)throw new Error('JOURNAL_INCOMPLETE_PLAN_REQUIRES_REVIEW');
      plan.push(...JSON.parse(chunks[0][3]));
    }
  }
  activityValidateJournal_(plan,m);
  const comparable=v=>v instanceof Date?v.toISOString():v;
  plan.forEach(w=>{
    const s=(w.book && w.book!==m.getId()?SpreadsheetApp.openById(w.book):m).getSheetByName(w.sheet);
    const values=w.values || [[w.value]],before=w.beforeValues || [[w.before]],types=w.types || [[w.type]];
    const range=s.getRange(w.row,w.column,1,values[0].length);
    const current=range.getValues()[0],formulas=range.getFormulas()[0];
    current.forEach((v,i)=>{
      const actual=JSON.stringify(comparable(formulas[i]||v));
      if(actual!==JSON.stringify(values[0][i]) && actual!==JSON.stringify(before[0][i])) {
        const err=new Error('JOURNAL_CONFLICT: '+w.sheet+':'+w.row+':'+(w.column+i));
        err.code='IDEMPOTENCY_REQUIRES_REVIEW';throw err;
      }
    });
    range.setValues([values[0].map((v,i)=>types[0][i]==='date'?new Date(v):v)]);
  });
  SpreadsheetApp.flush();record.sheet.getRange(record.row,3).setValue('COMPLETED');SpreadsheetApp.flush();
  return result;
}

function journalCommit_(id, action, m, writes, result) {
  if(!id)throw new Error('REQUEST_ID_REQUIRED');
  const old=journalResume_(id,action,m);if(old)return old;
  activityValidateJournal_(writes,m);
  const s=journalSheet_(m);
  if(journalRows_(s).some(r=>journalRowHasContent_(r) && r[2]!=='COMPLETED'))throw new Error('JOURNAL_RECOVERY_REQUIRED: resolver intención previa antes de continuar.');
  const seen=new Set();
  const sorted=writes.slice().sort((a,b)=>String(a.book+a.sheet).localeCompare(String(b.book+b.sheet)) || a.row-b.row || a.column-b.column);
  const groups=[];
  sorted.forEach(w=>{
    const key=w.book+':'+w.sheet+':'+w.row+':'+w.column;
    if(seen.has(key))throw new Error('JOURNAL_DUPLICATE_CELL: '+key);seen.add(key);
    const last=groups[groups.length-1];
    if(last && last.book===w.book && last.sheet===w.sheet && last.row===w.row && last.column+last.raw.length===w.column){last.raw.push(w.value);if(last.activityHeaders)last.activityHeaders.push(w.activityHeader);}
    else groups.push({book:w.book,sheet:w.sheet,row:w.row,column:w.column,raw:[w.value],...(w.sheet==='ACTIVIDADES'?{activityHeaders:[w.activityHeader]}:{})});
  });
  groups.forEach(w=>{
    const target=(w.book && w.book!==m.getId()?SpreadsheetApp.openById(w.book):m).getSheetByName(w.sheet);
    if(w.row>target.getMaxRows())target.insertRowsAfter(target.getMaxRows(),w.row-target.getMaxRows());
    const range=target.getRange(w.row,w.column,1,w.raw.length),oldValues=range.getValues()[0],formulas=range.getFormulas()[0],rules=range.getDataValidations()[0];
    w.beforeValues=[oldValues.map((v,i)=>formulas[i] || (v instanceof Date?v.toISOString():v))];
    w.types=[w.raw.map(v=>v instanceof Date?'date':null)];
    w.values=[w.raw.map(v=>v instanceof Date?v.toISOString():v)];delete w.raw;
    w.values[0].forEach((value,i)=>{
      const rule=rules[i];
      if(rule && rule.getAllowInvalid()===false && !(typeof value==='string' && value[0]==='=')) {
        const kind=String(rule.getCriteriaType()),args=rule.getCriteriaValues();
        if(kind==='VALUE_IN_LIST' && !args[0].map(String).includes(String(value)))throw new Error('SCHEMA_VALIDATION: '+w.sheet+':'+w.row);
        if(kind==='VALUE_IN_RANGE' && !args[0].getValues().flat().map(String).includes(String(value)))throw new Error('SCHEMA_VALIDATION: '+w.sheet+':'+w.row);
      }
    });
  });
  const chunks=[];let chunk=[];
  groups.forEach(w=>{
    if(JSON.stringify(chunk.concat(w)).length>40000){if(!chunk.length)throw new Error('JOURNAL_CELL_TOO_LARGE');chunks.push(chunk);chunk=[];}
    chunk.push(w);
  });
  if(chunk.length)chunks.push(chunk);
  const now=new Date().toISOString();
  const rows=[[id,action,'PREPARED',JSON.stringify({parts:chunks.length}),JSON.stringify(result),now]];
  chunks.forEach((part,i)=>rows.push([id+'#part:'+i,'JOURNAL_PART','COMPLETED',JSON.stringify(part),'',now]));
  const start=s.getLastRow()+1;if(start+rows.length-1>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),start+rows.length-1-s.getMaxRows());
  // One durable preparation batch, including all chunks, before any business effect.
  s.getRange(start,1,rows.length,6).setValues(rows);SpreadsheetApp.flush();
  return journalResume_(id,action,m);
}
