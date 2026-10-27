/**
 * DOMUS Economic OS v15 · Universal Economic Ledger (READ-ONLY PREVIEW)
 *
 * Phase A: observability only.
 * This module DOES NOT write to Sheets and DOES NOT modify operational flows.
 * It normalizes existing economic sources into a common ledger contract.
 */

'use strict';

const LEDGER_ENTRY_TYPES = Object.freeze({
  SALE: 'SALE',
  PAYMENT: 'PAYMENT',
  TIP: 'TIP',
  PROCESSING_FEE: 'PROCESSING_FEE',
  EXPENSE: 'EXPENSE',
  PAYROLL: 'PAYROLL',
  TRANSFER: 'TRANSFER',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  CASH_DEPOSIT: 'CASH_DEPOSIT',
  OWNER_CONTRIBUTION: 'OWNER_CONTRIBUTION',
  CUSTOMER_RECEIVABLE: 'CUSTOMER_RECEIVABLE',
  SUPPLIER_PAYABLE: 'SUPPLIER_PAYABLE',
  DEBT_PAYMENT: 'DEBT_PAYMENT',
  REFUND: 'REFUND',
  REVERSAL: 'REVERSAL',
  CAPEX: 'CAPEX',
  FUND_ADVANCE: 'FUND_ADVANCE',
  FUND_RETURN: 'FUND_RETURN',
  OTHER: 'OTHER'
});

function financeLedgerPreview_(params) {
  params = params || {};
  const ss = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const limit = Math.max(1, Math.min(Number(params.limit) || 500, 2000));
  const from = ledgerParseDateBoundary_(params.from || params.dateFrom, false);
  const to = ledgerParseDateBoundary_(params.to || params.dateTo, true);
  const entryType = String(params.entryType || '').trim().toUpperCase();
  const sourceModule = String(params.sourceModule || '').trim().toUpperCase();
  const unit = String(params.unit || '').trim().toUpperCase();
  const qualityStatus = String(params.qualityStatus || '').trim().toUpperCase();

  let entries = [];
  entries = entries.concat(ledgerFromCaja_(ss));
  entries = entries.concat(ledgerFromCobros_(ss));
  entries = entries.concat(ledgerFromMovimientos_(ss));
  entries = entries.concat(ledgerFromPendientes_(ss));

  entries = entries.filter(e => ledgerDateInRange_(e.timestamp, from, to));
  if (entryType) entries = entries.filter(e => String(e.entryType || '').toUpperCase() === entryType);
  if (sourceModule) entries = entries.filter(e => String(e.sourceModule || '').toUpperCase() === sourceModule);
  if (unit) entries = entries.filter(e => String((e.dimensions && e.dimensions.unit) || '').toUpperCase() === unit);
  if (qualityStatus) entries = entries.filter(e => String(e.qualityStatus || '').toUpperCase() === qualityStatus);
  entries.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const totalBeforeLimit = entries.length;
  if (entries.length > limit) entries = entries.slice(entries.length - limit);

  return {
    schemaVersion: 'economic-ledger-preview-v1',
    mode: 'READ_ONLY_DERIVED',
    environment: CONFIG.environment,
    generatedAt: new Date().toISOString(),
    filters: {
      from: from ? from.toISOString() : '',
      to: to ? to.toISOString() : '',
      entryType: entryType,
      sourceModule: sourceModule,
      unit: unit,
      qualityStatus: qualityStatus,
      limit: limit
    },
    totalBeforeLimit: totalBeforeLimit,
    returned: entries.length,
    entries: entries
  };
}



