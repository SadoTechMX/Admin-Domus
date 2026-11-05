# Reload and validation rejection follow-up — 2026-11-05

**IMPLEMENTED / LOCAL_TESTED. NO-GO for production.** Follow-up to `53bfa61a63796edcae8d1dcee0263bd6186d3a0d` on `repair/reconcile-pr18-main-20261105`. No merge, deployment, live Apps Script/Sheets transaction or hardware action.

## Corrected behavior

1. Migration now classifies the persisted error as `{message, code, status}`. A numeric 500 is retained when the code is `SERVER_ERROR`; a non-network message such as `INJECTED_WRITE_FAILURE` no longer downgrades RETRY to REQUIRES_REVIEW on reload. Deterministic errors keep precedence. Previously quarantined entries are not automatically released.
2. Explicit POS validation guards before journal preparation emit `SALE_VALIDATION_REJECTED_NO_EFFECTS`/422. This covers changed price/balance, missing account/product, empty or invalid cart/quantity, unauthorized courtesy/credit, invalid payment method, insufficient cash, invalid tip and already settled account. The original phase code remains supported. The client retains REJECTED evidence and permits a corrected draft under a new ID only for the POS action, an allowlisted code and status 422.
3. REQUESTS retains and replays that validation outcome for the same action, payload and device. A changed payload under the old ID still fails with `IDEMPOTENCY_KEY_REUSED`. Journal recovery runs before checking stored rejection outcomes and before current phase/catalog validation. The new error helper is used only by explicit pre-effect POS guards; there is no catch-all conversion of infrastructure/journal exceptions into proof of no effects.
4. If a rejection response is lost, the client remains uncertain and cannot create a replacement until same-ID recovery obtains the durable structured outcome. Error text alone, missing journal alone, unknown codes, wrong action or wrong status never authorize replacement.

“No effects” means no sale, payment, order or inventory effects for that request. REQUESTS intentionally records the attempt and rejection; it is not a claim of zero technical writes.

## Reproduction and verification

Before source changes, the new suite executed code from `53bfa61` with persistent mocked services: six cases failed, including the partial journal's downgrade on reload and both price/account-balance rejection flows. The stricter malformed-proof case also rejected the older phase-only gate. One infrastructure control passed. No live failure was observed or induced.

- `node tests/reload_rejection_regressions.js`: **8 PASS**. A fresh client VM shares the original browser storage and backend mock. The partial-write case asserts journal PREPARED before reload, unchanged original request/body, no replacement charge, journal COMPLETED afterward, exactly one payment row, original receipt and preservation of the new post-reload draft. Current phase and price change before replay to verify recovery precedence. Price and account-balance cases compare every commercial cell in both mocked books before/after rejection and assert no journal for the rejected ID, then complete exactly one corrected payment. Ten explicit validation variants, lost-response recovery, error metadata migration and negative permission controls are included.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser_outbox_concurrency.js`: **1 complete multi-step case PASS**, now requiring actual recovery after reload following SERVER_ERROR/500, with identical ID, arguments and device. It checks the recovered receipt and an empty queue, instead of only checking queue visibility before migration. Two real tabs, real localStorage/Web Locks, intercepted backend transport.
- Existing suites PASS: **27 backend, 12 client, 17 reconciliation, 16 prior review, 18 browser, 11 mocked bridge, 4 target guardrail, 3 harness-safety cases**; event selection and access-channel suites; **12 v13 and 11 KDS checks**. Counts overlap: the v13 wrapper reruns some suites. Synthetic checks do not certify operation.
- `python3 scripts/build_release.py --check`, JavaScript/native-script parsing and `git diff --check`: PASS. CI configuration includes the new suite; exact-head remote CI is not claimed.

Runtime: Node v24.22.1, Python 3.12.14, Chromium 155.0.8059.79. UI `20261105-reconcile-03`. Backend source SHA-256 `1437ae5b9952b53b31f2b5779bff4b336dc74eabef29cf312f096cd92b6cd893`; generated files are bound by `release-manifest.json`.

## Remaining gates

- Independently review this revision, including exact-head tests. The previous verification of a 5xx retry omitted reload; its claim was incomplete and is superseded here.
- Existing REQUIRES_REVIEW records lacking explicit structured proof remain blocked. This patch does not infer safe replacement from old Spanish error messages or automatically release historical quarantines. Infrastructure and schema errors outside the explicit guards also retain the conservative path.
- Web Locks is mandatory; old tabs must be closed/reloaded before any future installation. One unresolved sale gates another sale in shared browser storage. Browser storage loss/quota/corruption and real cross-device/Sheets concurrency need separate verification.
- Project identity/OAuth, isolated staging, physical printing/drawer behavior and operational acceptance remain unverified. No STAGING_VERIFIED, merge approval or production certification.
- Draft PR creation was previously denied by automatic approval review because no explicit trusted authorization to open a PR was found. That action remains stopped; this update only changes and pushes the already authorized isolated branch.
