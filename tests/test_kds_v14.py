#!/usr/bin/env python3
"""
DOMUS OS · KDS v14 verification
Static/structural checks for:
- real delivered history
- canonical state machine
- frontend button gating
- production bundle synchronization
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
kds = (root / "google-apps-script" / "KDS.gs").read_text(encoding="utf-8")
app = (root / "js" / "app.js").read_text(encoding="utf-8")
gas_index = (root / "google-apps-script" / "Index.html").read_text(encoding="utf-8")
bundle = (root / "google-apps-script" / "DOMUS_PRODUCTION_BUNDLE.gs").read_text(encoding="utf-8")

checks = [
    ("backend returns history", "history: history.slice(0, 100)" in kds),
    ("history includes delivered timestamps", "delivered: item.delivered ? new Date(item.delivered).getTime() : null" in kds),
    ("backend blocks TOMAR outside Pendiente", "TOMAR requiere estado Pendiente" in kds),
    ("backend blocks LISTA outside En preparación", "LISTA requiere estado En preparación" in kds),
    ("backend blocks ENTREGAR outside Lista", "ENTREGAR requiere estado Lista" in kds),
    ("frontend only shows ready in En preparación", "item.state === 'En preparación'" in app),
    ("frontend only shows deliver in Lista", "item.state === 'Lista'" in app),
    ("frontend deliver guard", "Sólo una comanda marcada como Lista puede registrarse como Entregada." in app),
    ("GAS client aligned", "Sólo una comanda marcada como Lista puede registrarse como Entregada." in gas_index),
    ("production bundle includes KDS 2.1", "version: 'Comandas Simple 2.1'" in bundle),
    ("production bundle returns history", "history: history.slice(0, 100)" in bundle),
]

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(("PASS" if ok else "FAIL"), "-", name)

if failed:
    raise SystemExit("FAILED: " + ", ".join(failed))

print(f"PASS: {len(checks)}/{len(checks)} checks")
