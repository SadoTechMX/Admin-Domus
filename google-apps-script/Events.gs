/**
 * ============================================================================
 * DOMUS OS · EVENTS & CALENDAR MANAGEMENT (Events.gs)
 * Programación de eventos en ACTIVIDADES y definición de tarifas de admisión
 * ============================================================================
 */

'use strict';

/**
 * Registra una nueva actividad o evento con su estructura tarifaria autorizada
 */
function registrarNuevoEvento(evento) {
  authRequireContext_('registrarNuevoEvento');
  if (!evento || !evento.name) throw new Error('El nombre del evento es requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAct = m.getSheetByName('ACTIVIDADES');
    if (!sAct) throw new Error('Hoja ACTIVIDADES no encontrada.');

    if(dataRows_(sAct,7,13).some(r=>String(r[0])===String(evento.name)))throw new Error('Actividad ya existente.');
    const amounts=[evento.priceGeneral,evento.pricePareja,evento.priceTrio,evento.priceGuardarropa].map(Number);
    if(amounts.some(n=>!Number.isFinite(n)||n<0))throw new Error('Tarifas inválidas.');
    if(!Number.isInteger(Number(evento.capacity))||Number(evento.capacity)<=0)throw new Error('Capacidad inválida.');
    const rowIdx = Math.max(sAct.getLastRow() + 1, 7);
    
    // Serializar tipos de boletos personalizados si se proporcionan
    let notesVal = evento.notes || '';
    if (Array.isArray(evento.ticketTypes) && evento.ticketTypes.length > 0) {
      notesVal = JSON.stringify(evento.ticketTypes);
    }

    const rowData = [
      evento.name,
      evento.date ? new Date(evento.date + 'T12:00:00') : new Date(),
      evento.type || 'CLUB_NOCTURNO',
      evento.organizer || 'DOMUS',
      parseFloat(evento.priceGeneral) || 0,
      parseFloat(evento.pricePareja) || 0,
      parseFloat(evento.priceTrio) || 0,
      Number(evento.priceGuardarropa),
      parseInt(evento.capacity, 10) || 150,
      'DOMUS',
      'Bruto',
      'Confirmado',
      notesVal
    ];

    return journalCommit_(evento.requestId,'registrarNuevoEvento',m,rowData.map((v,i)=>cellWrite_(sAct,rowIdx,i+1,v)),{ok:true,message:'Evento registrado.'});
  });
}
