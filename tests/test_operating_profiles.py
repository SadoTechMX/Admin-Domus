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


def test_profile_set_persists_server_phase():
    assert "getRange('F2').setValue(profile)" in OPS
    assert "domusOperatingProfile" in OPS
    assert "actividadAcceso" in OPS


def test_profile_set_never_writes_access_history():
    assert "getSheetByName('ACCESO')" not in OPS
    assert ".appendRow(" not in OPS


def test_activity_switch_is_validated():
    assert "operatingActivityValidate_(act)" in ACCESS
    assert "OPERATING_ACTIVITY_NOT_CONFIRMED" in OPS


def test_rbac_and_routes():
    assert "operatingProfileDatos" in API
    assert "operatingProfileSet" in API
    assert re.search(r"operatingProfileDatos:\s*\['CAJA',\s*'ACCESOS',\s*'GERENCIA',\s*'ADMIN'\]", AUTH)
    assert re.search(r"operatingProfileSet:\s*\['CAJA',\s*'GERENCIA',\s*'ADMIN'\]", AUTH)


def test_frontend_phase_toggle_is_not_local_only():
    block = APP[APP.index("// Phase Switcher (Solar / Lunar)"):APP.index("// Botón Reintentar Outbox")]
    assert "operatingProfileSet" in block
    assert "await loadCajaData()" in block


def test_readiness_detects_operational_blockers():
    for token in [
        "ACTIVE_ACTIVITY_NOT_FOUND",
        "ACTIVE_ACTIVITY_NOT_CONFIRMED",
        "NO_ACTIVE_PRODUCTS",
        "CATALOG_PHASE_PRICE_GAPS",
        "INVALID_KDS_DESTINATIONS",
        "OPENING_NOT_TODAY",
        "OPENING_CHECKLIST_INCOMPLETE",
    ]:
        assert token in OPS


def test_staging_bundle_contains_profiles():
    assert "START OF OperatingProfiles.gs" in BUNDLE
    assert "operatingProfileSet" in BUNDLE
    assert "operatingActivityValidate_" in BUNDLE


def run_all():
    tests = [
        test_profiles_are_canonical,
        test_profile_set_persists_server_phase,
        test_profile_set_never_writes_access_history,
        test_activity_switch_is_validated,
        test_rbac_and_routes,
        test_frontend_phase_toggle_is_not_local_only,
        test_readiness_detects_operational_blockers,
        test_staging_bundle_contains_profiles,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"{len(tests)}/{len(tests)} PASSED")


if __name__ == "__main__":
    run_all()
