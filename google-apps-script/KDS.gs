/**
 * ============================================================================
 * DOMUS OS · KITCHEN & BAR DISPLAY SYSTEM (KDS.gs)
 * Gestión de comandas en tiempo real, lotes de preparación y resurtido
 * ============================================================================
 */

'use strict';

/**
 * Consulta de comandas activas, historial reciente y solicitudes de resurtido
 */
function comandasSimpleDatos(token) {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
  const sComandas = m.getSheetByName('COMANDAS');
  const oResurtido = o ? o.getSheetByName('RESURTIDO') : null;

  // 1. Leer comandas activas desde la columna M (JSON maestro)
  const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();
  const orders = [];
  masterRaw.forEach((row, i) => {
    if (row[0]) {
      try {
        const item = JSON.parse(row[0]);
        if (item && item.state !== 'Entregada' && item.state !== 'Cancelada') {
          orders.push({
            key: 'DCS-' + item.row + '-' + (item.batch || item.id),
            version: String(item.version || '1'),
            id: item.id || ('C2-' + item.row),
            ticket: item.ticket,
            batch: item.batch || item.id,
            alias: item.alias || 'Cliente',
            product: item.product,
            notes: item.notes || '',
            destination: item.destination || 'Barra',
            state: item.state || 'Pendiente',
            responsible: item.responsible || item.preparedBy || '',
            sent: item.sent ? new Date(item.sent).getTime() : Date.now(),
            credit: !!item.credit,
            incident: item.incident || ''
          });
        }
      } catch (err) {}
    }
  });

  // 2. Leer resurtidos abiertos
  const requests = [];
  if (oResurtido) {
    const resRows = oResurtido.getRange(7, 1, 100, 8).getValues();
    resRows.forEach(r => {
      if (r[0] && r[5] !== true && r[7] !== 'Resuelto') {
        requests.push({
          id: String(r[0]),
          product: String(r[2]),
          type: String(r[3] || 'Reposición'),
          created: r[1] instanceof Date ? r[1].getTime() : Date.now()
        });
      }
    });
  }

  return {
    version: 'Comandas Simple 2.0',
    at: Date.now(),
    mirrorSync: 'Conectado a Google Sheets',
    team: CONFIG.staff,
    orders: orders,
    history: [],
    requests: requests,
    issues: []
  };
}

/**
 * Aplica una acción sobre una comanda (TOMAR, LISTA, ENTREGAR, ALMACEN, AGOTADO)
 */
