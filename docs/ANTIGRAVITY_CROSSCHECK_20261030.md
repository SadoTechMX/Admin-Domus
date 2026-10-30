# DOMUS repair coordination — 30 October 2026

**NO-GO for production. Identity verification is not functional acceptance.**

This reconciliation uses GitHub branches/documents and authenticated read-only Apps Script observations. It does not claim a conversation with Antigravity's IDE; no direct IDE connector is available.

## Code and parallel work

| Source | Observed state | Integration decision |
|---|---|---|
| `main` | `ebf5697a4f5cd5cae281e51ecd1c0857c7e4c30b` | Production unchanged. |
| PR #18 / `repair/qa-20261030` | Draft candidate, previously verified commit `d0ce047b389ad32ca229e10393c5793992eaa1b8`; no discussion comments at cross-check | Continue isolated repair; no merge. |
| `stabilization/backend-v1` handoff | Names old baseline `5dd47ab` and frozen production | Preserve invariants; written percentages are not fresh deployment evidence. |
| PR #13 / `arch/domus-erp-v15-antigravity` | Open architecture/documentation | Not a deployed finance implementation. |
| PR #14 / `feat/erp-v15-universal-ledger` | Open read-only ledger preview | Review/test alongside transactional repair before integration. |
| PR #15 / `feat/erp-v15-dimensions-daily-finance` | Open analytical previews; names `AKfycbwg...` as staging | Endpoint agrees with runtime preflight; preserve parallel work. |
| PR #16 / `feat/solar-lunar-operating-profiles` | Open, head `f43a1deac80dcd746eeb6552377db7d0f3eb7562` | OperatingProfiles.gs adds concurrent contexts/readiness, overlapping repair phase/event changes. No blind cherry-pick. |

PR #16's source still contains limited catalog/activity reads and an activity ScriptProperty; the repair uses full reads and durable settings. Its concurrent-context contract is not certified by this candidate. Neither branch's isolated tests prove their combined behavior.

## Environment identity

Production project `1A45kAhlpaHC_9Rq5kT0rvkNjA_bCBhVRIIxpC20YUypWBAY9yH0PXjdj` is accessible and contains production book IDs. Legacy project `1VFG72NoaQlca_czsgSgQmbnAIGOqyaAzqMlXVTdtsU-YZy6Xt35pHYPh` also contains production IDs: never treat it as a write-test target based on old labels. Deployment management returned errors there; production deployment identity was not re-certified.

The visible `DOMUS OS · STAGING BACKEND V1` project has active deployment:

`https://script.google.com/macros/s/AKfycbwgLRDIvZ3rdl-dl3g_YtwexjYE7TBdGkxTfVdzBABb-58nKt-G7179bL163V5nTut2/exec`

Its **deployed** health response was independently parsed with `verify_write_target`, using GET only and exact case-sensitive comparison: environment `STAGING`, Main `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`, Ops `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE`, status `HEALTHY`. Literal allowlisted evidence: `docs/evidence/staging_identity_20261030.json`.

The browser summary incorrectly called capitalization differences cosmetic. Never normalize identifiers. Its project-ID transcription also varied in capitalization: re-open the exact project through the deployment UI and confirm the full ID before installation.

Browser observation: `?vista=caja`, `?vista=comandas`, `?vista=accesos` return JSON status rather than native HTML controls. The message asks for Index.html. This proves the published routes do not render UI; it does not establish whether the editor lacks the file or its deployed version is outdated. No build/version/source hash is reported. The repair candidate is not proven installed.

## Additional recovery repair

Interrupted background Outbox sends were marked `SYNCING`, but reload recovery recognized only `SENDING`; operations could remain stuck. Recovery now recognizes both after the existing 90-second timeout, preserving request ID/payload. Recent sends remain in flight; missing/invalid timestamps recover. Invalid queue JSON shapes block operation and preserve stored data instead of silently appearing empty.

Local client suite: 12 PASS. A real-browser fixture reload case was added for each of three viewports; its new CI result must be checked. This does not certify shared-storage concurrency, background receipt retrieval or live backend retries.

## Next execution gate

1. Re-open the isolated project via its observed deployment UI. Capture the exact project ID and deployed version/source backup; preserve parallel finance/operating-profile work.
2. Snapshot staging formulas, validations and rows. Keep production read-only.
3. Install either the STAGING bundle or individual modules plus generated native Index.html, never duplicate definitions. Configure station credentials securely outside Git/chat/logs.
4. Publish a new staging version. Require health environment, both book IDs and build source hash to match. Check all native routes render HTML.
5. Run live POS/payments/accounts/KDS/delivery/access/inventory/recovery cases with Sheets readback and p95. Do not relabel fixtures as STAGING_VERIFIED.
6. Reconcile historic data, suppliers, transfer/refund workflows and physical station hardware separately. Production promotion requires a concrete reviewed release and Direction's authorization.

## Evidence

- Repair: https://github.com/SadoTechMX/Admin-Domus/pull/18
- Prior fixture CI: https://github.com/SadoTechMX/Admin-Domus/actions/runs/41094055968
- Editor observation: https://agent.tinyfish.ai/runs/6a161f33-d93a-4de8-a5b1-7a25f94177c7
- Deployed/native route observation: https://agent.tinyfish.ai/runs/d9ed4a6a-1303-4f1e-9faf-b4c415048972

No standalone screenshot URLs were returned; run links are session evidence, not exported screenshots.