function financeDailyPreview_(params) {
  params = params || {};
  const explicitDate = String(params.date || params.businessDate || '').trim();
  const tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone)
    ? (Session.getScriptTimeZone() || 'America/Mexico_City')
    : 'America/Mexico_City';
  const businessDate = explicitDate || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const preview = financeLedgerPreview_(Object.assign({}, params, {
    from: businessDate,
    to: businessDate,
    limit: 2000
  }));
  const summary = financeSummaryFromEntries_(preview.entries);
  const byProductSales = {};
  const byProviderSales = {};
  const byEventSales = {};
  const byStaffActivity = {};

  preview.entries.forEach(e => {
    const d = e.dimensions || {};
    const amount = Number(e.netAmount || e.grossAmount || 0);
    if (e.entryType === LEDGER_ENTRY_TYPES.SALE && d.product) {
      byProductSales[d.product] = ledgerRound_((byProductSales[d.product] || 0) + amount);
    }
    if (e.entryType === LEDGER_ENTRY_TYPES.SALE && d.provider) {
      byProviderSales[d.provider] = ledgerRound_((byProviderSales[d.provider] || 0) + amount);
    }
    const event = d.event || d.project;
    if (e.entryType === LEDGER_ENTRY_TYPES.SALE && event) {
      byEventSales[event] = ledgerRound_((byEventSales[event] || 0) + amount);
    }
    if (d.staff) {
      if (!byStaffActivity[d.staff]) byStaffActivity[d.staff] = {};
      byStaffActivity[d.staff][e.entryType] = ledgerRound_(
        (byStaffActivity[d.staff][e.entryType] || 0) + amount
      );
    }
  });

  return {
    schemaVersion: 'finance-daily-preview-v2',
    mode: 'READ_ONLY_DERIVED',
    environment: CONFIG.environment,
    generatedAt: new Date().toISOString(),
    businessDate: businessDate,
    totals: summary.totals,
    byPaymentChannel: summary.byPaymentChannel,
    byUnit: summary.byUnit,
    quality: summary.quality,
    obligationQuality: summary.obligationQuality,
    byProductSales: byProductSales,
    byProviderSales: byProviderSales,
    byEventSales: byEventSales,
    byStaffActivity: byStaffActivity,
    warnings: summary.warnings.concat([
      'Las dimensiones monetarias de producto/proveedor/evento muestran sólo SALE; no mezclan deuda, gastos ni transferencias.',
      'Staff se expone por tipo de asiento para evitar interpretar actividad administrativa como venta o ingreso generado.'
    ])
  };
}

function financeDashboardPreview_(params) {
  params = params || {};
  const summary = financeSummaryPreview_(params);
  const t = summary.totals || {};
  const operatingResultBeforeCogs = ledgerRound_(
    Number(t.sales || 0)
    - Number(t.processingFees || 0)
    - Number(t.expenses || 0)
    - Number(t.payroll || 0)
  );

  return {
    schemaVersion: 'finance-dashboard-preview-v1',
    mode: summary.mode,
    environment: summary.environment,
    generatedAt: summary.generatedAt,
    filters: summary.filters,
    kpis: {
      sales: t.sales || 0,
      grossPayments: t.payments || 0,
      reversals: t.reversals || 0,
      netPayments: t.netPayments || 0,
      tips: t.tips || 0,
      processingFees: t.processingFees || 0,
      expenses: t.expenses || 0,
      payroll: t.payroll || 0,
      cashWithdrawals: t.cashWithdrawals || 0,
      receivables: t.receivables || 0,
      payables: t.payables || 0,
      payablesConfirmed: (summary.obligationQuality && summary.obligationQuality.payables && summary.obligationQuality.payables.REAL) || 0,
      payablesUnderReview: (summary.obligationQuality && summary.obligationQuality.payables && summary.obligationQuality.payables.UNDER_REVIEW) || 0,
      receivablesConfirmed: (summary.obligationQuality && summary.obligationQuality.receivables && summary.obligationQuality.receivables.REAL) || 0,
      receivablesUnderReview: (summary.obligationQuality && summary.obligationQuality.receivables && summary.obligationQuality.receivables.UNDER_REVIEW) || 0,
      debtPayments: t.debtPayments || 0,
      transfers: t.transfers || 0,
      operatingResultBeforeCogs: operatingResultBeforeCogs
    },
    byPaymentChannel: summary.byPaymentChannel,
    byUnit: summary.byUnit,
    quality: summary.quality,
    obligationQuality: summary.obligationQuality,
    warnings: summary.warnings.concat([
      'Resultado operativo mostrado antes de COGS; no equivale a utilidad neta.',
      'Punto de equilibrio y margen final permanecen fuera de esta vista hasta integrar costos reales.'
    ])
  };
}

