/**
 * ============================================================================
 * DOMUS OS · ADMISSIONS, TICKETING & WARDROBE SYSTEM (Access.gs)
 * Fase 0.5: Modelo Comercial Integral de Accesos, Taquilla, Boleteras y Aforo (ADR-005)
 * ============================================================================
 */

'use strict';

/**
 * Canales de Venta de Boletos
 */
const ACCESS_SALES_CHANNELS = Object.freeze({
  TAQUILLA_DOMUS: 'TAQUILLA_DOMUS',
  PREVENTA_DOMUS: 'PREVENTA_DOMUS',
  BOLETERA_EXTERNA: 'BOLETERA_EXTERNA',
  TRANSFERENCIA_DIRECTA: 'TRANSFERENCIA_DIRECTA',
  LISTA: 'LISTA',
  CORTESIA: 'CORTESIA',
  MEMBRESIA: 'MEMBRESIA'
});

/**
 * Estados de Pago de la Entrada
 */
const ACCESS_PAYMENT_STATUS = Object.freeze({
  CONFIRMADA: 'CONFIRMADA',
  PAGADO_EXTERNAMENTE: 'PAGADO_EXTERNAMENTE',
  PENDIENTE_VERIFICACION: 'PENDIENTE_VERIFICACION',
  RECHAZADA: 'RECHAZADA'
});

/**
 * Consulta de eventos activos y registros de acceso en vivo
 */
