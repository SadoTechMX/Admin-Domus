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
