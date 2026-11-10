'use strict';

// A narrowly scoped custody record for the phase-1 harness. Never a settlement,
// migration of TURNOS, proof of no effects, or production activation mechanism.
function stagingIsolationMode_() {return 'STAGING_PHASE1_OPENINGS_881A71C_V1';}
function stagingIsolationSource_() {return '881a71c9f705ebe8ef4772273c9ed0a7a1b0d8fd';}
function stagingIsolationProject_() {return '1sh5fyAaa0onlNsNZ40EokGumubebYEMisTGZ8rNj75gBiOsYPkA-rV4O';}
function stagingIsolationEnvironment_(m) {
  if(CONFIG.environment!=='STAGING' || CONFIG.mainSheetId!==ENVIRONMENTS.STAGING.mainSheetId ||
      CONFIG.opsSheetId!==ENVIRONMENTS.STAGING.opsSheetId || m.getId()!==ENVIRONMENTS.STAGING.mainSheetId ||
      typeof ScriptApp==='undefined' || typeof ScriptApp.getScriptId!=='function' || ScriptApp.getScriptId()!==stagingIsolationProject_())
    throw historyError_('El aislamiento de pruebas sólo admite el proyecto y libros canónicos de STAGING.');
}
function stagingIsolationCases_() {
  // Exact bodies from tests/test_phase1_shifts_cuts.py at the immutable source.
  // Hashing at that revision bound {action,payload}; it did not inject requestId.
  return [
    {stationId:'CAJA_1',registerId:'GAVETA_1',openingFloat:2000,phase:'Solar',openingNotes:'Apertura turno matutino'},
    {stationId:'CAJA_1',registerId:'GAVETA_OTRA',openingFloat:1000},
    {stationId:'GUARDARROPA',registerId:'GAVETA_1',openingFloat:500},
    {stationId:'ACCESOS',registerId:'GAVETA_ACCESOS',openingFloat:1000,phase:'Solar'}
  ];
}
function stagingIsolationHeaders_() {
  return {
    TURNOS:['shiftId','operationDayId','businessDate','stationId','registerId','phase','openedAt','openedBy','openingFloat','openingFloatBreakdown','openingNotes','status','countingStartedAt','closedAt','closedBy','cutId','version','requestId','createdAt'],
    CORTES_Z:['cutId','shiftId','operationDayId','businessDate','registerId','stationId','openedAt','closedAt','openingFloat','cashSales','cashOtherIncome','cashRefunds','cashWithdrawals','cashExpenses','expectedCash','countedCash','difference','differenceStatus','terminal1','terminal2','transfersConfirmed','transfersPending','ticketingExternalValue','ticketingExternalReceivable','courtesyCount','courtesyCommercialValue','tips','openAccounts','openAccountsBalance','grossSales','netSales','snapshotJson','snapshotHash','closedBy','createdAt','requestId','version']
  };
}
function stagingIsolationBusinessDate_(value,expected,zone) {
  if(typeof expected!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(expected))return false;
  const calendar=new Date(expected+'T00:00:00.000Z');
  if(!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10)!==expected)return false;
  if(typeof value==='string')return value===expected;
  // Sheets getValues() can return a native Date for a date-only cell. Compare
  // civil midnight in the book's zone, never the machine/script/UTC date. Do not
  // coerce serial numbers, truncate a time of day, or change the original cell.
  if(!(value instanceof Date) || !Number.isFinite(value.getTime()) || typeof zone!=='string' || !zone || zone!==zone.trim())return false;
  try {return Utilities.formatDate(value,zone,'yyyy-MM-dd HH:mm:ss.SSS')===expected+' 00:00:00.000';}
  catch(_) {return false;}
}
function stagingIsolationEvidence_(m,rows) {
  stagingIsolationEnvironment_(m);
  const fail=msg=>{throw historyError_('Aislamiento de pruebas: '+msg);};
  const cases=stagingIsolationCases_(),hashes=cases.map(p=>historyHash_({action:'turnoAbrir',payload:p}));
  const entries=[],openings=[],aliases=[],headers=stagingIsolationHeaders_(),tables={};
  const ledger=m.getSheetByName('REQUESTS');
  if(!ledger || ledger.getLastRow()<139 || ledger.getRange(131,1,9,8).getFormulas().some(r=>r.some(Boolean)))fail('Las nueve solicitudes deben ser valores originales literales en REQUESTS.');
  Object.keys(headers).forEach(name=>{
    const sheet=m.getSheetByName(name),width=headers[name].length;
    if(!sheet || sheet.getLastColumn()!==width || JSON.stringify(sheet.getRange(1,1,1,width).getValues()[0])!==JSON.stringify(headers[name]))fail('Esquema '+name+' no acreditado.');
    tables[name]={lastRow:sheet.getLastRow(),width:width,hash:historyPrefix_(sheet,sheet.getLastRow(),width)};
  });
  if(tables.TURNOS.lastRow!==3)fail('Se requieren exactamente los dos turnos inventariados, sin otros turnos.');
  const shifts=m.getSheetByName('TURNOS').getRange(2,1,2,19).getValues();
  let businessDateTimeZone=null;
  if(shifts.some(r=>r[2] instanceof Date)) {
    try {businessDateTimeZone=m.getSpreadsheetTimeZone();}catch(_){fail('No se pudo acreditar la zona de la fecha nativa del libro.');}
    if(typeof businessDateTimeZone!=='string' || !businessDateTimeZone || businessDateTimeZone!==businessDateTimeZone.trim())fail('Falta la zona de la fecha nativa del libro.');
  }
  if(m.getSheetByName('TURNOS').getRange(2,1,2,19).getFormulas().some(r=>r.some(Boolean)))fail('TURNOS contiene fórmulas, no identidades literales.');
  for(let row=131;row<=139;row++) {
    const r=rows[row-2],caseIndex=r?hashes.indexOf(r[2]):-1,completed=row===131 || row===134;
    if(!r || !requestRootIdValid_(r[0]) || r[1]!=='turnoAbrir' || caseIndex<0 || r[3]!=='TEST-DEV-PHASE1' ||
        r[4]!== (completed?'COMPLETED':'FAILED') || rows.filter(v=>v[0]===r[0]).length!==1 || journalFind_(r[0],m))fail('Identidad, procedencia, estado o unicidad fuera del conjunto auditado 131–139.');
    let result;try{result=JSON.parse(r[7]);}catch(_){fail('Respuesta original ilegible.');}
    if(!result || typeof result!=='object' || Array.isArray(result) || historyHasJourney_(r[7]))fail('Respuesta original incompatible.');
    entries.push({row:row,requestId:r[0],payloadHash:r[2],status:r[4]});
    if(!completed) {
      if(typeof result.error!=='string' || !result.error || result.ok===true || result.shiftId)fail('Rechazo histórico ambiguo.');
      continue;
    }
    const n=row===131?0:1,s=shifts[n],p=cases[caseIndex];
    if(caseIndex!==(n===0?0:3) || result.ok!==true || result.status!=='OPEN' || !requestRootIdValid_(result.shiftId) ||
        journeyTimestamp_(result.openedAt)===null || typeof result.openedBy!=='string' || !result.openedBy ||
        !stagingIsolationBusinessDate_(s[2],result.businessDate,businessDateTimeZone) || result.operationDayId!=='OPDAY-'+result.businessDate.replace(/-/g,'') ||
        result.stationId!==p.stationId || result.registerId!==p.registerId || result.openingFloat!==p.openingFloat || result.phase!=='Solar' ||
        s[0]!==result.shiftId || s[1]!==result.operationDayId || s[3]!==result.stationId || s[4]!==result.registerId ||
        s[5]!==result.phase || s[6]!==result.openedAt || s[7]!==result.openedBy || s[8]!==result.openingFloat || s[9]!=='' ||
        s[10]!== (p.openingNotes || '') || s[11]!=='OPEN' || s.slice(12,16).some(v=>v!=='') || s[16]!==1 ||
        !requestRootIdValid_(s[17]) || rows.some(v=>v[0]===s[17]) || s[18]!==result.openedAt)fail('TURNOS y apertura no coinciden literalmente, o tienen cierre/identidad no prevista.');
    openings.push(result.shiftId);aliases.push(s[17]);
  }
  const ids=entries.map(v=>v.requestId),refs=ids.concat(openings,aliases);
  if(new Set(refs).size!==13)fail('Identidades de solicitudes, turnos y alias deben ser distintas.');
  const evidence={mode:stagingIsolationMode_(),sourceCommit:stagingIsolationSource_(),projectId:stagingIsolationProject_(),entries:entries,shiftIds:openings,aliases:aliases,tables:tables};
  if(businessDateTimeZone!==null)evidence.businessDateTimeZone=businessDateTimeZone;
  return evidence;
}
function stagingIsolationContains_(value,refs) {
  if(value && typeof value==='object')return Object.keys(value).some(k=>stagingIsolationContains_(k,refs) || stagingIsolationContains_(value[k],refs));
  if(typeof value!=='string')return false;
  if(refs.some(id=>value.includes(id)))return true;
  // JSON.parse accepts leading/trailing JSON whitespace and decodes escaped
  // keys, values, arrays and string envelopes. Never normalize persisted cells.
  if(!['{','[','"'].includes(value.trimStart()[0]))return false;
  let parsed;try{parsed=JSON.parse(value);}catch(_){return false;}
  return stagingIsolationContains_(parsed,refs);
}
function stagingIsolationReferences_(m,isolation,rows,ownId) {
  const refs=isolation.entries.map(e=>e.requestId).concat(isolation.shiftIds,isolation.aliases);
  const contains=v=>stagingIsolationContains_(v,refs);
  // Conservatively reject tagged links; this cannot prove absence of untagged effects.
  if(rows.some(r=>!isolation.entries.some(e=>e.requestId===r[0]) && r[0]!==ownId && r.some(contains)))throw historyError_('Hay otra solicitud vinculada a las pruebas retenidas.');
  ['COBROS','CAJA 2','COMANDAS','ACCESO','CORTES_Z','MOVIMIENTOS','DEVOLUCIONES','AJUSTES_Z'].forEach(name=>{
    const sheet=m.getSheetByName(name);
    if(!sheet) {
      if(['COBROS','CAJA 2','COMANDAS','ACCESO','CORTES_Z'].includes(name))throw historyError_('Falta evidencia de '+name+'.');
      return;
    }
    if(!sheet.getLastRow())return;
    const range=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn());
    if(range.getValues().some(r=>r.some(contains)) || range.getFormulas().some(r=>r.some(contains)))throw historyError_('Hay una referencia a las pruebas en '+name+'; revisar sin aislarla.');
  });
  const plans=journalRows_(m.getSheetByName('DOMUS_JOURNAL'));
  if(plans.some(r=>r[0]!==ownId && r.some(contains)))throw historyError_('Hay un journal vinculado a las pruebas.');
}
function stagingIsolationValidate_(m,b,ledger) {
  const s=b.snapshot,isolation=s.isolation;
  stagingIsolationEnvironment_(m);
  if(b.kind!=='STAGING_TEST_OPENING_ISOLATION' || b.confirmLegacyTestWriterDisabled!==true || b.acceptUnattributedEffectsUnresolved!==true ||
      !isolation || isolation.mode!==stagingIsolationMode_() || isolation.sourceCommit!==stagingIsolationSource_() || s.queue.length)
    throw historyError_('Custodia de pruebas incompleta; no aplicar el límite general.');
  const current=stagingIsolationEvidence_(m,ledger.slice(0,s.requests.lastRow-1));
  if(historyHash_(current)!==historyHash_(isolation))throw historyError_('Cambió la evidencia de TURNOS/CORTES_Z o de las solicitudes retenidas.');
  stagingIsolationReferences_(m,isolation,ledger,b.boundaryId);
  return new Set(isolation.entries.map(e=>e.requestId).concat(isolation.aliases,isolation.shiftIds));
}
function stagingIsolationRegistrationGuard_(m,id,deviceId) {
  // Called by the idempotent wrapper before even a PROCESSING row is appended.
  // An isolation request must not write to another environment or consume one
  // of the original TURNOS aliases as its new administrative identity.
  stagingIsolationEnvironment_(m);
  const isolation=stagingIsolationEvidence_(m,requestRows_(m.getSheetByName('REQUESTS')));
  if(stagingIsolationContains_([id,deviceId],isolation.entries.map(e=>e.requestId).concat(isolation.aliases,isolation.shiftIds)))
    throw historyError_('El registro administrativo necesita una identidad nueva, distinta de las pruebas y sus alias.');
}
