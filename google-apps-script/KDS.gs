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

  // 1. Leer comandas activas + historial desde la columna M (JSON maestro).
  // La columna M es la fuente de verdad del KDS; H/N se mantienen como espejo humano.
  const masterRaw = sComandas.getRange(7, 13, 500, 1).getValues();
  const orders = [];
  const history = [];
  const now = Date.now();

  const toClientItem = item => ({
    key: 'DCS-' + item.row + '-' + (item.batch || item.id),
    version: String(item.version || '1'),
    id: item.id || ('C2-' + item.row),
    ticket: item.ticket || '',
    batch: item.batch || item.id,
    alias: item.alias || 'Cliente',
    product: item.product || '',
    notes: item.notes || '',
    destination: item.destination || 'Barra',
    state: item.state || 'Pendiente',
    responsible: item.responsible || item.preparedBy || '',
    sent: item.sent ? new Date(item.sent).getTime() : now,
    claimed: item.claimed ? new Date(item.claimed).getTime() : null,
    ready: item.ready ? new Date(item.ready).getTime() : null,
    delivered: item.delivered ? new Date(item.delivered).getTime() : null,
    deliveredBy: item.deliveredBy || '',
    cancelled: item.cancelled ? new Date(item.cancelled).getTime() : null,
    credit: !!item.credit,
    incident: item.incident || ''
  });

  masterRaw.forEach(row => {
    if (!row[0]) return;
    try {
      const item = JSON.parse(row[0]);
      if (!item) return;
      const clientItem = toClientItem(item);
      if (clientItem.state === 'Entregada') {
        history.push(clientItem);
      } else if (clientItem.state !== 'Cancelada') {
        orders.push(clientItem);
      }
    } catch (err) {
      console.warn('[KDS] JSON inválido en COMANDAS!M:', err);
    }
  });

  // Activas: las más antiguas primero. Historial: entrega/cancelación más reciente primero.
  orders.sort((a, b) => (a.sent || 0) - (b.sent || 0));
  history.sort((a, b) =>
    (b.delivered || b.cancelled || b.sent || 0) -
    (a.delivered || a.cancelled || a.sent || 0)
  );

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
    version: 'Comandas Simple 2.1',
    at: Date.now(),
    mirrorSync: 'Conectado a Google Sheets',
    team: CONFIG.staff,
    orders: orders,
    history: history.slice(0, 100),
    requests: requests,
    issues: []
  };
}

/**
 * Aplica una acción sobre una comanda (TOMAR, LISTA, ENTREGAR, ALMACEN, AGOTADO)
 */
