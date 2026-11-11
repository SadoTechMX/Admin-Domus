'use strict';
// Temporary public writers ARE accessible via /dev. Not editor-only. Never deploy.
// Remove this file after the coordinated approval/activation attempt or failure.
function domusInicioVentana_() {return {principal:'',issuedAt:'',expiresAt:''};}
function domusInicioGuardia_(c) {
  const principal=domusRetencionAdminIdentidad_();
  if(!c || Object.keys(c).sort().join(',')!=='expiresAt,issuedAt,principal' || c.principal!==principal)domusInicioFallo_('PRINCIPAL_REQUIRED');
  const iso=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString()===v;
  if(!iso(c.issuedAt) || !iso(c.expiresAt) || Date.parse(c.expiresAt)<=Date.parse(c.issuedAt) || Date.parse(c.expiresAt)-Date.parse(c.issuedAt)>600000)domusInicioFallo_('WINDOW_INVALID');
  if(Date.now()<Date.parse(c.issuedAt) || Date.now()>=Date.parse(c.expiresAt))domusInicioFallo_('WINDOW_CLOSED');return principal;
}
function domusAprobarInicioNuevoTemporal() {
  const hasArgs=arguments.length!==0;
  return domusRetencionAdminEjecutar_(function(){
    if(hasArgs)domusInicioFallo_('NO_ARGUMENTS');const c=Object.freeze(Object.assign({},domusInicioVentana_()));
    return domusInicioAprobar_(function(){return domusInicioGuardia_(c);});
  });
}
function domusActivarInicioNuevoTemporal() {
  const hasArgs=arguments.length!==0;
  return domusRetencionAdminEjecutar_(function(){
    if(hasArgs)domusInicioFallo_('NO_ARGUMENTS');const c=Object.freeze(Object.assign({},domusInicioVentana_()));
    return domusInicioActivar_(function(){return domusInicioGuardia_(c);});
  });
}
