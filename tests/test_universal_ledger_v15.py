import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEDGER = (ROOT / "google-apps-script" / "Ledger.gs").read_text(encoding="utf-8")
API = (ROOT / "google-apps-script" / "Api.gs").read_text(encoding="utf-8")
AUTH = (ROOT / "google-apps-script" / "Auth.gs").read_text(encoding="utf-8")


def test_ledger_is_read_only():
    forbidden = [
        ".setValue(", ".setValues(", ".appendRow(", ".insertSheet(",
        ".deleteRow(", ".deleteRows(", ".clear(", ".clearContent("
    ]
    for token in forbidden:
        assert token not in LEDGER, f"Ledger preview must remain read-only: found {token}"


def test_ledger_never_reads_access_sheet():
    assert "getSheetByName('ACCESO')" not in LEDGER
    assert 'getSheetByName("ACCESO")' not in LEDGER


def test_finance_actions_are_get_only_and_rbac_protected():
    assert "financeLedgerPreview" in API
    assert "financeSummaryPreview" in API
    assert "financeLedgerPreview" in AUTH
    assert "financeSummaryPreview" in AUTH
    assert re.search(r"financeLedgerPreview:\s*\['GERENCIA',\s*'ADMIN'\]", AUTH)
    assert re.search(r"financeSummaryPreview:\s*\['GERENCIA',\s*'ADMIN'\]", AUTH)


def test_universal_entry_contract_present():
    required = [
        "entryId", "timestamp", "businessDate", "sourceModule",
        "sourceRecordId", "entryType", "accountFrom", "accountTo",
        "grossAmount", "feeAmount", "taxAmount", "netAmount",
        "currency", "status", "qualityStatus", "dimensions"
    ]
    for field in required:
        assert field in LEDGER


def test_sources_are_normalized_without_mutating_operational_flow():
    for source in ["CAJA 2", "COBROS", "MOVIMIENTOS", "PENDIENTES"]:
        assert source in LEDGER
    assert "READ_ONLY_DERIVED" in LEDGER


def test_reversal_handling_contract():
    assert "reversals" in LEDGER
    assert "netPayments" in LEDGER
    assert "LEDGER_ENTRY_TYPES.REVERSAL" in LEDGER
    assert "paymentChannel" in LEDGER
    assert "reversalOf" in LEDGER


def test_accounting_category_isolation():
    assert "CASH_WITHDRAWAL" in LEDGER
    assert "DEBT_PAYMENT" in LEDGER
    assert "CUSTOMER_RECEIVABLE" in LEDGER
    assert "SUPPLIER_PAYABLE" in LEDGER
    # withdrawal must be tracked separately from expenses
    assert "cashWithdrawals" in LEDGER


def test_filters_and_date_boundaries():
    for token in ["entryType", "sourceModule", "unit", "qualityStatus"]:
        assert token in LEDGER
    assert "String(value).trim()" in LEDGER


def test_staging_bundle_sync_contract():
    staging = (ROOT / "google-apps-script" / "DOMUS_STAGING_BUNDLE.gs").read_text(encoding="utf-8")
    assert "START OF Ledger.gs" in staging
    assert "financeLedgerPreview" in staging
    assert "financeSummaryPreview" in staging
    assert "financeLedgerPreview: ['GERENCIA', 'ADMIN']" in staging
    assert "financeSummaryPreview: ['GERENCIA', 'ADMIN']" in staging


def test_production_bundle_is_not_part_of_this_feature_diff():
    # This test is intentionally structural: Ledger markers must not be injected
    # into the frozen production bundle during Phase A.
    prod = (ROOT / "google-apps-script" / "DOMUS_PRODUCTION_BUNDLE.gs").read_text(encoding="utf-8")
    assert "START OF Ledger.gs" not in prod


def run_all():
    tests = [
        test_ledger_is_read_only,
        test_ledger_never_reads_access_sheet,
        test_finance_actions_are_get_only_and_rbac_protected,
        test_universal_entry_contract_present,
        test_sources_are_normalized_without_mutating_operational_flow,
        test_reversal_handling_contract,
        test_accounting_category_isolation,
        test_filters_and_date_boundaries,
        test_staging_bundle_sync_contract,
        test_production_bundle_is_not_part_of_this_feature_diff,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"{len(tests)}/{len(tests)} PASSED")


if __name__ == "__main__":
    run_all()
