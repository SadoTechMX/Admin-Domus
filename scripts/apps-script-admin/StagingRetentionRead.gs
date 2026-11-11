'use strict';
// Read-only public companion; keep for inspection after removing the write bridge.
// Reachable through /dev. Uses the existing Gerencia/staging checks, never writes.
// Do not version or deploy this administrative companion.
function domusInspeccionarRetencionTemporal() {
  const hasArgs=arguments.length!==0;
  return domusRetencionAdminEjecutar_(function() {
    if(hasArgs)domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_NO_ARGUMENTS');
    return Object.assign(domusRetencionAdminLeer_(),{serverTimeUtc:new Date().toISOString()});
  });
}
