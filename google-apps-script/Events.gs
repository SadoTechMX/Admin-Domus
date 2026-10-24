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
  if (!evento || !evento.name) throw new Error('El nombre del evento es requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAct = m.getSheetByName('ACTIVIDADES');
    if (!sAct) throw new Error('Hoja ACTIVIDADES no encontrada.');

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
      parseFloat(evento.priceGuardarropa) || 50,
      parseInt(evento.capacity, 10) || 150,
      'DOMUS',
      'Bruto',
      'Confirmado',
      notesVal
    ];

    sAct.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: `Evento "${evento.name}" programado con éxito en ACTIVIDADES.`
    };
  });
}
