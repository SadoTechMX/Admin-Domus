import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEDGER = (ROOT / "google-apps-script" / "Ledger.gs").read_text(encoding="utf-8")
API = (ROOT / "google-apps-script" / "Api.gs").read_text(encoding="utf-8")
AUTH = (ROOT / "google-apps-script" / "Auth.gs").read_text(encoding="utf-8")


def test_daily_and_dashboard_endpoints_exist():
    for action in ["financeDailyPreview", "financeDashboardPreview"]:
        assert action in API
        assert action in AUTH
        assert re.search(rf"{action}:\s*\['GERENCIA',\s*'ADMIN'\]", AUTH)


def test_daily_dimensions_exist():
    for token in [
        "byProductSales", "byProviderSales", "byEventSales",
        "byStaffActivity", "byPaymentChannel", "byUnit", "quality",
        "obligationQuality"
    ]:
        assert token in LEDGER


def test_daily_is_actually_daily():
    assert "Utilities.formatDate(new Date()" in LEDGER
    assert "businessDate: businessDate" in LEDGER


def test_obligation_quality_is_split():
    for token in ["payablesConfirmed", "payablesUnderReview", "receivablesConfirmed", "receivablesUnderReview"]:
        assert token in LEDGER


def test_dashboard_never_claims_net_profit_without_cogs():
    assert "operatingResultBeforeCogs" in LEDGER
    assert "no equivale a utilidad neta" in LEDGER


def test_phase_remains_read_only():
    forbidden = [".setValue(", ".setValues(", ".appendRow(", ".insertSheet(", ".deleteRow(", ".clear("]
    for token in forbidden:
        assert token not in LEDGER


def test_staging_bundle_contains_daily_and_dashboard():
    staging = (ROOT / "google-apps-script" / "DOMUS_STAGING_BUNDLE.gs").read_text(encoding="utf-8")
    for action in ["financeDailyPreview", "financeDashboardPreview"]:
        assert action in staging
        assert f"{action}: ['GERENCIA', 'ADMIN']" in staging
    assert "operatingResultBeforeCogs" in staging


def run_all():
    tests = [
        test_daily_and_dashboard_endpoints_exist,
        test_daily_dimensions_exist,
        test_daily_is_actually_daily,
        test_obligation_quality_is_split,
        test_dashboard_never_claims_net_profit_without_cogs,
        test_phase_remains_read_only,
        test_staging_bundle_contains_daily_and_dashboard,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"{len(tests)}/{len(tests)} PASSED")


if __name__ == "__main__":
    run_all()