function comandasSimpleAccion(token, body) {
  if (!body || !body.key || !body.action) {
    throw new Error('Parámetros de acción de comanda incompletos.');
  }

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sComandas = m.getSheetByName('COMANDAS');
    const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();

    let targetRow = -1;
    let targetItem = null;

    for (let i = 0; i < masterRaw.length; i++) {
      if (masterRaw[i][0]) {
        try {
          const item = JSON.parse(masterRaw[i][0]);
          const key = 'DCS-' + item.row + '-' + (item.batch || item.id);
          if (key === body.key) {
            targetRow = i + 7;
            targetItem = item;
            break;
          }
        } catch (e) {}
      }
    }

    if (!targetItem || targetRow < 7) {
      throw new Error(`Comanda con clave '${body.key}' no encontrada en la matriz activa.`);
    }

    const action = String(body.action).toUpperCase();
    const operator = String(body.operator || 'Operador').trim();

    if (action === 'TOMAR') {
      // Reclamar lote completo
      const batchId = targetItem.batch;
      for (let i = 0; i < masterRaw.length; i++) {
        if (masterRaw[i][0]) {
          try {
            const it = JSON.parse(masterRaw[i][0]);
            if (it.batch === batchId && it.state === 'Pendiente') {
              it.state = 'En preparación';
              it.responsible = operator;
              it.version = String(Number(it.version || 1) + 1);
              sComandas.getRange(i + 7, 13).setValue(JSON.stringify(it));
              sComandas.getRange(i + 7, 14).setValue('En preparación (' + operator + ')');
            }
          } catch (e) {}
        }
      }
    } else if (action === 'LISTA') {
      targetItem.state = 'Lista';
      targetItem.version = String(Number(targetItem.version || 1) + 1);
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 14).setValue('Lista para entrega');
    } else if (action === 'ENTREGAR') {
      if (targetItem.state === 'Entregada') {
        throw new Error(`La comanda '${body.key}' (${targetItem.product}) ya fue entregada previamente.`);
      }
      targetItem.state = 'Entregada';
      targetItem.delivered = new Date().toISOString();
      targetItem.deliveredBy = operator;
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 8).setValue('Entregada');
      sComandas.getRange(targetRow, 14).setValue('Entregada por ' + operator);

      // Decremento físico de inventario en hoja INVENTARIO (ADR-004)
      let invMovement = null;
      const sInv = m.getSheetByName('INVENTARIO');
      if (sInv) {
        const invValues = sInv.getRange(7, 1, 300, 9).getValues();
        for (let j = 0; j < invValues.length; j++) {
          const invSku = String(invValues[j][0] || '').trim();
          const invName = String(invValues[j][1] || '').trim();
          if ((targetItem.sku && invSku === targetItem.sku) ||
              (invName && (invName === targetItem.product || targetItem.product.startsWith(invName) || targetItem.product.includes(invName)))) {
            const rowIdx = j + 7;
            const currentInitial = Number(invValues[j][5]) || 0;
            const currentOut = Number(invValues[j][6]) || 0;
            const qty = Number(targetItem.qty || 1);
            const newOut = currentOut + qty;
            const newDisp = Math.max(0, currentInitial - newOut);
            sInv.getRange(rowIdx, 7).setValue(newOut);
            sInv.getRange(rowIdx, 8).setValue(newDisp);
            invMovement = {
              sku: invSku,
              product: invName,
              qty: qty,
              previousOut: currentOut,
              newOut: newOut,
              available: newDisp
            };
            break;
          }
        }
      }

      SpreadsheetApp.flush();
      return {
        ok: true,
        message: `Acción '${action}' aplicada exitosamente a ${targetItem.product}.`,
        key: body.key,
        product: targetItem.product,
        state: 'Entregada',
        deliveredBy: operator,
        inventory: invMovement
      };
    } else if (action === 'ALMACEN' || action === 'AGOTADO') {
      const incidentType = action === 'ALMACEN' ? 'Reponer de almacén' : 'Agotado en DOMUS';
      targetItem.incident = incidentType;
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 14).setValue(incidentType);

      // Crear aviso en RESURTIDO
      const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
      if (o) {
        const sRes = o.getSheetByName('RESURTIDO');
        if (sRes) {
          const resRowIdx = Math.max(sRes.getLastRow() + 1, 7);
          const reqId = 'RS-' + Utilities.getUuid().slice(0, 8).toUpperCase();
          sRes.getRange(resRowIdx, 1, 1, 8).setValues([[
            reqId, new Date(), targetItem.product, incidentType, 1, false, '', incidentType === 'Agotado en DOMUS' ? 'Compra pendiente' : 'Resurtido pendiente'
          ]]);
        }
      }
    }

    SpreadsheetApp.flush();
    return { ok: true, message: `Acción '${action}' aplicada exitosamente a ${targetItem.product}.` };
  });
}

/**
 * Resuelve una incidencia de resurtido
 */
function comandasSimpleResolver(token, body) {
  if (!body || !body.id) throw new Error('ID de solicitud de resurtido no especificado.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
    if (!o) throw new Error('Libro operativo no encontrado.');
    const sRes = o.getSheetByName('RESURTIDO');
    if (!sRes) throw new Error('Hoja RESURTIDO no encontrada.');

    const values = sRes.getRange(7, 1, 100, 8).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toUpperCase() === String(body.id).trim().toUpperCase()) {
        const row = i + 7;
        sRes.getRange(row, 6).setValue(true);
        sRes.getRange(row, 7).setValue(new Date());
        sRes.getRange(row, 8).setValue('Resuelto');
        SpreadsheetApp.flush();
        return { ok: true, message: 'Disponibilidad confirmada para ' + body.id };
      }
    }

    throw new Error('Solicitud ' + body.id + ' no encontrada.');
  });
}

function comandasSimpleEntrar(token) {
  return { ok: true, token: token || 'SES-' + Utilities.getUuid(), team: CONFIG.staff };
}
