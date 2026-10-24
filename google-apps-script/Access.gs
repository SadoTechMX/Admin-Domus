/**
 * ============================================================================
 * DOMUS OS · ADMISSIONS & WARDROBE SYSTEM (Access.gs)
 * Control de aforo, taquilla, eventos y custodia física de guardarropa
 * ============================================================================
 */

'use strict';

/**
 * Consulta de eventos activos y registros de acceso en vivo
 */
function accesoSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sAcc = m.getSheetByName('ACCESO');
  const props = PropertiesService.getScriptProperties();

  // 1. Obtener actividades / eventos
  const rawActs = sAct ? sAct.getRange('A7:M106').getValues() : [];
  const activities = [];
  rawActs.forEach(r => {
    if (r[0]) {
      activities.push({
        name: String(r[0]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        type: String(r[2] || 'Evento'),
        organizer: String(r[3] || 'DOMUS'),
        priceGeneral: typeof r[4] === 'number' ? r[4] : (parseFloat(r[4]) || 0),
        pricePareja: typeof r[5] === 'number' ? r[5] : (parseFloat(r[5]) || 0),
        priceTrio: typeof r[6] === 'number' ? r[6] : (parseFloat(r[6]) || 0),
        priceGuardarropa: typeof r[7] === 'number' ? r[7] : (parseFloat(r[7]) || 50),
        capacity: Number(r[8]) || 150,
        status: String(r[11] || 'Confirmado')
      });
    }
  });

  // Actividad activa configurada
  let activeActivity = props.getProperty('actividadAcceso') || '';
  if (!activeActivity && activities.length > 0) {
    activeActivity = activities[0].name;
  }

  // 2. Obtener accesos registrados
  const rawAcc = sAcc ? sAcc.getRange('A7:AF506').getValues() : [];
  const recentAccess = [];
  let totalAttendance = 0;
  let activeWardrobe = 0;
  let totalAdmissionRevenue = 0;
  let presalesCount = 0;

  rawAcc.forEach((r, idx) => {
    if (r[0] || r[3]) {
      const rowId = String(r[0] || ('A-' + (idx + 7)));
      const dateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd HH:mm') : String(r[1] || '');
      const activity = String(r[2] || activeActivity);
      const customer = String(r[3] || 'Anónimo');
      const email = String(r[4] || '');
      const phone = String(r[5] || '');
      const entryType = String(r[6] || 'General');
      const packages = Number(r[7]) || (entryType === 'Pareja' ? 2 : (entryType === 'Trío' ? 3 : 1));
      const wardrobeQty = Number(r[8]) || 0;
      const totalAmount = Number(r[13]) || 0;
      const paid = Number(r[14]) || 0;
      const due = Number(r[15]) || 0;
      const presaleFolio = String(r[17] || '');
      const method = String(r[26] || 'Efectivo');
      const ticketGuardarropa = String(r[30] || (wardrobeQty > 0 ? ('GUA-' + rowId) : ''));
      const devuelto = String(r[31] || '').toUpperCase().includes('DEVUELTO') || r[31] === true;

      totalAttendance += packages;
      totalAdmissionRevenue += paid;
      if (entryType === 'Preventa') presalesCount++;
      if (wardrobeQty > 0 && !devuelto) {
        activeWardrobe += wardrobeQty;
      }

      recentAccess.unshift({
        id: rowId,
        date: dateStr,
        activity: activity,
        customer: customer,
        email: email,
        phone: phone,
        entryType: entryType,
        packages: packages,
        wardrobeQty: wardrobeQty,
        totalAmount: totalAmount,
        paid: paid,
        due: due,
        presaleFolio: presaleFolio,
        method: method,
        ticketGuardarropa: ticketGuardarropa,
        devuelto: devuelto
      });
    }
  });

  return {
    activeActivity: activeActivity,
    activities: activities,
    recentAccess: recentAccess,
    metrics: {
      totalAttendance: totalAttendance,
      activeWardrobe: activeWardrobe,
      totalAdmissionRevenue: totalAdmissionRevenue,
      presalesCount: presalesCount
    }
  };
}

/**
 * Registra un acceso/asistencia y su cobro en ACCESO y COBROS bajo candado estricto
 */