function financeSummaryFromEntries_(entries) {
  const totals = {
    sales: 0,
    payments: 0,
    reversals: 0,
    netPayments: 0,
    tips: 0,
    processingFees: 0,
    expenses: 0,
    payroll: 0,
    debtPayments: 0,
    receivables: 0,
    payables: 0,
    transfers: 0,
    cashWithdrawals: 0
  };
  const byPaymentChannel = {};
  const byUnit = {};
  const quality = { REAL: 0, RECONCILED: 0, ESTIMATED: 0, PENDING: 0, UNDER_REVIEW: 0 };
  const obligationQuality = {
    receivables: { REAL: 0, RECONCILED: 0, ESTIMATED: 0, PENDING: 0, UNDER_REVIEW: 0 },
    payables: { REAL: 0, RECONCILED: 0, ESTIMATED: 0, PENDING: 0, UNDER_REVIEW: 0 }
  };

  (entries || []).forEach(e => {
    const n = Number(e.netAmount || e.grossAmount || 0);
    switch (e.entryType) {
      case LEDGER_ENTRY_TYPES.SALE: totals.sales += n; break;
      case LEDGER_ENTRY_TYPES.PAYMENT: totals.payments += n; break;
      case LEDGER_ENTRY_TYPES.REVERSAL: totals.reversals += Math.abs(n); break;
      case LEDGER_ENTRY_TYPES.TIP: totals.tips += n; break;
      case LEDGER_ENTRY_TYPES.PROCESSING_FEE: totals.processingFees += n; break;
      case LEDGER_ENTRY_TYPES.EXPENSE: totals.expenses += n; break;
      case LEDGER_ENTRY_TYPES.PAYROLL: totals.payroll += n; break;
      case LEDGER_ENTRY_TYPES.DEBT_PAYMENT: totals.debtPayments += n; break;
      case LEDGER_ENTRY_TYPES.CUSTOMER_RECEIVABLE: totals.receivables += n; break;
      case LEDGER_ENTRY_TYPES.SUPPLIER_PAYABLE: totals.payables += n; break;
      case LEDGER_ENTRY_TYPES.TRANSFER: totals.transfers += n; break;
      case LEDGER_ENTRY_TYPES.CASH_WITHDRAWAL: totals.cashWithdrawals += Math.abs(n); break;
    }
    const pay = (e.dimensions && e.dimensions.paymentChannel) || '';
    if (pay && (e.entryType === LEDGER_ENTRY_TYPES.PAYMENT || e.entryType === LEDGER_ENTRY_TYPES.REVERSAL)) {
      byPaymentChannel[pay] = ledgerRound_((byPaymentChannel[pay] || 0) + n);
    }
    const unit = (e.dimensions && e.dimensions.unit) || 'DOMUS';
    if (e.entryType === LEDGER_ENTRY_TYPES.SALE) {
      byUnit[unit] = ledgerRound_((byUnit[unit] || 0) + n);
    }
    if (quality[e.qualityStatus] !== undefined) quality[e.qualityStatus]++;
    if (e.entryType === LEDGER_ENTRY_TYPES.CUSTOMER_RECEIVABLE && obligationQuality.receivables[e.qualityStatus] !== undefined) {
      obligationQuality.receivables[e.qualityStatus] = ledgerRound_(obligationQuality.receivables[e.qualityStatus] + n);
    }
    if (e.entryType === LEDGER_ENTRY_TYPES.SUPPLIER_PAYABLE && obligationQuality.payables[e.qualityStatus] !== undefined) {
      obligationQuality.payables[e.qualityStatus] = ledgerRound_(obligationQuality.payables[e.qualityStatus] + n);
    }
  });

  totals.netPayments = ledgerRound_(totals.payments - totals.reversals);
  Object.keys(totals).forEach(k => totals[k] = ledgerRound_(totals[k]));

  return {
    totals: totals,
    byPaymentChannel: byPaymentChannel,
    byUnit: byUnit,
    quality: quality,
    obligationQuality: obligationQuality,
    warnings: [
      'Vista derivada: no constituye todavía libro contable persistente.',
      'COGS no se calcula hasta integrar costo real por SKU/receta.',
      'Comisiones de terminal sólo se reconocen cuando existen en la fuente.',
      'No se lee ni modifica ACCESO/Forza en este módulo.'
    ]
  };
}

function financeSummaryPreview_(params) {
  const preview = financeLedgerPreview_(Object.assign({}, params || {}, { limit: 2000 }));
  const summary = financeSummaryFromEntries_(preview.entries);
  return {
    schemaVersion: preview.schemaVersion,
    mode: preview.mode,
    environment: preview.environment,
    generatedAt: preview.generatedAt,
    filters: preview.filters,
    entryCount: preview.returned,
    totals: summary.totals,
    byPaymentChannel: summary.byPaymentChannel,
    byUnit: summary.byUnit,
    quality: summary.quality,
    obligationQuality: summary.obligationQuality,
    warnings: summary.warnings
  };
}

