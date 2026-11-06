/**
 * ============================================================================
 * DOMUS OS · EVENTS & CALENDAR MANAGEMENT (Events.gs)
 * Programación de eventos en ACTIVIDADES y definición de tarifas de admisión
 * ============================================================================
 */

'use strict';

// Named contract of the legacy schema documented in DATA_MODEL.md. A production
// contract must be explicitly supplied; similar labels/positions are not aliases.
const LEGACY_ACTIVITY_HEADERS_ = Object.freeze({
  name:'Actividad',date:'Fecha',type:'Tipo',organizer:'Organizador',
  priceGeneral:'General',pricePareja:'Pareja',priceTrio:'Trío',priceGuardarropa:'Guardarropa',
  capacity:'Capacidad',provider:'Proveedor',base:'Base',status:'Estado',notes:'Notas'
});

function activitySchemaError_(message) {
  const err=new Error('ACTIVITY_SCHEMA_REQUIRES_REVIEW: '+message);
  err.code='ACTIVITY_SCHEMA_REQUIRES_REVIEW';err.status=409;return err;
}

function activitySchema_(sheet) {
  try {
    const columns=schemaColumns_(sheet,Object.values(LEGACY_ACTIVITY_HEADERS_));
    // These known production headers have different meanings. Never interpret a
    // mixed/partially migrated layout as the legacy contract, even if aliases exist.
    if(['% DOMUS entradas','Acuerdo validado','ESTADO DEL EVENTO'].some(h=>columns[h])) {
      throw activitySchemaError_('ACTIVIDADES requiere el mapa explícito del contrato de 35 columnas.');
    }
    const fields={};Object.keys(LEGACY_ACTIVITY_HEADERS_).forEach(k=>fields[k]=columns[LEGACY_ACTIVITY_HEADERS_[k]]);
    return {sheet:sheet,fields:fields,headers:LEGACY_ACTIVITY_HEADERS_};
  } catch(err) {
    if(err.code==='ACTIVITY_SCHEMA_REQUIRES_REVIEW')throw err;
    throw activitySchemaError_(String(err.message || err));
  }
}

function activityRows_(schema) {
  return dataRows_(schema.sheet,7,schema.sheet.getLastColumn()).map((row,index)=>{
    const item={row:index+7};Object.keys(schema.fields).forEach(k=>item[k]=row[schema.fields[k]-1]);return item;
  }).filter(item=>String(item.name || '').trim());
}

function activityFindConfirmed_(m,name) {
  const schema=activitySchema_(m.getSheetByName('ACTIVIDADES'));
  const matches=activityRows_(schema).filter(item=>String(item.name)===name);
  if(matches.length!==1 || String(matches[0].status).trim().toLowerCase()!=='confirmado') {
    const err=new Error('EVENT_PRICING_NOT_CONFIRMED');err.code='EVENT_PRICING_NOT_CONFIRMED';err.status=409;throw err;
  }
  return matches[0];
}

function activityCellWrite_(schema,row,key,value) {
  const write=cellWrite_(schema.sheet,row,schema.fields[key],value);
  write.activityHeader=schema.headers[key];return write;
}

// Check every activity group BEFORE replay writes any group. Old positional plans
// without a header binding require reconciliation; never remap a prepared plan.
function activityValidateJournal_(plan,m) {
  const writes=plan.filter(w=>w.sheet==='ACTIVIDADES');if(!writes.length)return;
  const schema=activitySchema_(m.getSheetByName('ACTIVIDADES'));
  const approved=new Set(Object.values(schema.fields));
  writes.forEach(w=>{
    const values=w.values ? w.values[0] : [w.value];
    const headers=w.activityHeaders || [w.activityHeader];
    if((w.book && w.book!==m.getId()) || w.row<7 || headers.length!==values.length)throw activitySchemaError_('Plan de evento sin vínculo de columnas.');
    values.forEach((_,i)=>{
      const column=w.column+i,actual=String(schema.sheet.getRange(6,column).getValue()).trim();
      if(!approved.has(column) || !headers[i] || headers[i]!==actual)throw activitySchemaError_('El encabezado del plan cambió o no está vinculado.');
    });
  });
}

/**
 * Registra una nueva actividad o evento con su estructura tarifaria autorizada
 */
function registrarNuevoEvento(evento) {
  authRequireContext_('registrarNuevoEvento');
  if (!evento || !evento.name) throw new Error('El nombre del evento es requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAct = m.getSheetByName('ACTIVIDADES');
    const schema=activitySchema_(sAct);

    if(activityRows_(schema).some(r=>String(r.name)===String(evento.name)))throw new Error('Actividad ya existente.');
    const amounts=[evento.priceGeneral,evento.pricePareja,evento.priceTrio,evento.priceGuardarropa].map(Number);
    if(amounts.some(n=>!Number.isFinite(n)||n<0))throw new Error('Tarifas inválidas.');
    if(!Number.isInteger(Number(evento.capacity))||Number(evento.capacity)<=0)throw new Error('Capacidad inválida.');
    const rowIdx = Math.max(sAct.getLastRow() + 1, 7);
    
    // Serializar tipos de boletos personalizados si se proporcionan
    let notesVal = evento.notes || '';
    if (Array.isArray(evento.ticketTypes) && evento.ticketTypes.length > 0) {
      notesVal = JSON.stringify(evento.ticketTypes);
    }

    const fields={
      name:evento.name,date:evento.date ? new Date(evento.date+'T12:00:00') : new Date(),
      type:evento.type || 'CLUB_NOCTURNO',organizer:evento.organizer || 'DOMUS',
      priceGeneral:amounts[0],pricePareja:amounts[1],priceTrio:amounts[2],priceGuardarropa:amounts[3],
      capacity:Number(evento.capacity),provider:'DOMUS',base:'Bruto',status:'Confirmado',notes:notesVal
    };
    const writes=Object.keys(fields).map(k=>activityCellWrite_(schema,rowIdx,k,fields[k]));
    return journalCommit_(evento.requestId,'registrarNuevoEvento',m,writes,{ok:true,message:'Evento registrado.'});
  });
}
