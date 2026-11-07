'use strict';

// Preparation for adapting Shifts/Cuts into the recovery candidate. Private,
// read-only resolver; no RPC route, schema creation, opening, cut or POS activation.
// Future writers must persist this versioned result through the existing journal.
// Future mutation callers must hold the same script lock across this read and
// journal preparation. An old returned snapshot cannot authorize a new sale.
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

function journeyContext_(m,openingRequestId,observedAt) {
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
