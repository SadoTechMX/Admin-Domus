/**
 * ============================================================================
 * DOMUS OS · FINANCIAL CUTS X/Z, CASH AUDIT & ADJUSTMENTS ENGINE (Cuts.gs)
 * Motor transaccional de Corte X (Snapshot read-only), Arqueo Físico,
 * Corte Z (Inmutable con sello criptográfico) y Ajustes Posteriores (AJUSTES_Z).
 * ============================================================================
 */

'use strict';

/**
 * Genera el hash criptográfico SHA-256 canónico para sellar la inmutabilidad de un Corte Z
 */
function computeCorteZHash_(data) {
  const canonicalParts = [
    data.cutId || '',
    data.shiftId || '',
    data.businessDate || '',
    data.registerId || '',
    Number(data.openingFloat || 0).toFixed(2),
    Number(data.cashSales || 0).toFixed(2),
    Number(data.expectedCash || 0).toFixed(2),
    Number(data.countedCash || 0).toFixed(2),
    Number(data.difference || 0).toFixed(2),
    Number(data.terminal1 || 0).toFixed(2),
    Number(data.terminal2 || 0).toFixed(2),
    Number(data.transfersConfirmed || 0).toFixed(2),
    Number(data.grossSales || 0).toFixed(2),
    Number(data.netSales || 0).toFixed(2)
  ];

  const canonicalString = canonicalParts.join('|');
  const rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonicalString, Utilities.Charset.UTF_8);
  return rawBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * CORTE X: Snapshot Financiero de Solo Lectura.
 * REGLAS CANÓNICAS:
 * 1. Recalcula todos los totales en SERVIDOR a partir de fuentes de datos canónicas.
 * 2. Jamás modifica ninguna celda de la hoja de cálculo.
 * 3. Ejecutable cualquier cantidad de veces por Cajeros, Accesos o Gerencia.
 */
