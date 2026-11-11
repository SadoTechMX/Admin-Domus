'use strict';
// Independent read-only verification remains callable after writer removal/expiry.
// /dev accessible with the same Google Gerencia/staging guard; never deploy.
function domusVerificarInicioNuevoTemporal() {
  const hasArgs=arguments.length!==0;
  return domusRetencionAdminEjecutar_(function(){if(hasArgs)domusInicioFallo_('NO_ARGUMENTS');return domusInicioInspeccionar_();});
}
