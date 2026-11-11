'use strict';
// Real client functions + real server dispatcher, synthetic memory only.
const assert=require('assert/strict');
const {setup}=require('./absent_recovery_regressions');
const {ui,copy,snapshot}=require('./unconfirmed_observation_regressions');
const {APPROVAL}=require('./audited_release_regressions');
const functions=['qaReleaseStorageSeal_','qaReleaseKeys_','qaReleaseLocked_','qaReleaseAppend_','qaReleaseRpc_','qaReleaseInput_','qaReleaseAck_','qaReleaseProposal_',
 'qaPrepareReleaseClient_','qaReleaseTicket_','qaReleaseEvidenceExact_','qaReleaseIntent_','qaReserveReleaseClient_','qaQueryReleaseClient_',
 'qaReleaseArchive_','qaCommitReleaseClient_','qaReleaseFinalState_','qaFinalizeReleaseClient_','qaActiveReleaseTicket_','qaRecoverAbsentClient_'];
let passed=0;async function test(n,f){await f();console.log('PASS',n);passed++;}
async function client(mode='EXISTING_ACK',options={}) {
 const b=options.backend || setup();if(!options.existing && mode==='EXISTING_ACK')b.call('turnoAbrir',copy(b.inputObserve.body),b.inputObserve.requestId,'CAJA');
 const t=await ui(b,options);for(const f of functions)t.load(f);const k=t.ctx.qaReleaseKeys_();
 if(!options.existing){const c=t.ctx.qaUnconfirmedCapture_();b.inputObserve.localEvidenceHash=await t.ctx.qaDigest_(c.seal);b.inputObserve.originalAttemptHash=await t.ctx.qaDigest_(c.attemptRaw);}
 t.calls=[];t.attachRelease=handler=>{t.ctx.window.google={script:{run:{withSuccessHandler:resolve=>({withFailureHandler:reject=>({dispatchNativeAction:p=>{
  t.calls.push(copy(p));Promise.resolve().then(()=>handler?handler(copy(p)):b.ctx.dispatchNativeAction(copy(p))).then(resolve,reject);
 }})})}}};};t.attachRelease();
 t.prepare=(mode='ACK')=>t.ctx.qaPrepareReleaseClient_(mode,t.consent());
 t.approve=async()=>{t.fresh=await t.prepare();const now=Date.now();t.approval={version:1,approved:true,approvalId:'SYNTHETIC-release-approval',approvedBy:'direccion@domusccc.net',approvalReference:'SYNTHETIC exact release',evidenceHash:t.fresh.proposal.evidenceHash,issuedAt:now,expiresAt:now+600000,confirmStationsHeld:true,confirmOldExecutionsTerminated:true,confirmIncompatibleWritersDisabled:true,confirmOnlyBoundStation:true,executorBarrierEvidenceHash:'d'.repeat(64)};b.props.set(APPROVAL,JSON.stringify(t.approval));return t.fresh;};
 t.reserve=()=>t.ctx.qaReserveReleaseClient_(t.fresh,{approvalId:t.approval.approvalId,confirmEvidenceHash:t.fresh.proposal.evidenceHash,confirmReserve:true});
 t.commit=()=>t.ctx.qaCommitReleaseClient_({approvalId:t.approval.approvalId,confirmEvidenceHash:t.fresh.proposal.evidenceHash,confirmArchive:true,confirmRelease:true});
 t.query=()=>t.ctx.qaQueryReleaseClient_();t.finalize=()=>t.ctx.qaFinalizeReleaseClient_({confirmFinalize:true});
 t.recover=async()=>{await t.observe();t.attachRelease();const fresh=await t.prepare('ABSENT');b.approve();const c={...t.consent(),fresh,approvalId:b.approval.approvalId,confirmEvidenceHash:fresh.proposal.evidenceHash,confirmPayloadHash:fresh.proposal.evidence.payloadHash,confirmSameId:true,confirmPotentialOpening:true};return t.ctx.qaRecoverAbsentClient_(c);};
 t.original=()=>Object.fromEntries(['hold','initial','settled','attempt','observation','recovery'].map(n=>[n,t.localStorage.getItem(k[n])]));
 t.active=()=>{t.ctx.STATE.operator=b.inputObserve.operator;return t.ctx.qaActiveReleaseTicket_({role:'CAJA',deviceId:b.inputObserve.deviceId,operator:b.inputObserve.operator});};
 return {t,b,k};
}
async function main(){
 for(const mode of ['EXISTING_ACK','RECOVERED_ACK'])await test(mode+': exact reserve/archive/commit/finalize retains original uncertainty and permits only ticket envelope',async()=>{
  const {t,b,k}=await client(mode);if(mode==='RECOVERED_ACK')await t.recover();const original=t.original(),books=snapshot(b),props=b.props.get('DOMUS_QA_ABSENT_RECOVERY_GATE_V1');
  await t.approve();const p=await t.reserve();assert.equal(p.state,'PREPARED');assert.equal(t.ctx.reviewReleaseDecision_().allowed,false);await assert.rejects(t.active());
  const r=await t.commit();assert.equal(r.state,'RELEASED_AUDITED');assert(t.localStorage.getItem(k.hold));assert.deepEqual(t.original(),original);await assert.rejects(t.active());
  await t.finalize();assert.equal(t.localStorage.getItem(k.hold),null);assert.equal(t.localStorage.getItem('domus_outbox'),'[]');assert.equal(t.localStorage.getItem(k.attempt),original.attempt);assert.equal(t.localStorage.getItem(k.observation),original.observation);assert.equal(t.localStorage.getItem(k.recovery),original.recovery);
  assert.equal(t.localStorage.getItem('domus_confirmation_'+b.inputObserve.requestId),null);assert.equal(JSON.parse(t.localStorage.getItem(k.attempt)).state,'UNCONFIRMED');assert.equal(await t.active(),r.ticketId);assert.equal(snapshot(b),books);assert.equal(b.props.get('DOMUS_QA_ABSENT_RECOVERY_GATE_V1'),props);
  const archive=JSON.parse(t.localStorage.getItem('domus_outbox_qa_release_archive_'+p.ticketId)),i=JSON.parse(archive.intentRaw);assert.deepEqual(copy(i.original),original);assert.equal(await t.ctx.qaDigest_(JSON.stringify(archive)),r.archiveHash);
  assert(!JSON.stringify([...t.localStorage.data]).includes(b.observationToken));assert(!t.calls.some(p=>['authCrearSesion','turnoAbrir','cajaSimpleRegistrar'].includes(p.action)));
  t.load('transport_');t.ctx.STATE.isNativeGas=true;t.ctx.google=t.ctx.window.google;delete t.ctx.window.DOMUS_OUTBOX_REVIEW_REQUESTED;
  assert.equal((await t.ctx.transport_({action:'turnoEstado',args:[],requestId:'SYNTHETIC-state',role:'CAJA',deviceId:b.inputObserve.deviceId,operator:b.inputObserve.operator,sessionToken:b.observationToken})).ok,true);assert.equal(t.calls.at(-1).qaReleaseTicketId,r.ticketId);
 });
 for(const mode of ['ABSENT','ACK'])await test('fresh '+mode+' proposal is read-only and neither approves nor persists',async()=>{
  const {t,b}=await client(mode==='ABSENT'?'ABSENT':'EXISTING_ACK'),before=JSON.stringify([...t.localStorage.data]),books=snapshot(b),props=JSON.stringify([...b.props]);const r=await t.prepare(mode);assert.equal(r.mode,mode);assert.equal(JSON.stringify([...t.localStorage.data]),before);assert.equal(snapshot(b),books);assert.equal(JSON.stringify([...b.props]),props);assert.equal(t.calls.length,1);
 });
 await test('observed ACK forbids absence UI preparation without sending a mutation or query',async()=>{const {t}=await client();await t.observe();t.attachRelease();await assert.rejects(t.prepare('ABSENT'),/ACK_EXISTS/);assert.equal(t.calls.length,0);});
 for(const variant of ['cancel','hash','approval','attempt','observation','recovery','queue','session'])await test('reserve refuses changed/unchecked input before mutation: '+variant,async()=>{
  const {t,k}=await client();await t.approve();const c={approvalId:t.approval.approvalId,confirmEvidenceHash:t.fresh.proposal.evidenceHash,confirmReserve:true};
  if(variant==='cancel')c.confirmReserve=false;if(variant==='hash')c.confirmEvidenceHash='0'.repeat(64);if(variant==='approval')c.approvalId='';if(variant==='attempt')t.localStorage.setItem(k.attempt,'{}');if(variant==='observation')t.localStorage.setItem(k.observation,'{}');if(variant==='recovery')t.localStorage.setItem(k.recovery,'{}');if(variant==='queue')t.localStorage.setItem('domus_outbox','[]');if(variant==='session')t.sessionStorage.removeItem('domus_session_token_CAJA');
  const before=JSON.stringify([...t.localStorage.data]);await assert.rejects(t.ctx.qaReserveReleaseClient_(t.fresh,c));assert.equal(t.calls.filter(p=>p.action==='reservarLiberacionQa').length,0);if(variant!=='session')assert.equal(JSON.stringify([...t.localStorage.data]),before);
 });
 for(const phase of ['reserve','commit'])for(const kind of ['lost','timeout','malformed','session-changed'])await test(phase+' '+kind+': read-only query resolves without mutation replay',async()=>{
  const {t,b,k}=await client();await t.approve();if(phase==='commit')await t.reserve();const original=t.original();let late,expire;
  if(kind==='timeout'){t.ctx.setTimeout=fn=>{expire=fn;return 1;};t.ctx.clearTimeout=()=>{};}
  t.attachRelease(p=>{const r=b.ctx.dispatchNativeAction(p);if(kind==='lost')throw Error('SYNTHETIC_LOST');if(kind==='timeout')return new Promise(resolve=>late=()=>resolve(r));if(kind==='malformed')r.data.extra='SYNTHETIC_SECRET';if(kind==='session-changed')t.sessionStorage.setItem('domus_session_token_CAJA','SYNTHETIC_OTHER');return r;});
  const pending=t[phase]();if(kind==='timeout'){while(!late)await new Promise(r=>setImmediate(r));expire();}await assert.rejects(pending);if(late){late();await new Promise(r=>setImmediate(r));}
  assert.deepEqual(t.original(),original);const count=t.calls.length;await assert.rejects(t[phase](),/ALREADY_SENT/);assert.equal(t.calls.length,count);
  t.ctx.setTimeout=setTimeout;t.ctx.clearTimeout=clearTimeout;t.sessionStorage.setItem('domus_session_token_CAJA',b.observationToken);t.attachRelease();const q=await t.query();assert.equal(q.state,phase==='reserve'?'PREPARED':'RELEASED_AUDITED');assert.deepEqual(t.original(),original);assert(t.localStorage.getItem(k.hold));assert.equal(t.calls.at(-1).action,'consultarLiberacionQa');
  if(phase==='commit')await t.finalize();assert(!JSON.stringify([...t.localStorage.data]).includes('SYNTHETIC_SECRET'));
 });
 for(const operation of ['reserve','commit','finalize'])for(const phase of ['before','after']) {
  const baseline=await client();await baseline.t.approve();if(operation!=='reserve')await baseline.t.reserve();if(operation==='finalize')await baseline.t.commit();let writes=0;const oldSet=baseline.t.localStorage.setItem,oldRemove=baseline.t.localStorage.removeItem;
  baseline.t.localStorage.setItem=(...a)=>{writes++;return oldSet(...a);};baseline.t.localStorage.removeItem=(...a)=>{writes++;return oldRemove(...a);};await baseline.t[operation]();
  for(let target=1;target<=writes;target++)await test(operation+' storage '+phase+' write '+target+' is preserved/resumable with no replay',async()=>{
   const {t,b,k}=await client();await t.approve();if(operation!=='reserve')await t.reserve();if(operation==='finalize')await t.commit();const original=t.localStorage.getItem(k.attempt);let n=0,hit=false;const set=t.localStorage.setItem,remove=t.localStorage.removeItem;
   const wrap=fn=>(...args)=>{if(++n===target){hit=true;if(phase==='after')fn(...args);throw Error('SYNTHETIC_QUOTA');}return fn(...args);};t.localStorage.setItem=wrap(set);t.localStorage.removeItem=wrap(remove);
   await assert.rejects(t[operation]());assert(hit);assert.equal(t.localStorage.getItem(k.attempt),original);assert.equal(t.localStorage.getItem('domus_confirmation_'+b.inputObserve.requestId),null);
   t.localStorage.setItem=set;t.localStorage.removeItem=remove;
   if(operation==='finalize'){await t.finalize();assert.equal(await t.active(),JSON.parse(t.localStorage.getItem(k.receipt)).ticketId);}
   else {assert(t.localStorage.getItem(k.hold));if(operation==='reserve' && t.localStorage.getItem(k.intent)!==null){await assert.rejects(t.reserve(),/ALREADY_SENT/);if(b.props.has('DOMUS_QA_AUDITED_RELEASE_V1'))await t.query();else await assert.rejects(t.query());}
    if(operation==='commit' && t.localStorage.getItem(k.commit)!==null){await assert.rejects(t.commit(),/ALREADY_SENT/);await t.query();}}
  });
 }
 for(const keyName of ['attempt','observation','recovery','intent','prepared','receipt','commit','archive','hold','initial','settled','queue','other-receipt','device'])await test('tamper after server release blocks finalization and preserves external change: '+keyName,async()=>{
  const {t,k}=await client();await t.approve();const p=await t.reserve();await t.commit();const key=keyName==='archive'?'domus_outbox_qa_release_archive_'+p.ticketId:keyName==='queue'?'domus_outbox':keyName==='other-receipt'?'domus_confirmation_external':keyName==='device'?'domus_device_id':k[keyName];
  t.localStorage.setItem(key,'SYNTHETIC_CHANGED');const before=JSON.stringify([...t.localStorage.data]);await assert.rejects(t.finalize());assert.equal(JSON.stringify([...t.localStorage.data]),before);await assert.rejects(t.active());
 });
 await test('two tabs reserve and finalize only once under shared Web Locks; reload does no RPC',async()=>{
  const locks=require('./mock_web_locks')(),a=await client('EXISTING_ACK',{locks});await a.t.approve();const z=await client('EXISTING_ACK',{locks,storage:a.t.localStorage,existing:true,backend:a.b});z.t.fresh=a.t.fresh;z.t.approval=a.t.approval;
  const r=await Promise.allSettled([a.t.reserve(),z.t.reserve()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(a.t.calls.concat(z.t.calls).filter(p=>p.action==='reservarLiberacionQa').length,1);
  await a.t.commit();await Promise.all([a.t.finalize(),z.t.finalize()]);assert.equal(await a.t.active(),await z.t.active());const before=a.t.calls.length+z.t.calls.length;await z.t.ctx.preserveOutboxForReview_();assert.equal(a.t.calls.length+z.t.calls.length,before);assert.equal(a.t.localStorage.getItem(a.k.hold),null);
 });
 for(const variant of ['PREPARED','uncommitted','incomplete','other-operator','other-device','other-role','wrong-build','changed-archive','original-requeued'])await test('unverified resolution cannot add operational envelope: '+variant,async()=>{
  const {t,k,b}=await client();await t.approve();const p=await t.reserve();if(variant!=='PREPARED')await t.commit();if(!['PREPARED','uncommitted'].includes(variant))await t.finalize();t.ctx.STATE.operator=b.inputObserve.operator;
  const payload={role:'CAJA',deviceId:b.inputObserve.deviceId,operator:b.inputObserve.operator};
  if(variant==='incomplete')t.localStorage.setItem(k.hold,'{}');if(variant==='other-operator')payload.operator='OTHER';if(variant==='other-device')payload.deviceId='OTHER';if(variant==='other-role')payload.role='BARRA';if(variant==='wrong-build')t.ctx.qaObservationExpectedSource_=()=> '0'.repeat(64);if(variant==='changed-archive')t.localStorage.setItem('domus_outbox_qa_release_archive_'+p.ticketId,'{}');if(variant==='original-requeued')t.localStorage.setItem('domus_outbox',JSON.stringify([{requestId:b.inputObserve.requestId}]));
  await assert.rejects(t.ctx.qaActiveReleaseTicket_(payload));
 });
 for(const variant of ['unchecked','cancelled','existing','absent','double-click'])await test('actual UI handlers are explicit, cancellation-safe and hold-preserving: '+variant,async()=>{
  const {t,b,k}=await client(variant==='absent'?'ABSENT':'EXISTING_ACK');
  const elements={};const element=id=>elements[id] || (elements[id]={hidden:true,disabled:false,checked:false,textContent:'',value:'',innerHTML:'',after(){},appendChild(){},replaceChildren(){}});
  t.ctx.document={readyState:'complete',body:element('body'),getElementById:element,createElement:()=>({innerHTML:'',after(){}})};
  t.ctx.window.addEventListener=()=>{};t.ctx.confirm=()=>variant!=='cancelled';t.ctx.reviewReturnUrl_=()=> 'https://synthetic.invalid/';
  t.load('qaMountReleaseUi_');const status=element('queueReviewStatus');t.ctx.qaMountReleaseUi_(status);
  assert.equal(t.calls.length,0);if(variant!=='unchecked')element('qaReleaseAttested').checked=true;
  if(variant==='absent'){await t.observe();t.attachRelease();await element('qaPrepareAbsent').onclick();b.approve();element('qaReleaseApproval').value=b.approval.approvalId;element('qaReleaseEvidence').value=b.recovery.confirmEvidenceHash;await element('qaRecoverAbsent').onclick();assert.equal(JSON.parse(t.localStorage.getItem(k.recovery)).state,'CONFIRMED_HELD');assert.equal(element('qaRecoverAbsent').disabled,true);}
  await element('qaPrepareAck').onclick();
  if(variant==='unchecked'){assert.equal(t.calls.length,0);return;}
  const proposal=b.invoke('prepararLiberacionQa'),now=Date.now();b.props.set(APPROVAL,JSON.stringify({version:1,approved:true,approvalId:'SYNTHETIC-ui-release',approvedBy:'direccion@domusccc.net',approvalReference:'SYNTHETIC UI fixture',evidenceHash:proposal.evidenceHash,issuedAt:now,expiresAt:now+600000,confirmStationsHeld:true,confirmOldExecutionsTerminated:true,confirmIncompatibleWritersDisabled:true,confirmOnlyBoundStation:true,executorBarrierEvidenceHash:'d'.repeat(64)}));
  element('qaReleaseApproval').value='SYNTHETIC-ui-release';element('qaReleaseEvidence').value=proposal.evidenceHash;
  const initial=t.localStorage.getItem(k.attempt);if(variant==='double-click')await Promise.all([element('qaReserveRelease').onclick(),element('qaReserveRelease').onclick()]);else await element('qaReserveRelease').onclick();
  if(variant==='cancelled'){assert.equal(t.localStorage.getItem(k.intent),null);assert(!t.calls.some(p=>p.action==='reservarLiberacionQa'));return;}
  assert.equal(t.calls.filter(p=>p.action==='reservarLiberacionQa').length,1);assert(t.localStorage.getItem(k.hold));assert.equal(element('qaReserveRelease').disabled,true);
  await element('qaCommitRelease').onclick();assert(t.localStorage.getItem(k.receipt));assert(t.localStorage.getItem(k.hold));await element('qaFinalizeRelease').onclick();assert.equal(t.localStorage.getItem(k.hold),null);assert.equal(t.localStorage.getItem(k.attempt),initial);assert(status.textContent.startsWith('Cierre auditado completado'));
 });
 for(const variant of ['extra','hash','ticket-id','ack-extra','bad-date','can-operate','financial-final','ttl-too-long'])await test('untrusted malformed ticket never persists: '+variant,async()=>{
  const {t,b,k}=await client();await t.approve();t.attachRelease(async p=>{const r=b.ctx.dispatchNativeAction(p),v=r.data;
   if(variant==='extra')v.secret='SYNTHETIC_SECRET';if(variant==='hash')v.receiptHash='0'.repeat(64);if(variant==='ticket-id')v.ticketId='0'.repeat(64);if(variant==='ack-extra')v.ack.data.secret='SYNTHETIC_SECRET';if(variant==='bad-date')v.preparedAt='2026-11-11';if(variant==='can-operate')v.canOperate=true;if(variant==='financial-final')v.financialFinal=true;if(variant==='ttl-too-long')v.expiresAt=Date.parse(v.preparedAt)+600001;
   if(variant!=='hash'){const unsigned=copy(v);delete unsigned.receiptHash;v.receiptHash=await t.ctx.qaDigest_(unsigned);}return r;});
  await assert.rejects(t.reserve());assert.equal(t.localStorage.getItem(k.prepared),null);assert(t.localStorage.getItem(k.hold));assert(!JSON.stringify([...t.localStorage.data]).includes('SYNTHETIC_SECRET'));
 });
 for(const offset of [0,1])await test('rehashed commit timestamp at/after expiry is refused: '+offset,async()=>{
  const {t,b,k}=await client();await t.approve();await t.reserve();t.attachRelease(async p=>{const r=b.ctx.dispatchNativeAction(p),v=r.data;v.committedAt=new Date(v.expiresAt+offset).toISOString();const unsigned=copy(v);delete unsigned.receiptHash;v.receiptHash=await t.ctx.qaDigest_(unsigned);return r;});
  await assert.rejects(t.commit(),/TICKET_STATE_INVALID/);assert.equal(t.localStorage.getItem(k.receipt),null);assert(t.localStorage.getItem(k.hold));assert(t.localStorage.getItem(k.commit));await assert.rejects(t.commit(),/ALREADY_SENT/);
 });
 await test('finalization fails if cleanup occurs out of order even with exact values',async()=>{
  const {t,k}=await client();await t.approve();await t.reserve();await t.commit();t.localStorage.removeItem(k.initial);const before=JSON.stringify([...t.localStorage.data]);await assert.rejects(t.finalize(),/EXACT_PREFIX/);assert.equal(JSON.stringify([...t.localStorage.data]),before);
 });
 await test('unrelated local keys remain byte-for-byte intact across release',async()=>{
  const {t}=await client();t.localStorage.setItem('synthetic-unrelated-intention','SYNTHETIC_BYTES');await t.approve();await t.reserve();await t.commit();await t.finalize();assert.equal(t.localStorage.getItem('synthetic-unrelated-intention'),'SYNTHETIC_BYTES');
 });
 for(const target of [1,2,3,4,5,6])await test('archive mutation during finalization digest '+target+' is caught before hold removal',async()=>{
  const {t,k}=await client();await t.approve();const p=await t.reserve();await t.commit();const old=t.ctx.qaDigest_;let n=0,hit=false;
  t.ctx.qaDigest_=async v=>{const h=await old(v);if(v?.kind==='QA_AUDITED_RELEASE_TICKET_V1' && v.state==='RELEASED_AUDITED' && ++n===target){hit=true;t.localStorage.setItem('domus_outbox_qa_release_archive_'+p.ticketId,'SYNTHETIC_RACE');}return h;};
  await assert.rejects(t.finalize(),/CONTEXT_CHANGED/);assert(hit);assert(t.localStorage.getItem(k.hold));
 });
 for(const name of ['intent','prepared','receipt','commit','resolution','archive','attempt','observation','recovery'])await test('active ticket digest race preserves fail-closed proof: '+name,async()=>{
  const {t,k}=await client();await t.approve();const p=await t.reserve();await t.commit();await t.finalize();const key=name==='archive'?'domus_outbox_qa_release_archive_'+p.ticketId:k[name],old=t.ctx.qaDigest_;let hit=false;
  t.ctx.qaDigest_=async v=>{const h=await old(v);if(v?.kind==='QA_AUDITED_RELEASE_TICKET_V1' && v.state==='RELEASED_AUDITED'){hit=true;t.localStorage.setItem(key,'SYNTHETIC_RACE');}return h;};
  await assert.rejects(t.active(),/CONTEXT_CHANGED/);assert(hit);
 });
 await test('queue change during proposal digest cannot be absorbed into reservation evidence',async()=>{
  const {t,k}=await client();await t.approve();const old=t.ctx.qaDigest_;let hit=false;
  t.ctx.qaDigest_=async v=>{const h=await old(v);if(v?.protocol==='QA_AUDITED_RELEASE_V1'){hit=true;t.localStorage.setItem('domus_outbox','[]');}return h;};
  await assert.rejects(t.reserve());assert(hit);assert.equal(t.localStorage.getItem(k.intent),null);assert(!t.calls.some(p=>p.action==='reservarLiberacionQa'));
 });
 await test('transport checks the proof again after the active-ticket asynchronous return',async()=>{
  const {t,k,b}=await client();await t.approve();await t.reserve();await t.commit();await t.finalize();t.ctx.STATE.operator=b.inputObserve.operator;delete t.ctx.window.DOMUS_OUTBOX_REVIEW_REQUESTED;
  const active=t.ctx.qaActiveReleaseTicket_;t.ctx.qaActiveReleaseTicket_=async(...a)=>{const ticket=await active(...a);t.localStorage.setItem(k.receipt,'SYNTHETIC_RACE');return ticket;};
  t.load('transport_');t.ctx.STATE.isNativeGas=true;t.ctx.google=t.ctx.window.google;const before=t.calls.length;
  await assert.rejects(t.ctx.transport_({action:'turnoEstado',args:[],role:'CAJA',deviceId:b.inputObserve.deviceId,operator:b.inputObserve.operator,sessionToken:b.observationToken}),/CONTEXT_CHANGED/);assert.equal(t.calls.length,before);
 });
 await test('nullable eventId in a structurally valid project scope does not reject the ACK',async()=>{
  const {t,b}=await client(),ack=copy(b.inspect().ack),item=t.ctx.qaUnconfirmedCapture_().candidate.item;ack.data.scope.eventId=null;ack.data.scope.eventName='';assert.equal(t.ctx.qaReleaseAck_(ack,item),ack);
 });
 await test('private evidence download includes complete v4 archive/receipt before and after cleanup without session tokens',async()=>{
  const {t,b,k}=await client('RECOVERED_ACK');await t.recover();const original=t.original();await t.approve();const p=await t.reserve();await t.commit();
  t.load('downloadOutboxEvidence_');let blob;t.ctx.Blob=Blob;t.ctx.URL={createObjectURL:b=>{blob=b;return 'blob:synthetic';},revokeObjectURL(){}};t.ctx.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};t.ctx.setTimeout=()=>1;
  for(const finalized of [false,true]){if(finalized)await t.finalize();t.ctx.downloadOutboxEvidence_();const raw=await blob.text(),e=JSON.parse(raw);const archive=JSON.parse(e.archives['domus_outbox_qa_release_archive_'+p.ticketId]);assert.deepEqual(JSON.parse(archive.intentRaw).original,original);
   for(const name of ['intent','prepared','commit','receipt','recovery'])assert.equal(e.archives[k[name]],t.localStorage.getItem(k[name]));if(finalized)assert.equal(e.archives[k.resolution],t.localStorage.getItem(k.resolution));assert.equal(e.recoveryRaw,original.attempt);assert(!raw.includes(b.observationToken));}
 });
 console.log(JSON.stringify({suite:'audited-release-client',passed,realOperations:0,deployments:0,automaticRetries:0,browserExecuted:false}));
}
module.exports={client,functions};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