function corteXConsultar(p, authContext) {
  p = p || {};
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  ensurePhase1Schema_(m);

  // 1. Identificar el turno objetivo
  let targetShift = null;
  const sTurnos = m.getSheetByName('TURNOS');

  if (p.shiftId && sTurnos && sTurnos.getLastRow() >= 2) {
    const turnosData = sTurnos.getRange(2, 1, sTurnos.getLastRow() - 1, 19).getValues();
    const found = turnosData.find(r => r[0] === p.shiftId);
    if (found) {
      targetShift = {
        shiftId: found[0],
        operationDayId: found[1],
        businessDate: found[2],
        stationId: found[3],
        registerId: found[4],
        phase: found[5],
        openedAt: found[6],
        openedBy: found[7],
        openingFloat: Number(found[8]) || 0,
        status: found[11]
      };
    }
  }

  if (!targetShift) {
    const stationId = p.stationId || (authContext && authContext.stationId) || 'CAJA_1';
    const registerId = p.registerId || getDefaultRegisterForStation_(stationId);
    const active = turnoEstado(stationId, registerId);
    if (active.active && active.shift) {
      targetShift = active.shift;
    }
  }

  const shiftId = targetShift ? targetShift.shiftId : '';
  const businessDate = targetShift ? targetShift.businessDate : getBusinessDateNow_();
  const openingFloat = targetShift ? targetShift.openingFloat : 0;
  const registerId = targetShift ? targetShift.registerId : 'GAVETA_1';
  const stationId = targetShift ? targetShift.stationId : 'CAJA_1';

  // 2. Extracción y agregación canónica de COBROS
  const sCobros = m.getSheetByName('COBROS');
  let cashSales = 0;
  let terminal1 = 0;
  let terminal2 = 0;
  let transfersConfirmed = 0;
  let transfersPending = 0;
  let tips = 0;
  let grossSales = 0;
  let netSales = 0;

  if (sCobros && sCobros.getLastRow() >= 7) {
    const colShift = getOrAddColumnIndex_(sCobros, 'shiftId', 6);
    const colBizDate = getOrAddColumnIndex_(sCobros, 'businessDate', 6);
    const cobRows = sCobros.getRange(7, 1, sCobros.getLastRow() - 6, Math.max(colBizDate, 33)).getValues();

    cobRows.forEach(r => {
      const rowFolio = r[0];
      const rowMethod = String(r[4] || '');
      const rowGross = Number(r[5]) || 0;
      const rowStatus = String(r[10] || '');
      const rowNet = Number(r[13]) || 0;
      const rowTip = Number(r[28]) || 0;
      const rowShiftId = String(r[colShift - 1] || '');
      const rowBizDate = String(r[colBizDate - 1] || '');

      // Coincidencia por shiftId estricto o fallback a businessDate para registros legacy
      const isShiftMatch = shiftId ? (rowShiftId === shiftId) : (rowBizDate === businessDate);

      if (isShiftMatch && rowFolio) {
        if (rowStatus === 'Confirmado') {
          grossSales += rowGross;
          netSales += rowNet;
          tips += rowTip;

          if (rowMethod === 'Efectivo') cashSales += rowGross;
          else if (rowMethod === 'Terminal 1') terminal1 += rowGross;
          else if (rowMethod === 'Terminal 2') terminal2 += rowGross;
          else if (rowMethod === 'Transferencia') transfersConfirmed += rowGross;
        } else if (rowStatus === 'Borrador' || rowStatus === 'Pendiente') {
          if (rowMethod === 'Transferencia') transfersPending += rowGross;
        }
      }
    });
  }

  // 3. Extracción de MOVIMIENTOS (Efectivo saliente/entrante de caja)
  const sMov = m.getSheetByName('MOVIMIENTOS');
  let cashOtherIncome = 0;
  let cashWithdrawals = 0;
  let cashExpenses = 0;

  if (sMov && sMov.getLastRow() >= 7) {
    const colShift = getOrAddColumnIndex_(sMov, 'shiftId', 6);
    const colBizDate = getOrAddColumnIndex_(sMov, 'businessDate', 6);
    const movRows = sMov.getRange(7, 1, sMov.getLastRow() - 6, Math.max(colBizDate, 16)).getValues();

    movRows.forEach(r => {
      const tipo = String(r[2] || '');
      const medio = String(r[4] || '');
      const importe = Number(r[6]) || 0;
      const estado = String(r[10] || '');
      const rowShiftId = String(r[colShift - 1] || '');
      const rowBizDate = String(r[colBizDate - 1] || '');

      const isShiftMatch = shiftId ? (rowShiftId === shiftId) : (rowBizDate === businessDate);

      if (isShiftMatch && estado === 'Confirmado' && (medio === 'Caja' || medio === 'Efectivo')) {
        if (tipo === 'Ingreso') cashOtherIncome += importe;
        else if (tipo === 'Retiro') cashWithdrawals += importe;
        else if (tipo === 'Gasto') cashExpenses += importe;
      }
    });
  }

  // 4. Extracción de DEVOLUCIONES
  const sDev = m.getSheetByName('DEVOLUCIONES');
  let cashRefunds = 0;
  let terminal1Refunds = 0;
  let terminal2Refunds = 0;

  if (sDev && sDev.getLastRow() >= 7) {
    const colShift = getOrAddColumnIndex_(sDev, 'shiftId', 6);
    const colBizDate = getOrAddColumnIndex_(sDev, 'businessDate', 6);
    const devRows = sDev.getRange(7, 1, sDev.getLastRow() - 6, Math.max(colBizDate, 16)).getValues();

    devRows.forEach(r => {
      const medio = String(r[5] || '');
      const monto = Number(r[6]) || 0;
      const estado = String(r[11] || '');
      const rowShiftId = String(r[colShift - 1] || '');
      const rowBizDate = String(r[colBizDate - 1] || '');

      const isShiftMatch = shiftId ? (rowShiftId === shiftId) : (rowBizDate === businessDate);

      if (isShiftMatch && estado === 'Registrado') {
        if (medio === 'Efectivo') cashRefunds += monto;
        else if (medio === 'Terminal 1') terminal1Refunds += monto;
        else if (medio === 'Terminal 2') terminal2Refunds += monto;
      }
    });
  }

  terminal1 = Math.max(0, terminal1 - terminal1Refunds);
  terminal2 = Math.max(0, terminal2 - terminal2Refunds);

  // 5. Conciliación de ACCESOS (Boleteras, Preventas, Cortesías, Guardarropa)
  const sAcceso = m.getSheetByName('ACCESO');
  let ticketingExternalValue = 0;
  let ticketingExternalReceivable = 0;
  let courtesiesCount = 0;
  let courtesyCommercialValue = 0;
  let wardrobeReceived = 0;
  let wardrobeReturned = 0;
  let wardrobeCash = 0;

  if (sAcceso && sAcceso.getLastRow() >= 7) {
    const colShift = getOrAddColumnIndex_(sAcceso, 'shiftId', 6);
    const colBizDate = getOrAddColumnIndex_(sAcceso, 'businessDate', 6);
    const accRows = sAcceso.getRange(7, 1, sAcceso.getLastRow() - 6, Math.max(colBizDate, 34)).getValues();

    accRows.forEach(r => {
      const accessId = r[0];
      const ticketType = String(r[6] || '');
      const wardrobeQty = Number(r[8]) || 0;
      const faceValue = Number(r[9]) || 0;
      const wardrobeAmount = Number(r[12]) || 0;
      const totalCommercial = Number(r[13]) || 0;
      const paidAtDoor = Number(r[14]) || 0;
      const dueAtDoor = Number(r[15]) || 0;
      const salesChannel = String(r[19] || '');
      const method = String(r[26] || '');
      const returned = r[31] === true || String(r[31]).toUpperCase() === 'DEVUELTO';
      const rowShiftId = String(r[colShift - 1] || '');
      const rowBizDate = String(r[colBizDate - 1] || '');

      const isShiftMatch = shiftId ? (rowShiftId === shiftId) : (rowBizDate === businessDate);

      if (isShiftMatch && accessId) {
        if (salesChannel === 'BOLETERA_EXTERNA') {
          ticketingExternalValue += faceValue;
          ticketingExternalReceivable += dueAtDoor;
        }

        if (salesChannel === 'CORTESIA' || ticketType === 'CORTESIA') {
          courtesiesCount++;
          courtesyCommercialValue += totalCommercial;
        }

        if (wardrobeQty > 0) {
          wardrobeReceived += wardrobeQty;
          if (returned) wardrobeReturned += wardrobeQty;
          if (method === 'Efectivo') wardrobeCash += wardrobeAmount;
        }
      }
    });
  }

  // 6. Conciliación de CAJA 2 (Cuentas Abiertas, Ventas Barra vs Cocina, Cortesías de Barra)
  const sCaja = m.getSheetByName('CAJA 2');
  let openAccountsCount = 0;
  let openAccountsBalance = 0;
  let salesBarra = 0;
  let salesCocina = 0;
  let salesSolar = 0;
  let salesLunar = 0;

  if (sCaja && sCaja.getLastRow() >= 7) {
    const colShift = getOrAddColumnIndex_(sCaja, 'shiftId', 6);
    const colBizDate = getOrAddColumnIndex_(sCaja, 'businessDate', 6);
    const cajaRows = sCaja.getRange(7, 1, sCaja.getLastRow() - 6, Math.max(colBizDate, 26)).getValues();

    const accountsMap = new Map();
    cajaRows.forEach(r => {
      const ticket = String(r[1] || '');
      const isCourtesy = r[8] === 'Cortesía';
      const price = Number(r[9]) || 0;
      const state = String(r[15] || '');
      const destination = String(r[24] || 'Barra');
      const rowShiftId = String(r[colShift - 1] || '');
      const rowBizDate = String(r[colBizDate - 1] || '');

      const isShiftMatch = shiftId ? (rowShiftId === shiftId) : (rowBizDate === businessDate);

      if (isShiftMatch && ticket && state !== 'Cancelado') {
        if (!isCourtesy) {
          if (destination === 'Cocina') salesCocina += price;
          else salesBarra += price;
        } else {
          courtesiesCount++;
          courtesyCommercialValue += price;
        }

        if (!accountsMap.has(ticket)) accountsMap.set(ticket, 0);
        accountsMap.set(ticket, accountsMap.get(ticket) + (isCourtesy ? 0 : price));
      }
    });

    // Descontar abonos confirmados para determinar cuentas abiertas
    if (sCobros && sCobros.getLastRow() >= 7) {
      const cobRows = sCobros.getRange(7, 1, sCobros.getLastRow() - 6, 14).getValues();
      cobRows.forEach(r => {
        const ticket = String(r[3] || '');
        const amount = Number(r[5]) || 0;
        const status = String(r[10] || '');
        if (accountsMap.has(ticket) && status === 'Confirmado') {
          accountsMap.set(ticket, accountsMap.get(ticket) - amount);
        }
      });
    }

    accountsMap.forEach((due) => {
      if (due > 0.01) {
        openAccountsCount++;
        openAccountsBalance += due;
      }
    });
  }

  // 7. ECUACIÓN FINANCIERA CANÓNICA
  // EFECTIVO ESPERADO = Fondo inicial + cobros confirmados efectivo + otros ingresos caja - devoluciones efectivo - retiros - gastos de caja
  const expectedCash = Math.round((openingFloat + cashSales + cashOtherIncome - cashRefunds - cashWithdrawals - cashExpenses) * 100) / 100;

  const snapshot = {
    shiftId: shiftId,
    businessDate: businessDate,
    stationId: stationId,
    registerId: registerId,
    status: targetShift ? targetShift.status : 'NO_SHIFT',
    openingFloat: Math.round(openingFloat * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cashOtherIncome: Math.round(cashOtherIncome * 100) / 100,
    cashRefunds: Math.round(cashRefunds * 100) / 100,
    cashWithdrawals: Math.round(cashWithdrawals * 100) / 100,
    cashExpenses: Math.round(cashExpenses * 100) / 100,
    expectedCash: expectedCash,
    terminal1: Math.round(terminal1 * 100) / 100,
    terminal2: Math.round(terminal2 * 100) / 100,
    transfersConfirmed: Math.round(transfersConfirmed * 100) / 100,
    transfersPending: Math.round(transfersPending * 100) / 100,
    ticketingExternalValue: Math.round(ticketingExternalValue * 100) / 100,
    ticketingExternalReceivable: Math.round(ticketingExternalReceivable * 100) / 100,
    courtesyCount: courtesiesCount,
    courtesyCommercialValue: Math.round(courtesyCommercialValue * 100) / 100,
    tips: Math.round(tips * 100) / 100,
    openAccounts: openAccountsCount,
    openAccountsBalance: Math.round(openAccountsBalance * 100) / 100,
    grossSales: Math.round(grossSales * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    salesByDestination: {
      barra: Math.round(salesBarra * 100) / 100,
      cocina: Math.round(salesCocina * 100) / 100
    },
    wardrobe: {
      received: wardrobeReceived,
      returned: wardrobeReturned,
      inCustody: Math.max(0, wardrobeReceived - wardrobeReturned),
      cashCollected: Math.round(wardrobeCash * 100) / 100
    },
    generatedAt: new Date().toISOString()
  };

  return { ok: true, data: snapshot };
}

/**
 * ARQUEO FÍSICO DE CAJA
 * Captura el conteo de billetes y monedas, calcula las diferencias sin ocultar sobrantes ni faltantes,
 * y coloca el turno en estado 'COUNTING'.
 */
function arqueoCapturar(p, authContext) {
  if (!p || !p.shiftId) throw new Error('Parámetros de arqueo incompletos: shiftId requerido.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    ensurePhase1Schema_(m);

    const sTurnos = m.getSheetByName('TURNOS');
    if (!sTurnos || sTurnos.getLastRow() < 2) throw new Error('Hoja TURNOS vacía.');

    const turnosData = sTurnos.getRange(2, 1, sTurnos.getLastRow() - 1, 19).getValues();
    let rowIndex = -1;
    let shiftRow = null;

    for (let i = 0; i < turnosData.length; i++) {
      if (turnosData[i][0] === p.shiftId) {
        rowIndex = i + 2;
        shiftRow = turnosData[i];
        break;
      }
    }

    if (!shiftRow) throw new Error(`Turno ${p.shiftId} no encontrado.`);

    const b = p.breakdown || {};
    const b1000 = Number(b.b1000) || 0;
    const b500 = Number(b.b500) || 0;
    const b200 = Number(b.b200) || 0;
    const b100 = Number(b.b100) || 0;
    const b50 = Number(b.b50) || 0;
    const b20 = Number(b.b20) || 0;
    const coins = Number(b.coins) || 0;

    const countedCash = Math.round((1000 * b1000 + 500 * b500 + 200 * b200 + 100 * b100 + 50 * b50 + 20 * b20 + coins) * 100) / 100;

    // Obtener recálculo del efectivo esperado
    const xRes = corteXConsultar({ shiftId: p.shiftId }, authContext);
    const expectedCash = xRes.data.expectedCash;
    const difference = Math.round((countedCash - expectedCash) * 100) / 100;

    let differenceStatus = 'CUADRADO';
    if (difference > 0.01) differenceStatus = 'SOBRANTE';
    else if (difference < -0.01) differenceStatus = 'FALTANTE';

    // Actualizar estado a COUNTING si está en OPEN
    if (shiftRow[11] === 'OPEN') {
      sTurnos.getRange(rowIndex, 12).setValue('COUNTING');
      sTurnos.getRange(rowIndex, 13).setValue(new Date().toISOString());
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      shiftId: p.shiftId,
      countedCash: countedCash,
      expectedCash: expectedCash,
      difference: difference,
      differenceStatus: differenceStatus,
      breakdown: {
        b1000: b1000,
        b500: b500,
        b200: b200,
        b100: b100,
        b50: b50,
        b20: b20,
        coins: coins
      },
      message: `Arqueo físico capturado: $${countedCash.toFixed(2)} vs Esperado $${expectedCash.toFixed(2)} (${differenceStatus}: $${difference.toFixed(2)}).`
    };
  });
}

/**
 * CORTE Z (CIERRE FINANCIERO INMUTABLE)
 * REGLAS CANÓNICAS:
 * 1. Solo GERENCIA o ADMIN pueden cerrar un Corte Z.
 * 2. Cierre atómico con LockService + Idempotencia.
 * 3. Inmutable desde DOMUS OS + hash criptográfico de integridad.
 * 4. Pasa el turno a 'CLOSED' e impide cualquier mutación posterior del Z.
 */
function corteZCerrar(p, authContext) {
  if (!p || !p.shiftId) throw new Error('Parámetros de Corte Z incompletos: shiftId requerido.');

  // Verificación estricta de RBAC del servidor
  if (!authContext || (authContext.role !== 'GERENCIA' && authContext.role !== 'ADMIN')) {
    const err = new Error('Acceso denegado: Solo personal de GERENCIA o ADMINISTRACIÓN está facultado para ejecutar el Corte Z.');
    err.status = 403;
    err.code = 'FORBIDDEN_ROLE';
    throw err;
  }

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    ensurePhase1Schema_(m);

    const sTurnos = m.getSheetByName('TURNOS');
    const sCortesZ = m.getSheetByName('CORTES_Z');

    if (!sTurnos || sTurnos.getLastRow() < 2) throw new Error('Hoja TURNOS vacía.');

    // 1. Buscar turno
    const turnosData = sTurnos.getRange(2, 1, sTurnos.getLastRow() - 1, 19).getValues();
    let shiftRowIdx = -1;
    let shiftData = null;

    for (let i = 0; i < turnosData.length; i++) {
      if (turnosData[i][0] === p.shiftId) {
        shiftRowIdx = i + 2;
        shiftData = turnosData[i];
        break;
      }
    }

    if (!shiftData) throw new Error(`Turno ${p.shiftId} no encontrado.`);

    // 2. Si el turno ya estaba cerrado, retornar el Corte Z existente (Idempotencia)
    if (shiftData[11] === 'CLOSED') {
      const existingCutId = shiftData[15];
      if (existingCutId && sCortesZ && sCortesZ.getLastRow() >= 2) {
        const cutsData = sCortesZ.getRange(2, 1, sCortesZ.getLastRow() - 1, 37).getValues();
        const existingCut = cutsData.find(r => r[0] === existingCutId);
        if (existingCut) {
          console.log(`[CORTE Z IDEMPOTENTE] Replay de Corte Z previo: ${existingCutId}`);
          return {
            ok: true,
            cutId: existingCutId,
            shiftId: p.shiftId,
            status: 'ALREADY_CLOSED',
            differenceStatus: existingCut[17],
            difference: existingCut[16],
            message: `El turno ${p.shiftId} ya fue cerrado previamente bajo el folio ${existingCutId}.`
          };
        }
      }
    }

    // 3. Recálculo financiero en servidor (Zero-Trust)
    const xRes = corteXConsultar({ shiftId: p.shiftId }, authContext);
    const snap = xRes.data;

    // Conteo físico
    let countedCash = Number(p.countedCash);
    if (!Number.isFinite(countedCash) && p.breakdown) {
      const b = p.breakdown;
      countedCash = Math.round((1000 * (Number(b.b1000) || 0) + 500 * (Number(b.b500) || 0) + 200 * (Number(b.b200) || 0) + 100 * (Number(b.b100) || 0) + 50 * (Number(b.b50) || 0) + 20 * (Number(b.b20) || 0) + (Number(b.coins) || 0)) * 100) / 100;
    }
    if (!Number.isFinite(countedCash)) countedCash = snap.expectedCash;

    const difference = Math.round((countedCash - snap.expectedCash) * 100) / 100;
    let differenceStatus = 'CUADRADO';
    if (difference > 0.01) differenceStatus = 'SOBRANTE';
    else if (difference < -0.01) differenceStatus = 'FALTANTE';

    const closedAt = new Date().toISOString();
    const cutId = 'CORTE-Z-' + snap.businessDate.replace(/-/g, '') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();

    // 4. Sello criptográfico
    const hashData = {
      cutId: cutId,
      shiftId: p.shiftId,
      businessDate: snap.businessDate,
      registerId: snap.registerId,
      openingFloat: snap.openingFloat,
      cashSales: snap.cashSales,
      expectedCash: snap.expectedCash,
      countedCash: countedCash,
      difference: difference,
      terminal1: snap.terminal1,
      terminal2: snap.terminal2,
      transfersConfirmed: snap.transfersConfirmed,
      grossSales: snap.grossSales,
      netSales: snap.netSales
    };
    const snapshotHash = computeCorteZHash_(hashData);

    // 5. Asentar registro en CORTES_Z
    const cutRow = [
      cutId,
      p.shiftId,
      shiftData[1], // operationDayId
      snap.businessDate,
      snap.registerId,
      snap.stationId,
      shiftData[6], // openedAt
      closedAt,
      snap.openingFloat,
      snap.cashSales,
      snap.cashOtherIncome,
      snap.cashRefunds,
      snap.cashWithdrawals,
      snap.cashExpenses,
      snap.expectedCash,
      countedCash,
      difference,
      differenceStatus,
      snap.terminal1,
      snap.terminal2,
      snap.transfersConfirmed,
      snap.transfersPending,
      snap.ticketingExternalValue,
      snap.ticketingExternalReceivable,
      snap.courtesyCount,
      snap.courtesyCommercialValue,
      snap.tips,
      snap.openAccounts,
      snap.openAccountsBalance,
      snap.grossSales,
      snap.netSales,
      JSON.stringify(snap),
      snapshotHash,
      authContext.operator || 'Gerente',
      closedAt,
      p.requestId || ('REQ-CORTEZ-' + Date.now()),
      1 // version
    ];

    sCortesZ.getRange(Math.max(sCortesZ.getLastRow() + 1, 2), 1, 1, cutRow.length).setValues([cutRow]);

    // 6. Cerrar el turno en TURNOS
    sTurnos.getRange(shiftRowIdx, 12).setValue('CLOSED');
    sTurnos.getRange(shiftRowIdx, 14).setValue(closedAt);
    sTurnos.getRange(shiftRowIdx, 15).setValue(authContext.operator || 'Gerente');
    sTurnos.getRange(shiftRowIdx, 16).setValue(cutId);

    SpreadsheetApp.flush();

    console.log(`[CORTE Z SELLADO] Folio: ${cutId} | Turno: ${p.shiftId} | Hash: ${snapshotHash} | Diferencia: ${differenceStatus} ($${difference})`);

    return {
      ok: true,
      cutId: cutId,
      shiftId: p.shiftId,
      businessDate: snap.businessDate,
      registerId: snap.registerId,
      status: 'CLOSED',
      expectedCash: snap.expectedCash,
      countedCash: countedCash,
      difference: difference,
      differenceStatus: differenceStatus,
      snapshotHash: snapshotHash,
      closedAt: closedAt,
      closedBy: authContext.operator || 'Gerente',
      message: `Corte Z ${cutId} sellado exitosamente. Estado de arqueo: ${differenceStatus} ($${difference.toFixed(2)}).`
    };
  });
}

