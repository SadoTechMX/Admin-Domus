import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
OPS = (ROOT / "google-apps-script" / "OperatingProfiles.gs").read_text(encoding="utf-8")
API = (ROOT / "google-apps-script" / "Api.gs").read_text(encoding="utf-8")
AUTH = (ROOT / "google-apps-script" / "Auth.gs").read_text(encoding="utf-8")
ACCESS = (ROOT / "google-apps-script" / "Access.gs").read_text(encoding="utf-8")
APP = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
BUNDLE = (ROOT / "google-apps-script" / "DOMUS_STAGING_BUNDLE.gs").read_text(encoding="utf-8")


def test_profiles_are_canonical():
    assert "Solar" in OPS and "Lunar" in OPS
    assert "14:00–21:00" in OPS
    assert "priceSolar" in OPS and "priceLunar" in OPS


def test_context_is_transaction_scoped():
    assert "CONCURRENT_TRANSACTION_CONTEXT" in OPS
    assert "getRange('F2').setValue" not in OPS
    assert "operatingContextValidate_" in OPS


def test_context_never_writes_access_history():
    assert "getSheetByName('ACCESO')" not in OPS
    assert ".appendRow(" not in OPS


def test_activity_switch_is_validated():
    assert "operatingActivityValidate_(act)" in ACCESS
    assert "OPERATING_ACTIVITY_NOT_CONFIRMED" in OPS


def test_rbac_and_routes():
    assert "operatingProfileDatos" in API
    assert "operatingContextValidate" in API
    assert re.search(r"operatingProfileDatos:\s*\['CAJA',\s*'ACCESOS',\s*'GERENCIA',\s*'ADMIN'\]", AUTH)
    assert re.search(r"operatingContextValidate:\s*\['CAJA',\s*'ACCESOS',\s*'GERENCIA',\s*'ADMIN'\]", AUTH)


def test_frontend_phase_toggle_is_not_local_only():
    marker = "// Contexto transaccional Solar / Lunar." if "// Contexto transaccional Solar / Lunar." in APP else "// Phase Switcher (Solar / Lunar)"
    block = APP[APP.index(marker):APP.index("// Botón Reintentar Outbox")]
    assert "Siguiente venta" in block
    assert "operatingContextValidate" not in block


def test_readiness_detects_operational_blockers():
    for token in [
        "NO_CONFIRMED_CONTEXT_TODAY",
        "NO_ACTIVE_PRODUCTS",
        "CATALOG_PHASE_PRICE_GAPS",
        "INVALID_KDS_DESTINATIONS",
        "OPENING_NOT_TODAY",
        "OPENING_CHECKLIST_INCOMPLETE",
    ]:
        assert token in OPS


def test_staging_bundle_contains_profiles():
    assert "START OF OperatingProfiles.gs" in BUNDLE
    assert "operatingContextValidate" in BUNDLE
    assert "operatingContextsDatos" in BUNDLE
    assert "operatingActivityValidate_" in BUNDLE


def test_pos_records_phase_per_line():
    pos = (ROOT / "google-apps-script" / "POS.gs").read_text(encoding="utf-8")
    assert "sCaja.getRange(rowNum, 37).setValue(phase)" in pos
    assert "operatingContextValidate_" in pos
    assert "phase: phase" in pos


def run_all():
    tests = [
        test_profiles_are_canonical,
        test_context_is_transaction_scoped,
        test_context_never_writes_access_history,
        test_activity_switch_is_validated,
        test_rbac_and_routes,
        test_frontend_phase_toggle_is_not_local_only,
        test_readiness_detects_operational_blockers,
        test_staging_bundle_contains_profiles,
        test_pos_records_phase_per_line,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"{len(tests)}/{len(tests)} PASSED")


if __name__ == "__main__":
    run_all()
