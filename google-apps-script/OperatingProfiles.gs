/**
 * DOMUS OS · SOLAR / LUNAR OPERATING PROFILES
 * Operational control for POS phase + active access activity.
 * Does not alter historical sales or ACCESO rows.
 */

'use strict';

const DOMUS_OPERATING_PROFILES = Object.freeze({
  Solar: Object.freeze({
    id: 'Solar',
    phase: 'Solar',
    label: 'DOMUS Solar',
    intendedWindow: '14:00–21:00',
    priceField: 'priceSolar'
  }),
  Lunar: Object.freeze({
    id: 'Lunar',
    phase: 'Lunar',
    label: 'DOMUS Lunar',
    intendedWindow: '21:00–cierre / según programación',
    priceField: 'priceLunar'
  })
});

function operatingProfileDatos_() {
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sCaja = m.getSheetByName('CAJA 2');
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sCat = m.getSheetByName('CATALOGO');
  const sApertura = m.getSheetByName('APERTURA');
  const props = PropertiesService.getScriptProperties();

  const phaseRaw = sCaja ? String(sCaja.getRange('F2').getValue() || 'Solar').trim() : 'Solar';
  const phase = DOMUS_OPERATING_PROFILES[phaseRaw] ? phaseRaw : 'Solar';
  const activeActivity = String(props.getProperty('actividadAcceso') || '').trim();

  const activities = [];
  if (sAct && sAct.getLastRow() >= 7) {
    const rows = sAct.getRange(7, 1, Math.min(sAct.getLastRow() - 6, 100), 13).getValues();
    rows.forEach(r => {
      if (!r[0]) return;
      activities.push({
        name: String(r[0] || '').trim(),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        area: String(r[2] || '').trim(),
        organizer: String(r[3] || '').trim(),
        priceGeneral: Number(r[4]) || 0,
        pricePareja: Number(r[5]) || 0,
        priceTrio: Number(r[6]) || 0,
        priceGuardarropa: (r[7] === '' || r[7] === null || r[7] === undefined) ? null : Number(r[7]),
        status: String(r[11] || '').trim()
      });
    });
  }

  const selectedActivity = activities.find(a => a.name === activeActivity) || null;
  const confirmedActivities = activities.filter(a => a.status.toLowerCase() === 'confirmado');

  let activeProducts = 0;
  let invalidDestination = 0;
  let phasePricedProducts = 0;
  if (sCat && sCat.getLastRow() >= 7) {
    const rows = sCat.getRange(7, 1, Math.min(sCat.getLastRow() - 6, 500), 20).getValues();
    rows.forEach(r => {
      if (!r[0] || String(r[8] || '').trim() !== 'Sí') return;
      activeProducts++;
      const destination = String(r[7] || '').trim();
      if (!['Barra', 'Cocina'].includes(destination)) invalidDestination++;
      const hasDualPrice = !!r[15];
      const p = hasDualPrice ? Number(r[phase === 'Solar' ? 16 : 17]) : Number(r[2]);
      if (Number.isFinite(p) && p >= 0) phasePricedProducts++;
    });
  }

  let opening = {
    checklistMarked: 0,
    checklistTotal: 8,
    date: '',
    isToday: false
  };
  if (sApertura) {
    const checks = sApertura.getRange('A5:A12').getValues().flat();
    const arrival = sApertura.getRange('B3').getValue();
    const today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
    const openingDate = arrival instanceof Date
      ? Utilities.formatDate(arrival, 'America/Mexico_City', 'yyyy-MM-dd')
      : '';
    opening = {
      checklistMarked: checks.filter(v => v === true).length,
      checklistTotal: checks.length,
      date: openingDate,
      isToday: openingDate === today
    };
  }

  const blockers = [];
  if (!selectedActivity) blockers.push('ACTIVE_ACTIVITY_NOT_FOUND');
  if (selectedActivity && selectedActivity.status.toLowerCase() !== 'confirmado') blockers.push('ACTIVE_ACTIVITY_NOT_CONFIRMED');
  if (activeProducts === 0) blockers.push('NO_ACTIVE_PRODUCTS');
  if (phasePricedProducts < activeProducts) blockers.push('CATALOG_PHASE_PRICE_GAPS');
  if (invalidDestination > 0) blockers.push('INVALID_KDS_DESTINATIONS');
  if (!opening.isToday) blockers.push('OPENING_NOT_TODAY');
  if (opening.checklistMarked < opening.checklistTotal) blockers.push('OPENING_CHECKLIST_INCOMPLETE');

  return {
    environment: CONFIG.environment,
    profile: phase,
    preset: DOMUS_OPERATING_PROFILES[phase],
    activeActivity: activeActivity,
    selectedActivity: selectedActivity,
    confirmedActivities: confirmedActivities,
    catalog: {
      activeProducts: activeProducts,
      phasePricedProducts: phasePricedProducts,
      invalidDestination: invalidDestination
    },
    opening: opening,
    readiness: {
      ready: blockers.length === 0,
      blockers: blockers
    },
    profiles: DOMUS_OPERATING_PROFILES
  };
}