function accesoSimpleRegistrar(payload) {
  if (!payload) throw new Error('Datos de acceso no proporcionados.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    const sCob = m.getSheetByName('COBROS');

    const customer = String(payload.customer || 'Asistente').trim();
    const phone = String(payload.phone || '').trim();
    const email = String(payload.email || '').trim();
    const activity = String(payload.activity || 'Operación diaria').trim();
    const entryType = String(payload.entryType || 'General').trim();
    const packages = Number(payload.packages) || (entryType === 'Pareja' ? 2 : (entryType === 'Trío' ? 3 : 1));
    const wardrobeQty = Math.max(0, parseInt(payload.wardrobeQty, 10) || 0);
    const wardrobeNotes = String(payload.wardrobeNotes || '').trim();
    const presaleFolio = String(payload.presaleFolio || '').trim();
    const courtesyAuth = String(payload.courtesyAuth || '').trim();
    const entryPrice = parseFloat(payload.entryPrice) || 0;
    const wardrobePrice = parseFloat(payload.wardrobePrice) || (wardrobeQty * 50);
    const total = entryPrice + wardrobePrice;
    const method = String(payload.method || 'Efectivo').trim();
    const isPaid = payload.paid !== false;
    const reqKey = String(payload.id || payload.requestId || '').trim();

    // 1. Doble verificación a nivel base de datos en COBROS (Idempotencia Fuerte):
    if (reqKey && sCob) {
      const existingPayments = sCob.getRange(7, 1, 500, 14).getValues();
      const existingPay = existingPayments.find(r => r[8] === 'ACCESO-WEB:' + reqKey);
      if (existingPay && existingPay[0]) {
        console.log(`[IDEMPOTENCY EN SHEETS] Acceso previo localizado en COBROS: Folio ${existingPay[0]} para ${reqKey}`);
        return {
          ok: true,
          ticket: String(existingPay[3] || reqKey),
          rowId: String(existingPay[3] || reqKey),
          customer: String(existingPay[7] || customer),
          total: Number(existingPay[5]) || total,
          paid: true,
          date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
          message: `Acceso previamente confirmado (recuperado de COBROS): Folio ${existingPay[3] || existingPay[0]}`
        };
      }
    }

    // Generar Folio Atómico Inmutable
    const rowIdx = Math.max(sAcc.getLastRow() + 1, 7);
    const rowId = 'A-' + String(rowIdx).padStart(4, '0');
    const guaTicket = wardrobeQty > 0 ? ('GUA-' + rowId) : '';

    // Escribir en ACCESO
    const rowData = [
      rowId, new Date(), activity, customer, email, phone, entryType, packages, wardrobeQty,
      entryPrice, entryPrice, entryPrice, wardrobePrice, total, isPaid ? total : 0, isPaid ? 0 : total,
      isPaid ? 'LISTO' : 'PENDIENTE', presaleFolio, courtesyAuth, '', '', '', 'Registrado',
      '', '', packages, method, isPaid ? total : 0, true,
      guaTicket ? ('TICKETS FÍSICOS · ' + guaTicket + (wardrobeNotes ? ' · ' + wardrobeNotes : '')) : 'CONFIRMADO',
      guaTicket, false
    ];

    sAcc.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);

    // Si tiene cobro, asentar en COBROS
    if (isPaid && total > 0 && sCob) {
      const cobIdx = Math.max(sCob.getLastRow() + 1, 7);
      const cobFolio = 'REC-ACC-' + Date.now().toString(36).toUpperCase();
      const cobRow = [
        cobFolio, new Date(), 'Acceso', rowId, method, total, method === 'Efectivo' ? 0 : '',
        customer, 'ACCESO-WEB:' + rowId, '', method === 'Transferencia' ? 'Borrador' : 'Confirmado',
        'Taquilla', total, total, '', activity, 0, 0, 0, 'SISTEMA-WEB'
      ];
      sCob.getRange(cobIdx, 1, 1, cobRow.length).setValues([cobRow]);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      ticket: rowId,
      rowId: rowId,
      ticketGuardarropa: guaTicket,
      customer: customer,
      activity: activity,
      entryType: entryType,
      packages: packages,
      wardrobeQty: wardrobeQty,
      wardrobeNotes: wardrobeNotes,
      entryPrice: entryPrice,
      wardrobePrice: wardrobePrice,
      total: total,
      method: method,
      paid: isPaid,
      date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
      message: `Acceso registrado exitosamente para ${customer} (Folio: ${rowId}).`
    };
  });
}

/**
 * Marca como entregadas las prendas de guardarropa bajo candado
 */
function guardarropaDevolver(ticketGua) {
  if (!ticketGua) throw new Error('Folio de guardarropa requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    const values = sAcc.getRange('AE7:AF506').getValues();

    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toUpperCase() === String(ticketGua).trim().toUpperCase()) {
        const row = i + 7;
        sAcc.getRange(row, 32).setValue(true).setNote('DEVUELTO: ' + new Date().toISOString());
        SpreadsheetApp.flush();
        return { ok: true, message: 'Prendas entregadas para ' + ticketGua + '.' };
      }
    }

    throw new Error('Ticket de guardarropa ' + ticketGua + ' no encontrado.');
  });
}

/**
 * Establece la actividad activa de turno
 */
function accesoCambiarActividad(nombreActividad) {
  if (!nombreActividad) throw new Error('Nombre de actividad requerido.');
  PropertiesService.getScriptProperties().setProperty('actividadAcceso', nombreActividad);
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAcc = m.getSheetByName('ACCESO');
  if (sAcc) {
    sAcc.getRange('A1').setValue('DOMUS · ACCESO · ' + nombreActividad);
  }
  return { ok: true, activeActivity: nombreActividad, message: 'Actividad de acceso cambiada a: ' + nombreActividad };
}
