#!/usr/bin/env python3
"""
DOMUS Economic OS v15 · STAGING validation for PR #15
Validates financeDailyPreview and financeDashboardPreview against isolated STAGING.
"""

import json
import urllib.parse
import urllib.request

STAGING_URL = "https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec"
EXPECTED_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_OPS = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"


def http_json(url, payload=None, timeout=90):
    if payload is None:
        req = urllib.request.Request(url, headers={"User-Agent": "DOMUS-PR15-QA/1.0"})
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "DOMUS-PR15-QA/1.0"},
        )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_session(role):
    res = http_json(STAGING_URL, {
        "action": "authCrearSesion",
        "role": role,
        "deviceId": f"DEV-PR15-{role}",
        "args": [role, "PR15 QA"],
    })
    return res["data"]["token"]


def get(action, token="", **params):
    q = {"action": action}
    if token:
        q["token"] = token
    q.update(params)
    return http_json(STAGING_URL + "?" + urllib.parse.urlencode(q))


def run():
    h = get("health")
    assert h["ok"] is True
    assert h["data"]["environment"] == "STAGING"
    assert h["data"]["mainSheetId"] == EXPECTED_MAIN
    assert h["data"]["opsSheetId"] == EXPECTED_OPS
    print("PASS health")

    ger = create_session("GERENCIA")
    adm = create_session("ADMIN")

    for action in ["financeDailyPreview", "financeDashboardPreview"]:
        assert get(action, token=ger)["ok"] is True
        assert get(action, token=adm)["ok"] is True
    print("PASS management access")

    for role in ["CAJA", "BARRA", "COCINA", "ACCESOS"]:
        tok = create_session(role)
        for action in ["financeDailyPreview", "financeDashboardPreview"]:
            assert get(action, token=tok).get("ok") is False
    for action in ["financeDailyPreview", "financeDashboardPreview"]:
        assert get(action).get("ok") is False
    print("PASS RBAC")

    daily = get("financeDailyPreview", token=ger)
    dd = daily["data"]
    assert dd["schemaVersion"] == "finance-daily-preview-v1"
    for key in ["totals", "byPaymentChannel", "byUnit", "quality", "byProduct", "byProvider", "byEvent", "byStaff"]:
        assert key in dd
    print("PASS daily schema")

    dash = get("financeDashboardPreview", token=ger)
    kd = dash["data"]["kpis"]
    assert dash["data"]["schemaVersion"] == "finance-dashboard-preview-v1"
    for key in [
        "sales","grossPayments","reversals","netPayments","tips",
        "processingFees","expenses","payroll","cashWithdrawals",
        "receivables","payables","debtPayments","transfers",
        "operatingResultBeforeCogs"
    ]:
        assert key in kd

    expected = round(
        float(kd["sales"]) - float(kd["processingFees"]) - float(kd["expenses"]) - float(kd["payroll"]),
        2
    )
    assert round(float(kd["operatingResultBeforeCogs"]), 2) == expected
    print("PASS dashboard KPI math")

    warnings = " ".join(dash["data"].get("warnings", []))
    assert "no equivale a utilidad neta" in warnings
    assert "COGS" in warnings
    print("PASS accounting warnings")

    print("PR #15 STAGING VALIDATION PASSED")


if __name__ == "__main__":
    run()
