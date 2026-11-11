'use strict';
// Private, temporary administrative companion. Never version/deploy this file.
// Only the separately reviewed public bridge may call its writers; /dev is not
// an editor-only boundary. No supplied token, role, ID, action or hash is trusted.
function domusInicioEntrada_() {
  return {artifact:null,approvalReference:'',confirmStationsHeld:false,confirmBackupVerified:false,
    confirmLegacyTestWriterDisabled:false,acceptUnattributedEffectsUnresolved:false,
    acknowledgeUnresolvedHistory:false,confirmPropertyWritersStopped:false,confirmSingleActivation:false};
}
function domusInicioHuella_() {return '5c0b3a75ba2653d8255ff05159c5d6a679696d189db9cc3e57455fee0c31cd90';}
function domusInicioId_() {return 'STAGING-FRESH-'+domusInicioHuella_();}
function domusInicioDispositivo_() {return 'STAGING-ADMIN-'+domusInicioHuella_().slice(0,16);}
function domusInicioClave_() {return 'DOMUS_STAGING_FRESH_START_APPROVAL_V1';}
function domusInicioFallo_(code) {domusRetencionAdminFallo_('RETENTION_ADMIN_FRESH_'+code);}
function domusInicioVista_(m) {
  if(typeof domusRetencionReadView_!=='function')domusInicioFallo_('CONSISTENT_READ_REQUIRED');
  const read=domusRetencionReadView_(m);
  if(read.version!=='HISTORY_CONSISTENT_READ_V2')domusInicioFallo_('CONSISTENT_READ_REQUIRED');return read;
}
function domusInicioContrato_(input) {
  const a=input && input.artifact,p=a && a.proposal,s=p && p.snapshot,f=s && s.freshStart,body=a && a.input;
  if(!a || a.format!=='DOMUS_STAGING_FRESH_START_PROPOSAL_V2' || !p || p.ok!==true ||
      p.kind!=='STAGING_FRESH_START_PROPOSAL' || p.canActivate!==false || p.resolved!==false || p.financialFinal!==false ||
      p.snapshotHash!==domusInicioHuella_() || !s || historyHash_(s)!==domusInicioHuella_() ||
      s.environment!=='STAGING' || s.book!==CONFIG.mainSheetId || !f || f.mode!=='STAGING_FRESH_START_V1' ||
      f.projectId!==ScriptApp.getScriptId() || f.opsBook!==CONFIG.opsSheetId || f.backendSourceSha256!==BACKEND_BUILD.sourceSha256 ||
      !body || Object.keys(body).sort().join(',')!=='backup,evidenceReference,isolationMode,queue,stationDeviceIds' || body.isolationMode!==f.mode ||
      historyHash_(body.backup)!==historyHash_(f.backup))domusInicioFallo_('ARTIFACT_MISMATCH');
  if(typeof input.approvalReference!=='string' || !input.approvalReference.trim() || input.approvalReference.length>200 ||
      /[\x00-\x1f\x7f]/.test(input.approvalReference) ||
      ['confirmStationsHeld','confirmBackupVerified','confirmLegacyTestWriterDisabled','acceptUnattributedEffectsUnresolved',
       'acknowledgeUnresolvedHistory','confirmPropertyWritersStopped','confirmSingleActivation'].some(k=>input[k]!==true))domusInicioFallo_('CONFIRMATIONS_REQUIRED');
  const payload=Object.assign(JSON.parse(JSON.stringify(body)),{requestId:domusInicioId_(),snapshotHash:domusInicioHuella_(),
    acknowledgeUnresolvedHistory:true,confirmStationsHeld:true,confirmBackupVerified:true,
    confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true});
  return {input:input,payload:payload,payloadHash:computePayloadHash_({action:'registrarLimiteHistorico',payload:payload}),backupSha256:f.backup.sha256};
}
function domusInicioAprobacionValida_(a,c,principal) {
  return !!(a && a.version===1 && a.mode==='STAGING_FRESH_START_V1' && a.approved===true && a.snapshotHash===domusInicioHuella_() &&
    a.requestId===domusInicioId_() && a.deviceId===domusInicioDispositivo_() && a.payloadHash===c.payloadHash &&
    a.backupSha256===c.backupSha256 && a.approvalReference===c.input.approvalReference && a.recordedBy===principal &&
    a.tool==='STAGING_FRESH_START_ADMIN_V1' && typeof a.recordedAt==='string' && Number.isFinite(Date.parse(a.recordedAt)) &&
    ['confirmStationsHeld','confirmBackupVerified','confirmLegacyTestWriterDisabled','acceptUnattributedEffectsUnresolved','acknowledgeUnresolvedHistory'].every(k=>a[k]===true));
}
function domusInicioLeerJson_(raw) {try{return JSON.parse(raw);}catch(_){return null;}}
function domusInicioPersistir_(store,before,value) {
  const key=domusInicioClave_();
  if(store.getProperty(key)!==before)domusInicioFallo_('PROPERTY_CHANGED');
  const raw=JSON.stringify(value);
  try {store.setProperty(key,raw);if(store.getProperty(key)!==raw)throw Error('READBACK');}
  catch(_){domusInicioFallo_('WRITE_UNCERTAIN_INSPECT_ONLY');}return raw;
}
function domusInicioRevalidar_(c) {
  const read=domusInicioVista_(SpreadsheetApp.openById(CONFIG.mainSheetId)),m=read.book;
  if(historyBoundary_(m))domusInicioFallo_('BOUNDARY_EXISTS');
  const requests=m.getSheetByName('REQUESTS');if(!requests)domusInicioFallo_('LEDGER_REQUIRED');
  if(requestRecordEntry_(requests,domusInicioId_()) || journalFind_(domusInicioId_(),m))domusInicioFallo_('PRIOR_ATTEMPT_INSPECT_ONLY');
  const candidate=historySnapshot_(m,c.payload,null,true);read.assertDimensions();
  if(!candidate.snapshot || candidate.snapshotHash!==domusInicioHuella_() || historyHash_(candidate.snapshot)!==domusInicioHuella_())domusInicioFallo_('EVIDENCE_CHANGED');
  return candidate;
}
function domusInicioInspeccionar_() {
  const principal=domusRetencionAdminIdentidad_();
  return withLock_(CONFIG.lockTimeoutMs,function(){
    const store=PropertiesService.getScriptProperties(),raw=store.getProperty(domusInicioClave_());
    const out={ok:true,status:'REVIEW_REQUIRED',requestId:domusInicioId_(),snapshotHash:domusInicioHuella_(),
      propertyPresent:raw!==null,valueSha256:raw===null?null:domusRetencionAdminHuellaValor_(raw),verified:false,
      resolved:false,financialFinal:false,newCharge:null,inventoryMovement:null};
    const c=domusInicioContrato_(domusInicioEntrada_()),a=domusInicioLeerJson_(raw);
    const read=domusInicioVista_(SpreadsheetApp.openById(CONFIG.mainSheetId)),m=read.book,s=m.getSheetByName('REQUESTS');
    if(!s)domusInicioFallo_('LEDGER_REQUIRED');
    const entry=requestRecordEntry_(s,domusInicioId_()),j=journalFind_(domusInicioId_(),m);
    out.requestStatus=entry?(['PROCESSING','COMPLETED','FAILED','REQUIRES_REVIEW'].includes(entry.values[4])?entry.values[4]:'UNKNOWN'):null;
    out.journalStatus=j?j.data[2]:null;
    if(!entry && !j)out.status=raw===null?'ABSENT':domusInicioAprobacionValida_(a,c,principal)&&a.attempt===null?'APPROVED_NOT_STARTED':'ATTEMPT_OR_PROPERTY_REQUIRES_REVIEW';
    else if(entry && j && domusInicioAprobacionValida_(a,c,principal) && a.attempt && a.attempt.requestId===domusInicioId_() &&
        a.attempt.by===principal && typeof a.attempt.startedAt==='string' && Number.isFinite(Date.parse(a.attempt.startedAt)) &&
        entry.values[1]==='registrarLimiteHistorico' && entry.values[2]===c.payloadHash && entry.values[3]===domusInicioDispositivo_() &&
        entry.values[4]==='COMPLETED' && j.data[1]==='registrarLimiteHistorico' && j.data[2]==='COMPLETED') {
      const b=historyBoundary_(m),r=b && b.result;
      if(r && r.boundaryId===domusInicioId_() && r.snapshotHash===domusInicioHuella_() && r.kind==='STAGING_FRESH_START_BOUNDARY' &&
          r.newCharge===0 && r.inventoryMovement===0 && r.resolved===false && r.financialFinal===false &&
          r.authorizedPrincipal===principal && r.authorizedRole==='GERENCIA') {
        out.status='ACTIVATED_VERIFIED';out.verified=true;out.newCharge=0;out.inventoryMovement=0;
      }
    }
    read.assertDimensions();if(store.getProperty(domusInicioClave_())!==raw)domusInicioFallo_('PROPERTY_CHANGED');return out;
  });
}
function domusInicioAprobar_(guard) {
  const principal=guard();
  return withLock_(CONFIG.lockTimeoutMs,function(){
    guard();const store=PropertiesService.getScriptProperties(),raw=store.getProperty(domusInicioClave_());
    if(raw!==null)return {ok:true,status:'EXISTING_PRESERVED',requestId:domusInicioId_(),valueSha256:domusRetencionAdminHuellaValor_(raw),verified:false};
    const c=domusInicioContrato_(domusInicioEntrada_());domusInicioRevalidar_(c);guard();
    const approval={version:1,mode:'STAGING_FRESH_START_V1',approved:true,snapshotHash:domusInicioHuella_(),
      approvalReference:c.input.approvalReference,backupSha256:c.backupSha256,confirmStationsHeld:true,confirmBackupVerified:true,
      confirmLegacyTestWriterDisabled:true,acceptUnattributedEffectsUnresolved:true,acknowledgeUnresolvedHistory:true,
      requestId:domusInicioId_(),deviceId:domusInicioDispositivo_(),payloadHash:c.payloadHash,recordedBy:principal,
      recordedAt:new Date().toISOString(),tool:'STAGING_FRESH_START_ADMIN_V1',attempt:null};
    const created=domusInicioPersistir_(store,null,approval);
    return {ok:true,status:'APPROVED_NOT_STARTED',requestId:domusInicioId_(),valueSha256:domusRetencionAdminHuellaValor_(created),verified:false};
  });
}
function domusInicioDispatch_(payload) {
  // Execution-local adapter only. Original snapshot function and every original
  // validator still run; the normal dispatcher owns auth, binding and journal.
  // This avoids V16's repeated remote reads after PROCESSING has been persisted.
  const original=historySnapshot_;
  historySnapshot_=function(m,p,id,allowDiagnostic){
    if(id!==domusInicioId_() || !_authContext || _authContext.requestId!==id || _authContext.role!=='GERENCIA' ||
        p.requestId!==id || p.snapshotHash!==domusInicioHuella_())domusInicioFallo_('ADAPTER_SCOPE');
    const read=domusInicioVista_(m),candidate=original(read.book,p,id,allowDiagnostic);read.assertDimensions();return candidate;
  };
  try {return executeDomusAction_('registrarLimiteHistorico',payload);}
  finally {historySnapshot_=original;}
}
function domusInicioActivar_(guard) {
  const principal=guard();
  return withLock_(CONFIG.lockTimeoutMs,function(){
    guard();const state=domusInicioInspeccionar_();
    if(state.verified)return state; // Verification only, never a second dispatcher call.
    if(state.status!=='APPROVED_NOT_STARTED')domusInicioFallo_('INSPECT_ONLY');
    const c=domusInicioContrato_(domusInicioEntrada_()),store=PropertiesService.getScriptProperties();
    const raw=store.getProperty(domusInicioClave_()),a=domusInicioLeerJson_(raw);
    if(!domusInicioAprobacionValida_(a,c,principal) || a.attempt!==null)domusInicioFallo_('APPROVAL_CONFLICT');
    domusInicioRevalidar_(c);guard();
    // Durable latch in the ONE approved key, before login or dispatcher. A crash,
    // timeout or auth failure cannot cause another automatic activation attempt.
    a.attempt={requestId:domusInicioId_(),startedAt:new Date().toISOString(),by:principal};
    const attempted=domusInicioPersistir_(store,raw,a);
    guard();if(store.getProperty(domusInicioClave_())!==attempted)domusInicioFallo_('PROPERTY_CHANGED');
    // Normal Google-identity Gerencia login. It creates its own normal ses: entry;
    // no credentials are invented or supplied, and the token never leaves here.
    const login=executeDomusAction_('authCrearSesion',{args:['GERENCIA','Staging activation'],role:'GERENCIA',deviceId:domusInicioDispositivo_()}).result;
    if(!login || typeof login.token!=='string' || !login.token.startsWith('DOMUS-SES-') || login.role!=='GERENCIA' ||
        login.principal!==principal || login.deviceId!==domusInicioDispositivo_())domusInicioFallo_('AUTH_FAILED_INSPECT_ONLY');
    guard();const result=domusInicioDispatch_({args:[c.payload],requestId:domusInicioId_(),deviceId:domusInicioDispositivo_(),role:'GERENCIA',sessionToken:login.token});
    if(!result || !result.result || result.result.boundaryId!==domusInicioId_() || result.result.snapshotHash!==domusInicioHuella_())domusInicioFallo_('ACK_UNCERTAIN_INSPECT_ONLY');
    const verified=domusInicioInspeccionar_();if(!verified.verified)domusInicioFallo_('VERIFY_FAILED_INSPECT_ONLY');return verified;
  });
}