function accesoSimpleDatos() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sAcc = m.getSheetByName('ACCESO');
  const props = PropertiesService.getScriptProperties();

  // 1. Obtener actividades / eventos y sus tipos de boletos
  const rawActs = sAct ? sAct.getRange('A7:M106').getValues() : [];
  const activities = [];
  rawActs.forEach(r => {
    if (r[0]) {
      const pGen = typeof r[4] === 'number' ? r[4] : (parseFloat(r[4]) || 0);
      const pPar = typeof r[5] === 'number' ? r[5] : (parseFloat(r[5]) || 0);
      const pTrio = typeof r[6] === 'number' ? r[6] : (parseFloat(r[6]) || 0);
      const pGua = typeof r[7] === 'number' ? r[7] : (parseFloat(r[7]) || 50);

      // Tipos de boletos del evento (estándar + personalizados en notas col M)
      let customTicketTypes = [];
      try {
        if (r[12] && String(r[12]).trim().startsWith('[')) {
          customTicketTypes = JSON.parse(r[12]);
        }
      } catch (e) {}

      const ticketTypes = [
        { id: 'General', name: 'General (1 Asistente)', price: pGen, persons: 1 },
        { id: 'Pareja', name: 'Pareja (2 Asistentes)', price: pPar, persons: 2 },
        { id: 'Trío', name: 'Trío (3 Asistentes)', price: pTrio, persons: 3 },
        ...customTicketTypes
      ];

      activities.push({
        name: String(r[0]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        type: String(r[2] || 'CLUB_NOCTURNO'),
        organizer: String(r[3] || 'DOMUS'),
        priceGeneral: pGen,
        pricePareja: pPar,
        priceTrio: pTrio,
        priceGuardarropa: pGua,
        capacity: Number(r[8]) || 150,
        status: String(r[11] || 'Confirmado'),
        ticketTypes: ticketTypes
      });
    }
  });

  // Actividad activa configurada
  let activeActivity = props.getProperty('actividadAcceso') || '';
  if (!activeActivity && activities.length > 0) {
    activeActivity = activities[0].name;
  }

  // 2. Obtener accesos registrados con modelo comercial integral (22 campos)
  const rawAcc = sAcc ? sAcc.getRange('A7:AF506').getValues() : [];
  const recentAccess = [];
  let totalAttendance = 0;
  let activeWardrobe = 0;
  let totalDoorRevenue = 0;
  let totalCommercialGross = 0;
  let presalesCount = 0;
  let courtesiesCount = 0;

  rawAcc.forEach((r, idx) => {
    if (r[0] || r[3]) {
      const rowId = String(r[0] || ('A-' + String(idx + 7).padStart(4, '0')));
      const dateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd HH:mm') : String(r[1] || '');
      const activity = String(r[2] || activeActivity);
      const customer = String(r[3] || 'Anónimo');
      const email = String(r[4] || '');
      const phone = String(r[5] || '');
      const ticketTypeId = String(r[6] || 'General');
      const persons = Number(r[7]) || (ticketTypeId === 'Pareja' ? 2 : (ticketTypeId === 'Trío' ? 3 : 1));
      const wardrobeQty = Number(r[8]) || 0;
      const faceValue = Number(r[9]) || 0;
      const wardrobeAmount = Number(r[12]) || 0;
      const totalCommercial = Number(r[13]) || (faceValue + wardrobeAmount);
      const amountPaidAtDoor = Number(r[14]) || 0;
      const amountDueAtDoor = Number(r[15]) || 0;
      const paymentStatus = String(r[16] || 'CONFIRMADA');
      const externalTicketId = String(r[17] || '');
      const courtesyAuth = String(r[18] || '');
      const salesChannel = String(r[19] || (externalTicketId ? 'BOLETERA_EXTERNA' : 'TAQUILLA_DOMUS'));
      const ticketProvider = String(r[20] || 'DOMUS');
      const method = String(r[26] || 'Efectivo');
      const ticketGuardarropa = String(r[30] || (wardrobeQty > 0 ? ('GUA-' + rowId) : ''));
      const wardrobeReturned = String(r[31] || '').toUpperCase().includes('DEVUELTO') || r[31] === true;

      totalAttendance += persons;
      totalDoorRevenue += amountPaidAtDoor;
      totalCommercialGross += totalCommercial;
      if (salesChannel === 'BOLETERA_EXTERNA' || salesChannel === 'PREVENTA_DOMUS') presalesCount++;
      if (salesChannel === 'CORTESIA') courtesiesCount++;
      if (wardrobeQty > 0 && !wardrobeReturned) {
        activeWardrobe += wardrobeQty;
      }

      recentAccess.unshift({
        id: rowId,
        date: dateStr,
        activity: activity,
        customer: customer,
        email: email,
        phone: phone,
        ticketTypeId: ticketTypeId,
        persons: persons,
        salesChannel: salesChannel,
        ticketProvider: ticketProvider,
        externalTicketId: externalTicketId,
        faceValue: faceValue,
        wardrobeQty: wardrobeQty,
        wardrobeAmount: wardrobeAmount,
        totalCommercial: totalCommercial,
        amountPaidAtDoor: amountPaidAtDoor,
        amountDueAtDoor: amountDueAtDoor,
        paymentStatus: paymentStatus,
        paymentMethod: method,
        courtesyAuth: courtesyAuth,
        ticketGuardarropa: ticketGuardarropa,
        wardrobeReturned: wardrobeReturned
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
      totalDoorRevenue: totalDoorRevenue,
      totalCommercialGross: totalCommercialGross,
      presalesCount: presalesCount,
      courtesiesCount: courtesiesCount
    }
  };
}

/**
 * Registra un acceso/asistencia y su cobro en ACCESO y COBROS bajo candado estricto
 * Fase 0.5: Atribución correcta de ingresos (Boleteras vs Taquilla vs Guardarropa)
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
    const salesChannel = String(payload.salesChannel || ACCESS_SALES_CHANNELS.TAQUILLA_DOMUS).trim();
    const ticketTypeId = String(payload.ticketTypeId || payload.entryType || 'General').trim();
    const persons = Number(payload.persons) || (ticketTypeId === 'Pareja' ? 2 : (ticketTypeId === 'Trío' ? 3 : 1));
    const faceValue = parseFloat(payload.faceValue || payload.entryPrice) || 0;
    
    const wardrobeQty = Math.max(0, parseInt(payload.wardrobeQty, 10) || 0);
    const wardrobeNotes = String(payload.wardrobeNotes || '').trim();
    const wardrobeUnitPrice = parseFloat(payload.wardrobeUnitPrice) || 50;
    const wardrobeAmount = wardrobeQty * wardrobeUnitPrice;

    const ticketProvider = String(payload.ticketProvider || (salesChannel === ACCESS_SALES_CHANNELS.BOLETERA_EXTERNA ? 'Boletera' : 'DOMUS')).trim();
    const externalTicketId = String(payload.externalTicketId || payload.presaleFolio || '').trim();
    const courtesyAuth = String(payload.courtesyAuth || '').trim();
    const paymentMethod = String(payload.paymentMethod || payload.method || 'Efectivo').trim();
    const paymentReference = String(payload.paymentReference || '').trim();

    // 1. Cálculo financiero estricto de puerta:
    let ticketDoorCharge = 0;
    let paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;

    if (salesChannel === ACCESS_SALES_CHANNELS.BOLETERA_EXTERNA) {
      ticketDoorCharge = 0;
      paymentStatus = ACCESS_PAYMENT_STATUS.PAGADO_EXTERNAMENTE;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.PREVENTA_DOMUS) {
      ticketDoorCharge = 0; // Ya cobrada con anterioridad en DOMUS
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.CORTESIA || salesChannel === ACCESS_SALES_CHANNELS.LISTA) {
      ticketDoorCharge = 0;
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    } else if (salesChannel === ACCESS_SALES_CHANNELS.TRANSFERENCIA_DIRECTA) {
      const isVerified = payload.isTransferVerified === true || payload.paymentStatus === ACCESS_PAYMENT_STATUS.CONFIRMADA;
      paymentStatus = isVerified ? ACCESS_PAYMENT_STATUS.CONFIRMADA : ACCESS_PAYMENT_STATUS.PENDIENTE_VERIFICACION;
      ticketDoorCharge = isVerified ? faceValue : 0;
    } else {
      // TAQUILLA_DOMUS
      ticketDoorCharge = faceValue;
      paymentStatus = ACCESS_PAYMENT_STATUS.CONFIRMADA;
    }

    // El cobro en puerta es la suma del boleto de taquilla + guardarropa
    const doorCollectedTotal = ticketDoorCharge + wardrobeAmount;
    const commercialTotal = faceValue + wardrobeAmount;
    const dueAtDoor = (salesChannel === ACCESS_SALES_CHANNELS.TAQUILLA_DOMUS ? faceValue : 0) + wardrobeAmount - doorCollectedTotal;

    const reqKey = String(payload.id || payload.requestId || '').trim();

    // 2. Doble verificación a nivel base de datos en COBROS (Idempotencia Fuerte):
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
          total: Number(existingPay[5]) || doorCollectedTotal,
          doorCollected: Number(existingPay[5]) || doorCollectedTotal,
          paid: true,
          date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
          message: `Acceso previamente confirmado (recuperado de COBROS): Folio ${existingPay[3] || existingPay[0]}`
        };
      }
    }

    // Generar Folio Atómico Inmutable de Acceso
    const rowIdx = Math.max(sAcc.getLastRow() + 1, 7);
    const rowId = 'A-' + String(rowIdx).padStart(4, '0');
    const guaTicket = wardrobeQty > 0 ? ('GUA-' + rowId) : '';

    // Escribir en ACCESO (22 campos según ADR-005)
    const rowData = [
      rowId,                          // Col 1: accessId
      new Date(),                     // Col 2: checkedInAt
      activity,                       // Col 3: eventId / activity
      customer,                       // Col 4: customer
      email,                          // Col 5: email
      phone,                          // Col 6: phone
      ticketTypeId,                   // Col 7: ticketTypeId
      persons,                        // Col 8: persons (aforo)
      wardrobeQty,                    // Col 9: wardrobeQty
      faceValue,                      // Col 10: faceValue
      faceValue,                      // Col 11: precio base
      faceValue,                      // Col 12: precio catálogo
      wardrobeAmount,                 // Col 13: wardrobeAmount
      commercialTotal,                // Col 14: valor comercial total
      doorCollectedTotal,             // Col 15: cobrado en puerta DOMUS
      dueAtDoor,                      // Col 16: saldo por cobrar
      paymentStatus,                  // Col 17: paymentStatus
      externalTicketId,               // Col 18: externalTicketId / QR
      courtesyAuth,                   // Col 19: courtesyAuth
      salesChannel,                   // Col 20: salesChannel
      ticketProvider,                 // Col 21: ticketProvider
      paymentReference,               // Col 22: paymentReference
      'Registrado',                   // Col 23: estado checkin
      '', '', persons,                // Col 24-26
      paymentMethod,                  // Col 27: paymentMethod
      doorCollectedTotal,             // Col 28: cobrado
      true,                           // Col 29: activo
      guaTicket ? ('TICKETS FÍSICOS · ' + guaTicket + (wardrobeNotes ? ' · ' + wardrobeNotes : '')) : 'CONFIRMADO',
      guaTicket,                      // Col 31: ticketGuardarropa
      false                           // Col 32: devuelto
    ];

    sAcc.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);

    // 3. Asentar en COBROS ÚNICAMENTE lo que DOMUS cobra en puerta:
    // A. Cobro de Entrada de Taquilla
    if (ticketDoorCharge > 0 && sCob) {
      const cobIdx = Math.max(sCob.getLastRow() + 1, 7);
      const cobFolio = 'REC-TAQ-' + Date.now().toString(36).toUpperCase();
      const cobRow = [
        cobFolio, new Date(), 'Accesos', rowId, paymentMethod, ticketDoorCharge,
        paymentMethod === 'Efectivo' ? 0 : '', customer, 'ACCESO-WEB:' + rowId,
        '', 'Confirmado', 'Taquilla', ticketDoorCharge, ticketDoorCharge, '',
        activity, 0, 0, 0, 'SISTEMA-WEB'
      ];
      sCob.getRange(cobIdx, 1, 1, cobRow.length).setValues([cobRow]);
    }

    // B. Cobro de Guardarropa independiente
    if (wardrobeAmount > 0 && sCob) {
      const cobIdxGua = Math.max(sCob.getLastRow() + 1, 7);
      const cobFolioGua = 'REC-GUA-' + Date.now().toString(36).toUpperCase();
      const cobRowGua = [
        cobFolioGua, new Date(), 'Guardarropa', guaTicket, paymentMethod, wardrobeAmount,
        paymentMethod === 'Efectivo' ? 0 : '', customer, 'ACCESO-GUA:' + guaTicket,
        '', 'Confirmado', 'Taquilla', wardrobeAmount, wardrobeAmount, '',
        activity, 0, 0, 0, 'SISTEMA-WEB'
      ];
      sCob.getRange(cobIdxGua, 1, 1, cobRowGua.length).setValues([cobRowGua]);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      ticket: rowId,
      rowId: rowId,
      ticketGuardarropa: guaTicket,
      customer: customer,
      activity: activity,
      ticketTypeId: ticketTypeId,
      salesChannel: salesChannel,
      ticketProvider: ticketProvider,
      persons: persons,
      faceValue: faceValue,
      wardrobeQty: wardrobeQty,
      wardrobeAmount: wardrobeAmount,
      totalCommercial: commercialTotal,
      doorCollected: doorCollectedTotal,
      paymentStatus: paymentStatus,
      paymentMethod: paymentMethod,
      date: Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'),
      message: `Acceso registrado con éxito. Folio: ${rowId}${guaTicket ? ' · ' + guaTicket : ''}`
    };
  });
}

/**
 * Devuelve una prenda de guardarropa
 */
function guardarropaDevolver(payload) {
  if (!payload || !payload.ticket) throw new Error('Ticket de guardarropa requerido.');
  const ticket = String(payload.ticket).trim();

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    if (!sAcc) throw new Error('Hoja ACCESO no encontrada.');

    const rows = sAcc.getRange('A7:AF506').getValues();
    let foundRow = -1;

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][30]).trim() === ticket || String(rows[i][0]).trim() === ticket) {
        foundRow = i + 7;
        break;
      }
    }

    if (foundRow === -1) {
      throw new Error(`Ticket de guardarropa "${ticket}" no encontrado.`);
    }

    sAcc.getRange(foundRow, 32).setValue(true);
    SpreadsheetApp.flush();

    return {
      ok: true,
      ticket: ticket,
      message: `Prenda del ticket "${ticket}" devuelta exitosamente.`
    };
  });
}

/**
 * Cambia la actividad / evento activo en el sistema
 */
function accesoCambiarActividad(payload) {
  if (!payload || !payload.activity) throw new Error('Actividad no especificada.');
  const act = String(payload.activity).trim();
  PropertiesService.getScriptProperties().setProperty('actividadAcceso', act);
  return { ok: true, activeActivity: act };
}
