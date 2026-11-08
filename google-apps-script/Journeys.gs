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
  if(typeof openingRequestId!=='string' || !openingRequestId.trim() || !(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    throw journeyError_('Se requiere apertura identificada e instante del servidor.');
  }
  const index=paymentRequestIndex_(m),record=paymentRequest_(index,openingRequestId),p=record && record.result;
  if(!record || record.action!=='turnoAbrir' || record.status!=='COMPLETED' || !p || p.ok!==true ||
      p.journeyContract!=='domus-journey-v1' || p.openingRequestId!==openingRequestId ||
      p.journeyId!=='JOR-'+openingRequestId || typeof p.shiftId!=='string' || !p.shiftId.trim() ||
      p.status!=='OPEN' || !journeyScopeValid_(p.scope) || journeyTimestamp_(p.openedAt)===null) {
    throw journeyError_('Apertura sin vínculo durable de evento/proyecto/jornada. No importar el prototipo por fecha.');
  }
  if(observedAt.getTime()<journeyTimestamp_(p.openedAt))throw journeyError_('El instante precede la apertura.');
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
    openedAt:p.openedAt,occurredAt:observedAt.toISOString(),status:closed?'CLOSED':'OPEN',allowed:!closed,
    cutId:closed?cuts[0].cutId:null,closedAt:closed?cuts[0].closedAt:null};
}

function journeyReject_(message) {
  const e=new Error(message);e.code='JOURNEY_VALIDATION_NO_EFFECTS';e.status=422;return e;
}
function journeyKnownNoEffects_(m,rows) {
  if(rows.length!==1 || journalFind_(String(rows[0][0]),m))return false;
  let p;try {p=JSON.parse(rows[0][7]);} catch(_){return false;}
  return p && p.status===422 && ['JOURNEY_VALIDATION_NO_EFFECTS','SALE_VALIDATION_REJECTED_NO_EFFECTS','SALE_PHASE_CHANGED_NO_EFFECTS',
    'TRANSFER_POLICY_REQUIRED_NO_EFFECTS','TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS','TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS'].includes(p.code);
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
  const r=paymentRequest_(paymentRequestIndex_(m),id);return r && r.result;
}
function journeyAssertSettled_(m,ownId) {
  paymentRequestIndex_(m).forEach((rows,id)=>{
    if(id===ownId)return;
    if(!rows.some(r=>['turnoAbrir','corteZCerrar','cajaSimpleRegistrar','confirmarTransferencia','cancelarTransferenciaNoRecibida','comandasSimpleAccion'].includes(r[1])))return;
    if(journeyKnownNoEffects_(m,rows))return;
    if(rows.length!==1 || rows[0][4]!=='COMPLETED')throw journeyError_('Hay intenciones inciertas. Recuperar o conciliar antes de abrir/cortar.');
  });
}
function journeyOpenings_(m,now,ownId) {
  const result=[];
  paymentRequestIndex_(m).forEach((rows,id)=>{
    if(id===ownId || !rows.some(r=>r[1]==='turnoAbrir') || journeyKnownNoEffects_(m,rows))return;
    const context=journeyContext_(m,id,now,ownId);
    if(context.allowed)result.push(journeyOpening_(m,id));
  });
  return result;
}

function turnoAbrir(p) {
  authRequireContext_('turnoAbrir');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId),id=p && p.requestId;
    const resumed=journalResume_(id,'turnoAbrir',m);if(resumed)return resumed;
    const result=journeyPreflight_(()=>{
      if(!p)throw journeyReject_('Datos de apertura requeridos.');
      const policy=journeyPolicy_(m),station=journeyStation_(policy);
      const scope=policy.scopes.find(s=>s.id===p.scopeId && station.scopeIds.includes(s.id));
      if(!scope || !journeyMoney_(p.openingFloat))throw journeyReject_('Selecciona evento/proyecto autorizado y fondo inicial explícito.');
      journeyAssertSettled_(m,id);
      const now=new Date();
      if(journeyOpenings_(m,now,id).some(o=>o.stationId===station.stationId || o.registerId===station.registerId ||
          (o.scope.projectId===scope.projectId && o.scope.eventId===scope.eventId)))throw journeyReject_('Estación, gaveta o evento/proyecto ya tiene jornada abierta.');
      return {ok:true,journeyContract:'domus-journey-v1',openingRequestId:id,journeyId:'JOR-'+id,shiftId:'TURNO-'+id,
        scopeId:scope.id,scope:{projectId:scope.projectId,projectName:scope.projectName,eventId:scope.eventId,eventName:scope.eventName},activity:scope.activity,
        stationId:station.stationId,registerId:station.registerId,deviceId:_authContext.deviceId,openingFloat:p.openingFloat,
        openedAt:now.toISOString(),openedBy:_authContext.operator,status:'OPEN'};
    });
    // Opening float is custody metadata, never a sale/payment/stock mutation.
    return journalCommit_(id,'turnoAbrir',m,[],result);
  });
}