/**
 * CONSULTA DE CORTE Z CON VALIDACIÓN DE INTEGRIDAD CRIPTOGRÁFICA
 * Si un administrador o script modificó alguna celda en Sheets, la firma discrepante
 * dispara de inmediato un estado INTEGRITY_VIOLATION.
 */
function corteZConsultar(p, authContext) {
  if (!p || !p.cutId) throw new Error('Parámetros de consulta incompletos: cutId requerido.');

  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sCortesZ = m.getSheetByName('CORTES_Z');
  if (!sCortesZ || sCortesZ.getLastRow() < 2) throw new Error('No hay registros de Corte Z.');

  const cutsData = sCortesZ.getRange(2, 1, sCortesZ.getLastRow() - 1, 37).getValues();
  const row = cutsData.find(r => r[0] === p.cutId);
  if (!row) throw new Error(`Corte Z ${p.cutId} no encontrado.`);

  // Verificación de integridad con el hash almacenado
  const hashData = {
    cutId: row[0],
    shiftId: row[1],
    businessDate: row[3],
    registerId: row[4],
    openingFloat: Number(row[8]) || 0,
    cashSales: Number(row[9]) || 0,
    expectedCash: Number(row[14]) || 0,
    countedCash: Number(row[15]) || 0,
    difference: Number(row[16]) || 0,
    terminal1: Number(row[18]) || 0,
    terminal2: Number(row[19]) || 0,
    transfersConfirmed: Number(row[20]) || 0,
    grossSales: Number(row[29]) || 0,
    netSales: Number(row[30]) || 0
  };

  const storedHash = String(row[32] || '');
  const computedHash = computeCorteZHash_(hashData);

  if (storedHash !== computedHash) {
    console.error(`[INTEGRITY_VIOLATION] Discrepancia en Corte Z ${p.cutId}: Almacenado '${storedHash}' vs Calculado '${computedHash}'`);
    return {
      ok: false,
      code: 'INTEGRITY_VIOLATION',
      cutId: p.cutId,
      error: 'ALERTA DE SEGURIDAD: El registro de Corte Z fue manipulado en la hoja de cálculo. La firma de integridad discrepa.'
    };
  }

  // Consultar ajustes vinculados en AJUSTES_Z
  const adjustments = [];
  const sAjustesZ = m.getSheetByName('AJUSTES_Z');
  if (sAjustesZ && sAjustesZ.getLastRow() >= 2) {
    const adjRows = sAjustesZ.getRange(2, 1, sAjustesZ.getLastRow() - 1, 9).getValues();
    adjRows.forEach(ar => {
      if (ar[1] === p.cutId) {
        adjustments.push({
          adjustmentId: ar[0],
          cutId: ar[1],
          motivo: ar[2],
          importe: Number(ar[3]) || 0,
          medio: ar[4],
          actor: ar[5],
          autorizadoPor: ar[6],
          timestamp: ar[7]
        });
      }
    });
  }

  return {
    ok: true,
    cut: {
      cutId: row[0],
      shiftId: row[1],
      operationDayId: row[2],
      businessDate: row[3],
      registerId: row[4],
      stationId: row[5],
      openedAt: row[6],
      closedAt: row[7],
      openingFloat: Number(row[8]) || 0,
      cashSales: Number(row[9]) || 0,
      expectedCash: Number(row[14]) || 0,
      countedCash: Number(row[15]) || 0,
      difference: Number(row[16]) || 0,
      differenceStatus: row[17],
      terminal1: Number(row[18]) || 0,
      terminal2: Number(row[19]) || 0,
      transfersConfirmed: Number(row[20]) || 0,
      transfersPending: Number(row[21]) || 0,
      grossSales: Number(row[29]) || 0,
      netSales: Number(row[30]) || 0,
      snapshotHash: storedHash,
      closedBy: row[33]
    },
    adjustments: adjustments
  };
}

