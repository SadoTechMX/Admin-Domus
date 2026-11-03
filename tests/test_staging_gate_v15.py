#!/usr/bin/env python3
"""
DOMUS Economic OS v15 · STAGING GATE
Read-only live validation against the isolated STAGING deployment.
Never targets production for mutations.
"""

import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGING_URL = "https://script.google.com/macros/s/AKfycbwgLRDIvZ3rdl-dl3g_YtwexjYE7TBdGkxTfVdzBABb-58nKt-G7179bL163V5nTut2/exec"
EXPECTED_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_OPS = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"


def http_json(url, payload=None, timeout=90):
    if payload is None:
        req = urllib.request.Request(url, headers={"User-Agent": "DOMUS-v15-Gate/1.0"})
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "DOMUS-v15-Gate/1.0"},
        )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_session(role):
    res = http_json(
        STAGING_URL,
        {
            "action": "authCrearSesion",
            "role": role,
            "deviceId": f"DEV-GATE-{role}",
            "args": [role, "Gate QA"],
        },
    )
    return res["data"]["token"]


def get(action, token="", **params):
    q = {"action": action}
    if token:
        q["token"] = token
    q.update(params)
    return http_json(STAGING_URL + "?" + urllib.parse.urlencode(q))


def assert_denied(role):
    token = create_session(role)
    res = get("financeLedgerPreview", token=token, limit="5")
    assert res.get("ok") is False, (role, res)


def run():
    checks = []

    health = get("health")
    d = health["data"]
    assert health["ok"] is True
    assert d["environment"] == "STAGING"
    assert d["mainSheetId"] == EXPECTED_MAIN
    assert d["opsSheetId"] == EXPECTED_OPS
    checks.append("1 health=STAGING isolated sheets")

    ger = create_session("GERENCIA")
    adm = create_session("ADMIN")
    assert get("financeLedgerPreview", token=ger, limit="5")["ok"] is True
    assert get("financeLedgerPreview", token=adm, limit="5")["ok"] is True
    checks.append("2 GERENCIA/ADMIN finance access")

    for role in ["CAJA", "BARRA", "COCINA", "ACCESOS"]:
        assert_denied(role)
    assert get("financeLedgerPreview", limit="5")["ok"] is False
    checks.append("3 operational/anonymous finance blocked")

    summary = get("financeSummaryPreview", token=ger)
    assert summary["ok"] is True
    assert "totals" in summary["data"]
    checks.append("4 summary contract")

    ranged = get("financeLedgerPreview", token=ger, **{"from": "2026-10-24", "to": "2026-10-25", "limit": "2000"})
    assert ranged["ok"] is True
    checks.append("5 date range")

    payments = get("financeLedgerPreview", token=ger, entryType="PAYMENT", limit="2000")
    assert all(e["entryType"] == "PAYMENT" for e in payments["data"]["entries"])
    checks.append("6 PAYMENT filter")

    reversals = get("financeLedgerPreview", token=ger, entryType="REVERSAL", limit="2000")
    assert all(e["entryType"] == "REVERSAL" for e in reversals["data"]["entries"])
    checks.append("7 REVERSAL filter")

    cobros = get("financeLedgerPreview", token=ger, sourceModule="COBROS", limit="2000")
    assert all(e["sourceModule"] == "COBROS" for e in cobros["data"]["entries"])
    checks.append("8 COBROS filter")

    lunar = get("financeLedgerPreview", token=ger, unit="LUNAR", limit="2000")
    assert all((e.get("dimensions") or {}).get("unit") == "LUNAR" for e in lunar["data"]["entries"])
    checks.append("9 LUNAR filter")

    real = get("financeLedgerPreview", token=ger, qualityStatus="REAL", limit="2000")
    assert all(e["qualityStatus"] == "REAL" for e in real["data"]["entries"])
    checks.append("10 REAL filter")

    totals = summary["data"]["totals"]
    assert round(totals["payments"] - totals["reversals"], 2) == round(totals["netPayments"], 2)
    checks.append("11 reversal netting")

    assert "cashWithdrawals" in totals and "expenses" in totals
    checks.append("12 withdrawals isolated")

    assert "receivables" in totals and "sales" in totals
    checks.append("13 receivables isolated")

    assert "payables" in totals and "expenses" in totals
    checks.append("14 payables isolated")

    ledger_text = (ROOT / "google-apps-script" / "Ledger.gs").read_text(encoding="utf-8")
    assert "getSheetByName('ACCESO')" not in ledger_text
    assert 'getSheetByName("ACCESO")' not in ledger_text
    checks.append("15 ACCESO isolated")

    forbidden = [".setValue(", ".setValues(", ".appendRow(", ".insertSheet(", ".deleteRow(", ".clear("]
    assert not any(x in ledger_text for x in forbidden)
    checks.append("16 ledger read-only")

    pos = get("cajaSimpleDatos")
    assert pos["ok"] is True
    checks.append("17 POS read regression")

    kds = get("comandasSimpleDatos")
    assert kds["ok"] is True
    checks.append("18 KDS read regression")

    state = get("cajaSimpleEstado", id="NONEXISTENT-GATE-READONLY")
    assert "ok" in state
    checks.append("19 router/state regression")

    entries = ranged["data"]["entries"]
    assert all("sourceModule" in e and "sourceRecordId" in e and "dimensions" in e for e in entries[:20])
    checks.append("20 ledger sample contract")

    for i, name in enumerate(checks, 1):
        print(f"PASS {i:02d}: {name}")
    print(f"{len(checks)}/{len(checks)} PASSED")


if __name__ == "__main__":
    run()