function ledgerFromCaja_(ss) {
  const sheet = ss.getSheetByName('CAJA 2') || ss.getSheetByName('CAJA');
  if (!sheet || sheet.getLastRow() < 7) return [];
  const numRows = Math.min(Math.max(sheet.getLastRow() - 6, 0), 5000);
  if (!numRows) return [];
  const rows = sheet.getRange(7, 1, numRows, 25).getValues();
  const out = [];

  rows.forEach((r, i) => {
    const ticket = String(r[1] || '').trim();
    const product = String(r[6] || '').trim();
    if (!ticket || !product) return;
    const state = String(r[15] || '').trim();
    if (state === 'Cancelado') return;

    const amount = ledgerRound_(Number(r[11]) || 0);
    const ts = ledgerIso_(r[2]);
    const activity = String(r[3] || '');
    const group = String(r[5] || '');
    const courtesy = String(r[8] || '').toLowerCase().indexOf('cortes') !== -1 || amount === 0;

    out.push(ledgerEntry_({
      entryId: 'SALE:CAJA2:' + (i + 7),
      timestamp: ts,
      sourceModule: 'CAJA 2',
      sourceRecordId: ticket + ':ROW:' + (i + 7),
      entryType: LEDGER_ENTRY_TYPES.SALE,
      grossAmount: amount,
      netAmount: amount,
      status: state || 'RECORDED',
      qualityStatus: 'REAL',
      description: product,
      dimensions: {
        unit: ledgerInferUnit_(activity),
        project: activity,
        event: activity,
        product: product,
        sku: String(r[20] || ''),
        provider: String(r[18] || ''),
        customer: String(r[4] || ''),
        ticket: ticket,
        quantity: Number(r[7]) || 1,
        salesChannel: 'CAJA',
        costCenter: group,
        revenueCenter: group,
        destination: String(r[24] || ''),
        courtesy: courtesy
      }
    }));
  });
  return out;
}

function ledgerFromCobros_(ss) {
  const sheet = ss.getSheetByName('COBROS');
  if (!sheet || sheet.getLastRow() < 7) return [];
  const numRows = Math.min(Math.max(sheet.getLastRow() - 6, 0), 5000);
  if (!numRows) return [];
  const rows = sheet.getRange(7, 1, numRows, 31).getValues();
  const out = [];

  rows.forEach((r, i) => {
    const folio = String(r[0] || '').trim();
    if (!folio) return;
    const status = String(r[10] || '').trim() || 'RECORDED';
    const amount = ledgerRound_(Number(r[13]) || Number(r[5]) || 0);
    const method = String(r[4] || '');
    const activity = String(r[15] || '');
    const evidence = String(r[8] || '');
    const reversalRefs = evidence.match(/REC-[A-Z0-9-]+/ig) || [];
    const reversalOf = reversalRefs.find(ref => String(ref).toUpperCase() !== folio.toUpperCase()) || '';
    const base = {
      timestamp: ledgerIso_(r[1]),
      sourceModule: 'COBROS',
      sourceRecordId: folio,
      status: status,
      qualityStatus: status === 'Confirmado' ? 'REAL' : (status === 'Borrador' ? 'PENDING' : 'UNDER_REVIEW'),
      accountFrom: 'CUSTOMER',
      accountTo: ledgerTreasuryAccountForPayment_(method),
      evidence: evidence,
      dimensions: {
        unit: ledgerInferUnit_(activity),
        project: activity,
        event: activity,
        customer: String(r[7] || ''),
        ticket: String(r[3] || ''),
        staff: String(r[11] || ''),
        paymentChannel: method,
        salesChannel: String(r[2] || 'Caja')
      }
    };

    if (amount !== 0) {
      out.push(ledgerEntry_(Object.assign({}, base, {
        entryId: 'PAYMENT:COBROS:' + folio,
        entryType: amount < 0 ? LEDGER_ENTRY_TYPES.REVERSAL : LEDGER_ENTRY_TYPES.PAYMENT,
        grossAmount: amount,
        netAmount: amount,
        reversalOf: amount < 0 ? reversalOf : '',
        description: 'Cobro ' + folio
      })));
    }

    const fee = ledgerRound_(Number(r[6]) || 0);
    if (fee !== 0) {
      out.push(ledgerEntry_(Object.assign({}, base, {
        entryId: 'FEE:COBROS:' + folio,
        entryType: LEDGER_ENTRY_TYPES.PROCESSING_FEE,
        grossAmount: Math.abs(fee),
        netAmount: Math.abs(fee),
        accountFrom: ledgerTreasuryAccountForPayment_(method),
        accountTo: 'PAYMENT_PROCESSOR_FEES',
        description: 'Comisión de cobro ' + folio
      })));
    }

    const tip = ledgerRound_(Number(r[28]) || 0);
    if (tip !== 0) {
      out.push(ledgerEntry_(Object.assign({}, base, {
        entryId: 'TIP:COBROS:' + folio,
        entryType: LEDGER_ENTRY_TYPES.TIP,
        grossAmount: tip,
        netAmount: tip,
        description: 'Propina ' + folio
      })));
    }
  });
  return out;
}

