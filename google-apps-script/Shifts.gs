/**
 * ============================================================================
 * DOMUS OS · SHIFTS & OPERATIONAL DAY ENGINE (Shifts.gs)
 * Gestión canónica de Turnos, Aperturas, Gavetas de Custodia (registerId)
 * y Día Operativo (businessDate) independiente de la medianoche.
 * ============================================================================
 */

'use strict';

/**
 * Retorna la fecha operativa actual en zona horaria America/Mexico_City ('yyyy-MM-dd')
 */
function getBusinessDateNow_() {
  return Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
}

/**
 * Retorna el identificador canónico del día operativo
 */
function getOperationDayId_(businessDate) {
  return 'OPDAY-' + String(businessDate).replace(/-/g, '');
}

/**
 * Mapeo canónico de gaveta física por estación operativa
 */
function getDefaultRegisterForStation_(stationId) {
  const map = {
    CAJA_1: 'GAVETA_1',
    CAJA_2: 'GAVETA_2',
    ACCESOS: 'GAVETA_ACCESOS',
    GUARDARROPA: 'GAVETA_ACCESOS',
    BARRA: 'GAVETA_BARRA'
  };
  return map[stationId] || ('GAVETA_' + stationId);
}

/**
 * Localiza dinámicamente el índice de una columna por nombre de encabezado.
 * Si no existe, lo agrega al final de los encabezados existentes sin sobreescribir columnas intermedias.
 * Devuelve el índice 1-based de la columna.
 */
function getOrAddColumnIndex_(sheet, headerName, headerRow) {
  const row = headerRow || 6;
  const maxCols = sheet.getMaxColumns();
  
  if (maxCols === 0) {
    sheet.insertColumnsAfter(1, 1);
    sheet.getRange(row, 1).setValue(headerName)
      .setBackground('#252B36').setFontColor('#ffffff').setFontWeight('bold');
    return 1;
  }

  const lastCol = sheet.getLastColumn();
  const rangeWidth = Math.max(lastCol, maxCols);
  const headers = sheet.getRange(row, 1, 1, rangeWidth).getValues()[0];

  for (let c = 0; c < headers.length; c++) {
    if (String(headers[c] || '').trim().toLowerCase() === headerName.trim().toLowerCase()) {
      return c + 1;
    }
  }

  // Si no se encontró, detectar la última columna con contenido real en la fila de encabezados
  let lastContentCol = 0;
  for (let c = headers.length - 1; c >= 0; c--) {
    if (String(headers[c] || '').trim() !== '') {
      lastContentCol = c + 1;
      break;
    }
  }

  const targetCol = lastContentCol + 1;
  if (targetCol > maxCols) {
    sheet.insertColumnsAfter(maxCols, targetCol - maxCols);
  }

  sheet.getRange(row, targetCol).setValue(headerName)
    .setBackground('#252B36').setFontColor('#ffffff').setFontWeight('bold');

  return targetCol;
}

/**
 * Asegura la creación y consistencia no destructiva de las hojas de Fase 1:
 * - TURNOS
 * - CORTES_Z
 * - AJUSTES_Z
 * - Encabezados dinámicos (shiftId, businessDate) en COBROS, MOVIMIENTOS, DEVOLUCIONES, ACCESO, CAJA 2.
 */
