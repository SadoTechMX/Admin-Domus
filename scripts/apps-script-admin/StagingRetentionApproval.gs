'use strict';
// Private administrative core. NOT part of the bundle or release-manifest.
// Underscore functions are private to google.script.run, but an installed public
// bridge can call them. Identity checks do NOT establish an editor-only origin.
// Fill the local input only after reviewing the private diagnostic. Never commit it.
function domusRetencionAdminEntrada_() {
  return {artifact:null,approvalReference:'',expectedPropertyState:null,
    confirmStationsHeld:false,confirmBackupVerified:false,acknowledgeUnresolvedHistory:false,
    confirmOnlyPrepareProposal:false,confirmPropertyWritersStopped:false};
}
function domusRetencionAdminHashAutorizado_() {
  return '708c295c42adbbb7adb215de78f46e6c0f24a14508a4b2eb734024d839dbb94b';
}
function domusRetencionAdminClave_() {return 'DOMUS_STAGING_UNCERTAIN_RETENTION_APPROVAL_V1';}
function domusRetencionAdminFallo_(code) {const e=new Error(code);e.retentionAdminCode=code;throw e;}
function domusRetencionAdminIdentidad_() {
  const deny=()=>domusRetencionAdminFallo_('RETENTION_ADMIN_IDENTITY_REQUIRED');
  let active,effective;
  try {active=Session.getActiveUser().getEmail();effective=Session.getEffectiveUser().getEmail();}catch(_){deny();}
  if(typeof active!=='string' || !active || active!==effective || !CONFIG.managers.includes(active) ||
      (typeof _authContext!=='undefined' && _authContext!==null))deny();
  if(CONFIG.environment!=='STAGING' || CONFIG.mainSheetId!=='114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg' ||
      CONFIG.opsSheetId!=='1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE' ||
      ScriptApp.getScriptId()!=='1sh5fyAaa0onlNsNZ40EokGumubebYEMisTGZ8rNj75gBiOsYPkA-rV4O')
    domusRetencionAdminFallo_('RETENTION_ADMIN_STAGING_ONLY');
  if(typeof BACKEND_BUILD==='undefined' || ![
    'edfaad95a796a784e59a54b19c3c76966d39f1e9963af0a9262d99960960a5e4',
    '48897795ee48ddeb4a6ff5b49673e1e3054e595b544615e9c709f5cabfc36d4c',
    'ae76a4b2799bbf636b498cade21391755daf847eb1676f77cd3cc6e96262933e',
    'b07de85635e3e297ddc7decf45a195094619beb42bf7a1f9bbac0e71728a8e61',
    'f24d94ffa387680b000b26c79e262c31fabda499231ddae7880fb6af200a31b1'
  ].includes(BACKEND_BUILD.sourceSha256))domusRetencionAdminFallo_('RETENTION_ADMIN_BUILD_UNREVIEWED');
  return active;
}
function domusRetencionAdminHuellaValor_(raw) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8)
    .map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function domusRetencionAdminResumen_(raw) {
  const result={property:domusRetencionAdminClave_(),present:raw!==null,valueSha256:raw===null?null:domusRetencionAdminHuellaValor_(raw),
    approvalForAuthorizedHash:false,currentEvidenceChecked:false,canActivate:false,resolved:false,financialFinal:false};
  if(raw===null)return result;
  // Never print the stored value (including malformed text or unexpected fields).
  let a;try{a=JSON.parse(raw);}catch(_){return result;}
  result.approvalForAuthorizedHash=!!(a && a.version===1 && a.mode==='STAGING_ACCESS_WARDROBE_17_V1' && a.approved===true &&
    a.evidenceHash===domusRetencionAdminHashAutorizado_() && typeof a.approvalReference==='string' && a.approvalReference.trim() && a.approvalReference.length<=200 &&
    a.confirmStationsHeld===true && a.confirmBackupVerified===true && a.acknowledgeUnresolvedHistory===true);
  return result;
}
function domusRetencionAdminLeer_() {
  domusRetencionAdminIdentidad_();
  return withLock_(CONFIG.lockTimeoutMs,()=>Object.assign({ok:true,status:'READ_ONLY'},
    domusRetencionAdminResumen_(PropertiesService.getScriptProperties().getProperty(domusRetencionAdminClave_()))));
}
function domusRetencionAdminGuardaFinalVersion_() {return 'RETENTION_FINAL_GUARD_V1';}
function domusRetencionAdminCrear_(input,beforeWrite) {
  if(beforeWrite!==undefined && typeof beforeWrite!=='function')domusRetencionAdminFallo_('RETENTION_ADMIN_FINAL_GUARD_INVALID');
  const principal=domusRetencionAdminIdentidad_();
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const store=PropertiesService.getScriptProperties(),key=domusRetencionAdminClave_(),original=store.getProperty(key);
    // Any existing byte string, even empty/malformed/revoked, is preserved.
    // A retry after an uncertain write also ends here without overwriting it.
    if(original!==null)return Object.assign({ok:true,status:'EXISTING_PRESERVED'},domusRetencionAdminResumen_(original));
    if(!input || input.expectedPropertyState!=='ABSENT' || input.confirmStationsHeld!==true || input.confirmBackupVerified!==true ||
        input.acknowledgeUnresolvedHistory!==true || input.confirmOnlyPrepareProposal!==true || input.confirmPropertyWritersStopped!==true ||
        typeof input.approvalReference!=='string' || !input.approvalReference.trim() || input.approvalReference.length>200 ||
        /[\x00-\x1f\x7f]/.test(input.approvalReference))domusRetencionAdminFallo_('RETENTION_ADMIN_CONFIRMATIONS_REQUIRED');
    // The diagnostic and its original input come from the existing private download.
    // Hash equality binds the exact approved evidence, including build and backup.
    const a=input.artifact,d=a && a.diagnostic,e=d && d.evidence,p=a && a.input,approved=domusRetencionAdminHashAutorizado_();
    if(!a || a.format!=='DOMUS_STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1' || !d ||
        d.kind!=='STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1' || d.canActivate!==false || d.resolved!==false ||
        d.financialFinal!==false || d.approvalRequired!==true || 'snapshot' in d || 'snapshotHash' in d || !e ||
        d.evidenceHash!==approved || historyHash_(e)!==approved || e.backendSourceSha256!==BACKEND_BUILD.sourceSha256 ||
        !p || p.isolationMode!=='STAGING_FRESH_START_V1')domusRetencionAdminFallo_('RETENTION_ADMIN_APPROVED_ARTIFACT_REQUIRED');
    let candidate;
    try {
      const source=SpreadsheetApp.openById(CONFIG.mainSheetId);
      stagingIsolationEnvironment_(source);
      // The separately reviewed companion can accelerate V16 without replacing
      // its backend/build. Never fall back to the unsafe V1 range cache or repeat
      // the unbounded legacy read path after a timeout.
      const read=typeof domusRetencionReadView_==='function'?domusRetencionReadView_(source):
        typeof historyReadView_==='function'?historyReadView_(source):null;
      if(!read || read.version!=='HISTORY_CONSISTENT_READ_V2')domusRetencionAdminFallo_('RETENTION_ADMIN_CONSISTENT_READ_REQUIRED');
      if(historyBoundary_(read.book))domusRetencionAdminFallo_('RETENTION_ADMIN_BOUNDARY_EXISTS');
      candidate=historySnapshot_(read.book,p,null,true);read.assertDimensions();
    } catch(error) {
      if(['RETENTION_ADMIN_BOUNDARY_EXISTS','RETENTION_ADMIN_CONSISTENT_READ_REQUIRED'].includes(error.retentionAdminCode))throw error;
      domusRetencionAdminFallo_('RETENTION_ADMIN_EVIDENCE_REVALIDATION_FAILED');
    }
    if(!candidate || candidate.kind!=='STAGING_UNCERTAIN_RETENTION_DIAGNOSTIC_V1' || candidate.canActivate!==false ||
        candidate.resolved!==false || candidate.financialFinal!==false || candidate.evidenceHash!==approved ||
        historyHash_(candidate.evidence)!==approved || 'snapshotHash' in candidate)
      domusRetencionAdminFallo_('RETENTION_ADMIN_EVIDENCE_CHANGED');
    // Re-read immediately before create. Lock serializes this tool/backend, not
    // manual property editors; keep all other writers stopped throughout.
    if(store.getProperty(key)!==null)domusRetencionAdminFallo_('RETENTION_ADMIN_PROPERTY_CHANGED');
    const approval={version:1,mode:'STAGING_ACCESS_WARDROBE_17_V1',approved:true,evidenceHash:approved,
      approvalReference:input.approvalReference,confirmStationsHeld:true,confirmBackupVerified:true,acknowledgeUnresolvedHistory:true,
      recordedBy:principal,recordedAt:new Date().toISOString(),tool:'STAGING_RETENTION_PROPERTY_ADMIN_V1',backendSourceSha256:BACKEND_BUILD.sourceSha256};
    const serialized=JSON.stringify(approval);
    // Optional private caller guard, inside the lock and outside the uncertain-write
    // catch. The temporary bridge rechecks its fixed identity/deadline here.
    if(beforeWrite)beforeWrite();
    try {store.setProperty(key,serialized);if(store.getProperty(key)!==serialized)throw new Error('READBACK_MISMATCH');}
    catch(_){domusRetencionAdminFallo_('RETENTION_ADMIN_WRITE_UNCERTAIN_INSPECT_ONLY');}
    return Object.assign({ok:true,status:'CREATED'},domusRetencionAdminResumen_(serialized),{currentEvidenceChecked:true});
  });
}
function domusRetencionAdminEjecutar_(fn) {
  let result;
  try {result=fn();}catch(e){result={ok:false,status:/^RETENTION_ADMIN_[A-Z_]+$/.test(e.retentionAdminCode||'')?e.retentionAdminCode:'RETENTION_ADMIN_STOPPED',canActivate:false};}
  console.log(JSON.stringify(result));return result;
}
// Private native-menu callbacks. Use the companion StagingRetentionMenu.gs
// launcher in the editor; these names are not selectable there. Do not publish.
function domusInspeccionarAprobacionRetencion_() {return domusRetencionAdminEjecutar_(domusRetencionAdminLeer_);}
function domusRegistrarAprobacionRetencion_() {return domusRetencionAdminEjecutar_(()=>domusRetencionAdminCrear_(domusRetencionAdminEntrada_()));}
