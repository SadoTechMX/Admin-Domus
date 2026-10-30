# DOMUS OS · Repair candidate · 30 October 2026

**NO-GO. IMPLEMENTED / LOCAL_TESTED only. Not STAGING_VERIFIED, not APPROVED_FOR_MERGE, not PROD_DEPLOYED.**

This branch is a repair candidate against main `ebf5697a4f5cd5cae281e51ecd1c0857c7e4c30b`. It is not a claim that every button, device, or live integration works. Main, deployments and historical production rows have not been changed.

## Implemented changes

- Full-history account/payment/access/KDS reads. Draft transfers cannot count as applied payment even when legacy applied cells contain amounts.
- Server-owned catalog prices, positive integer quantities, active SKU checks and server role checks for courtesy. Existing account settlement calculates full outstanding balance without creating new consumption.
- Durable, chunked write journal prepared before business writes; grouped absolute range writes preserve before/after state and recover partially written sales/accesses under the original id. Other mutations stop while a prepared journal is unresolved. REQUESTS is the authoritative ledger, with complete-history lookup and device/payload binding; no silent cache-only completion.
- Narrow CAJA writes and explicit formulas for NEW operation rows. COMANDAS A/H/M stays linked to the sale. Existing historical rows are not repaired automatically.
- KDS state machine with destination authorization. Delivery preserves INVENTARIO A:P formulas and integrates RECETAS CARTA/INSUMOS formulas; missing counts or insufficient stock block delivery explicitly.
- New product writes use the 16-column inventory schema and explicit stock. Official catalog sync updates at most 40 changed prices per call, preserving names, historical keys, provider terms and inventory; ambiguous/missing mappings are reported. It no longer invents SKU/stock or rebuilds inventory.
- No anonymous ADMIN session issuance. Public REST reads of private operational records are rejected. Native direct entry points require the authenticated dispatcher. Station credentials must be configured server-side, with privileged sessions requiring verified Workspace manager identity.
- Outbox persisted before transport; saved financial intent survives retry; double-click guard; pending result never shown/printed as paid. Read and mutation transport use the same authenticated REST/native dispatch. No silent financial queue deletion.
- Access registration and wardrobe now wait for server confirmation. Wardrobe return uses the correct object payload and does not deactivate admission. Restock, descriptive access edits, logical void and phase changes use durable server actions instead of local-only overrides.
- Public print token removed. Bridge restricts origins, rejects query tokens and payloads above 64 KB, sanitizes ESC/GS from text, serializes requests, persists uncertain sends before CUPS, retains idempotency history and reports QUEUED. Drawer rejects non-cash/reprint/unconfirmed automatic requests, requires explicit manual confirmation and cooldown.
- Deterministic source → native HTML and backend bundles, source hashes and environment-target assertions. Build script does not deploy.

## Local verification

| Suite | Scope | Result at branch preparation |
|---|---|---|
| `node tests/recovery_regressions.js` | Actual Apps Script modules, mocked isolated Sheets/services, injected failures; 50-unit chunked recovery | 26 PASS |
| `node tests/client_recovery_regressions.js` | Actual client handlers in isolated VM; persistence, double click, uncertain response, transfer labels | 9 PASS |
| `python tests/bridge_recovery_regressions.py` | Temporary state + mocked CUPS, no physical hardware | 11 PASS |
| `python tests/test_write_guardrails.py` | Production/legacy deployment rejection and exact Main/Ops staging identity | 4 PASS |
| `python tests/test_hotfix_v13.py` | Legacy source/structural checks; final empty-cart check executes client regression suite | 12 checks PASS (overlaps client cases) |
| `python tests/test_kds_v14.py` | Structural compatibility and native/bundle parity | 11 checks PASS |
| `python scripts/build_release.py --check` | Deterministic generated native/bundles/manifest parity | PASS |
| `node tests/browser_local_regressions.js` | Real Chromium with local frontend + intercepted fixtures, never live backend | BLOCKED locally: Chromium executable unavailable; CI configured to install it |

These are not end-to-end results against live Apps Script, not proof of financial spreadsheet recalculation, not a real multi-process concurrency proof, and not printer/drawer verification. The historical 543 controls and 287 requested cases are not all completed.

## Required STAGING installation — human authenticated access needed

1. Verify the exact Apps Script project belongs to the two approved staging books. **Do not use the old CURRENT_STATE staging URL blindly:** `AKfycbysBaRA...` reported PRODUCTION during audit.
2. Snapshot staging code, deployment version, formulas, validations and data before updating. Keep production read-only.
3. Install EITHER all source modules (including Build, Data, Schema and Operations) OR the generated STAGING bundle, plus generated Index.html. Never install both bundles or duplicate modules. Never use the staging bundle in production.
4. Set ScriptProperties `DOMUS_ENV=STAGING`; exact Main `114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg`, Ops `1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE`.
5. Configure high-entropy `DOMUS_STATION_SECRET_CAJA`, `_BARRA`, `_COCINA`, `_ACCESOS` securely in ScriptProperties. Do not commit or paste them into chat. Workspace manager identity must be verified for GERENCIA/ADMIN. The previous public/local PIN is not server authentication.
6. Deploy a NEW STAGING version; retain deployment/version IDs and `health.build.sourceSha256`. Loading GitHub code does not update Apps Script.
7. Run real UI + API fixtures with legitimate sessions. Read values, formulas, validation and payment/ledger rows before and after. Verify browser refresh, lost ACK, concurrent devices/operators and p95 latency against the canonical operational gate.
8. Do not promote if any monetary write is ambiguous, any request creates duplicate rows, a delivered order lacks correct recipe consumption, or any critical UI action remains blocked.

## Open work / limits — cannot mark closed from local tests

- All P0/P1 still require deployed regression evidence. P0-08 supplier/history discrepancy and pre-existing damaged CAJA formulas remain unresolved in production. Prepare a separate read-only dry-run reconciliation; no automatic historical overwrites or provider payments.
- Bank verification of pending transfers, monetary refunds, full provider reconciliation and financial management are not certified by this candidate. Pending transfers intentionally do not close debt. A complete approved verification/refund workflow must be implemented and tested before relying on these paths.
- Commercial access edits that change persons/channel are rejected rather than silently rewriting history. Voids with money collected require independent financial reconciliation; they are not refunds. No real exit/reentry/occupancy model was introduced.
- Missing stock counts require physical data from the operator; never substitute 50, zero or a guessed base. Recipe/formula evaluation must be verified in real Sheets, including catalog mappings and conversions.
- Native Apps Script bridge origin must be explicitly paired in the local bridge origin policy if needed; cloud localhost is not the iMac. The previously exposed print token must be rotated locally before pairing this candidate.
- Browser fallback lease/multi-tab contention, shared Outbox queue updates and session expiration still require adversarial browser/deployed testing. Never equate the existing structural Web Locks check with demonstrated real concurrency.
- The bridge preserves ambiguous print/drawer sends for manual review instead of automatically repeating them; operator recovery and every physical channel must be rehearsed.
- Production promotion, historical data repair, installed bridge replacement and physical hardware certification are separate steps. This branch authorizes none automatically.

## Promotion and rollback

Prepare exact diffs, fresh backup, release manifest, endpoint/book proof, complete live acceptance matrix and operator/hardware evidence. Obtain Direction's approval for the concrete release before merge/deploy. Record every exact version actually deployed; verify Pages and native/backend bytes against that manifest. Revert code/config to the recorded prior versions if needed; never restore a global data backup over new real sales. Use approved compensating transactions and retain original financial folios.
