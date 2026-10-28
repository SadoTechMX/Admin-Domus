#!/usr/bin/env python3
"""
DOMUS Solar/Lunar live STAGING gate.
Requires the branch bundle to be deployed to the official isolated STAGING Web App.
"""

import json
import urllib.parse
import urllib.request

URL = "https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec"
EXPECTED_MAIN = "114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg"
EXPECTED_OPS = "1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE"


def http_json(url, payload=None, timeout=90):
    if payload is None:
        req = urllib.request.Request(url, headers={"User-Agent": "DOMUS-SOLAR-LUNAR-QA/1.0"})
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "DOMUS-SOLAR-LUNAR-QA/1.0"},
        )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_session(role):
    res = http_json(URL, {
        "action": "authCrearSesion",
        "role": role,
        "deviceId": f"DEV-OPS-{role}",
        "args": [role, "Solar Lunar QA"],
    })
    return res["data"]["token"]


def get(action, token="", **params):
    q = {"action": action}
    if token:
        q["token"] = token
    q.update(params)
    return http_json(URL + "?" + urllib.parse.urlencode(q))


def post(action, token, role, args):
    return http_json(URL, {
        "action": action,
        "role": role,
        "deviceId": "DEV-OPS-GATE",
        "sessionToken": token,
        "requestId": "OPS-GATE-" + action + "-" + str(abs(hash(json.dumps(args, sort_keys=True)))),
        "args": args,
    })


def run():
    h = get("health")
    assert h["ok"] and h["data"]["environment"] == "STAGING"
    assert h["data"]["mainSheetId"] == EXPECTED_MAIN
    assert h["data"]["opsSheetId"] == EXPECTED_OPS
    print("PASS health / isolation")

    caja = create_session("CAJA")
    accesos = create_session("ACCESOS")

    d = get("operatingProfileDatos", token=caja, role="CAJA")
    assert d["ok"]
    assert d["data"]["profile"] in ["Solar", "Lunar"]
    assert "readiness" in d["data"]
    print("PASS profile read")

    denied = post("operatingProfileSet", accesos, "ACCESOS", [{"profile": "Solar"}])
    assert denied.get("ok") is False
    print("PASS ACCESOS cannot change POS profile")

    original = d["data"]["profile"]
    target = "Lunar" if original == "Solar" else "Solar"
    switched = post("operatingProfileSet", caja, "CAJA", [{"profile": target}])
    assert switched["ok"]
    verify = get("operatingProfileDatos", token=caja, role="CAJA")
    assert verify["data"]["profile"] == target
    print("PASS persistent phase switch")

    restored = post("operatingProfileSet", caja, "CAJA", [{"profile": original}])
    assert restored["ok"]
    verify2 = get("operatingProfileDatos", token=caja, role="CAJA")
    assert verify2["data"]["profile"] == original
    print("PASS rollback to original profile")

    print("SOLAR/LUNAR STAGING GATE PASSED")


if __name__ == "__main__":
    run()