function ensurePhase1Schema_(m) {
  if (!m) m = SpreadsheetApp.openById(CONFIG.mainSheetId);

  // 1. Hoja TURNOS
  let sTurnos = m.getSheetByName('TURNOS');
  if (!sTurnos) {
    sTurnos = m.insertSheet('TURNOS');
    const headersTurnos = [
      'shiftId', 'operationDayId', 'businessDate', 'stationId', 'registerId', 'phase',
      'openedAt', 'openedBy', 'openingFloat', 'openingFloatBreakdown', 'openingNotes',
      'status', 'countingStartedAt', 'closedAt', 'closedBy', 'cutId',
      'version', 'requestId', 'createdAt'
    ];
    sTurnos.getRange(1, 1, 1, headersTurnos.length).setValues([headersTurnos])
      .setBackground('#252B36').setFontColor('#ffffff').setFontWeight('bold');
    sTurnos.setFrozenRows(1);
  }

  // 2. Hoja CORTES_Z
  let sCortesZ = m.getSheetByName('CORTES_Z');
  if (!sCortesZ) {
    sCortesZ = m.insertSheet('CORTES_Z');
    const headersCortesZ = [
      'cutId', 'shiftId', 'operationDayId', 'businessDate', 'registerId', 'stationId',
      'openedAt', 'closedAt', 'openingFloat',
      'cashSales', 'cashOtherIncome', 'cashRefunds', 'cashWithdrawals', 'cashExpenses',
      'expectedCash', 'countedCash', 'difference', 'differenceStatus',
      'terminal1', 'terminal2',
      'transfersConfirmed', 'transfersPending',
      'ticketingExternalValue', 'ticketingExternalReceivable',
      'courtesyCount', 'courtesyCommercialValue',
      'tips',
      'openAccounts', 'openAccountsBalance',
      'grossSales', 'netSales',
      'snapshotJson', 'snapshotHash',
      'closedBy', 'createdAt', 'requestId', 'version'
    ];
    sCortesZ.getRange(1, 1, 1, headersCortesZ.length).setValues([headersCortesZ])
      .setBackground('#252B36').setFontColor('#ffffff').setFontWeight('bold');
    sCortesZ.setFrozenRows(1);
  }

  // 3. Hoja AJUSTES_Z
  let sAjustesZ = m.getSheetByName('AJUSTES_Z');
  if (!sAjustesZ) {
    sAjustesZ = m.insertSheet('AJUSTES_Z');
    const headersAjustesZ = [
      'adjustmentId', 'cutId', 'motivo', 'importe', 'medio',
      'actor', 'autorizadoPor', 'timestamp', 'requestId'
    ];
    sAjustesZ.getRange(1, 1, 1, headersAjustesZ.length).setValues([headersAjustesZ])
      .setBackground('#252B36').setFontColor('#ffffff').setFontWeight('bold');
    sAjustesZ.setFrozenRows(1);
  }

  // 4. Encabezados no destructivos en hojas existentes
  const sheetsToExtend = [
    { name: 'COBROS', row: 6 },
    { name: 'MOVIMIENTOS', row: 6 },
    { name: 'DEVOLUCIONES', row: 6 },
    { name: 'ACCESO', row: 6 },
    { name: 'CAJA 2', row: 6 }
  ];

  sheetsToExtend.forEach(item => {
    const sh = m.getSheetByName(item.name);
    if (sh) {
      getOrAddColumnIndex_(sh, 'shiftId', item.row);
      getOrAddColumnIndex_(sh, 'businessDate', item.row);
    }
  });

  return { ok: true, message: 'Esquema de Fase 1 verificado e inicializado correctamente.' };
}

/**
 * Apertura formal de un Turno de Caja / Estación.
 * REGLAS CANÓNICAS:
 * 1. El fondo inicial NO es ingreso ni venta.
 * 2. Un registerId NO puede tener dos turnos financieros OPEN simultáneos.
 * 3. Una stationId NO puede tener dos turnos operativos OPEN simultáneos.
 * 4. El businessDate se congela al abrir y no cambia al cruzar medianoche.
 */
