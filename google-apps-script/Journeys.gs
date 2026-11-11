'use strict';

// Adapter of the opening/cut contract from phase-1-shifts-cuts to REQUESTS and
// the recovery journal. No TURNOS/CORTES_Z migration or date-derived identity.
// Callers hold the same script lock across context validation and preparation.
function journeyError_(message) {
  const err=new Error('JOURNEY_REQUIRES_REVIEW: '+message);
  err.code='JOURNEY_REQUIRES_REVIEW';err.status=409;return err;
}

function journeyTimestamp_(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
  const n=Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString()===value?n:null;
}

function journeyScopeValid_(scope) {
  const text=v=>typeof v==='string' && !!v.trim() && v.length<=200;
  return !!scope && typeof scope==='object' && !Array.isArray(scope) &&
    text(scope.projectId) && text(scope.projectName) &&
    ((scope.eventId===null && scope.eventName==='') || (text(scope.eventId) && text(scope.eventName)));
}

function journeyContext_(m,openingRequestId,observedAt,ownCutId) {
  qaRecoveryOperationalGuard_();
  if(typeof openingRequestId!=='string' || !openingRequestId.trim() || !(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    throw journeyError_('Se requiere apertura identificada e instante del servidor.');
  }
  const index=historyOperationalIndex_(m),record=paymentRequest_(index,openingRequestId),p=record && record.result;
  if(!record || record.action!=='turnoAbrir' || record.status!=='COMPLETED' || !p || p.ok!==true ||
      p.journeyContract!=='domus-journey-v1' || p.openingRequestId!==openingRequestId ||
      p.journeyId!=='JOR-'+openingRequestId || typeof p.shiftId!=='string' || !p.shiftId.trim() ||
      p.status!=='OPEN' || !journeyScopeValid_(p.scope) || journeyTimestamp_(p.openedAt)===null) {
    throw journeyError_('Apertura sin vínculo durable de evento/proyecto/jornada. No importar el prototipo por fecha.');
  }
  if(observedAt.getTime()<journeyTimestamp_(p.openedAt))throw journeyError_('El instante precede la apertura.');
  const history=historyNotice_(m);
  if((p.historyBoundaryId || null)!==(history && history.boundaryId))throw journeyError_('La apertura no corresponde al límite histórico vigente.');
  const cuts=[];
  // REQUESTS lacks the body for unknown/failed cuts: never guess their scope.
  // A partial/ambiguous cut therefore prevents resolving a new active context.
  index.forEach((rows,id)=>{
    if(!rows.some(r=>r[1]==='corteZCerrar'))return;
    if(id===ownCutId && rows.length===1 && rows[0][4]==='PROCESSING' && !journalFind_(id,m))return;
    if(journeyKnownNoEffects_(m,rows))return;
    const cut=paymentRequest_(index,id),c=cut && cut.result;
    if(!cut || cut.action!=='corteZCerrar' || cut.status!=='COMPLETED' || !c || c.ok!==true ||
        c.journeyContract!=='domus-journey-v1' || c.closingRequestId!==id ||
        typeof c.openingRequestId!=='string' || !c.openingRequestId.trim() || c.journeyId!=='JOR-'+c.openingRequestId ||
        typeof c.cutId!=='string' || !c.cutId.trim() || typeof c.shiftId!=='string' || !c.shiftId.trim() ||
        c.status!=='CLOSED' || journeyTimestamp_(c.closedAt)===null) {
      throw journeyError_('Corte incierto, parcial o legado: conciliar antes de asignar una jornada.');
    }
    if(c.openingRequestId!==openingRequestId)return;
    if(c.shiftId!==p.shiftId || journeyTimestamp_(c.closedAt)<journeyTimestamp_(p.openedAt) || journeyTimestamp_(c.closedAt)>observedAt.getTime()) {
      throw journeyError_('Corte incompatible con la apertura o el instante del servidor.');
    }
    cuts.push(c);
  });
  if(cuts.length>1)throw journeyError_('Más de un corte para la misma jornada.');
  const closed=cuts.length===1;
  return {version:1,journeyId:p.journeyId,openingRequestId:openingRequestId,shiftId:p.shiftId,
    scope:{projectId:p.scope.projectId,projectName:p.scope.projectName,eventId:p.scope.eventId,eventName:p.scope.eventName},
    historyBoundaryId:p.historyBoundaryId || null,openedAt:p.openedAt,occurredAt:observedAt.toISOString(),status:closed?'CLOSED':'OPEN',allowed:!closed,
    cutId:closed?cuts[0].cutId:null,closedAt:closed?cuts[0].closedAt:null};
}

function journeyReject_(message) {
  const e=new Error(message);e.code='JOURNEY_VALIDATION_NO_EFFECTS';e.status=422;return e;
}
function journeyKnownNoEffects_(m,rows) {
  if(historyNoEffects_(m,rows))return true;
  if(rows.length!==1 || journalFind_(String(rows[0][0]),m))return false;
  let p;try {p=JSON.parse(rows[0][7]);} catch(_){return false;}
  return p && p.status===422 && ['JOURNEY_VALIDATION_NO_EFFECTS','SALE_VALIDATION_REJECTED_NO_EFFECTS','SALE_PHASE_CHANGED_NO_EFFECTS',
    'TRANSFER_POLICY_REQUIRED_NO_EFFECTS','TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS','TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS','EXISTING_PAYMENT_VALIDATION_NO_EFFECTS'].includes(p.code);
}
function journeyMoney_(n) {
  return typeof n==='number' && Number.isFinite(n) && n>=0 && Number.isSafeInteger(Math.round(n*100)) && Math.abs(n*100-Math.round(n*100))<0.00001;
}
// Only for the read-only validation phase of opening/cut. Never wrap preparation,
// Sheets writes, journal replay or unknown service exceptions as no-effects.
function journeyPreflight_(fn) {
  try {return fn();} catch(e) {
    if(['JOURNEY_REQUIRES_REVIEW','PAYMENT_EVIDENCE_REQUIRES_REVIEW','TRANSFER_HISTORY_REQUIRES_REVIEW'].includes(e.code))throw journeyReject_(e.message);
    throw e;
  }
}

// Explicit, server-maintained identity map. No default real projects/devices.
function journeyPolicy_(m) {
  const raw=PropertiesService.getScriptProperties().getProperty('DOMUS_JOURNEY_POLICY_V1');
  if(!raw) {
    const ledger=m.getSheetByName('REQUESTS'),journal=m.getSheetByName('DOMUS_JOURNAL');
    const bound=value=>{
      try {const p=JSON.parse(value);return p && (p.journeyContract==='domus-journey-v1' || (p.journey && p.journey.version===1));}
      catch(_){return /"journeyContract"|"journey"/.test(String(value));}
    };
    if((ledger && dataRows_(ledger,2,8).some(r=>bound(r[7]))) || (journal && dataRows_(journal,2,6).some(r=>bound(r[4])))) {
      throw journeyReject_('Restaurar el mapa de jornadas: ya existen aperturas vinculadas. No volver al modo legado.');
    }
    return null;
  }
  let p;try {p=JSON.parse(raw);} catch(_){throw journeyReject_('Mapa de jornadas ilegible.');}
  const key=v=>typeof v==='string' && /^[A-Za-z0-9._:-]{1,120}$/.test(v);
  if(!p || p.version!==1 || !Array.isArray(p.scopes) || !p.scopes.length || !Array.isArray(p.stations) || !p.stations.length ||
      p.scopes.some(s=>!s || !key(s.id) || !journeyScopeValid_(s) || typeof s.activity!=='string' || !s.activity.trim()) ||
      new Set(p.scopes.map(s=>s.id)).size!==p.scopes.length ||
      new Set(p.scopes.map(s=>JSON.stringify([s.projectId,s.eventId]))).size!==p.scopes.length ||
      p.stations.some(s=>!s || !key(s.deviceId) || !key(s.stationId) || !key(s.registerId) || !Array.isArray(s.scopeIds) || !s.scopeIds.length ||
        s.scopeIds.some(id=>!p.scopes.some(v=>v.id===id))) || new Set(p.stations.map(s=>s.deviceId)).size!==p.stations.length) {
    throw journeyReject_('Mapa explícito de evento/proyecto/estación/gaveta incompleto o ambiguo.');
  }
  return p;
}
function journeyStation_(policy) {
  const s=policy && policy.stations.find(s=>s.deviceId===_authContext.deviceId);
  if(!s)throw journeyReject_('Dispositivo sin estación/gaveta autorizada para jornadas.');return s;
}
function journeyOpening_(m,id) {
  const r=paymentRequest_(historyOperationalIndex_(m),id);return r && r.result;
}
function journeyAssertSettled_(m,ownId) {
  const boundary=historyBoundary_(m);
  if(boundary && boundary.result.snapshot.freshStart && journalRows_(m.getSheetByName('DOMUS_JOURNAL')).some(r=>
      journalRowHasContent_(r) && r[2]!=='COMPLETED' && (r[1]==='JOURNAL_PART'?r[0].replace(/#part:\d+$/,''):r[0])!==ownId))
    throw journeyError_('Hay un journal incompleto después del límite. Recuperar su mismo ID antes de abrir/cortar; no apartarlo como histórico.');
  historyOperationalIndex_(m).forEach((rows,id)=>{
    if(id===ownId)return;
    if(!rows.some(r=>['turnoAbrir','corteZCerrar','cajaSimpleRegistrar','confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente','comandasSimpleAccion'].includes(r[1])))return;
    if(journeyKnownNoEffects_(m,rows))return;
    if(rows.length!==1 || rows[0][4]!=='COMPLETED')throw journeyError_('Hay intenciones inciertas. Recuperar o conciliar antes de abrir/cortar.');
  });
}
function journeyOpenings_(m,now,ownId) {
  const result=[];
  historyOperationalIndex_(m).forEach((rows,id)=>{
    if(id===ownId || !rows.some(r=>r[1]==='turnoAbrir') || journeyKnownNoEffects_(m,rows))return;
    const context=journeyContext_(m,id,now,ownId);
    if(context.allowed)result.push(journeyOpening_(m,id));
  });
  return result;
}

// Pure opening preparation shared by normal and explicit absent-only paths.
function journeyPrepareOpening_(m,p,now) {
      if(!p)throw journeyReject_('Datos de apertura requeridos.');
      const policy=journeyPolicy_(m),station=journeyStation_(policy);
      const scope=policy.scopes.find(s=>s.id===p.scopeId && station.scopeIds.includes(s.id));
      if(!scope || !journeyMoney_(p.openingFloat))throw journeyReject_('Selecciona evento/proyecto autorizado y fondo inicial explícito.');
      const history=historyNotice_(m);
      if((p.historyBoundaryId || null)!==(history && history.boundaryId))throw journeyReject_('Actualiza la caja y revisa el límite histórico antes de abrir/cortar.');
      journeyAssertSettled_(m,p.requestId);
      if(journeyOpenings_(m,now,p.requestId).some(o=>o.stationId===station.stationId || o.registerId===station.registerId ||
          (o.scope.projectId===scope.projectId && o.scope.eventId===scope.eventId)))throw journeyReject_('Estación, gaveta o evento/proyecto ya tiene jornada abierta.');
      return {ok:true,journeyContract:'domus-journey-v1',openingRequestId:p.requestId,journeyId:'JOR-'+p.requestId,shiftId:'TURNO-'+p.requestId,
        scopeId:scope.id,scope:{projectId:scope.projectId,projectName:scope.projectName,eventId:scope.eventId,eventName:scope.eventName},activity:scope.activity,
        stationId:station.stationId,registerId:station.registerId,deviceId:_authContext.deviceId,openingFloat:p.openingFloat,
        historyBoundaryId:history && history.boundaryId,historyReview:history,openedAt:now.toISOString(),openedBy:_authContext.operator,status:'OPEN'};
}

function turnoAbrir(p) {
  authRequireContext_('turnoAbrir');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    const resumed=journalResume_(id,'turnoAbrir',m);if(resumed)return resumed;
    const read=historyReadView_(m);
    const result=journeyPreflight_(()=>journeyPrepareOpening_(read.book,p,new Date()));
    read.assertDimensions();
    // Opening float is custody metadata, never a sale/payment/stock mutation.
    return journalCommit_(id,'turnoAbrir',m,[],result);
  });
}

function turnoEstado() {
  authRequireContext_('turnoEstado');
  return operationalRead_(journeyState_);
}
function journeyState_(m) {
  const policy=journeyPolicy_(m);if(!policy)return {enabled:false,active:null};
  const station=journeyStation_(policy),active=journeyOpenings_(m,new Date()).filter(o=>o.stationId===station.stationId || o.registerId===station.registerId);
  if(active.length>1)throw journeyError_('Estación/gaveta con aperturas duplicadas.');
  const cuts=[],index=historyOperationalIndex_(m);
  index.forEach((rows,id)=>{
    if(rows.length!==1 || rows[0][1]!=='corteZCerrar' || rows[0][4]!=='COMPLETED')return;
    const c=paymentRequest_(index,id).result,o=c && journeyOpening_(m,c.openingRequestId);
    if(!c || c.coverage!=='JOURNEY_POS_RECEIPTS' || c.financialFinal!==false || !c.snapshot || !c.snapshot.totals || !Array.isArray(c.snapshot.openAccounts))throw journeyError_('Corte sin snapshot compatible.');
    if(o && o.stationId===station.stationId && o.registerId===station.registerId)cuts.push(c);
  });
  cuts.sort((a,b)=>b.closedAt.localeCompare(a.closedAt));
  return {enabled:true,historyReview:historyNotice_(m),active:active[0] || null,lastCut:cuts[0] || null,scopes:policy.scopes.filter(s=>station.scopeIds.includes(s.id)),stationId:station.stationId,registerId:station.registerId};
}

function journeyForMovement_(m,p,now) {
  const policy=journeyPolicy_(m);
  if(!policy){if(p.openingRequestId)throw journeyReject_('Jornada sin mapa autorizado.');return null;}
  const station=journeyStation_(policy);
  if(!p.openingRequestId)throw journeyReject_('Abre/selecciona una jornada antes de registrar el movimiento.');
  const context=journeyContext_(m,p.openingRequestId,now),o=journeyOpening_(m,p.openingRequestId);
  if(!context.allowed || o.stationId!==station.stationId || o.registerId!==station.registerId || !station.scopeIds.includes(o.scopeId)) {
    throw journeyReject_('Jornada cerrada o ajena a la estación/gaveta. No reasignar automáticamente.');
  }
  const scope=policy.scopes.find(s=>s.id===o.scopeId);
  if(!scope || scope.projectId!==context.scope.projectId || scope.eventId!==context.scope.eventId || scope.activity!==o.activity)throw journeyError_('El mapa cambió respecto a la apertura.');
  return Object.assign(context,{activity:o.activity,stationId:o.stationId,registerId:o.registerId});
}

function journeyAccountOrigin_(m,ticket,current,addingItems) {
  const records=[],index=historyOperationalIndex_(m);
  index.forEach((rows,id)=>{
    if(!rows.some(r=>r[1]==='cajaSimpleRegistrar'))return;
    const r=paymentRequest_(index,id);
    if(r.status==='COMPLETED' && r.result && r.result.ticket===ticket)records.push(r.result);
  });
  if(!records.length || records.some(r=>!r.journey || !r.originJourney))throw journeyError_('Cuenta histórica sin jornada de origen acreditada. No importarla por nombre/fecha.');
  const origin=records[0].originJourney;
  if(records.some(r=>r.originJourney.journeyId!==origin.journeyId) || current.scope.projectId!==origin.scope.projectId ||
      (addingItems && current.scope.eventId!==origin.scope.eventId))throw journeyReject_('La cuenta pertenece a otro evento/proyecto. Requiere revisión antes de vincularla.');
  const bound=new Set(records.flatMap(r=>(r.fulfillment && r.fulfillment.units || []).map(u=>u.id)));
  if(posBalanceFast_({m:m},ticket).rows.some(r=>!bound.has(r[0])))throw journeyError_('La cuenta contiene consumos sin vínculo durable de jornada.');
  return origin;
}

function journeyCutSnapshot_(m,opening,now) {
  const index=historyOperationalIndex_(m),payments=dataRows_(m.getSheetByName('COBROS'),7,31),commands=dataRows_(m.getSheetByName('COMANDAS'),7,14);
  const cancellations=transferCancellationRecords_(m,index);
  const links=transferExistingPaymentRecords_(m,index);
  const movements=[],pendingTransfers=[],pendingDeliveries=[],accounts=new Set();
  index.forEach((rows,id)=>{
    if(!rows.some(r=>['cajaSimpleRegistrar','confirmarTransferencia'].includes(r[1])))return;
    if(journeyKnownNoEffects_(m,rows))return;
    const record=paymentRequest_(index,id),r=record && record.result;
    if(!r || record.status!=='COMPLETED')throw journeyError_('Movimiento financiero sin resolver.');
    // A repeated confirmation under a different request can return the original
    // receipt. Count only the authoritative confirmation, never its duplicate ACK.
    if(record.action==='confirmarTransferencia' && r.confirmationRequestId!==id) {
      const original=paymentRequest_(index,r.confirmationRequestId);
      if(!original || original.action!=='confirmarTransferencia' || original.status!=='COMPLETED' ||
          canonicalJsonStringify_(original.result)!==canonicalJsonStringify_(r))throw journeyError_('Confirmación sin resultado original único.');
      return;
    }
    if(!r.journey) {
      const created=journeyTimestamp_(rows[0][5]);
      if(created===null || created>=journeyTimestamp_(opening.openedAt))throw journeyError_('Movimiento nuevo sin jornada acreditada.');
      return;
    }
    if(r.journey.journeyId!==opening.journeyId)return;
    accounts.add(r.ticket);
    if(r.paymentStatus==='PENDIENTE_VERIFICACION') {
      const confirmed=transferConfirmedRecords_(m,index).some(c=>c.sourceRequestId===id);
      const cancelled=cancellations.find(c=>c.sourceRequestId===id);
      const linked=links.some(p=>p.sourceRequestId===id);
      if(!confirmed && !linked && (!cancelled || cancelled.wasteReview.status!=='NO_WASTE_OBSERVED'))pendingTransfers.push({requestId:id,receipt:r.receipt,amount:r.total,
        ...(cancelled?{resolutionId:cancelled.cancellationRequestId,reason:'WASTE_REVIEW_REQUIRED'}:{})});
    }
    if(r.paid && r.verified) {
      const parts=r.payments || [{receipt:r.receipt,method:r.method,amount:r.total}];
      parts.forEach(part=>{
        const found=payments.filter(v=>v[0]===part.receipt),expectedTag=record.action==='confirmarTransferencia'?'DOMUS_TRANSFER_CONFIRMATION:':'CAJA-RAPIDA:'+id;
        if(found.length!==1 || found[0][3]!==r.ticket || found[0][4]!==part.method || Number(found[0][5])!==part.amount || paymentApplied_(found[0])!==part.amount ||
            !(record.action==='confirmarTransferencia'?String(found[0][8]).startsWith(expectedTag):found[0][8]===expectedTag))throw journeyError_('Cobro sin correspondencia única con su resultado durable.');
        movements.push({requestId:id,receipt:part.receipt,method:part.method,amount:part.amount,tip:part.method==='Efectivo'?r.tip:0});
      });
    }
    (r.fulfillment && r.fulfillment.units || []).forEach(unit=>{
      const found=commands.filter(v=>v[0]===unit.id);let item;
      try {item=found.length===1 && JSON.parse(found[0][12]);}catch(_){}
      if(!item || item.batch!==id || item.ticket!==r.ticket)throw journeyError_('Comanda sin vínculo único con la venta.');
      if(!['Entregada','Cancelada'].includes(item.state))pendingDeliveries.push({id:unit.id,requestId:id,state:item.state});
    });
  });
  const totals={Efectivo:0,'Terminal 1':0,'Terminal 2':0,Transferencia:0};let tips=0;
  movements.forEach(r=>{if(!(r.method in totals) || !journeyMoney_(r.amount) || !journeyMoney_(r.tip))throw journeyError_('Importes o medio incompatibles con el corte.');totals[r.method]=posRound_(totals[r.method]+r.amount);tips=posRound_(tips+r.tip);});
  return {coverage:'JOURNEY_POS_RECEIPTS',financialFinal:false,historyReview:historyNotice_(m),observedAt:now.toISOString(),movements:movements,totals:totals,tips:tips,
    openingFloat:opening.openingFloat,cashFromBoundPOS:posRound_(opening.openingFloat+totals.Efectivo+tips),pendingTransfers:pendingTransfers,pendingDeliveries:pendingDeliveries,
    cancelledTransfers:cancellations.filter(c=>c.journey.journeyId===opening.journeyId).map(c=>({requestId:c.cancellationRequestId,sourceRequestId:c.sourceRequestId,sourceReceipt:c.sourceReceipt,
      cancelledAmount:c.cancelledAmount,amountApplied:0,wasteStatus:c.wasteReview.status})),
    linkedPayments:links.filter(c=>c.journey.journeyId===opening.journeyId).map(c=>({requestId:c.linkRequestId,sourceRequestId:c.sourceRequestId,sourceReceipt:c.sourceReceipt,
      existingPaymentRequestId:c.existingPaymentRequestId,existingPaymentReceipt:c.existingPaymentReceipt,linkedAmount:c.linkedAmount,newCharge:0})),
    openAccounts:Array.from(accounts).map(ticket=>({ticket:ticket,due:posBalanceFast_({m:m},ticket).due})).filter(a=>a.due>0.01)};
}

function corteZCerrar(p) {
  authRequireContext_('corteZCerrar');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    const resumed=journalResume_(id,'corteZCerrar',m);if(resumed)return resumed;
    const result=journeyPreflight_(()=>{
      if(!p || !journeyMoney_(p.countedCash))throw journeyReject_('Indica el efectivo contado; no se sustituye por el esperado.');
      const policy=journeyPolicy_(m),station=journeyStation_(policy),now=new Date();
      const history=historyNotice_(m);
      if((p.historyBoundaryId || null)!==(history && history.boundaryId))throw journeyReject_('Actualiza la caja y revisa el límite histórico antes de abrir/cortar.');
      journeyAssertSettled_(m,id);
      const context=journeyContext_(m,p.openingRequestId,now,id),opening=journeyOpening_(m,p.openingRequestId);
      if(!context.allowed || opening.stationId!==station.stationId || opening.registerId!==station.registerId)throw journeyReject_('Jornada cerrada o ajena a la estación/gaveta.');
      const snapshot=journeyCutSnapshot_(m,opening,now);
      // Steven approved this closing rule on 2026-11-08. Only current server
      // evidence resolves a pending item; client overrides cannot waive it.
      if(snapshot.pendingTransfers.length || snapshot.pendingDeliveries.length) {
        const waste=snapshot.pendingTransfers.filter(p=>p.reason==='WASTE_REVIEW_REQUIRED').length;
        throw journeyReject_('Cierre bloqueado: '+(snapshot.pendingTransfers.length-waste)+' transferencia(s) sin confirmar y '+
          snapshot.pendingDeliveries.length+' comanda(s) sin resolver. '+waste+' cancelación(es) con merma por conciliar. La jornada sigue abierta.');
      }
      return {ok:true,journeyContract:'domus-journey-v1',closingRequestId:id,openingRequestId:p.openingRequestId,journeyId:context.journeyId,shiftId:context.shiftId,
        historyBoundaryId:context.historyBoundaryId,cutId:'CORTE-JOR-'+id,closedAt:now.toISOString(),closedBy:_authContext.operator,status:'CLOSED',snapshot:snapshot,countedCash:p.countedCash,
        closurePolicy:'RESOLVE_PENDING_TRANSFERS_AND_DELIVERIES',
        coverage:snapshot.coverage,financialFinal:false,message:'Jornada cerrada. Corte limitado a recibos POS vinculados; no es liquidación de reparto ni arqueo de otros movimientos.'};
    });
    if(JSON.stringify(result).length>40000)throw journeyReject_('Corte demasiado grande para el formato durable actual. Preparar paginación antes de cerrar; no se truncó el historial.');
    return journalCommit_(id,'corteZCerrar',m,[],result);
  });
}

'use strict';
// Staging-only authenticated observation. Private helper behind the dispatcher.
// Observe only. Never create/repair a sheet, resume a plan or release a hold.
function qaObservationError_(code) {const e=new Error(code);e.code=code;throw e;}
function qaExactKeys_(v,keys) {return !!v && typeof v==='object' && !Array.isArray(v) && JSON.stringify(Object.keys(v).sort())===JSON.stringify(keys.slice().sort());}
function qaObserveOpeningServer_(input, validateSession) {
  return qaRecoveryReadScope_(input && input.requestId,()=>qaObserveOpeningRead_(input,validateSession));
}
function qaObserveOpeningRead_(input, validateSession) {
  authRequireContext_('consultarAperturaQa');
  if(typeof validateSession!=='function')qaObservationError_('QA_OBSERVATION_SESSION_REQUIRED');
  const auth=validateSession();
  if(auth.role!=='CAJA' || !input || input.action!=='turnoAbrir' || input.deviceId!==auth.deviceId ||
      input.operator!==auth.operator || !requestRootIdValid_(input.requestId) || input.requestId.length>200 ||
      !input.body || Object.keys(input.body).some(k=>!['id','requestId','scopeId','openingFloat','historyBoundaryId'].includes(k)) || input.body.requestId!==input.requestId ||
      (input.body.id!==undefined && input.body.id!==input.requestId) || input.body.openingFloat!==0 ||
      !['scopeId','historyBoundaryId'].every(k=>typeof input.body[k]==='string' && !!input.body[k] && input.body[k]===input.body[k].trim()) ||
      !/^[a-f0-9]{64}$/.test(input.localEvidenceHash || ''))qaObservationError_('QA_OBSERVATION_INPUT_OR_AUTH');
  if(typeof BACKEND_BUILD==='undefined' || !/^[a-f0-9]{64}$/.test(BACKEND_BUILD.sourceSha256) || input.expectedSourceSha256!==BACKEND_BUILD.sourceSha256)qaObservationError_('QA_OBSERVATION_BUILD');
  const expectedBuild=BACKEND_BUILD.sourceSha256;
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    // Session may expire or be revoked while waiting for the physical lock.
    const lockedAuth=validateSession();
    qaRecoveryOperationalGuard_();
    if(historyHash_(lockedAuth)!==historyHash_(auth))qaObservationError_('QA_OBSERVATION_CONTEXT_CHANGED');
    const props=PropertiesService.getScriptProperties(),cache=CacheService.getScriptCache();
    const keys=['DOMUS_ENV','DOMUS_JOURNEY_POLICY_V1','idemp:'+input.requestId,'cajaSimple:'+input.requestId];
    const before=keys.map(k=>props.getProperty(k)),cached=cache.get('idemp:'+input.requestId);
    if(before[0]!=='STAGING')qaObservationError_('QA_OBSERVATION_ENVIRONMENT');
    // Validate configured destination/project before opening any spreadsheet.
    stagingIsolationEnvironment_({getId:()=>CONFIG.mainSheetId});
    const source=SpreadsheetApp.openById(CONFIG.mainSheetId);stagingIsolationEnvironment_(source);
    const read=historyReadView_(source),m=read.book,primary=m.getSheetByName('REQUESTS'),legacy=m.getSheetByName('TRANSACCIONES_API');
    if(!primary || legacy)qaObservationError_('QA_OBSERVATION_LEDGER_SCHEMA');
    const header=primary.getRange(1,1,1,8);
    if(header.getFormulas()[0].some(Boolean) || JSON.stringify(header.getValues()[0])!==JSON.stringify(
      ['REQUEST_ID','ACTION','PAYLOAD_HASH','DEVICE_ID','STATUS','CREATED_AT','COMPLETED_AT','RESPONSE']))
      qaObservationError_('QA_OBSERVATION_LEDGER_SCHEMA');
    const boundary=historyGuardIntent_(m,input.requestId,'turnoAbrir',input.body,input.deviceId);
    if(!boundary || !boundary.result.snapshot.freshStart || boundary.result.boundaryId!==input.body.historyBoundaryId)
      qaObservationError_('QA_OBSERVATION_BOUNDARY');
    const entry=requestRecordEntry_(primary,input.requestId),sheet=m.getSheetByName('DOMUS_JOURNAL');
    if(!sheet)qaObservationError_('QA_OBSERVATION_JOURNAL_SCHEMA');
    const journal=journalRows_(sheet),matches=journal.filter(r=>r[0]===input.requestId);
    if(matches.length>1)qaObservationError_('QA_OBSERVATION_DUPLICATE_JOURNAL');
    const j=matches[0] || null,row=entry && entry.values,payloadHash=historyHash_({action:'turnoAbrir',payload:input.body});
    const now=new Date();
    let status='UNRESOLVED',reason='NONFINAL_DURABLE_RECORD',ack=null;
    if(!row && !j) {
      reason=before[2]!==null || before[3]!==null || cached!==null?'LEGACY_EVIDENCE_PRESENT':'NO_DURABLE_RECORD_OBSERVED';
      status=reason==='NO_DURABLE_RECORD_OBSERVED'?'OBSERVED_ABSENT':'UNRESOLVED';
    } else if(!row || !j)qaObservationError_('QA_OBSERVATION_ORPHAN_RECORD');
    else {
      if(primary.getRange(entry.row,1,1,8).getFormulas()[0].some(Boolean) || row[1]!=='turnoAbrir' ||
          row[2]!==payloadHash || row[3]!==input.deviceId || j[1]!=='turnoAbrir')qaObservationError_('QA_OBSERVATION_BINDING_CONFLICT');
      if(!['PROCESSING','COMPLETED','FAILED','REQUIRES_REVIEW'].includes(row[4]))qaObservationError_('QA_OBSERVATION_REQUEST_STATE');
      if(before[2]!==null || before[3]!==null || cached!==null)reason='LEGACY_EVIDENCE_PRESENT';
      else if(row[4]==='COMPLETED' && j[2]==='COMPLETED') {
        let result,other,plan;try{result=JSON.parse(row[7]);other=JSON.parse(j[4]);plan=JSON.parse(j[3]);}catch(_){qaObservationError_('QA_OBSERVATION_RESULT_INVALID');}
        if(!plan || Array.isArray(plan) || Object.keys(plan).length!==1 || plan.parts!==0 ||
            historyHash_(result)!==historyHash_(other))qaObservationError_('QA_OBSERVATION_ACK_CONFLICT');
        const dates=[row[5],row[6],j[5]].map(journeyTimestamp_);
        if(dates.some(n=>n===null || n>now.getTime()) || dates[1]<dates[0])qaObservationError_('QA_OBSERVATION_TIME_CONFLICT');
        const policy=journeyPolicy_(m),station=journeyStation_(policy),scope=policy.scopes.find(s=>s.id===input.body.scopeId);
        if(!qaExactKeys_(result,['ok','journeyContract','openingRequestId','journeyId','shiftId','scopeId','scope','activity','stationId','registerId','deviceId','openingFloat','historyBoundaryId','historyReview','openedAt','openedBy','status']) ||
            !scope || !station.scopeIds.includes(scope.id) || !result || result.ok!==true || result.journeyContract!=='domus-journey-v1' ||
            result.openingRequestId!==input.requestId || result.journeyId!=='JOR-'+input.requestId || result.shiftId!=='TURNO-'+input.requestId ||
            result.status!=='OPEN' || result.deviceId!==input.deviceId || result.scopeId!==scope.id || result.openingFloat!==0 ||
            result.stationId!==station.stationId || result.registerId!==station.registerId || result.activity!==scope.activity ||
            result.openedBy!==input.operator || result.historyBoundaryId!==input.body.historyBoundaryId ||
            !result.historyReview || result.historyReview.snapshotHash!==boundary.result.snapshotHash ||
            result.historyReview.resolved!==false || result.historyReview.financialFinal!==false ||
            historyHash_(result.historyReview)!==historyHash_(historyNotice_(m)) ||
            historyHash_(result.scope)!==historyHash_({projectId:scope.projectId,projectName:scope.projectName,eventId:scope.eventId,eventName:scope.eventName}))
          qaObservationError_('QA_OBSERVATION_OPENING_CONFLICT');
        const context=journeyContext_(m,input.requestId,now),openings=journeyOpenings_(m,now);
        const same=openings.filter(o=>o.stationId===station.stationId || o.registerId===station.registerId ||
          (o.scope.projectId===scope.projectId && o.scope.eventId===scope.eventId));
        if(!context.allowed || context.status!=='OPEN' || same.length!==1 || same[0].openingRequestId!==input.requestId)
          qaObservationError_('QA_OBSERVATION_OPENING_NOT_UNIQUE');
        historyGuardPrepared_(m,input.requestId,'turnoAbrir',[],j[4],boundary);
        status='OBSERVED_CONFIRMED';reason='MATCHING_DURABLE_ACK';ack={ok:true,requestId:input.requestId,data:result};
      }
    }
    // No observations are returned until the captured cells and all non-sheet
    // inputs used here have been revalidated. External writers remain a limit.
    read.assertDimensions();stagingIsolationEnvironment_(source);
    const current=validateSession();
    if(current.role!=='CAJA' || current.deviceId!==input.deviceId || current.operator!==input.operator || current.principal!==auth.principal ||
        keys.some((k,i)=>props.getProperty(k)!==before[i]) || cache.get('idemp:'+input.requestId)!==cached ||
        BACKEND_BUILD.sourceSha256!==expectedBuild)qaObservationError_('QA_OBSERVATION_CONTEXT_CHANGED');
    const evidence={ledgerHash:row?historyHash_(row):null,journalHash:j?historyHash_(j):null,
      boundarySnapshotHash:boundary.result.snapshotHash,policyHash:historyHash_(before[1]),
      legacyEvidence:before.slice(2).map(v=>v===null?null:historyHash_(v)),cacheEvidence:cached===null?null:historyHash_(cached)};
    const report={format:'DOMUS_QA_OPENING_OBSERVATION_V1',prototype:true,readOnly:true,canRelease:false,canRetry:false,
      resolved:false,financialFinal:false,status:status,reason:reason,requestId:input.requestId,deviceId:input.deviceId,
      payloadHash:payloadHash,localEvidenceHash:input.localEvidenceHash,environment:CONFIG.environment,
      mainSheetId:CONFIG.mainSheetId,opsSheetId:CONFIG.opsSheetId,projectId:stagingIsolationProject_(),
      backendSourceSha256:expectedBuild,observedAt:now.toISOString(),evidence:evidence,ack:ack};
    report.observationHash=historyHash_(report);return report;
  });
}

