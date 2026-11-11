'use strict';
// TEMPORARY, UNPUBLISHED bridge. Public functions ARE reachable through /dev by
// authorized editors. This is NOT an editor-origin check. Never version/deploy.
// Remove this file after ONE write invocation, including failure/uncertainty.
// Removal is an operator action; this file cannot delete its own source.
function domusRetencionPuenteConfig_() {
  // Fill only in the private editor copy after checking the authorized operator.
  // Absolute UTC ISO timestamps, including milliseconds; window <= 10 minutes.
  // Blank defaults disable the bridge. Never derive expiry from Date.now().
  return {principal:'',issuedAt:'',expiresAt:''};
}
function domusRetencionPuenteHuella_() {
  return '708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b';
}
function domusRetencionPuenteComprobar_(config,checkWindow) {
  const principal=domusRetencionAdminIdentidad_();
  if(!config || Object.keys(config).sort().join(',')!=='expiresAt,issuedAt,principal' ||
      typeof config.principal!=='string' || !config.principal || config.principal!==principal)
    domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_PRINCIPAL_REQUIRED');
  if(domusRetencionAdminHashAutorizado_()!==domusRetencionPuenteHuella_())
    domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_HASH_MISMATCH');
  if(!checkWindow)return;
  const iso=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString()===v;
  if(!iso(config.issuedAt) || !iso(config.expiresAt))domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_WINDOW_INVALID');
  const start=Date.parse(config.issuedAt),end=Date.parse(config.expiresAt),now=Date.now();
  if(end<=start || end-start>10*60*1000)domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_WINDOW_INVALID');
  if(!Number.isFinite(now) || now<start || now>=end)domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_WINDOW_CLOSED');
}
function domusRegistrarRetencionTemporal() {
  const hasArgs=arguments.length!==0;
  return domusRetencionAdminEjecutar_(function() {
    if(hasArgs)domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_NO_ARGUMENTS');
    // Old helpers silently ignore a second argument; reject them before any work.
    if(typeof domusRetencionAdminGuardaFinalVersion_!=='function' || domusRetencionAdminGuardaFinalVersion_()!=='RETENTION_FINAL_GUARD_V1')
      domusRetencionAdminFallo_('RETENTION_ADMIN_BRIDGE_FINAL_GUARD_REQUIRED');
    const config=Object.freeze(Object.assign({},domusRetencionPuenteConfig_()));
    domusRetencionPuenteComprobar_(config,true);
    // No client body/hash/key/action is accepted. All approved input remains in
    // the existing private helper; its complete validation is unchanged.
    return withLock_(CONFIG.lockTimeoutMs,function() {
      domusRetencionPuenteComprobar_(config,true);
      return domusRetencionAdminCrear_(domusRetencionAdminEntrada_(),function() {
        domusRetencionPuenteComprobar_(config,true);
      });
    });
  });
}