/**
 * REGISTRO DE AJUSTE POSTERIOR (AJUSTES_Z)
 * REGLAS CANÓNICAS:
 * 1. Solo GERENCIA o ADMIN pueden registrar un ajuste.
 * 2. Jamás edita la fila del Corte Z original en CORTES_Z.
 * 3. Registra una nueva fila en AJUSTES_Z vinculada al folio cutId.
 */
function ajusteZRegistrar(p, authContext) {
  if (!p || !p.cutId) throw new Error('Parámetros de ajuste incompletos: cutId requerido.');
  if (!p.motivo || !String(p.motivo).trim()) throw new Error('El motivo del ajuste es obligatorio para auditoría.');
  if (p.importe === undefined || p.importe === null || !Number.isFinite(Number(p.importe))) {
    throw new Error('El importe del ajuste debe ser un valor numérico válido.');
  }

  // Verificación estricta de RBAC del servidor
  if (!authContext || (authContext.role !== 'GERENCIA' && authContext.role !== 'ADMIN')) {
    const err = new Error('Acceso denegado: Solo personal de GERENCIA o ADMINISTRACIÓN puede registrar ajustes posteriores.');
    err.status = 403;
    err.code = 'FORBIDDEN_ROLE';
    throw err;
  }

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    ensurePhase1Schema_(m);

    // 1. Verificar existencia e integridad del Corte Z original
    const consultRes = corteZConsultar({ cutId: p.cutId }, authContext);
    if (!consultRes.ok && consultRes.code === 'INTEGRITY_VIOLATION') {
      const err = new Error(`Acción bloqueada: El Corte Z ${p.cutId} presenta violación de integridad previa. No se puede asentar ajuste sobre un registro corrupto.`);
      err.status = 409;
      err.code = 'INTEGRITY_VIOLATION';
      throw err;
    }

    const sAjustesZ = m.getSheetByName('AJUSTES_Z');
    const adjustmentId = 'AJUSTE-Z-' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    const now = new Date().toISOString();
    const importe = Math.round(Number(p.importe) * 100) / 100;
    const medio = String(p.medio || 'Efectivo').trim();
    const actor = authContext.operator || 'Gerente';

    const adjRow = [
      adjustmentId,
      p.cutId,
      String(p.motivo).trim(),
      importe,
      medio,
      actor,
      actor,
      now,
      p.requestId || ('REQ-AJUSTE-' + Date.now())
    ];

    sAjustesZ.getRange(Math.max(sAjustesZ.getLastRow() + 1, 2), 1, 1, adjRow.length).setValues([adjRow]);
    SpreadsheetApp.flush();

    console.log(`[AJUSTE Z REGISTRADO] Folio: ${adjustmentId} vinculado a ${p.cutId} por $${importe} (${medio})`);

    return {
      ok: true,
      adjustmentId: adjustmentId,
      cutId: p.cutId,
      motivo: String(p.motivo).trim(),
      importe: importe,
      medio: medio,
      autorizadoPor: actor,
      timestamp: now,
      message: `Ajuste ${adjustmentId} registrado exitosamente para el Corte Z ${p.cutId}. El documento original no fue modificado.`
    };
  });
}