// Revalidate persisted session authority under the same lock and at read completion.
// No session creation, refresh, token output, cache repair or property writes.
function qaObservationSession_(token,role,deviceId) {
  const context=authValidateAction('consultarAperturaQa',token,role,deviceId);
  const raw=PropertiesService.getScriptProperties().getProperty('ses:'+token);
  const cached=CacheService.getScriptCache().get('ses:'+token);
  let session;try{session=JSON.parse(raw);}catch(_){qaObservationError_('QA_OBSERVATION_SESSION_INVALID');}
  if(!session || session.token!==token || session.role!=='CAJA' || session.deviceId!==deviceId ||
      session.operator!==context.operator || session.principal!==context.principal ||
      !Number.isFinite(session.created) || !Number.isFinite(session.expires) || session.created>Date.now() ||
      session.expires<=Date.now() || session.expires<=session.created || (cached!==null && cached!==raw))
    qaObservationError_('QA_OBSERVATION_SESSION_INVALID');
  return context;
}

// Explicit absent-only QA recovery. Disabled unless an exact, separately
// authorized server approval exists. There is deliberately NO gate-clear API.
let _qaRecoveryReadId = null;
function qaRecoveryKey_() {return 'DOMUS_QA_ABSENT_RECOVERY_GATE_V1';}
function qaRecoveryApprovalKey_() {return 'DOMUS_QA_ABSENT_RECOVERY_APPROVAL_V1';}
function qaRecoveryError_(code) {const e=new Error(code);e.code=code;e.status=409;throw e;}
function qaRecoveryReadScope_(id,fn) {
  if(_qaRecoveryReadId!==null && _qaRecoveryReadId!==id)qaRecoveryError_('QA_RECOVERY_READ_SCOPE_CONFLICT');
  const previous=_qaRecoveryReadId;_qaRecoveryReadId=id;
  try{return fn();}finally{_qaRecoveryReadId=previous;}
}
function qaRecoveryGate_(raw) {
  if(raw===null)return null;
  let g;try{g=JSON.parse(raw);}catch(_){qaRecoveryError_('QA_RECOVERY_GATE_INVALID');}
  const keys=['version','protocol','state','requestId','originalPayloadHash','fenceHash','deviceId','evidenceHash','approvalId','approvalHash','originalAttemptHash','localEvidenceHash','backendSourceSha256','createdAt','committedAt','finalEvidenceHash','blockOperationalTraffic','canRelease','resolved','gateHash'];
  if(!qaExactKeys_(g,keys) || g.version!==1 || g.protocol!=='QA_ABSENT_RECOVERY_FENCE_V1' ||
      !['CLAIMED','COMMITTED_REQUIRES_REVIEW'].includes(g.state) || !requestRootIdValid_(g.requestId) ||
      g.blockOperationalTraffic!==true || g.canRelease!==false || g.resolved!==false)
    qaRecoveryError_('QA_RECOVERY_GATE_INVALID');
  const unsigned=Object.assign({},g);delete unsigned.gateHash;
  if(historyHash_(unsigned)!==g.gateHash)qaRecoveryError_('QA_RECOVERY_GATE_INVALID');return g;
}
function qaRecoveryOperationalGuard_(mutation) {
  if(CONFIG.environment!=='STAGING')return;
  if(qaReleaseOperationalGuard_(mutation))return;
  const g=qaRecoveryGate_(PropertiesService.getScriptProperties().getProperty(qaRecoveryKey_()));
  if(g && (mutation || _qaRecoveryReadId!==g.requestId))qaRecoveryError_('QA_RECOVERY_OPERATIONAL_GATE_HELD');
}
function qaRecoverySealGate_(g) {const copy=Object.assign({},g);delete copy.gateHash;copy.gateHash=historyHash_(copy);return JSON.stringify(copy);}
function qaRecoveryInventory_(main,ops) {
  return [main,ops].map(source=>{
    if(typeof source.getSheets!=='function')qaRecoveryError_('QA_RECOVERY_INVENTORY_UNAVAILABLE');
    const read=historyReadView_(source),identity=()=>source.getSheets().map(s=>[s.getName(),s.getSheetId()]).sort((a,b)=>a[0].localeCompare(b[0]));
    const before=identity();let cells=0;
    const tables=before.map(([name,id])=>{
      const s=read.book.getSheetByName(name),physical=source.getSheetByName(name),rows=s.getLastRow(),width=s.getLastColumn();
      cells+=rows*width;if(!Number.isSafeInteger(cells) || cells>4000000)qaRecoveryError_('QA_RECOVERY_INVENTORY_TOO_LARGE');
      const range=rows?s.getRange(1,1,rows,width):null;
      return {name,id,rows,width,maxRows:physical.getMaxRows(),values:range?range.getValues():[],formulas:range?range.getFormulas():[]};
    });
    const result={book:source.getId(),zone:read.book.getSpreadsheetTimeZone(),tables};read.assertDimensions();
    if(historyHash_(identity())!==historyHash_(before))qaRecoveryError_('QA_RECOVERY_INVENTORY_CHANGED');return result;
  });
}
function qaRecoveryExpectedWrite_(inventory,book,name,row,col,values) {
  const t=inventory.find(b=>b.book===book).tables.find(t=>t.name===name);
  const rows=Math.max(t.rows,row+values.length-1),width=Math.max(t.width,col+values[0].length-1);
  if(rows>t.maxRows)qaRecoveryError_('QA_RECOVERY_NO_GRID_GROWTH');
  for(const key of ['values','formulas']) {
    while(t[key].length<rows)t[key].push(Array(width).fill(''));
    t[key].forEach(r=>{while(r.length<width)r.push('');});
  }
  values.forEach((v,i)=>v.forEach((cell,j)=>{t.values[row+i-1][col+j-1]=cell;t.formulas[row+i-1][col+j-1]='';}));
  t.rows=rows;t.width=width;
}
function qaRecoveryContext_(input,validateSession) {
  const report=qaObserveOpeningServer_(input,validateSession);
  if(report.status!=='OBSERVED_ABSENT' || report.ack!==null)qaRecoveryError_('QA_RECOVERY_NOT_ABSENT');
  if(!/^[a-f0-9]{64}$/.test(input.originalAttemptHash || ''))qaRecoveryError_('QA_RECOVERY_ORIGINAL_ATTEMPT_REQUIRED');
  const main=SpreadsheetApp.openById(CONFIG.mainSheetId),ops=SpreadsheetApp.openById(CONFIG.opsSheetId);
  if(ops.getId()!==ENVIRONMENTS.STAGING.opsSheetId)qaRecoveryError_('QA_RECOVERY_DESTINATION');
  const read=historyReadView_(main),result=journeyPreflight_(()=>journeyPrepareOpening_(read.book,input.body,new Date()));
  historyGuardPrepared_(read.book,input.requestId,'turnoAbrir',[],JSON.stringify(result));
  read.assertDimensions();
  const inventory=qaRecoveryInventory_(main,ops),policyRaw=PropertiesService.getScriptProperties().getProperty('DOMUS_JOURNEY_POLICY_V1');
  const evidence={version:1,protocol:'QA_ABSENT_RECOVERY_FENCE_V1',requestId:input.requestId,payloadHash:report.payloadHash,
    deviceId:input.deviceId,operator:input.operator,localEvidenceHash:input.localEvidenceHash,originalAttemptHash:input.originalAttemptHash,
    backendSourceSha256:BACKEND_BUILD.sourceSha256,projectId:stagingIsolationProject_(),mainSheetId:CONFIG.mainSheetId,opsSheetId:CONFIG.opsSheetId,
    boundarySnapshotHash:report.evidence.boundarySnapshotHash,policyHash:historyHash_(policyRaw),inventoryHash:historyHash_(inventory)};
  return {main,ops,inventory,policyRaw,result,evidence,evidenceHash:historyHash_(evidence)};
}
function qaPrepareAbsentRecovery_(input,validateSession) {
  authRequireContext_('prepararRecuperacionQaAusente');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    qaRecoveryOperationalGuard_(true);const auth=validateSession(),c=qaRecoveryContext_(input,validateSession);
    const current=validateSession();stagingIsolationEnvironment_(c.main);
    if(historyHash_(current)!==historyHash_(auth) || PropertiesService.getScriptProperties().getProperty('DOMUS_ENV')!=='STAGING' ||
        PropertiesService.getScriptProperties().getProperty('DOMUS_JOURNEY_POLICY_V1')!==c.policyRaw || BACKEND_BUILD.sourceSha256!==input.expectedSourceSha256 ||
        historyHash_(qaRecoveryInventory_(c.main,c.ops))!==c.evidence.inventoryHash)qaRecoveryError_('QA_RECOVERY_PROPOSAL_CONTEXT_CHANGED');
    if(historyHash_(validateSession())!==historyHash_(auth))qaRecoveryError_('QA_RECOVERY_PROPOSAL_CONTEXT_CHANGED');
    qaRecoveryOperationalGuard_(true);
    return {ok:true,kind:'QA_ABSENT_RECOVERY_PROPOSAL_V1',evidence:c.evidence,evidenceHash:c.evidenceHash,
      canRecover:false,canRelease:false,canRetry:false,resolved:false,financialFinal:false};
  });
}
function qaRecoveryApproval_(c,input,raw) {
  let a;try{a=JSON.parse(raw);}catch(_){qaRecoveryError_('QA_RECOVERY_APPROVAL_REQUIRED');}
  const keys=['version','approved','approvalId','approvedBy','approvalReference','evidenceHash','issuedAt','expiresAt','confirmSameIdBody','confirmStationsHeld','confirmOldExecutionsTerminated','confirmIncompatibleWritersDisabled','executorBarrierEvidenceHash','allowedLateSourceSha256'];
  const text=v=>typeof v==='string' && v.trim()===v && v.length>0 && v.length<=160 && !/[\u0000-\u001f\u007f]/.test(v);
  const old=['f24d94ffa387680b000b26c79e262c31fabda499231ddae7880fb6af200a31b1','2412ae75708c2991e1ff92b9259473d638b573e2b5d2d427e0027fd605a0463f'];
  if(!qaExactKeys_(a,keys) || a.version!==1 || a.approved!==true || !text(a.approvalId) || a.approvalId!==input.approvalId ||
      !CONFIG.managers.includes(a.approvedBy) || !text(a.approvalReference) || a.evidenceHash!==c.evidenceHash ||
      !Number.isFinite(a.issuedAt) || !Number.isFinite(a.expiresAt) || a.issuedAt>Date.now() || a.expiresAt<=Date.now() ||
      a.expiresAt<=a.issuedAt || a.expiresAt-a.issuedAt>600000 ||
      !['confirmSameIdBody','confirmStationsHeld','confirmOldExecutionsTerminated','confirmIncompatibleWritersDisabled'].every(k=>a[k]===true) ||
      !/^[a-f0-9]{64}$/.test(a.executorBarrierEvidenceHash || '') || !Array.isArray(a.allowedLateSourceSha256) ||
      a.allowedLateSourceSha256.some(h=>!old.includes(h)) || new Set(a.allowedLateSourceSha256).size!==a.allowedLateSourceSha256.length ||
      input.confirmPotentialOpening!==true || input.confirmSameId!==true || input.confirmPayloadHash!==c.evidence.payloadHash || input.confirmEvidenceHash!==c.evidenceHash)
    qaRecoveryError_('QA_RECOVERY_APPROVAL_REQUIRED');return a;
}
function qaRecoverAbsentOpening_(input,validateSession) {
  authRequireContext_('recuperarAperturaQaAusente');
  // Own private copy: asynchronous external transport cannot change this input.
  input=JSON.parse(JSON.stringify(input));
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    qaRecoveryOperationalGuard_(true);
    const auth=validateSession(),c=qaRecoveryContext_(input,validateSession),props=PropertiesService.getScriptProperties();
    const approvalRaw=props.getProperty(qaRecoveryApprovalKey_()),approval=qaRecoveryApproval_(c,input,approvalRaw);
    const s=c.main.getSheetByName('REQUESTS'),j=c.main.getSheetByName('DOMUS_JOURNAL');
    const row=s.getLastRow()+1,jrow=j.getLastRow()+1;
    if(row>s.getMaxRows() || jrow>j.getMaxRows())qaRecoveryError_('QA_RECOVERY_NO_GRID_GROWTH');
    const resultJson=JSON.stringify(c.result),now=new Date().toISOString(),expected=JSON.parse(JSON.stringify(c.inventory));
    const fenceHash='QA_RECOVERY_FENCE_V1:'+historyHash_({protocol:'QA_ABSENT_RECOVERY_FENCE_V1',approvalHash:historyHash_(approvalRaw),evidenceHash:c.evidenceHash,requestId:input.requestId});
    if(fenceHash===c.evidence.payloadHash)qaRecoveryError_('QA_RECOVERY_FENCE_COLLISION');
    let gateRaw=null;
    const check=()=>{
      const current=validateSession();stagingIsolationEnvironment_(c.main);
      if(historyHash_(current)!==historyHash_(auth) || props.getProperty('DOMUS_ENV')!=='STAGING' ||
          props.getProperty(qaRecoveryApprovalKey_())!==approvalRaw || props.getProperty(qaRecoveryKey_())!==gateRaw ||
          props.getProperty('DOMUS_JOURNEY_POLICY_V1')!==c.policyRaw || BACKEND_BUILD.sourceSha256!==input.expectedSourceSha256 ||
          props.getProperty('idemp:'+input.requestId)!==null || props.getProperty('cajaSimple:'+input.requestId)!==null ||
          CacheService.getScriptCache().get('idemp:'+input.requestId)!==null)qaRecoveryError_('QA_RECOVERY_CONTEXT_CHANGED');
      qaRecoveryApproval_(c,input,approvalRaw);
    };
    const inventoryCheck=()=>{if(historyHash_(qaRecoveryInventory_(c.main,c.ops))!==historyHash_(expected))qaRecoveryError_('QA_RECOVERY_INVENTORY_CHANGED');};
    const verify=(sheet,r,col,values)=>{
      const range=sheet.getRange(r,col,values.length,values[0].length);
      if(range.getFormulas().some(v=>v.some(Boolean)) || historyHash_(range.getValues())!==historyHash_(values))qaRecoveryError_('QA_RECOVERY_READBACK_UNCERTAIN');
    };
    const write=(sheet,r,col,values)=>{
      check();
      const table=expected.find(b=>b.book===c.main.getId()).tables.find(t=>t.name===sheet.getName());
      if(sheet.getLastRow()!==table.rows || sheet.getLastColumn()!==table.width || sheet.getMaxRows()!==table.maxRows || sheet.getSheetId()!==table.id)
        qaRecoveryError_('QA_RECOVERY_WRITE_TARGET_CHANGED');
      const before=values.map((v,i)=>v.map((_,k)=>table.values[r+i-1]?.[col+k-1] ?? ''));
      verify(sheet,r,col,before);
      sheet.getRange(r,col,values.length,values[0].length).setValues(values);SpreadsheetApp.flush();verify(sheet,r,col,values);
      qaRecoveryExpectedWrite_(expected,c.main.getId(),sheet.getName(),r,col,values);
    };
    check();inventoryCheck();check();
    const gate={version:1,protocol:'QA_ABSENT_RECOVERY_FENCE_V1',state:'CLAIMED',requestId:input.requestId,
      originalPayloadHash:c.evidence.payloadHash,fenceHash,deviceId:input.deviceId,evidenceHash:c.evidenceHash,approvalId:approval.approvalId,
      approvalHash:historyHash_(approvalRaw),originalAttemptHash:input.originalAttemptHash,localEvidenceHash:input.localEvidenceHash,
      backendSourceSha256:BACKEND_BUILD.sourceSha256,createdAt:now,committedAt:null,finalEvidenceHash:null,blockOperationalTraffic:true,canRelease:false,resolved:false};
    const marker=JSON.stringify({ok:false,code:'QA_RECOVERY_FENCED_REQUIRES_REVIEW',approvalId:approval.approvalId,canRetry:false});
    historyGuardPrepared_(c.main,input.requestId,'turnoAbrir',[],marker);
    check();
    const claimed=qaRecoverySealGate_(gate);props.setProperty(qaRecoveryKey_(),claimed);
    if(props.getProperty(qaRecoveryKey_())!==claimed)qaRecoveryError_('QA_RECOVERY_GATE_WRITE_UNCERTAIN');gateRaw=claimed;
    // A lost/failed write never triggers rollback, repair, replay or gate removal.
    write(s,row,1,[[input.requestId,'turnoAbrir',fenceHash,input.deviceId,'REQUIRES_REVIEW',now,'',marker]]);
    write(j,jrow,1,[[input.requestId,'turnoAbrir','COMPLETED',JSON.stringify({parts:0}),resultJson,now]]);
    write(s,row,1,[[input.requestId,'turnoAbrir',fenceHash,input.deviceId,'COMPLETED',now,now,resultJson]]);
    // Readers remain globally fenced even if the next publication is uncertain.
    inventoryCheck();check();
    write(s,row,3,[[c.evidence.payloadHash]]);
    inventoryCheck();check();
    const completed=qaRecoverySealGate_(Object.assign({},gate,{state:'COMMITTED_REQUIRES_REVIEW',committedAt:new Date().toISOString(),finalEvidenceHash:historyHash_(expected)}));
    props.setProperty(qaRecoveryKey_(),completed);
    if(props.getProperty(qaRecoveryKey_())!==completed)qaRecoveryError_('QA_RECOVERY_GATE_WRITE_UNCERTAIN');gateRaw=completed;check();
    return {ok:true,kind:'QA_ABSENT_RECOVERY_RESULT_V1',requestId:input.requestId,payloadHash:c.evidence.payloadHash,
      approvalId:approval.approvalId,gateHash:JSON.parse(completed).gateHash,backendSourceSha256:BACKEND_BUILD.sourceSha256,
      ack:{ok:true,requestId:input.requestId,data:c.result},canRelease:false,canRetry:false,resolved:false,financialFinal:false,operationalGate:'HELD'};
  });
}