function turnoEstado() {
  authRequireContext_('turnoEstado');
  return withLock_(CONFIG.lockTimeoutMs,()=>journeyState_(SpreadsheetApp.openById(CONFIG.mainSheetId)));
}
function journeyState_(m) {
  const policy=journeyPolicy_(m);if(!policy)return {enabled:false,active:null};
  const station=journeyStation_(policy),active=journeyOpenings_(m,new Date()).filter(o=>o.stationId===station.stationId || o.registerId===station.registerId);
  if(active.length>1)throw journeyError_('Estación/gaveta con aperturas duplicadas.');
  const cuts=[],index=paymentRequestIndex_(m);
  index.forEach((rows,id)=>{
    if(rows.length!==1 || rows[0][1]!=='corteZCerrar' || rows[0][4]!=='COMPLETED')return;
    const c=paymentRequest_(index,id).result,o=c && journeyOpening_(m,c.openingRequestId);
    if(!c || c.coverage!=='JOURNEY_POS_RECEIPTS' || c.financialFinal!==false || !c.snapshot || !c.snapshot.totals || !Array.isArray(c.snapshot.openAccounts))throw journeyError_('Corte sin snapshot compatible.');
    if(o && o.stationId===station.stationId && o.registerId===station.registerId)cuts.push(c);
  });
  cuts.sort((a,b)=>b.closedAt.localeCompare(a.closedAt));
  return {enabled:true,active:active[0] || null,lastCut:cuts[0] || null,scopes:policy.scopes.filter(s=>station.scopeIds.includes(s.id)),stationId:station.stationId,registerId:station.registerId};
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
  const records=[],index=paymentRequestIndex_(m);
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
  const index=paymentRequestIndex_(m),payments=dataRows_(m.getSheetByName('COBROS'),7,31),commands=dataRows_(m.getSheetByName('COMANDAS'),7,14);
  const cancellations=transferCancellationRecords_(m,index);
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
      if(!confirmed && (!cancelled || cancelled.wasteReview.status!=='NO_WASTE_OBSERVED'))pendingTransfers.push({requestId:id,receipt:r.receipt,amount:r.total,
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
  return {coverage:'JOURNEY_POS_RECEIPTS',financialFinal:false,observedAt:now.toISOString(),movements:movements,totals:totals,tips:tips,
    openingFloat:opening.openingFloat,cashFromBoundPOS:posRound_(opening.openingFloat+totals.Efectivo+tips),pendingTransfers:pendingTransfers,pendingDeliveries:pendingDeliveries,
    cancelledTransfers:cancellations.filter(c=>c.journey.journeyId===opening.journeyId).map(c=>({requestId:c.cancellationRequestId,sourceRequestId:c.sourceRequestId,sourceReceipt:c.sourceReceipt,
      cancelledAmount:c.cancelledAmount,amountApplied:0,wasteStatus:c.wasteReview.status})),
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
        cutId:'CORTE-JOR-'+id,closedAt:now.toISOString(),closedBy:_authContext.operator,status:'CLOSED',snapshot:snapshot,countedCash:p.countedCash,
        closurePolicy:'RESOLVE_PENDING_TRANSFERS_AND_DELIVERIES',
        coverage:snapshot.coverage,financialFinal:false,message:'Jornada cerrada. Corte limitado a recibos POS vinculados; no es liquidación de reparto ni arqueo de otros movimientos.'};
    });
    if(JSON.stringify(result).length>40000)throw journeyReject_('Corte demasiado grande para el formato durable actual. Preparar paginación antes de cerrar; no se truncó el historial.');
    return journalCommit_(id,'corteZCerrar',m,[],result);
  });
}