function ledgerFromMovimientos_(ss) {
  const sheet = ss.getSheetByName('MOVIMIENTOS');
  if (!sheet || sheet.getLastRow() < 7) return [];
  const numRows = Math.min(Math.max(sheet.getLastRow() - 6, 0), 5000);
  if (!numRows) return [];
  const rows = sheet.getRange(7, 1, numRows, 14).getValues();
  const out = [];

  rows.forEach((r, i) => {
    const folio = String(r[0] || '').trim();
    if (!folio) return;
    const sourceType = String(r[2] || '').trim();
    const status = String(r[10] || '').trim();
    const applied = Number(r[13]);
    const amount = ledgerRound_(Number.isFinite(applied) && applied !== 0 ? applied : (Number(r[6]) || 0));
    const mapped = ledgerMapMovementType_(sourceType, String(r[3] || ''));

    out.push(ledgerEntry_({
      entryId: mapped + ':MOV:' + folio,
      timestamp: ledgerIso_(r[1]),
      sourceModule: 'MOVIMIENTOS',
      sourceRecordId: folio,
      entryType: mapped,
      accountFrom: String(r[4] || ''),
      accountTo: String(r[5] || ''),
      grossAmount: amount,
      netAmount: amount,
      status: status || 'RECORDED',
      qualityStatus: status === 'Confirmado' ? 'REAL' : (status === 'Borrador' ? 'PENDING' : 'UNDER_REVIEW'),
      description: String(r[3] || ''),
      evidence: String(r[9] || ''),
      dimensions: {
        unit: ledgerInferUnit_(String(r[3] || '')),
        project: '',
        provider: String(r[5] || ''),
        staff: String(r[11] || ''),
        obligationId: String(r[7] || ''),
        fundId: String(r[8] || '')
      }
    }));
  });
  return out;
}

function ledgerFromPendientes_(ss) {
  const sheet = ss.getSheetByName('PENDIENTES');
  if (!sheet || sheet.getLastRow() < 7) return [];
  const numRows = Math.min(Math.max(sheet.getLastRow() - 6, 0), 5000);
  if (!numRows) return [];
  const rows = sheet.getRange(7, 1, numRows, 13).getValues();
  const out = [];

  rows.forEach((r, i) => {
    const id = String(r[0] || '').trim();
    if (!id) return;
    const direction = String(r[1] || '').trim().toLowerCase();
    const state = String(r[11] || '').trim();
    const balance = ledgerRound_(Number(r[10]) || 0);
    if (balance <= 0 || state === 'LIQUIDADO') return;

    const entryType = direction === 'cobrar'
      ? LEDGER_ENTRY_TYPES.CUSTOMER_RECEIVABLE
      : LEDGER_ENTRY_TYPES.SUPPLIER_PAYABLE;

    out.push(ledgerEntry_({
      entryId: entryType + ':PEND:' + id,
      timestamp: ledgerIso_(r[8]) || '',
      sourceModule: 'PENDIENTES',
      sourceRecordId: id,
      entryType: entryType,
      accountFrom: direction === 'cobrar' ? String(r[2] || '') : 'DOMUS',
      accountTo: direction === 'cobrar' ? 'DOMUS' : String(r[2] || ''),
      grossAmount: balance,
      netAmount: balance,
      status: state || 'PENDIENTE',
      qualityStatus: state.indexOf('REVISAR') !== -1 ? 'UNDER_REVIEW' : 'REAL',
      description: String(r[3] || ''),
      evidence: String(r[12] || ''),
      dimensions: {
        unit: 'DOMUS',
        counterparty: String(r[2] || ''),
        obligationId: id,
        settlementAccount: String(r[7] || ''),
        priority: String(r[6] || '')
      }
    }));
  });
  return out;
}