function comandasSimpleAccion(tokenOrBody, maybeBody) {
  const body = (maybeBody && typeof maybeBody === 'object') ? maybeBody : tokenOrBody;
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
      if (targetItem.state !== 'Pendiente') {
        if (targetItem.state === 'En preparación') {
          return { ok: true, message: `Comanda ya en preparación por ${targetItem.responsible || operator}.`, state: targetItem.state, responsible: targetItem.responsible };
        }
        throw new Error(`INVALID_KDS_TRANSITION: TOMAR requiere estado Pendiente; estado actual: ${targetItem.state}.`);
      }

      // Reclamar lote completo
      const batchId = targetItem.batch;
      const claimedAt = new Date().toISOString();
      for (let i = 0; i < masterRaw.length; i++) {
        if (masterRaw[i][0]) {
          try {
            const it = JSON.parse(masterRaw[i][0]);
            if (it.batch === batchId && it.state === 'Pendiente') {
              it.state = 'En preparación';
              it.responsible = operator;
              it.claimed = claimedAt;
              it.version = String(Number(it.version || 1) + 1);
              sComandas.getRange(i + 7, 13).setValue(JSON.stringify(it));
              sComandas.getRange(i + 7, 8).setValue('Preparando');
              sComandas.getRange(i + 7, 14).setValue('En preparación (' + operator + ')');
            }
          } catch (e) {}
        }
      }
      SpreadsheetApp.flush();
      return { ok: true, message: `Lote '${batchId}' tomado para preparación por ${operator}.`, state: 'En preparación', responsible: operator };
    } else if (action === 'LISTA') {
      if (targetItem.state !== 'En preparación') {
        if (targetItem.state === 'Lista') {
          return { ok: true, message: `Comanda ya marcada como Lista.`, state: targetItem.state };
        }
        throw new Error(`INVALID_KDS_TRANSITION: LISTA requiere estado En preparación; estado actual: ${targetItem.state}.`);
      }
      targetItem.state = 'Lista';
      targetItem.ready = new Date().toISOString();
      targetItem.version = String(Number(targetItem.version || 1) + 1);
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 8).setValue('Lista');
      sComandas.getRange(targetRow, 14).setValue('Lista para entrega');
      SpreadsheetApp.flush();
      return { ok: true, message: `Comanda '${body.key}' marcada como Lista.`, state: 'Lista' };
    } else if (action === 'ENTREGAR') {
      if (targetItem.state === 'Entregada') {
        return { ok: true, message: `La comanda '${body.key}' (${targetItem.product}) ya fue entregada previamente.`, state: targetItem.state };
      }
      if (targetItem.state !== 'Lista') {
        throw new Error(`INVALID_KDS_TRANSITION: ENTREGAR requiere estado Lista; estado actual: ${targetItem.state}.`);
      }
      targetItem.state = 'Entregada';
      targetItem.delivered = new Date().toISOString();
      targetItem.deliveredBy = operator;
      targetItem.version = String(Number(targetItem.version || 1) + 1);
      sComandas.getRange(targetRow, 13).setValue(JSON.stringify(targetItem));
      sComandas.getRange(targetRow, 8).setValue('Entregada');
      sComandas.getRange(targetRow, 14).setValue('Entregada por ' + operator);

      // Decremento físico de inventario en hoja INVENTARIO (ADR-004)
      let invMovement = null;
      const sInv = m.getSheetByName('INVENTARIO');
      if (sInv) {
        const lastRow = sInv.getLastRow();
        const numRows = Math.max(1, lastRow - 6);
        const invValues = sInv.getRange(7, 1, numRows, 9).getValues();

        const targetSkuRaw = String(targetItem.sku || '').trim().toUpperCase();
        const targetProdRaw = String(targetItem.product || '').trim();

        // 1. Alias de SKU explícitamente autorizados (bidireccionales)
        const SKU_ALIASES = {
          'VICTORIA-473': 'CARTA-VICTORIA-473',
          'CARTA-VICTORIA-473': 'VICTORIA-473',
          'MODELO-473': 'CARTA-MODELO-473',
          'CARTA-MODELO-473': 'MODELO-473',
          'BAR-CB-LATA': 'CARTA-BAR-CB-LATA',
          'CARTA-BAR-CB-LATA': 'BAR-CB-LATA'
        };
        const targetAlias = SKU_ALIASES[targetSkuRaw] || '';

        // Función de normalización estricta de nombres para descarte de colisiones
        const normalizeStr = s => String(s || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[·—–-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const targetNorm = normalizeStr(targetProdRaw);

        let matchRowIdx = -1;
        let matchedInvRow = null;

        // Prioridad 1: SKU exacto
        if (targetSkuRaw) {
          for (let j = 0; j < invValues.length; j++) {
            const invSku = String(invValues[j][0] || '').trim().toUpperCase();
            if (invSku && invSku === targetSkuRaw) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Prioridad 2: Alias de SKU explícitamente autorizado
        if (matchRowIdx === -1 && targetAlias) {
          for (let j = 0; j < invValues.length; j++) {
            const invSku = String(invValues[j][0] || '').trim().toUpperCase();
            if (invSku && invSku === targetAlias) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Prioridad 3: Nombre exacto normalizado (coincidencia idéntica completa, NUNCA substring laxo)
        if (matchRowIdx === -1 && targetNorm) {
          for (let j = 0; j < invValues.length; j++) {
            const invNameNorm = normalizeStr(invValues[j][1]);
            if (invNameNorm && invNameNorm === targetNorm) {
              matchRowIdx = j + 7;
              matchedInvRow = invValues[j];
              break;
            }
          }
        }

        // Si se localizó la fila inequívoca:
        if (matchRowIdx !== -1 && matchedInvRow) {
          const invSku = String(matchedInvRow[0] || '').trim();
          const invName = String(matchedInvRow[1] || '').trim();
          const currentInitial = Number(matchedInvRow[5]) || 0;
          const currentOut = Number(matchedInvRow[6]) || 0;
          const qty = Number(targetItem.qty || 1);
          const newOut = currentOut + qty;
          const newDisp = Math.max(0, currentInitial - newOut);
          sInv.getRange(matchRowIdx, 7).setValue(newOut);
          sInv.getRange(matchRowIdx, 8).setValue(newDisp);
          invMovement = {
            sku: invSku,
            product: invName,
            row: matchRowIdx,
            qty: qty,
            previousOut: currentOut,
            newOut: newOut,
            available: newDisp
          };
        } else {
          // Prioridad 4: Si no existe coincidencia inequívoca, INVENTORY_ITEM_NOT_FOUND y NO descontar nada
          console.warn(`[KDS INVENTARIO] Item no localizado en INVENTARIO: SKU='${targetSkuRaw}', Producto='${targetProdRaw}'. No se descontó ninguna fila.`);
          invMovement = {
            status: 'INVENTORY_ITEM_NOT_FOUND',
            sku: targetSkuRaw,
            product: targetProdRaw,
            discounted: false
          };
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
function comandasSimpleResolver(tokenOrBody, maybeBody) {
  const body = (maybeBody && typeof maybeBody === 'object') ? maybeBody : tokenOrBody;
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