function operatingContextValidate_(payload) {
  payload = payload || {};
  const phase = String(payload.phase || payload.profile || '').trim();
  const activity = String(payload.activity || '').trim();

  if (!['Solar', 'Lunar'].includes(phase)) {
    const err = new Error('OPERATING_CONTEXT_INVALID: phase debe ser Solar o Lunar.');
    err.status = 400;
    err.code = 'OPERATING_CONTEXT_INVALID';
    throw err;
  }

  let activityInfo = null;
  if (activity) activityInfo = operatingActivityValidate_(activity);

  return {
    ok: true,
    phase: phase,
    activity: activity,
    activityInfo: activityInfo,
    mode: 'CONCURRENT_TRANSACTION_CONTEXT'
  };
}

function operatingContextsDatos_() {
  const base = operatingProfileDatos_();
  const contexts = (base.confirmedActivities || []).map(a => {
    const raw = String(a.area || '').toLowerCase();
    let units = [];
    if (raw.includes('solar')) units.push('Solar');
    if (raw.includes('lunar') || raw.includes('club') || raw.includes('nocturno')) units.push('Lunar');
    if (units.length === 0) units = ['Solar', 'Lunar'];
    return {
      activity: a.name,
      date: a.date,
      units: units,
      priceGeneral: a.priceGeneral,
      pricePareja: a.pricePareja,
      priceTrio: a.priceTrio,
      priceGuardarropa: a.priceGuardarropa,
      status: a.status
    };
  });

  return {
    environment: CONFIG.environment,
    mode: 'CONCURRENT_TRANSACTION_CONTEXT',
    defaultPhase: base.profile,
    contexts: contexts,
    catalog: base.catalog,
    opening: base.opening,
    readiness: base.readiness
  };
}

function operatingActivityValidate_(activity) {
  const clean = String(activity || '').trim();
  if (!clean) throw new Error('Actividad no especificada.');

  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  if (!sAct) throw new Error('Hoja ACTIVIDADES no encontrada.');

  const lastRow = Math.max(sAct.getLastRow(), 7);
  const rows = sAct.getRange(7, 1, Math.max(lastRow - 6, 1), 13).getValues();
  const match = rows.find(r => String(r[0] || '').trim().toLowerCase() === clean.toLowerCase());

  if (!match) {
    const err = new Error('OPERATING_ACTIVITY_NOT_FOUND: la actividad no existe en ACTIVIDADES.');
    err.status = 400;
    err.code = 'OPERATING_ACTIVITY_NOT_FOUND';
    throw err;
  }

  const status = String(match[11] || '').trim();
  if (status.toLowerCase() !== 'confirmado') {
    const err = new Error('OPERATING_ACTIVITY_NOT_CONFIRMED: la actividad está "' + status + '".');
    err.status = 400;
    err.code = 'OPERATING_ACTIVITY_NOT_CONFIRMED';
    throw err;
  }

  return { name: clean, status: status };
}
