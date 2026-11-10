'use strict';

// Administrative fence, not a reconciliation or a financial opening balance.
// No time/status heuristic can establish that a legacy FAILED had no effects.
function historyError_(message,noEffects) {
  const e=new Error('Histórico en revisión: '+message);
  e.code=noEffects?'HISTORY_BOUNDARY_NO_EFFECTS':'HISTORY_REQUIRES_REVIEW';e.status=noEffects?422:409;return e;
}
function historyHash_(value) {
  const hash=computePayloadHash_(JSON.parse(JSON.stringify(value)));
  if(!/^[a-f0-9]{64}$/.test(hash))throw historyError_('No se pudo acreditar la huella SHA-256.');return hash;
}
function historyPrefix_(sheet,lastRow,width) {
  if(!sheet || !Number.isInteger(lastRow) || lastRow<1 || sheet.getLastRow()<lastRow)throw historyError_('Falta el rango original.');
  const range=sheet.getRange(1,1,lastRow,width);
  return historyHash_({sheet:sheet.getName(),lastRow:lastRow,values:range.getValues(),formulas:range.getFormulas()});
}
function historyNoEffects_(m,rows) {
  if(rows.length!==1 || rows[0][1]!=='registrarLimiteHistorico' || journalFind_(String(rows[0][0]),m))return false;
  try {const e=JSON.parse(rows[0][7]);return e.code==='HISTORY_BOUNDARY_NO_EFFECTS' && e.status===422;}catch(_){return false;}
}
function historyHasJourney_(raw) {
  try {
    const walk=v=>v && typeof v==='object' && Object.keys(v).some(k=>['journey','journeyContract','originJourney'].includes(k) || walk(v[k]));
    return !!walk(JSON.parse(raw));
  }catch(_){return /"(?:journey|journeyContract|originJourney)"\s*:/.test(String(raw));}
}
function historySnapshot_(m,p,ownId) {
  const fail=message=>{throw historyError_(message,true);};
  const policy=journeyPolicy_(m);
  if(!policy)fail('Se requiere el mapa explícito de jornadas.');
  const text=v=>typeof v==='string' && v.trim()===v && v.length>0 && v.length<=200;
  if(!p || !Array.isArray(p.queue) || p.queue.length>500 || p.queue.some(v=>!v || !text(v.requestId) || !text(v.action)) ||
      new Set(p.queue.map(v=>v.requestId)).size!==p.queue.length || !Array.isArray(p.stationDeviceIds) ||
      p.stationDeviceIds.some(v=>!text(v)) || new Set(p.stationDeviceIds).size!==p.stationDeviceIds.length ||
      !policy.stations.every(s=>p.stationDeviceIds.includes(s.deviceId)) || !text(p.evidenceReference))fail('Inventario de estaciones/colas y referencia privada de evidencia requeridos.');
  const s=m.getSheetByName('REQUESTS') || m.getSheetByName('TRANSACCIONES_API');
  if(!s)fail('Falta REQUESTS; no inferir historial vacío.');
  if(JSON.stringify(s.getRange(1,1,1,8).getValues()[0])!==JSON.stringify(['REQUEST_ID','ACTION','PAYLOAD_HASH','DEVICE_ID','STATUS','CREATED_AT','COMPLETED_AT','RESPONSE']))fail('Encabezados REQUESTS incompatibles; no interpretar columnas por inferencia.');
  if(ownId && p.queue.some(q=>q.requestId===ownId))fail('El registro administrativo necesita un ID distinto a los retenidos.');
  let last=s.getLastRow();const all=dataRows_(s,2,8),own=all.filter(r=>r[0]===ownId);
  if(ownId) {
    if(own.length!==1 || own[0][1]!=='registrarLimiteHistorico' || own[0][4]!=='PROCESSING' || all[all.length-1]!==own[0])fail('El inventario cambió antes del registro.');
    last--;
  }
  const rows=all.slice(0,Math.max(0,last-1)),index=new Map();
  rows.forEach(r=>{
    if(!r[0]){if(r.some(v=>v!=='' && v!==null))fail('Fila sin ID con evidencia: revisión manual requerida.');return;}
    const id=String(r[0]);if(id.trim()!==id)fail('ID histórico no canónico.');
    const list=index.get(id)||[];list.push(r);index.set(id,list);
  });
  let uncertain=0,duplicates=0;
  index.forEach((rs,id)=>{
    if(historyNoEffects_(m,rs) || journeyKnownNoEffects_(m,rs))return;
    // This first fence only addresses legacy POS/KDS failures, not newer journeys,
    // bank resolutions, unknown PROCESSING or a prepared plan with business writes.
    if(rs.some(r=>['turnoAbrir','corteZCerrar','registrarLimiteHistorico'].includes(r[1]) ||
      historyHasJourney_(r[7])))fail('Hay una jornada o límite previo; no se puede apartar como legado.');
    if(rs.some(r=>!['COMPLETED','FAILED'].includes(r[4])))fail('Estado histórico no admisible para este límite.');
    if(rs.length>1 || rs[0][4]!=='COMPLETED') {
      if(rs.some(r=>!['cajaSimpleRegistrar','comandasSimpleAccion'].includes(r[1])) || new Set(rs.map(r=>r[1])).size!==1 || journalFind_(id,m))fail('Intención incierta fuera del alcance legado sin journal.');
      uncertain++;if(rs.length>1)duplicates++;
    }
  });
  const journal=m.getSheetByName('DOMUS_JOURNAL'),jr=journalRows_(journal);
  if(journal && JSON.stringify(journal.getRange(1,1,1,6).getValues()[0])!==JSON.stringify(['REQUEST_ID','ACTION','STATUS','PLAN','RESULT','CREATED_AT']))fail('Encabezados del journal incompatibles.');
  if(jr.some(r=>journalRowHasContent_(r) && r[2]!=='COMPLETED'))fail('Hay un journal incompleto; recuperar su mismo ID antes de proponer un límite.');
  const journalIds=jr.filter(journalRowHasContent_).map(r=>String(r[0]));
  if(new Set(journalIds).size!==journalIds.length || jr.some(r=>journalRowHasContent_(r) && !index.has(r[1]==='JOURNAL_PART'?String(r[0]).replace(/#part:\d+$/,''):String(r[0]))))fail('Journal duplicado o sin REQUESTS original; revisión requerida.');
  const queue=p.queue.map(v=>({requestId:v.requestId,action:v.action})).sort((a,b)=>a.requestId.localeCompare(b.requestId));
  if(queue.some(q=>index.has(q.requestId) && index.get(q.requestId).some(r=>r[1]!==q.action)))fail('La acción de la cola no coincide con REQUESTS.');
  const snapshot={version:1,book:m.getId(),environment:CONFIG.environment,
    requests:{sheet:s.getName(),lastRow:last,hash:historyPrefix_(s,last,8)},
    journal:{lastRow:journal?journal.getLastRow():0,hash:journal?historyPrefix_(journal,journal.getLastRow(),6):null},
    queue:queue,stationDeviceIds:p.stationDeviceIds.slice().sort(),evidenceReference:p.evidenceReference,journeyPolicyHash:historyHash_(policy),
    counts:{historicalIds:index.size,uncertainIds:uncertain,duplicateIds:duplicates,queueIds:queue.length,
      queueAbsent:queue.filter(q=>!index.has(q.requestId)).length}};
  return {snapshot:snapshot,snapshotHash:historyHash_(snapshot)};
}

function historyValidateBoundary_(m,b) {
  if(!b || b.ok!==true || b.kind!=='LEGACY_HISTORY_BOUNDARY' || b.version!==1 || b.financialFinal!==false || b.resolved!==false ||
      b.acknowledgeUnresolvedHistory!==true || b.confirmStationsHeld!==true || b.newCharge!==0 || b.inventoryMovement!==0 || !b.approvalReference ||
      !b.boundaryId || !b.snapshot || b.snapshot.book!==m.getId() || b.snapshot.environment!==CONFIG.environment ||
      !CONFIG.managers.includes(b.authorizedPrincipal) || !['ADMIN','GERENCIA'].includes(b.authorizedRole) ||
      journeyTimestamp_(b.recordedAt)===null || b.snapshotHash!==historyHash_(b.snapshot))throw historyError_('Registro administrativo incompatible.');
  const s=b.snapshot,j=m.getSheetByName('DOMUS_JOURNAL');
  if(s.version!==1 || !s.requests || !['REQUESTS','TRANSACCIONES_API'].includes(s.requests.sheet) ||
      !s.journal || !Number.isInteger(s.journal.lastRow) || s.journal.lastRow<0 || !Array.isArray(s.queue) ||
      s.queue.some(q=>!q || typeof q.requestId!=='string' || !q.requestId || typeof q.action!=='string' || !q.action) ||
      !s.counts || ['historicalIds','uncertainIds','duplicateIds','queueIds','queueAbsent'].some(k=>!Number.isInteger(s.counts[k]) || s.counts[k]<0))throw historyError_('Inventario administrativo incompleto.');
  const authoritative=m.getSheetByName('REQUESTS') || m.getSheetByName('TRANSACCIONES_API');
  if(!authoritative || authoritative.getName()!==s.requests.sheet || historyHash_(journeyPolicy_(m))!==s.journeyPolicyHash)throw historyError_('Cambió el libro autoritativo o el mapa aprobado de estaciones/jornadas.');
  if(s.requests.hash!==historyPrefix_(m.getSheetByName(s.requests.sheet),s.requests.lastRow,8) ||
      (s.journal.lastRow && s.journal.hash!==historyPrefix_(j,s.journal.lastRow,6)))throw historyError_('La evidencia histórica cambió. Conservar copias y revisar; no recalcular el límite.');
  const ids=new Set(s.requests.lastRow>1?m.getSheetByName(s.requests.sheet).getRange(2,1,s.requests.lastRow-1,1).getValues().map(r=>String(r[0])).filter(Boolean):[]);
  s.queue.forEach(q=>ids.add(q.requestId));
  // Frozen prefix only. Appending a duplicate of any fenced ID is also a change,
  // including a previously absent station ID. Never treat it as newly completed.
  const after=dataRows_(m.getSheetByName(s.requests.sheet),s.requests.lastRow+1,8);
  if(after.some(r=>r.some(v=>v!=='' && v!==null) && (!r[0] || !r[1] || !['PROCESSING','COMPLETED','FAILED','REQUIRES_REVIEW'].includes(r[4]))))throw historyError_('Nueva evidencia sin ID, acción o estado reconocible. No excluirla por falta de jornada.');
  const afterIds=after.filter(r=>r[0]).map(r=>String(r[0]));
  if(new Set(afterIds).size!==afterIds.length)throw historyError_('ID nuevo duplicado después del límite.');
  if(after.some(r=>ids.has(String(r[0]))))throw historyError_('Un ID retenido reapareció fuera del inventario original.');
  if(j) {
    const plans=journalRows_(j).slice(Math.max(0,s.journal.lastRow-1)),planIds=plans.filter(journalRowHasContent_).map(r=>String(r[0]));
    if(new Set(planIds).size!==planIds.length || plans.some(r=>journalRowHasContent_(r) &&
      !afterIds.includes(r[1]==='JOURNAL_PART'?String(r[0]).replace(/#part:\d+$/,''):String(r[0]))))throw historyError_('Nuevo journal duplicado, sin REQUESTS o para un ID retenido.');
  }
  return {result:b,ids:ids};
}

function historyBoundary_(m,ownRegistrationId) {
  const index=paymentRequestIndex_(m),j=m.getSheetByName('DOMUS_JOURNAL'),plans=journalRows_(j),candidates=[];
  index.forEach((rows,id)=>{
    if(!rows.some(r=>r[1]==='registrarLimiteHistorico') || historyNoEffects_(m,rows))return;
    const entries=plans.filter(r=>r[0]===id);
    if(id===ownRegistrationId && rows.length===1 && !entries.length)return;
    if(rows.length!==1 || entries.length!==1)throw historyError_('Registro del límite ausente, duplicado o incompleto.');
    let b,record;try{b=JSON.parse(entries[0][4]);record=JSON.parse(rows[0][7]);}catch(_){throw historyError_('Resultado del límite ilegible.');}
    if(!b || typeof b!=='object' || Array.isArray(b) || entries[0][1]!=='registrarLimiteHistorico' || !['PREPARED','COMPLETED'].includes(entries[0][2]) || entries[0][3]!==JSON.stringify({parts:0}) || b.boundaryId!==id ||
      ((id!==ownRegistrationId || rows[0][4]==='COMPLETED') && (rows[0][4]!=='COMPLETED' || entries[0][2]!=='COMPLETED' || historyHash_(b)!==historyHash_(record))))throw historyError_('El límite no está confirmado en REQUESTS y journal. Recuperar sólo su mismo ID.');
    candidates.push(historyValidateBoundary_(m,b));
  });
  if(plans.some(r=>r[1]==='registrarLimiteHistorico' && !index.has(String(r[0]))))throw historyError_('Journal administrativo sin REQUESTS.');
  if(candidates.length>1)throw historyError_('Más de un límite. No elegir el más reciente.');
  return candidates[0] || null;
}
function historyGuard_(m,id,action) {
  const b=historyBoundary_(m,action==='registrarLimiteHistorico'?id:null);
  if(b && b.ids.has(String(id)))throw historyError_('ID retenido. No reenviar, sustituir por otro ID ni fabricar un comprobante.');
  return b;
}
function historyGuardIntent_(m,id,action,payload) {
  const b=historyGuard_(m,id,action);if(!b)return;
  const p=payload || {},deny=()=>{throw historyError_('La intención apunta a un origen retenido. Conservarlo; no registrarlo de nuevo.');};
  if(['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(action) &&
      [p.sourceRequestId,p.existingPaymentRequestId].some(ref=>ref && b.ids.has(String(ref))))deny();
  if(action==='comandasSimpleAccion') {
    dataRows_(m.getSheetByName('COMANDAS'),7,1,13).forEach(r=>{
      let item;try{item=JSON.parse(r[0]);}catch(_){return;}
      if(item && 'DCS-'+item.row+'-'+(item.batch || item.id)===p.key && b.ids.has(String(item.batch || item.id)))deny();
    });
  }
}
function historyOperationalIndex_(m) {
  const index=paymentRequestIndex_(m),b=historyBoundary_(m);
  if(b)b.ids.forEach(id=>index.delete(id));return index;
}
function historyNotice_(m) {
  const b=historyBoundary_(m);return b?{boundaryId:b.result.boundaryId,snapshotHash:b.result.snapshotHash,
    counts:b.result.snapshot.counts,resolved:false,financialFinal:false,
    message:'Histórico retenido sin conciliar. El corte sólo cubre la nueva jornada; no acredita saldos, existencias ni ingresos anteriores.'}:null;
}
function prepararLimiteHistorico(p) {
  authRequireContext_('prepararLimiteHistorico');
  if(!CONFIG.managers.includes(_authContext.principal))throw historyError_('Se requiere la identidad efectiva de Gerencia.');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId);
    if(historyBoundary_(m))throw historyError_('Ya existe un límite; no reemplazarlo.');
    return Object.assign({ok:true,kind:'LEGACY_HISTORY_PROPOSAL',canActivate:false,resolved:false,financialFinal:false},historySnapshot_(m,p));
  });
}
function registrarLimiteHistorico(p) {
  authRequireContext_('registrarLimiteHistorico');
  if(!CONFIG.managers.includes(_authContext.principal))throw historyError_('Se requiere la identidad efectiva de Gerencia.');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    const resumed=journalResume_(id,'registrarLimiteHistorico',m);if(resumed)return resumed;
    if(historyBoundary_(m,id))throw historyError_('Ya existe un límite.',true);
    const candidate=historySnapshot_(m,p,id);let approval;
    try{approval=JSON.parse(PropertiesService.getScriptProperties().getProperty('DOMUS_HISTORY_BOUNDARY_APPROVAL_V1'));}catch(_){}
    if(!approval || approval.version!==1 || approval.approved!==true || approval.snapshotHash!==candidate.snapshotHash ||
        typeof approval.approvalReference!=='string' || !approval.approvalReference.trim() || p.snapshotHash!==candidate.snapshotHash ||
        p.acknowledgeUnresolvedHistory!==true || p.confirmStationsHeld!==true)throw historyError_('Falta aprobación explícita para esta huella y confirmación de estaciones retenidas. No habilitar por antigüedad.',true);
    const result={ok:true,version:1,kind:'LEGACY_HISTORY_BOUNDARY',boundaryId:id,snapshot:candidate.snapshot,snapshotHash:candidate.snapshotHash,
      approvalReference:approval.approvalReference,acknowledgeUnresolvedHistory:true,confirmStationsHeld:true,
      recordedAt:new Date().toISOString(),authorizedPrincipal:_authContext.principal,authorizedRole:_authContext.role,authorizedBy:_authContext.operator,
      resolved:false,financialFinal:false,newCharge:0,inventoryMovement:0};
    if(JSON.stringify(result).length>40000)throw historyError_('Inventario demasiado grande; no truncar IDs.',true);
    return journalCommit_(id,'registrarLimiteHistorico',m,[],result);
  });
}
