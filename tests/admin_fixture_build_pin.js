'use strict';
// TEST ONLY. Never writes a source file or changes a real administrative pin.
// Preserve the real denial for new builds, then inject the new test-runtime hash
// only into this VM so old administrative invariants remain exercised.
const assert=require('assert/strict'),vm=require('vm');
module.exports=function loadSyntheticAdmin(ctx,source){
 const sha=vm.runInContext('BACKEND_BUILD.sourceSha256',ctx);
 vm.runInContext(source,ctx,{filename:'StagingRetentionApproval.gs'});
 if(!source.includes("'"+sha+"'")){
  assert.throws(()=>ctx.domusRetencionAdminIdentidad_(),/RETENTION_ADMIN_BUILD_UNREVIEWED/,'unmodified helper must reject the new runtime');
  const old='f24d94ffa387680b000b26c79e262c31fabda499231ddae7880fb6af200a31b1';
  assert.equal(source.split(old).length,2,'expected exactly one old allowlist pin');
  vm.runInContext(source.replace(old,sha),ctx,{filename:'SYNTHETIC_TEST_ONLY_admin_pin.gs'});
 }
};
