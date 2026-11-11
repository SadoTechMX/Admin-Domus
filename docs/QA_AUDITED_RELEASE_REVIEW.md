# QA audited reconciliation and release (isolated candidate)

Status: development copy only, based on db6805886538cd5f59506b17dd04747f4ca57695. No publication, installation, production access, real opening or retry is authorized by this file. All recorded test data is synthetic.

## Two entry paths

1. A fresh authenticated query finds a unique durable ACK for the original opening: do not invoke absent recovery, turnoAbrir, generic idempotency or journal replay. Proceed directly to a fresh release proposal.
2. No durable ACK is observed: absence alone does not prove no effects. The separate absent recovery protocol requires explicit same-ID/body approval, inventory and boundary matching, and an independently verified barrier against late and incompatible writers. It may create the original zero-float opening once. A fresh matching ACK must then be prepared for a separate release approval.

Partial, orphaned, conflicting or provisional records stop both paths. A gate produced by an older source hash is deliberately unsupported; no implicit migration or alteration of its provenance is provided.

## Release protocol

- Proposal is read-only and cannot release anything.
- Gerencia authorizes an exact evidence hash and a single bound station. The private property DOMUS_QA_AUDITED_RELEASE_APPROVAL_V1 must contain the reviewed schema, an approved manager identity, external barrier evidence and a window of no more than ten minutes. There is no public setter and no generic administrative bypass. Deployment alone does not install an approval.
- Explicit reservation under the script lock creates PREPARED in DOMUS_QA_AUDITED_RELEASE_V1. This is an administrative write and retains the operational block. It does not touch business, REQUESTS or journal rows.
- The reviewed client archives original raw local evidence under traffic/store locks, reads it back, hashes it and persists a separate commit intent before sending one explicit commit.
- Commit revalidates the bound session, original ACK, inventory, policy, boundary, build, approval and gate under the lock. It updates only the release property to RELEASED_AUDITED, retaining provenance and archive hash. The original recovery gate is never deleted or edited.
- Client finalization requires exact archive, ticket and receipt, then removes only the exact singleton from the active queue and the corresponding active review snapshots/hold. Original UNCONFIRMED attempt, separate observation/recovery records, archive and receipt are preserved. Other intents or changed evidence block cleanup.
- The normal transport attaches qaReleaseTicketId only after local finalization validation. Server guards also require the exact authenticated CAJA device, operator, principal and paired source hash. Other stations and older clients lacking the envelope remain blocked. Release does not automatically open, sell, print or resolve historical financial uncertainty.

## Lost responses and blocked states

A sent reserve or commit is never automatically replayed. Only explicit read-only ticket query may retrieve a completed result. Late responses cannot update a timed-out client attempt. A missing ticket, expired PREPARED ticket, rejected/uncertain commit that remains PREPARED, corrupt property, changed archive, changed queue, or changed authority stays blocked and requires another reviewed administrative procedure. There is no reset/delete/fake-confirmation shortcut in this candidate.

Finalization is resumable only from exact validated prefixes. A server receipt is evidence of release, not evidence that the journey remains open indefinitely; operational boot must fetch current context.

## Limits and prerequisites

- Google Sheets, Script Properties and browser storage are not one ACID transaction. Lock protection applies only to cooperating writers in the same Apps Script project. Old deployments, other projects, manual editors and already pending remote writes must be stopped/verified outside this protocol. A boolean or hash records an attestation, not proof that they stopped.
- localStorage is append-only by this code, not physically immutable. It can be removed or altered by browser users/extensions or noncooperating code. Export and retain a private external copy before any authorized real recovery.
- Server clock and administrative property integrity are trusted platform inputs. There is no recovery from an administrator deleting the release property. No supported endpoint performs such deletion.
- Full inventory scans are bounded at four million populated cells per book. Real Google latency/memory and six-minute timeouts have not been measured by synthetic tests. No performance guarantee is made.
- Property records are capped at 8500 UTF-8 bytes before writes. Readback uncertainty never authorizes local activation.
- Browser tests are prepared for the existing read-only GitHub Actions workflow. They have not been run here: Chromium was blocked by the execution environment. No alternate browser route, iMac access, sandbox weakening or remote CI was attempted.
- Repository publication of the complete changed-file set, exact-SHA CI, staging installation of the paired staging backend and Index, configuration of exact approvals and any real opening/payment test require their applicable authorizations separately. The production bundle is regenerated only for repository/build parity and must not be installed in production.
- A future $70 test is a separate financial/operational action. This release does not authorize it. Before any such test, verify current authenticated journey, period, intended item/method, synthetic destination and printing/drawer isolation with the operator.

See QA_RELEASE_PROTOCOL_V4.md for the exact route/record contract. Validation summary and hashes accompany the final local artifact; no earlier test count or source hash certifies a later edit.

## Operational boundary after release

This candidate grants only the original CAJA identity/device. It is not authorization to reopen every club station. BARRA/KDS mutations and GERENCIA actions from other identities remain blocked by the global ticket gate; expanding that scope requires a separately reviewed policy. The synthetic $70 checks demonstrate one guarded sale and same-ID deduplication, not full delivery/cut or live financial certification.

The preserved review flow requires an existing authenticated CAJA session for the original actor/device. Config currently limits sessions to twelve hours. This flow never renews or creates a session automatically. If it is expired or missing, stop: a separately permitted reauthentication path that preserves the hold is still needed before live use. Do not clear the hold or fabricate a session to proceed.

The opening-read-scope fixture compares cached versus physical-book execution using the same current preflight helper. It tests consistency and read reduction, not independently proven equivalence with all historical implementations. Optional legacy-bundle cases were not run unless explicitly recorded in the validation summary.
