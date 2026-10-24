/**
 * ============================================================================
 * DOMUS OS · CUSTOMER ACCOUNTS & BALANCES (Accounts.gs)
 * Gestión de saldos de cuentas abiertas, aperturas, autorizaciones y cierres
 * ============================================================================
 */

'use strict';

function accountKey_(ticket) {
  return 'cuenta:' + Utilities.base64EncodeWebSafe(String(ticket));
}

function account_(ticket) {
  const raw = PropertiesService.getScriptProperties().getProperty(accountKey_(ticket));
  return JSON.parse(raw || '{}');
}

function putAccount_(ticket, a) {
  PropertiesService.getScriptProperties().setProperty(accountKey_(ticket), JSON.stringify(a));
}

function posBalanceFast_(x, ticket) {
  const sCaja = x.c || x.m.getSheetByName('CAJA 2');
  const sCobros = x.m.getSheetByName('COBROS');

  const rows = sCaja.getRange(7, 1, 500, 32).getValues()
    .filter(r => String(r[1]) === String(ticket) && r[6] && r[15] !== 'Cancelado');

  const total = rows.reduce((n, r) => n + (Number(r[11]) || 0), 0);

  const paid = sCobros.getRange(7, 1, 500, 14).getValues()
    .filter(r => r[2] === 'Caja' && String(r[3]) === String(ticket))
    .reduce((n, r) => n + (Number(r[13]) || 0), 0);

  return {
    rows: rows,
    total: posRound_(total),
    paid: posRound_(paid),
    due: posRound_(total - paid)
  };
}

function closeCashAccount_(x, ticket, who) {
  const b = posBalanceFast_(x, ticket);
  if (b.due > 0.01) {
    throw new Error(`No se puede cerrar la cuenta '${ticket}'. Presenta un saldo pendiente de $${b.due.toFixed(2)}.`);
  }

  const a = account_(ticket);
  a.closed = true;
  a.closedBy = who;
  a.closedAt = new Date().toISOString();
  putAccount_(ticket, a);

  return { ok: true, ticket: ticket, message: `Cuenta '${ticket}' cerrada formalmente por ${who}.` };
}

function reopenCashAccount_(ticket, who, reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('El motivo de reapertura es obligatorio para auditoría.');
  }

  const a = account_(ticket);
  a.closed = false;
  a.events = a.events || [];
  a.events.push({
    action: 'Reabrir',
    who: who,
    reason: String(reason).trim(),
    at: new Date().toISOString()
  });
  putAccount_(ticket, a);

  return { ok: true, ticket: ticket, message: `Cuenta '${ticket}' reabierta con éxito.` };
}
