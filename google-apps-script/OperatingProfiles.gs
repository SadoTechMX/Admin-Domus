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

function operatingProfileSet_(payload, authContext) {
  payload = payload || {};
  const profile = String(payload.profile || payload.phase || '').trim();
  if (!DOMUS_OPERATING_PROFILES[profile]) {
    const err = new Error('OPERATING_PROFILE_INVALID: perfil debe ser Solar o Lunar.');
    err.status = 400;
    err.code = 'OPERATING_PROFILE_INVALID';
    throw err;
  }

  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sCaja = m.getSheetByName('CAJA 2');
  const sAct = m.getSheetByName('ACTIVIDADES');
  if (!sCaja || !sAct) throw new Error('Faltan hojas operativas CAJA 2 / ACTIVIDADES.');

  const activity = String(payload.activity || '').trim();
  if (activity) {
    const lastRow = Math.max(sAct.getLastRow(), 7);
    const rows = sAct.getRange(7, 1, Math.max(lastRow - 6, 1), 13).getValues();
    const match = rows.find(r => String(r[0] || '').trim().toLowerCase() === activity.toLowerCase());
    if (!match) {
      const err = new Error('OPERATING_ACTIVITY_NOT_FOUND: actividad no existe en ACTIVIDADES.');
      err.status = 400;
      err.code = 'OPERATING_ACTIVITY_NOT_FOUND';
      throw err;
    }
    const status = String(match[11] || '').trim().toLowerCase();
    if (status !== 'confirmado') {
      const err = new Error('OPERATING_ACTIVITY_NOT_CONFIRMED: la actividad debe estar Confirmada antes de activarse.');
      err.status = 400;
      err.code = 'OPERATING_ACTIVITY_NOT_CONFIRMED';
      throw err;
    }
  }

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const props = PropertiesService.getScriptProperties();
    const previousPhase = String(sCaja.getRange('F2').getValue() || 'Solar').trim();
    const previousActivity = String(props.getProperty('actividadAcceso') || '').trim();

    sCaja.getRange('F2').setValue(profile);
    if (activity) props.setProperty('actividadAcceso', activity);
    props.setProperty('domusOperatingProfile', profile);
    props.setProperty('domusOperatingProfileChangedAt', new Date().toISOString());
    props.setProperty('domusOperatingProfileChangedBy', (authContext && authContext.operator) || 'Operador');

    SpreadsheetApp.flush();

    const current = operatingProfileDatos_();
    return {
      ok: true,
      previous: { profile: previousPhase, activeActivity: previousActivity },
      current: current,
      message: 'Perfil operativo cambiado a ' + profile + (activity ? ' · ' + activity : '')
    };
  });
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