// Audited release v4. Two confirmed-ACK paths; no opening or journal replay.
// This serializes compliant writers, not independent projects or manual editors.
function qaReleaseKey_() {return 'DOMUS_QA_AUDITED_RELEASE_V1';}
function qaReleaseApprovalKey_() {return 'DOMUS_QA_AUDITED_RELEASE_APPROVAL_V1';}
function qaReleaseHash_(v) {return typeof v==='string' && /^[a-f0-9]{64}$/.test(v);}
function qaReleaseText_(v) {return typeof v==='string' && v===v.trim() && v.length>0 && v.length<=160 && !/[\u0000-\u001f\u007f]/.test(v);}
function qaReleaseTicketId_(evidenceHash,approvalId,requestId) {return historyHash_({protocol:'QA_AUDITED_RELEASE_V1',evidenceHash,approvalId,requestId});}
function qaReleaseSeal_(r) {const unsigned=Object.assign({},r);delete unsigned.recordHash;return JSON.stringify(Object.assign(unsigned,{recordHash:historyHash_(unsigned)}));}
function qaReleaseRecord_(raw) {
  if(raw===null)return null;
  if(typeof raw!=='string' || encodeURIComponent(raw).replace(/%[A-F\d]{2}/gi,'x').length>8500)qaRecoveryError_('QA_RELEASE_RECORD_TOO_LARGE');
  let r;try{r=JSON.parse(raw);}catch(_){qaRecoveryError_('QA_RELEASE_RECORD_INVALID');}
  const keys=['version','protocol','state','ticketId','evidence','evidenceHash','approvalId','approvalHash','ack','preparedAt','expiresAt','archiveHash','committedAt','recordHash'];
  const e=r && r.evidence;
  if(!qaExactKeys_(r,keys) || r.version!==1 || r.protocol!=='QA_AUDITED_RELEASE_V1' || !['PREPARED','RELEASED_AUDITED'].includes(r.state) ||
      !e || !qaReleaseHash_(r.evidenceHash) || r.evidenceHash!==historyHash_(e) || !qaReleaseText_(r.approvalId) || !qaReleaseHash_(r.approvalHash) ||
      r.ticketId!==qaReleaseTicketId_(r.evidenceHash,r.approvalId,e.requestId) || !r.ack || historyHash_(r.ack)!==e.ackHash ||
      !qaReleaseHash_(e.originalAttemptHash) || !qaReleaseHash_(e.localEvidenceHash) || !qaReleaseHash_(e.backendSourceSha256) || !requestRootIdValid_(e.requestId) ||
      !Number.isFinite(Date.parse(r.preparedAt)) || new Date(r.preparedAt).toISOString()!==r.preparedAt || !Number.isFinite(r.expiresAt) ||
      r.expiresAt<=Date.parse(r.preparedAt) || r.expiresAt-Date.parse(r.preparedAt)>600000 ||
      (r.state==='PREPARED'?(r.archiveHash!==null || r.committedAt!==null):(!qaReleaseHash_(r.archiveHash) || !Number.isFinite(Date.parse(r.committedAt)) ||
        new Date(r.committedAt).toISOString()!==r.committedAt || Date.parse(r.committedAt)<Date.parse(r.preparedAt) || Date.parse(r.committedAt)>=r.expiresAt)))
    qaRecoveryError_('QA_RELEASE_RECORD_INVALID');
  const unsigned=Object.assign({},r);delete unsigned.recordHash;if(r.recordHash!==historyHash_(unsigned))qaRecoveryError_('QA_RELEASE_RECORD_INVALID');return r;
}
function qaReleaseRecoveryGate_(e) {
  const g=qaRecoveryGate_(PropertiesService.getScriptProperties().getProperty(qaRecoveryKey_()));
  if(e.recoveryGateHash===null) {if(g!==null)qaRecoveryError_('QA_RELEASE_GATE_CHANGED');}
  else if(!g || g.gateHash!==e.recoveryGateHash || g.state!=='COMMITTED_REQUIRES_REVIEW' ||
      g.requestId!==e.requestId || g.deviceId!==e.deviceId || g.originalPayloadHash!==e.payloadHash ||
      g.originalAttemptHash!==e.originalAttemptHash || g.localEvidenceHash!==e.localEvidenceHash || g.backendSourceSha256!==e.backendSourceSha256)
    qaRecoveryError_('QA_RELEASE_GATE_CHANGED');
  return g;
}
function qaReleaseOperationalGuard_(mutation) {
  const r=qaReleaseRecord_(PropertiesService.getScriptProperties().getProperty(qaReleaseKey_()));
  if(!r)return false;
  qaReleaseRecoveryGate_(r.evidence);
  if(!mutation && _qaRecoveryReadId===r.evidence.requestId)return true;
  const a=_authContext;
  if(r.state!=='RELEASED_AUDITED' || !a || a.role!=='CAJA' || a.deviceId!==r.evidence.deviceId || a.operator!==r.evidence.operator ||
      a.principal!==r.evidence.principal || a.qaReleaseTicketId!==r.ticketId || BACKEND_BUILD.sourceSha256!==r.evidence.backendSourceSha256)
    qaRecoveryError_('QA_RELEASE_OPERATIONAL_GATE_HELD');
  return true;
}
function qaReleaseContext_(input,validateSession) {
  if(!input || !qaReleaseHash_(input.originalAttemptHash))qaRecoveryError_('QA_RELEASE_ORIGINAL_ATTEMPT_REQUIRED');
  const auth=validateSession(),report=qaObserveOpeningServer_(input,validateSession);
  if(report.status!=='OBSERVED_CONFIRMED' || !report.ack)qaRecoveryError_('QA_RELEASE_DURABLE_ACK_REQUIRED');
  const props=PropertiesService.getScriptProperties(),g=qaRecoveryGate_(props.getProperty(qaRecoveryKey_()));
  const main=SpreadsheetApp.openById(CONFIG.mainSheetId),ops=SpreadsheetApp.openById(CONFIG.opsSheetId);
  if(ops.getId()!==ENVIRONMENTS.STAGING.opsSheetId)qaRecoveryError_('QA_RELEASE_DESTINATION');
  const inventory=qaRecoveryInventory_(main,ops),policyRaw=props.getProperty('DOMUS_JOURNEY_POLICY_V1');
  const evidence={version:1,protocol:'QA_AUDITED_RELEASE_V1',mode:g?'RECOVERED_ACK':'EXISTING_ACK',requestId:input.requestId,payloadHash:report.payloadHash,
    deviceId:input.deviceId,operator:input.operator,principal:auth.principal,localEvidenceHash:input.localEvidenceHash,originalAttemptHash:input.originalAttemptHash,
    backendSourceSha256:BACKEND_BUILD.sourceSha256,projectId:stagingIsolationProject_(),mainSheetId:CONFIG.mainSheetId,opsSheetId:CONFIG.opsSheetId,
    ackHash:historyHash_(report.ack),ledgerHash:report.evidence.ledgerHash,journalHash:report.evidence.journalHash,
    boundarySnapshotHash:report.evidence.boundarySnapshotHash,policyHash:historyHash_(policyRaw),inventoryHash:historyHash_(inventory),recoveryGateHash:g?g.gateHash:null};
  qaReleaseRecoveryGate_(evidence);
  if(historyHash_(validateSession())!==historyHash_(auth) || BACKEND_BUILD.sourceSha256!==input.expectedSourceSha256 ||
      props.getProperty('DOMUS_JOURNEY_POLICY_V1')!==policyRaw)qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
  return {auth,report,main,ops,policyRaw,evidence,evidenceHash:historyHash_(evidence)};
}
function qaReleaseRevalidate_(c,input,validateSession,releaseRaw) {
  stagingIsolationEnvironment_(c.main);const props=PropertiesService.getScriptProperties();
  if(historyHash_(validateSession())!==historyHash_(c.auth) || props.getProperty('DOMUS_ENV')!=='STAGING' ||
      props.getProperty(qaReleaseKey_())!==releaseRaw || props.getProperty('DOMUS_JOURNEY_POLICY_V1')!==c.policyRaw ||
      BACKEND_BUILD.sourceSha256!==input.expectedSourceSha256 || props.getProperty('idemp:'+input.requestId)!==null ||
      props.getProperty('cajaSimple:'+input.requestId)!==null || CacheService.getScriptCache().get('idemp:'+input.requestId)!==null)
    qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
  qaReleaseRecoveryGate_(c.evidence);
  if(historyHash_(qaRecoveryInventory_(c.main,c.ops))!==c.evidence.inventoryHash)qaRecoveryError_('QA_RELEASE_INVENTORY_CHANGED');
  if(historyHash_(validateSession())!==historyHash_(c.auth))qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
}
function qaReleaseApproval_(c,input,raw) {
  let a;try{a=JSON.parse(raw);}catch(_){qaRecoveryError_('QA_RELEASE_APPROVAL_REQUIRED');}
  const keys=['version','approved','approvalId','approvedBy','approvalReference','evidenceHash','issuedAt','expiresAt','confirmStationsHeld','confirmOldExecutionsTerminated','confirmIncompatibleWritersDisabled','confirmOnlyBoundStation','executorBarrierEvidenceHash'];
  const now=Date.now();
  if(!qaExactKeys_(a,keys) || a.version!==1 || a.approved!==true || !qaReleaseText_(a.approvalId) || a.approvalId!==input.approvalId ||
      !CONFIG.managers.includes(a.approvedBy) || !qaReleaseText_(a.approvalReference) || a.evidenceHash!==c.evidenceHash || input.confirmEvidenceHash!==c.evidenceHash ||
      !Number.isFinite(a.issuedAt) || !Number.isFinite(a.expiresAt) || a.issuedAt>now || a.expiresAt<=now || a.expiresAt<=a.issuedAt || a.expiresAt-a.issuedAt>600000 ||
      !['confirmStationsHeld','confirmOldExecutionsTerminated','confirmIncompatibleWritersDisabled','confirmOnlyBoundStation'].every(k=>a[k]===true) || !qaReleaseHash_(a.executorBarrierEvidenceHash))
    qaRecoveryError_('QA_RELEASE_APPROVAL_REQUIRED');return a;
}
function qaReleaseProjection_(r) {
  const e=r.evidence,out={ok:true,kind:'QA_AUDITED_RELEASE_TICKET_V1',state:r.state,ticketId:r.ticketId,evidenceHash:r.evidenceHash,approvalId:r.approvalId,
    requestId:e.requestId,payloadHash:e.payloadHash,deviceId:e.deviceId,backendSourceSha256:e.backendSourceSha256,originalAttemptHash:e.originalAttemptHash,
    localEvidenceHash:e.localEvidenceHash,ack:r.ack,ackHash:e.ackHash,recoveryGateHash:e.recoveryGateHash,preparedAt:r.preparedAt,expiresAt:r.expiresAt,
    archiveHash:r.archiveHash,committedAt:r.committedAt,canOperate:r.state==='RELEASED_AUDITED',financialFinal:false};
  out.receiptHash=historyHash_(out);if(JSON.stringify(out).length>30000)qaRecoveryError_('QA_RELEASE_PROJECTION_TOO_LARGE');return out;
}
function qaPrepareRelease_(input,validateSession) {
  authRequireContext_('prepararLiberacionQa');input=JSON.parse(JSON.stringify(input));
  return withLock_(CONFIG.lockTimeoutMs,()=>qaRecoveryReadScope_(input.requestId,()=>{
    if(PropertiesService.getScriptProperties().getProperty(qaReleaseKey_())!==null)qaRecoveryError_('QA_RELEASE_ALREADY_RESERVED_QUERY_ONLY');
    const c=qaReleaseContext_(input,validateSession);qaReleaseRevalidate_(c,input,validateSession,null);
    return {ok:true,kind:'QA_RELEASE_PROPOSAL_V1',evidence:c.evidence,evidenceHash:c.evidenceHash,ack:c.report.ack,canRelease:false,canRetry:false,financialFinal:false};
  }));
}
function qaReserveRelease_(input,validateSession) {
  authRequireContext_('reservarLiberacionQa');input=JSON.parse(JSON.stringify(input));
  return withLock_(CONFIG.lockTimeoutMs,()=>qaRecoveryReadScope_(input.requestId,()=>{
    const props=PropertiesService.getScriptProperties();if(props.getProperty(qaReleaseKey_())!==null)qaRecoveryError_('QA_RELEASE_ALREADY_RESERVED_QUERY_ONLY');
    if(input.confirmReserve!==true)qaRecoveryError_('QA_RELEASE_RESERVATION_CONSENT_REQUIRED');
    const c=qaReleaseContext_(input,validateSession),approvalRaw=props.getProperty(qaReleaseApprovalKey_()),a=qaReleaseApproval_(c,input,approvalRaw);
    // Preserve custody rules for every administrative reference we persist.
    historyGuardPrepared_(c.main,input.requestId,'turnoAbrir',[],JSON.stringify({approvalId:a.approvalId}));
    const r={version:1,protocol:'QA_AUDITED_RELEASE_V1',state:'PREPARED',ticketId:qaReleaseTicketId_(c.evidenceHash,a.approvalId,input.requestId),
      evidence:c.evidence,evidenceHash:c.evidenceHash,approvalId:a.approvalId,approvalHash:historyHash_(approvalRaw),ack:c.report.ack,
      preparedAt:new Date().toISOString(),expiresAt:a.expiresAt,archiveHash:null,committedAt:null};
    const raw=qaReleaseSeal_(r);qaReleaseRecord_(raw);qaReleaseProjection_(JSON.parse(raw));
    qaReleaseRevalidate_(c,input,validateSession,null);qaReleaseApproval_(c,input,props.getProperty(qaReleaseApprovalKey_()));
    if(props.getProperty(qaReleaseApprovalKey_())!==approvalRaw)qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
    props.setProperty(qaReleaseKey_(),raw);
    if(props.getProperty(qaReleaseKey_())!==raw)qaRecoveryError_('QA_RELEASE_RESERVATION_UNCERTAIN_QUERY_ONLY');
    return qaReleaseProjection_(JSON.parse(raw));
  }));
}
function qaReleaseBoundInput_(r,input) {
  const e=r.evidence;
  if(input.requestId!==e.requestId || input.deviceId!==e.deviceId || input.operator!==e.operator || input.expectedSourceSha256!==e.backendSourceSha256 ||
      input.originalAttemptHash!==e.originalAttemptHash || input.localEvidenceHash!==e.localEvidenceHash || input.approvalId!==r.approvalId ||
      input.confirmEvidenceHash!==r.evidenceHash || historyHash_({action:'turnoAbrir',payload:input.body})!==e.payloadHash)
    qaRecoveryError_('QA_RELEASE_TICKET_BINDING_CONFLICT');
}
function qaQueryRelease_(input,validateSession) {
  authRequireContext_('consultarLiberacionQa');input=JSON.parse(JSON.stringify(input));
  return withLock_(CONFIG.lockTimeoutMs,()=>qaRecoveryReadScope_(input.requestId,()=>{
    const props=PropertiesService.getScriptProperties(),raw=props.getProperty(qaReleaseKey_()),r=qaReleaseRecord_(raw);
    if(!r)qaRecoveryError_('QA_RELEASE_TICKET_NOT_OBSERVED_PRESERVE_HOLD');qaReleaseBoundInput_(r,input);
    const c=qaReleaseContext_(input,validateSession);
    // Operational data may legitimately change after release. A fresh unique
    // durable OPEN ACK must still match before local activation is resumed.
    if(c.evidence.ackHash!==r.evidence.ackHash || c.auth.principal!==r.evidence.principal || c.evidence.recoveryGateHash!==r.evidence.recoveryGateHash)
      qaRecoveryError_('QA_RELEASE_ACK_CHANGED');
    qaReleaseRevalidate_(c,input,validateSession,raw);return qaReleaseProjection_(r);
  }));
}
function qaCommitRelease_(input,validateSession) {
  authRequireContext_('confirmarLiberacionQa');input=JSON.parse(JSON.stringify(input));
  return withLock_(CONFIG.lockTimeoutMs,()=>qaRecoveryReadScope_(input.requestId,()=>{
    const props=PropertiesService.getScriptProperties(),raw=props.getProperty(qaReleaseKey_()),r=qaReleaseRecord_(raw);
    if(!r || r.state!=='PREPARED')qaRecoveryError_('QA_RELEASE_COMMIT_NOT_PREPARED_QUERY_ONLY');qaReleaseBoundInput_(r,input);
    if(input.ticketId!==r.ticketId || !qaReleaseHash_(input.archiveHash) || input.confirmArchive!==true || input.confirmRelease!==true)
      qaRecoveryError_('QA_RELEASE_ARCHIVE_CONSENT_REQUIRED');
    const c=qaReleaseContext_(input,validateSession),approvalRaw=props.getProperty(qaReleaseApprovalKey_());
    qaReleaseApproval_(c,input,approvalRaw);
    if(c.evidenceHash!==r.evidenceHash || historyHash_(approvalRaw)!==r.approvalHash || Date.now()>=r.expiresAt || Date.now()<Date.parse(r.preparedAt))
      qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
    const completed=qaReleaseSeal_(Object.assign({},r,{state:'RELEASED_AUDITED',archiveHash:input.archiveHash,committedAt:new Date().toISOString()}));
    const record=qaReleaseRecord_(completed);qaReleaseProjection_(record);
    qaReleaseRevalidate_(c,input,validateSession,raw);qaReleaseApproval_(c,input,props.getProperty(qaReleaseApprovalKey_()));
    if(props.getProperty(qaReleaseApprovalKey_())!==approvalRaw || Date.now()>=r.expiresAt)qaRecoveryError_('QA_RELEASE_CONTEXT_CHANGED');
    props.setProperty(qaReleaseKey_(),completed);
    if(props.getProperty(qaReleaseKey_())!==completed)qaRecoveryError_('QA_RELEASE_COMMIT_UNCERTAIN_QUERY_ONLY');
    return qaReleaseProjection_(record);
  }));
}
