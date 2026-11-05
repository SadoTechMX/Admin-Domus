# Independent review follow-up — 2026-11-05

**IMPLEMENTED / LOCAL_TESTED. NO-GO for production.** Isolated branch `repair/reconcile-pr18-main-20261105`, follow-up to `694737117603d786c5db860f315c23aa51e048df`. No merge, deployment, live Apps Script/Sheets call, real sale or physical-device action.

## Findings, fixes and proof

| Finding | Result |
| --- | --- |
| A phase rejection poisoned the saved intention; subsequent Cobrar ignored corrected draft/phase | POS emits `SALE_PHASE_CHANGED_NO_EFFECTS`/422 only at the phase check, before journal preparation or business effects. REQUESTS retains that outcome and returns it on same-ID replay. The client preserves the old rejected entry and can create a new ID with the corrected draft. Unknown/legacy REQUIRES_REVIEW or partial effects never get this permission. |
| Retrying OLD bound it to NEW's basket; foreground callback also cleared current fields unconditionally | Cobrar creates a new intention; unresolved intents must recover via Outbox. The original draft snapshot includes basket, client, account, activity and phase and is captured only when creating that intention. Only an exact original snapshot can be cleared on ACK. Both background and foreground handlers preserve later edits. |
| Two tabs lost queue entries through stale snapshots | Every store mutation now uses `domus-outbox-store`, reads fresh state inside the lock and finishes synchronously. Enqueue claims SENDING atomically; completion/failure touches only the requested entry. No unlocked writer/fallback remains. See ADR-006. |
| Fully authorized zero-charge courtesy was mistaken for an already settled account | A new, nonempty, entirely courteous order authorized by server GERENCIA/ADMIN creates one order with `CORTESIA_AUTORIZADA`, no COBROS row, no payment receipt and no debt. Cashier escalation stays denied. Empty settlement of a paid account stays rejected. Receipt UI says “SIN COBRO”. |
| `error.code || error.status` hid numeric 5xx behind SERVER_ERROR | Classification uses numeric status separately from symbolic code. Known deterministic errors retain review precedence. Injected partial journal failure is RETRY; the next recovery uses the same request/body and completes exactly one mocked payment. |

The first three original defects were independently reproduced from the exact `6947371:js/app.js` functions in local VM contexts: corrected cart/phase resent the old ID/body; OLD's ACK erased NEW; adversarial interleaving left only A after enqueueing A+B. These were synthetic source executions, not observed production transactions.

## Verification

- `node tests/review_regressions.js`: **16 PASS** using actual client/backend functions and mocked Sheets. Includes separate foreground edits to cart/client/account/activity, rejected and uncertain intentions, partial journal replay, concurrent add/ACK/failure, duplicate-ID claims, absent Web Locks, crash-before-enqueue recovery and two UIs competing for the pending pointer.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser_outbox_concurrency.js`: **1 complete multi-step race PASS**, two real tabs with a held storage-lock barrier; simultaneous A+B, A ACK concurrent with C enqueue, B failure, C ACK, reload preserving B and both receipts. Every external request is intercepted. Test-only source instrumentation exposes functions without changing their bodies; it is not shipped.
- Existing regressions: **27 backend, 12 client, 17 reconciliation, 18 browser, 11 mocked bridge, 4 target guardrail, 3 harness-safety cases PASS**; event and access-channel suites PASS; **12 v13 and 11 KDS checks PASS**. Counts overlap. The v13 wrapper reruns client/reconciliation/review suites and is not additional acceptance coverage.
- Deterministic generation, JavaScript/native-script parsing and whitespace checks PASS. Browser: Chromium 155.0.8059.79; Node v24.22.1; Python 3.12.14. CI configuration includes both new suites; remote exact-head CI was not claimed.
- Test-maintenance failures encountered: a courtesy assertion initially used the wrong capitalization; legacy v13 assertions expected the removed unlocked retry-button writer. Assertions now check the server message case-insensitively and execute the guarded dispatcher behavior. No business guard was bypassed.

Frontend: `20261105-reconcile-02`. Backend source SHA-256: `1190f91e772ce9718163ecd80531d2bb6f66cef783303d09f7aacf387bbadc76`. `release-manifest.json` binds all generated artifacts. POS.gs and Idempotency.gs differ from the earlier candidate; remaining backend source modules and print bridge are unchanged by this follow-up.

## Constraints before another environment can use it

1. Independent review must examine this new diff and repeat the targeted scenarios. Old static/source-only checks are not proof of this behavior.
2. Web Locks is required. Missing support fails closed; no localStorage lease is considered safe. Close/reload every old tab before installing so no old writer can overwrite the queue. Native Apps Script origin/browser behavior needs real staging verification.
3. One unresolved sale blocks a second sale in the same shared browser storage; it preserves the new draft and points to recovery. Separate devices have separate browser stores and still require real server concurrency tests.
4. Legacy rejected records lacking the structured no-effects outcome remain in review. Do not infer safety from a Spanish error string alone, delete evidence, mutate an old payload under the same key, or create a replacement for an uncertain/partially written sale.
5. Browser storage eviction/quota/corruption, local archive retention, historical finance, refunds/transfers, supplier/event contracts and physical station evidence remain separate gates. Server data is authoritative.
6. Private project identity/OAuth verification blocked by the iMac remains unresolved. No STAGING_VERIFIED, APPROVED_FOR_MERGE or production status is implied by this delivery.
