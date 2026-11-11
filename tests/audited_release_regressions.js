'use strict';
// Real dispatcher + modules/bundle, synthetic memory only. No Google or browser.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {setup,business,instrument}=require('./absent_recovery_regressions');
const {snapshot,copy}=require('./unconfirmed_observation_regressions');
const KEY='DOMUS_QA_AUDITED_RELEASE_V1',APPROVAL='DOMUS_QA_AUDITED_RELEASE_APPROVAL_V1',GATE='DOMUS_QA_ABSENT_RECOVERY_GATE_V1';
let passed=0;async function test(n,f){await f();console.log('PASS',n);passed++;}
function releaseSetup(mode='EXISTING_ACK',env){
 const b=setup(env);
 if(mode==='RECOVERED_ACK'){b.approve();b.recover();}else b.call('turnoAbrir',copy(b.inputObserve.body),b.inputObserve.requestId,'CAJA');
 b.releaseProposal=()=>b.invoke('prepararLiberacionQa');
 b.releaseApprove=()=>{const p=b.releaseProposal(),now=Date.now();b.releaseApproval={version:1,approved:true,approvalId:'SYNTHETIC-release-approval',approvedBy:'direccion@domusccc.net',approvalReference:'SYNTHETIC scoped release',evidenceHash:p.evidenceHash,issuedAt:now,expiresAt:now+600000,confirmStationsHeld:true,confirmOldExecutionsTerminated:true,confirmIncompatibleWritersDisabled:true,confirmOnlyBoundStation:true,executorBarrierEvidenceHash:'d'.repeat(64)};b.props.set(APPROVAL,JSON.stringify(b.releaseApproval));b.releaseInput={...copy(b.inputObserve),approvalId:b.releaseApproval.approvalId,confirmEvidenceHash:p.evidenceHash,confirmReserve:true};return p;};
 b.reserve=()=>{b.ticket=b.invoke('reservarLiberacionQa',b.releaseInput);return b.ticket;};
 b.commitInput=()=>({...copy(b.releaseInput),ticketId:b.ticket.ticketId,archiveHash:'e'.repeat(64),confirmArchive:true,confirmRelease:true});
 b.commit=()=>b.invoke('confirmarLiberacionQa',b.commitInput());
 b.query=()=>b.invoke('consultarLiberacionQa',b.releaseInput);
 b.operate=(extra={})=>b.ctx.executeDomusAction_('turnoEstado',{args:[],requestId:'SYNTHETIC-read-state',role:'CAJA',deviceId:b.inputObserve.deviceId,sessionToken:b.observationToken,qaReleaseTicketId:b.ticket?.ticketId,...extra}).result;
 return b;
}
function advance(b,ms){const D=b.ctx.Date;b.ctx.Date=class extends D {constructor(...a){super(...(a.length?a:[D.now()+ms]));}static now(){return D.now()+ms;}};}
function forbidSheets(b){
 for(const n of ['turnoAbrir','qaRecoverAbsentOpening_','idempotentExecute_','journalCommit_','journalResume_','saveRequestRecord_'])b.ctx[n]=()=>assert.fail('forbidden helper '+n);
 for(const book of [b.main,b.ops])for(const sheet of book.sheets.values()){const get=sheet.getRange.bind(sheet);sheet.getRange=(...a)=>{const r=get(...a);r.setValues=r.setValue=()=>assert.fail('sheet write');return r;};sheet.appendRow=()=>assert.fail('append');}
 b.ctx.SpreadsheetApp.flush=()=>assert.fail('flush');
}
async function main(){
 for(const env of [undefined,'STAGING'])for(const mode of ['EXISTING_ACK','RECOVERED_ACK'])await test((env||'modules')+' '+mode+': release writes only two properties, original ACK/gate/business preserved',()=>{
  const b=releaseSetup(mode,env),before=snapshot(b),gate=b.props.get(GATE);forbidSheets(b);const p=b.releaseApprove(),track=instrument(b);assert.equal(p.evidence.mode,mode);
  const ticket=b.reserve();assert.equal(ticket.state,'PREPARED');assert.equal(ticket.canOperate,false);assert.throws(()=>b.operate(),/GATE_HELD/);
  const receipt=b.commit();assert.equal(receipt.state,'RELEASED_AUDITED');assert.equal(receipt.canOperate,true);assert.equal(receipt.archiveHash,'e'.repeat(64));assert.equal(receipt.financialFinal,false);
  const unsigned=copy(receipt);delete unsigned.receiptHash;assert.equal(b.ctx.historyHash_(unsigned),receipt.receiptHash);assert.equal(snapshot(b),before);assert.equal(b.props.get(GATE),gate);
  assert.deepEqual(track.actions,['property:'+KEY,'property:'+KEY]);assert.equal(b.query().receiptHash,receipt.receiptHash);assert.equal(b.operate().active.status,'OPEN');
  assert.throws(()=>b.invoke('turnoEstado'),/GATE_HELD/);assert.throws(()=>b.reserve(),/QUERY_ONLY/);assert.throws(()=>b.commit(),/QUERY_ONLY/);assert.equal(snapshot(b),before);
 });
 await test('absent source cannot prepare/reserve or release; zero opening replay',()=>{
  const b=setup(),before=snapshot(b);forbidSheets(b);for(const action of ['prepararLiberacionQa','reservarLiberacionQa','confirmarLiberacionQa','consultarLiberacionQa'])assert.throws(()=>b.invoke(action));assert.equal(snapshot(b),before);assert(!b.props.has(KEY));
 });
 for(const variant of ['missing','expired','future','long','manager','evidence','held','terminated','writers','station','barrier','extra','consent'])await test('reservation requires specific current authorization: '+variant,()=>{
  const b=releaseSetup();b.releaseApprove();const a=copy(b.releaseApproval);if(variant==='missing')b.props.delete(APPROVAL);else{
   if(variant==='expired')a.expiresAt=Date.now()-1;if(variant==='future')a.issuedAt=Date.now()+10000;if(variant==='long')a.expiresAt=a.issuedAt+600001;if(variant==='manager')a.approvedBy='OTHER';if(variant==='evidence')a.evidenceHash='0'.repeat(64);if(variant==='held')a.confirmStationsHeld=false;if(variant==='terminated')a.confirmOldExecutionsTerminated=false;if(variant==='writers')a.confirmIncompatibleWritersDisabled=false;if(variant==='station')a.confirmOnlyBoundStation=false;if(variant==='barrier')a.executorBarrierEvidenceHash='invalid';if(variant==='extra')a.extra=true;b.props.set(APPROVAL,JSON.stringify(a));}
  if(variant==='consent')b.releaseInput.confirmReserve=false;const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.reserve());assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 for(const variant of ['approval','session','clock-expire','clock-rollback','policy','business','request','journal','gate','attempt','device','body','operator','build','evidence','archive','consent','ticket'])await test('mutation after reservation fails closed: '+variant,()=>{
  const b=releaseSetup('RECOVERED_ACK');b.releaseApprove();b.reserve();const input=b.commitInput();
  if(variant==='approval')b.props.delete(APPROVAL);if(variant==='session')b.props.delete('ses:'+b.observationToken);if(variant==='clock-expire')advance(b,600001);if(variant==='clock-rollback')advance(b,-10000);
  if(variant==='policy')b.props.set('DOMUS_JOURNEY_POLICY_V1','{}');if(variant==='business')b.main.getSheetByName('COBROS').put(8,2,'SYNTHETIC-EXTERNAL');if(variant==='request')b.s.put(b.entry().row,4,'OTHER');if(variant==='journal')b.main.getSheetByName('DOMUS_JOURNAL').put(b.plan().row,3,'PREPARED');if(variant==='gate')b.props.delete(GATE);
  if(variant==='attempt')input.originalAttemptHash='0'.repeat(64);if(variant==='device')input.deviceId='OTHER';if(variant==='body')input.body.scopeId='OTHER';if(variant==='operator')input.operator='OTHER';if(variant==='build')input.expectedSourceSha256='0'.repeat(64);if(variant==='evidence')input.confirmEvidenceHash='0'.repeat(64);if(variant==='archive')input.archiveHash='invalid';if(variant==='consent')input.confirmRelease=false;if(variant==='ticket')input.ticketId='0'.repeat(64);
  const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.invoke('confirmarLiberacionQa',input));assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);assert.equal(JSON.parse(b.props.get(KEY)).state,'PREPARED');
 });
 for(const action of ['reserve','commit'])for(const phase of ['before','after'])await test(action+' property '+phase+' failure never sends an opening and resolves only by query',()=>{
  const b=releaseSetup();b.releaseApprove();if(action==='commit')b.reserve();const before=snapshot(b);let fired=false;instrument(b,e=>{if(!fired && e.phase===phase && e.name==='property:'+KEY){fired=true;throw Error('SYNTHETIC_FAILURE');}});
  assert.throws(()=>b[action](),/SYNTHETIC_FAILURE/);assert(fired);assert.equal(snapshot(b),before);
  if(action==='reserve' && phase==='before'){assert(!b.props.has(KEY));assert.throws(()=>b.query(),/NOT_OBSERVED/);}else {const r=b.query();assert.equal(r.state,action==='commit' && phase==='after'?'RELEASED_AUDITED':'PREPARED');}
 });
 for(const state of ['PREPARED','RELEASED_AUDITED'])for(const variant of ['bad-json','extra','hash','state','ticket','ack','time','archive'])await test('corrupt '+state+' barrier never grants traffic: '+variant,()=>{
  const b=releaseSetup();b.releaseApprove();b.reserve();if(state==='RELEASED_AUDITED')b.commit();const r=JSON.parse(b.props.get(KEY));let raw;
  if(variant==='bad-json')raw='{"';else {if(variant==='extra')r.extra=true;if(variant==='hash')r.recordHash='0'.repeat(64);if(variant==='state')r.state='UNKNOWN';if(variant==='ticket')r.ticketId='0'.repeat(64);if(variant==='ack')r.ack.data.openingFloat=70;if(variant==='time')r.preparedAt='invalid';if(variant==='archive')r.archiveHash=state==='PREPARED'?'e'.repeat(64):null;raw=JSON.stringify(r);}
  b.props.set(KEY,raw);const before=snapshot(b);assert.throws(()=>b.operate());assert.throws(()=>b.query());assert.equal(snapshot(b),before);
 });
 for(const variant of ['missing-ticket','wrong-ticket','other-operator','other-principal','other-device','other-role','changed-gate','missing-gate','new-build'])await test('release grants only bound identity and paired client: '+variant,()=>{
  const b=releaseSetup('RECOVERED_ACK');b.releaseApprove();b.reserve();b.commit();const extra={};
  if(variant==='missing-ticket')extra.qaReleaseTicketId=undefined;if(variant==='wrong-ticket')extra.qaReleaseTicketId='0'.repeat(64);
  if(variant==='other-operator' || variant==='other-principal' || variant==='other-device'){const s=JSON.parse(b.props.get('ses:'+b.observationToken));s[variant.slice(6)==='device'?'deviceId':variant.slice(6)]='OTHER';const raw=JSON.stringify(s);b.props.set('ses:'+b.observationToken,raw);b.ctx.CacheService.getScriptCache().put('ses:'+b.observationToken,raw);if(variant==='other-device')extra.deviceId='OTHER';}
  if(variant==='other-role')extra.role='BARRA';if(variant==='changed-gate')b.props.set(GATE,'{}');if(variant==='missing-gate')b.props.delete(GATE);if(variant==='new-build'){const ctx=vm.createContext({...b.ctx});const source=fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_STAGING_BUNDLE.gs'),'utf8').replace(/sourceSha256": "[a-f0-9]+"/,'sourceSha256": "'+'0'.repeat(64)+'"');vm.runInContext(source,ctx);b.ctx=ctx;}
  const before=snapshot(b);assert.throws(()=>b.operate(extra));assert.equal(snapshot(b),before);
 });
 await test('two separate contexts contend for reservation and commit using the same script lock',()=>{
  const b=releaseSetup(undefined,'STAGING');b.releaseApprove();const ctx=vm.createContext({...b.ctx});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../google-apps-script/DOMUS_STAGING_BUNDLE.gs'),'utf8'),ctx);let probes=0;
  const peer=(action,input)=>ctx.executeDomusAction_(action,{args:[copy(input)],requestId:input.requestId,role:'CAJA',deviceId:input.deviceId,sessionToken:b.observationToken}).result;
  instrument(b,e=>{if(e.phase==='after'){assert.throws(()=>peer('reservarLiberacionQa',b.releaseInput),/otra transacción/);assert.throws(()=>peer('confirmarLiberacionQa',b.ticket?b.commitInput():b.releaseInput),/otra transacción/);probes+=2;}});
  b.reserve();b.commit();assert.equal(probes,4);assert.throws(()=>peer('reservarLiberacionQa',b.releaseInput),/QUERY_ONLY/);assert.throws(()=>peer('confirmarLiberacionQa',b.commitInput()),/QUERY_ONLY/);assert.equal(peer('consultarLiberacionQa',b.releaseInput).state,'RELEASED_AUDITED');
 });
 await test('revocation during last full inventory prevents reservation',()=>{
  const b=releaseSetup();b.releaseApprove();const old=b.ctx.qaRecoveryInventory_;let n=0;b.ctx.qaRecoveryInventory_=(...args)=>{const r=old(...args);if(++n===2)b.props.delete(APPROVAL);return r;};assert.throws(()=>b.reserve());assert(!b.props.has(KEY));
 });
 await test('reserved-but-expired ticket remains held and read-only inspectable',()=>{
  const b=releaseSetup();b.releaseApprove();b.reserve();advance(b,600001);assert.throws(()=>b.commit());assert.equal(b.query().state,'PREPARED');assert.throws(()=>b.operate());
 });
 for(const committed of [false,true])await test('read scope never exempts mutation guard, committed='+committed,()=>{const b=releaseSetup();b.releaseApprove();b.reserve();if(committed)b.commit();assert.throws(()=>b.ctx.qaRecoveryReadScope_(b.inputObserve.requestId,()=>b.ctx.qaRecoveryOperationalGuard_(true)),/GATE_HELD/);});
 for(const variant of ['environment','project','main','ops'])await test('destination mismatch never opens any unintended book: '+variant,()=>{
  const b=releaseSetup();b.releaseApprove();if(variant==='environment')b.props.set('DOMUS_ENV','PRODUCTION');if(variant==='project')b.ctx.ScriptApp.getScriptId=()=> 'OTHER_PROJECT';if(variant==='main')b.main.id='OTHER_BOOK';if(variant==='ops')b.ops.id='OTHER_BOOK';const before=snapshot(b),props=JSON.stringify([...b.props]);assert.throws(()=>b.reserve());assert.equal(snapshot(b),before);assert.equal(JSON.stringify([...b.props]),props);
 });
 await test('oversized persisted property is rejected instead of relying on Google partial outcomes',()=>{const b=releaseSetup();assert.throws(()=>b.ctx.qaReleaseRecord_('x'.repeat(8501)),/TOO_LARGE/);});
 await test('gate from older build is explicitly unsupported and remains unchanged',()=>{const b=releaseSetup('RECOVERED_ACK'),g=JSON.parse(b.props.get(GATE));g.backendSourceSha256='721a07e65d98b2ef9c55a36904ea349b249dab4dea41e5b3a7985c87a1df2a36';const raw=b.ctx.qaRecoverySealGate_(g);b.props.set(GATE,raw);assert.throws(()=>b.releaseProposal(),/GATE_CHANGED/);assert.equal(b.props.get(GATE),raw);assert(!b.props.has(KEY));});
 await test('production bundle rejects all release routes without opening any spreadsheet or writing properties',()=>{
  const b=require('./staging_uncertain_retention_regressions').fixture('PRODUCTION'),token=b.login('CAJA');let opened=0;b.ctx.SpreadsheetApp.openById=()=>{opened++;throw Error('UNEXPECTED_OPEN');};
  const build=require('../release-manifest.json').build.sourceSha256,input={action:'turnoAbrir',requestId:'SYNTHETIC-prohibited',body:{id:'SYNTHETIC-prohibited',requestId:'SYNTHETIC-prohibited',scopeId:'QA',openingFloat:0,historyBoundaryId:'SYNTHETIC-boundary'},deviceId:'fixture-device',operator:'QA operator',localEvidenceHash:'a'.repeat(64),originalAttemptHash:'b'.repeat(64),expectedSourceSha256:build,confirmReserve:true};
  const props=JSON.stringify([...b.props]);for(const action of ['prepararLiberacionQa','reservarLiberacionQa','consultarLiberacionQa','confirmarLiberacionQa'])assert.throws(()=>b.ctx.executeDomusAction_(action,{args:[copy(input)],requestId:input.requestId,role:'CAJA',deviceId:input.deviceId,sessionToken:token}));assert.equal(opened,0);assert.equal(JSON.stringify([...b.props]),props);
 });
 for(const mode of ['EXISTING_ACK','RECOVERED_ACK'])await test(mode+': a separate synthetic $70 sale after release binds once, older envelope rejected',()=>{
  const b=releaseSetup(mode);b.main.getSheetByName('CATALOGO').put(7,3,70);b.main.getSheetByName('CATALOGO').put(7,17,70);b.releaseApprove();b.reserve();b.commit();
  const p=b.sale({id:'SYNTHETIC-release-sale70',requestId:'SYNTHETIC-release-sale70',openingRequestId:b.inputObserve.requestId,expectedTotal:70,received:70,historyBoundaryId:b.inputObserve.body.historyBoundaryId});
  const envelope={args:[copy(p)],requestId:p.id,role:'CAJA',deviceId:b.inputObserve.deviceId,sessionToken:b.observationToken,qaReleaseTicketId:b.ticket.ticketId};
  const before=snapshot(b);assert.throws(()=>b.ctx.executeDomusAction_('cajaSimpleRegistrar',{...envelope,qaReleaseTicketId:undefined}),/GATE_HELD/);assert.equal(snapshot(b),before);
  const first=b.ctx.executeDomusAction_('cajaSimpleRegistrar',copy(envelope)).result,after=snapshot(b);assert.equal(first.total,70);assert.equal(first.journey.openingRequestId,b.inputObserve.requestId);
  assert.deepEqual(b.ctx.executeDomusAction_('cajaSimpleRegistrar',copy(envelope)).result,first);assert.equal(snapshot(b),after);assert.equal(b.query().state,'RELEASED_AUDITED');
 });
 console.log(JSON.stringify({suite:'audited-release',passed,realOperations:0,deployments:0}));
}
module.exports={releaseSetup,KEY,APPROVAL};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
