# ADR-006: Serialize all Outbox storage mutations

Status: IMPLEMENTED / LOCAL_TESTED on the isolated reconciliation candidate, 2026-11-05. Not approved for production.

ADR-003's sender lock did not protect foreground enqueue or status updates. Two tabs could read the same queue and overwrite each other's additions. Its localStorage lease also cannot establish exclusive ownership atomically.

Every read/modify/write now runs as a synchronous callback under the same origin-wide Web Lock `domus-outbox-store`. `saveOutbox` rejects callers outside that transaction. This covers enqueue/claim, migration, failure updates, receipt persistence/removal and the pending-sale pointer. Operations read fresh state inside the lock. Network calls never hold the storage lock. Background dispatch retains the separate `domus-outbox-sync` lock. Same-ID active claims cannot be sent again through foreground enqueue; journal/idempotency remains the server safeguard for uncertain interrupted sends.

The non-atomic lease fallback is disabled in this candidate. Missing or failed Web Locks blocks mutation before transport rather than starting an unlocked writer. Read-only operations remain available. This supersedes the fallback portion of ADR-003 for this branch; it does not change business rules.

Rollout requires closing/reloading every old client tab. A client that does not cooperate with this lock protocol cannot be protected by the new code. Distinct origins/browser profiles/devices rely on server idempotency, not this browser lock. Storage corruption/quota still blocks operation and requires evidence-preserving recovery. A single unresolved POS intention gates a new sale in the same shared storage until confirmed or explicitly rejected without business effects; other typed operations keep independent queue IDs.

Evidence: `tests/review_regressions.js` uses two VM realms and an adversarial shared lock scheduler; `tests/browser_outbox_concurrency.js` uses two real Chromium tabs, localStorage and Web Locks with intercepted transport. Neither test certifies deployed Apps Script, Sheets concurrency or physical devices.
