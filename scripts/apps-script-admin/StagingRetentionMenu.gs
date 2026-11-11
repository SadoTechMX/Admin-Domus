'use strict';
// Add beside StagingRetentionApproval.gs; preserve its private local input.
// This selectable editor entry only adds a native menu. It NEVER calls the setter.
// Do not deploy. No onOpen trigger or dispatcher/HTML route is added.
function domusPrepararMenuRetencion() {
  return domusRetencionAdminEjecutar_(function() {
    domusRetencionAdminIdentidad_();
    let sheet,ui;
    try {
      sheet=SpreadsheetApp.getActiveSpreadsheet();
      if(!sheet || ![CONFIG.mainSheetId,CONFIG.opsSheetId].includes(sheet.getId()))
        domusRetencionAdminFallo_('RETENTION_ADMIN_BOUND_STAGING_UI_REQUIRED');
      ui=SpreadsheetApp.getUi();
    } catch(_) {domusRetencionAdminFallo_('RETENTION_ADMIN_BOUND_STAGING_UI_REQUIRED');}
    ui.createMenu('DOMUS · Retención staging')
      .addItem('1. Inspeccionar aprobación', 'domusInspeccionarAprobacionRetencion_')
      .addSeparator()
      .addItem('2. Registrar aprobación autorizada (sin activar)', 'domusRegistrarAprobacionRetencion_')
      .addToUi();
    return {ok:true,status:'PRIVATE_MENU_READY',propertyWrites:0,canActivate:false,resolved:false,financialFinal:false};
  });
}