function ledgerEntry_(v) {
  const ts = v.timestamp || '';
  return {
    entryId: String(v.entryId || ''),
    timestamp: ts,
    businessDate: ts ? ts.slice(0, 10) : '',
    sourceModule: String(v.sourceModule || ''),
    sourceRecordId: String(v.sourceRecordId || ''),
    entryType: String(v.entryType || LEDGER_ENTRY_TYPES.OTHER),
    accountFrom: String(v.accountFrom || ''),
    accountTo: String(v.accountTo || ''),
    grossAmount: ledgerRound_(v.grossAmount || 0),
    feeAmount: ledgerRound_(v.feeAmount || 0),
    taxAmount: ledgerRound_(v.taxAmount || 0),
    netAmount: ledgerRound_(v.netAmount !== undefined ? v.netAmount : (v.grossAmount || 0)),
    currency: 'MXN',
    status: String(v.status || 'RECORDED'),
    qualityStatus: String(v.qualityStatus || 'PENDING'),
    description: String(v.description || ''),
    evidence: String(v.evidence || ''),
    reversalOf: String(v.reversalOf || ''),
    dimensions: v.dimensions || {}
  };
}

function ledgerMapMovementType_(sourceType, concept) {
  const t = String(sourceType || '').toLowerCase();
  const c = String(concept || '').toLowerCase();
  if (t === 'gasto' || t === 'gasto de fondo') {
    if (c.indexOf('staff') !== -1 || c.indexOf('sueldo') !== -1 || c.indexOf('nómina') !== -1) return LEDGER_ENTRY_TYPES.PAYROLL;
    return LEDGER_ENTRY_TYPES.EXPENSE;
  }
  if (t === 'pago pendiente') return LEDGER_ENTRY_TYPES.DEBT_PAYMENT;
  if (t === 'transferencia') return LEDGER_ENTRY_TYPES.TRANSFER;
  if (t === 'fondo de compra') return LEDGER_ENTRY_TYPES.FUND_ADVANCE;
  if (t.indexOf('devol') !== -1) return LEDGER_ENTRY_TYPES.FUND_RETURN;
  if (t.indexOf('retiro') !== -1) return LEDGER_ENTRY_TYPES.CASH_WITHDRAWAL;
  return LEDGER_ENTRY_TYPES.OTHER;
}

function ledgerTreasuryAccountForPayment_(method) {
  const m = String(method || '');
  if (m === 'Efectivo') return 'CASH_REGISTER';
  if (m === 'Terminal 1') return 'TERMINAL_1';
  if (m === 'Terminal 2') return 'TERMINAL_2';
  if (m === 'Transferencia') return 'BANK_TRANSFER';
  return m || 'UNASSIGNED_PAYMENT_ACCOUNT';
}

function ledgerInferUnit_(activity) {
  const s = String(activity || '').toLowerCase();
  if (s.indexOf('lunar') !== -1 || s.indexOf('forza') !== -1 || s.indexOf('fiesta') !== -1 || s.indexOf('rave') !== -1) return 'LUNAR';
  if (s.indexOf('solar') !== -1 || s.indexOf('taller') !== -1 || s.indexOf('clase') !== -1 || s.indexOf('galer') !== -1) return 'SOLAR';
  if (s.indexOf('4 de oros') !== -1 || s.indexOf('caf') !== -1) return '4_DE_OROS';
  if (s.indexOf('nec') !== -1) return 'NEC';
  if (s.indexOf('inframundo') !== -1 || s.indexOf('bdsm') !== -1) return 'INFRAMUNDO';
  return 'DOMUS';
}

function ledgerIso_(value) {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch (e) {
    return '';
  }
}

function ledgerParseDateBoundary_(value, endOfDay) {
  if (!value) return null;
  const clean = String(value).trim();
  const d = new Date(clean.length <= 10 ? clean + (endOfDay ? 'T23:59:59.999-06:00' : 'T00:00:00.000-06:00') : clean);
  return isNaN(d.getTime()) ? null : d;
}

function ledgerDateInRange_(iso, from, to) {
  if (!from && !to) return true;
  if (!iso) return true; // obligations may not yet have a date; do not silently hide them.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return true;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function ledgerRound_(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}
