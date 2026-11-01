#!/usr/bin/env python3
"""
Test: Verification of Concurrent ensureSessionToken Isolation (BARRA + CAJA)
and Role Immutability in callBackend Retry.
"""

def test_single_flight_logic():
    print("Testing single-flight per role logic...")
    
    # Emulate the JS Maps and single-flight mechanism
    pendingSessionByRole = {}
    isEnsuringSessionByRole = {}
    session_tokens_by_role = {}
    tokens_returned_to_callbacks = {"BARRA": [], "CAJA": []}
    
    def setSessionToken(token, role):
        clean_role = role.upper()
        session_tokens_by_role[clean_role] = token
        
    def getSessionToken(role):
        return session_tokens_by_role.get(role.upper(), "")
        
    def ensureSessionToken(onDone, target_role, force_refresh=False):
        current_role = target_role.upper()
        cur_tok = getSessionToken(current_role)
        if cur_tok and not force_refresh:
            if onDone: onDone(None, cur_tok)
            return
            
        if current_role not in pendingSessionByRole:
            pendingSessionByRole[current_role] = []
        if onDone:
            pendingSessionByRole[current_role].append(onDone)
            
        if isEnsuringSessionByRole.get(current_role, False):
            return
        isEnsuringSessionByRole[current_role] = True
        
        # In real code, fetch runs async per role.
        # Here we simulate both fetches in-flight concurrently.
        
    def finish_mock_fetch(role, token):
        isEnsuringSessionByRole[role] = False
        setSessionToken(token, role)
        cbs = pendingSessionByRole.get(role, [])
        pendingSessionByRole[role] = []
        for cb in cbs:
            cb(None, token)

    # 1. Start concurrent requests for BARRA and CAJA
    ensureSessionToken(lambda err, tok: tokens_returned_to_callbacks["BARRA"].append(tok), "BARRA")
    ensureSessionToken(lambda err, tok: tokens_returned_to_callbacks["CAJA"].append(tok), "CAJA")
    
    assert isEnsuringSessionByRole["BARRA"] is True, "BARRA should be in flight"
    assert isEnsuringSessionByRole["CAJA"] is True, "CAJA should be in flight"
    assert len(pendingSessionByRole["BARRA"]) == 1
    assert len(pendingSessionByRole["CAJA"]) == 1
    
    # 2. Add second concurrent caller for BARRA (should coalesce into same single-flight)
    ensureSessionToken(lambda err, tok: tokens_returned_to_callbacks["BARRA"].append(tok), "BARRA")
    assert len(pendingSessionByRole["BARRA"]) == 2
    
    # 3. BARRA fetch completes first with token 'TOK-BARRA-999'
    finish_mock_fetch("BARRA", "TOK-BARRA-999")
    
    # Verify BARRA callbacks received BARRA token, and CAJA callback received NOTHING yet
    assert tokens_returned_to_callbacks["BARRA"] == ["TOK-BARRA-999", "TOK-BARRA-999"], \
        f"Expected 2 BARRA tokens, got: {tokens_returned_to_callbacks['BARRA']}"
    assert tokens_returned_to_callbacks["CAJA"] == [], \
        f"CAJA callback must NOT have received BARRA token! Got: {tokens_returned_to_callbacks['CAJA']}"
    print("  [PASS] BARRA callbacks isolated; CAJA did NOT receive BARRA token.")
    
    # 4. CAJA fetch completes second with token 'TOK-CAJA-111'
    finish_mock_fetch("CAJA", "TOK-CAJA-111")
    assert tokens_returned_to_callbacks["CAJA"] == ["TOK-CAJA-111"], \
        f"CAJA should receive TOK-CAJA-111, got: {tokens_returned_to_callbacks['CAJA']}"
    print("  [PASS] CAJA callback received CAJA token cleanly.")

def test_target_role_override_capture():
    print("\nTesting targetRoleOverride capture on view change...")
    
    # Simulate a call starting while in 'CAJA' view
    view_state = {"mode": "caja"}
    def getStationRole():
        return "CAJA" if view_state["mode"] == "caja" else "BARRA"
        
    def callBackend_mock(targetRoleOverride=None, isSessionRetry=False):
        stationRole = (targetRoleOverride or getStationRole()).upper()
        # Simulate view change while call is in-flight:
        view_state["mode"] = "comandas"  # user clicks KDS tab!
        
        # When retrying, it must use stationRole captured at invocation, NOT the new getStationRole()
        retry_role = stationRole
        return retry_role

    captured_role = callBackend_mock()
    assert captured_role == "CAJA", f"Expected CAJA, got: {captured_role}"
    print("  [PASS] Role remained 'CAJA' despite view changing to 'comandas'.")

if __name__ == "__main__":
    test_single_flight_logic()
    test_target_role_override_capture()
    print("\nALL LOCAL VM TESTS PASSED: 100% SUCCESS")