function turnoAbrir(p, authContext) {
  if (!p) throw new Error('Parámetros de apertura vacíos.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    ensurePhase1Schema_(m);

    const sTurnos = m.getSheetByName('TURNOS');
    const stationId = String(p.stationId || (authContext && authContext.stationId) || 'CAJA_1').trim().toUpperCase();
    const registerId = String(p.registerId || getDefaultRegisterForStation_(stationId)).trim().toUpperCase();
    const openingFloat = Number(p.openingFloat) || 0;

    if (openingFloat < 0 || !Number.isFinite(openingFloat)) {
      throw new Error('El fondo inicial debe ser un importe numérico mayor o igual a cero.');
    }

    // 1. Verificación de exclusión mutua de turnos abiertos
    const lastRow = sTurnos.getLastRow();
    if (lastRow >= 2) {
      const turnosData = sTurnos.getRange(2, 1, lastRow - 1, 12).getValues();
      for (let i = 0; i < turnosData.length; i++) {
        const row = turnosData[i];
        const rowShiftId = row[0];
        const rowStation = String(row[3]).toUpperCase();
        const rowRegister = String(row[4]).toUpperCase();
        const rowStatus = String(row[11]).toUpperCase();

        if (rowStatus === 'OPEN' || rowStatus === 'COUNTING') {
          if (rowRegister === registerId) {
            const err = new Error(`Conflicto de custodia: La gaveta '${registerId}' ya cuenta con un turno abierto activo ('${rowShiftId}'). Debe cerrarse antes de abrir uno nuevo.`);
            err.status = 409;
            err.code = 'REGISTER_ALREADY_OPEN';
            throw err;
          }
          if (rowStation === stationId) {
            const err = new Error(`Conflicto operativo: La estación '${stationId}' ya cuenta con un turno abierto activo ('${rowShiftId}').`);
            err.status = 409;
            err.code = 'STATION_ALREADY_OPEN';
            throw err;
          }
        }
      }
    }

    // 2. Cálculo del día operativo y timestamps
    const now = new Date();
    const openedAt = now.toISOString(); // UTC absoluto
    const businessDate = getBusinessDateNow_(); // America/Mexico_City
    const operationDayId = getOperationDayId_(businessDate);

    // 3. Generación de folio único de turno
    const shiftId = 'TURNO-' + businessDate.replace(/-/g, '') + '-' + stationId + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    const openedBy = String((authContext && authContext.operator) || p.openedBy || 'Caja').trim();
    const phase = String(p.phase || 'Solar').trim();
    const openingNotes = String(p.openingNotes || '').trim();
    const breakdownJson = p.openingFloatBreakdown ? JSON.stringify(p.openingFloatBreakdown) : '';

    const newRow = [
      shiftId,
      operationDayId,
      businessDate,
      stationId,
      registerId,
      phase,
      openedAt,
      openedBy,
      openingFloat,
      breakdownJson,
      openingNotes,
      'OPEN',
      '', // countingStartedAt
      '', // closedAt
      '', // closedBy
      '', // cutId
      1,  // version
      p.requestId || ('REQ-APERTURA-' + Date.now()),
      openedAt
    ];

    sTurnos.getRange(Math.max(sTurnos.getLastRow() + 1, 2), 1, 1, newRow.length).setValues([newRow]);
    SpreadsheetApp.flush();

    console.log(`[TURNO ABIERTO] Folio: ${shiftId} | Estación: ${stationId} | Gaveta: ${registerId} | Fondo: $${openingFloat} | Día: ${businessDate}`);

    return {
      ok: true,
      shiftId: shiftId,
      operationDayId: operationDayId,
      businessDate: businessDate,
      stationId: stationId,
      registerId: registerId,
      phase: phase,
      openingFloat: openingFloat,
      openedAt: openedAt,
      openedBy: openedBy,
      status: 'OPEN',
      message: `Turno ${shiftId} abierto exitosamente con fondo inicial de $${openingFloat.toFixed(2)}.`
    };
  });
}

/**
 * Consulta el estado activo de turno para una estación o gaveta
 */
function turnoEstado(stationId, registerId) {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sTurnos = m.getSheetByName('TURNOS');
  if (!sTurnos || sTurnos.getLastRow() < 2) {
    return { active: false, message: 'No hay turnos registrados en el sistema.' };
  }

  const cleanStation = stationId ? String(stationId).toUpperCase() : '';
  const cleanRegister = registerId ? String(registerId).toUpperCase() : '';
  const turnosData = sTurnos.getRange(2, 1, sTurnos.getLastRow() - 1, 19).getValues();

  for (let i = turnosData.length - 1; i >= 0; i--) {
    const row = turnosData[i];
    const rowStatus = String(row[11]).toUpperCase();
    const rowStation = String(row[3]).toUpperCase();
    const rowRegister = String(row[4]).toUpperCase();

    const matchesStation = cleanStation && rowStation === cleanStation;
    const matchesRegister = cleanRegister && rowRegister === cleanRegister;

    if ((matchesStation || matchesRegister || (!cleanStation && !cleanRegister)) && (rowStatus === 'OPEN' || rowStatus === 'COUNTING')) {
      return {
        active: true,
        shift: {
          shiftId: row[0],
          operationDayId: row[1],
          businessDate: row[2],
          stationId: row[3],
          registerId: row[4],
          phase: row[5],
          openedAt: row[6],
          openedBy: row[7],
          openingFloat: Number(row[8]) || 0,
          status: row[11],
          countingStartedAt: row[12],
          version: row[16]
        }
      };
    }
  }

  return { active: false, message: 'No hay turno abierto para esta estación/gaveta.' };
}

/**
 * Obtiene el turno activo asignado en servidor para la estación (Zero-Trust).
 * Si no hay turno abierto, devuelve un contexto con businessDate de hoy y shiftId vacío.
 */
function getActiveShiftForStation_(stationId, registerId) {
  try {
    const res = turnoEstado(stationId, registerId);
    if (res.active && res.shift) {
      return res.shift;
    }
  } catch (e) {
    console.warn('[SHIFT LOOKUP WARNING]', e.message);
  }

  return {
    shiftId: '',
    businessDate: getBusinessDateNow_(),
    operationDayId: getOperationDayId_(getBusinessDateNow_()),
    stationId: stationId || 'CAJA_1',
    registerId: registerId || 'GAVETA_1',
    openingFloat: 0,
    status: 'NO_SHIFT'
  };
}
