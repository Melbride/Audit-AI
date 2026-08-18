
import pandas as pd
from datetime import datetime

# Helper functions for trial balance validation
def get_standardized_field(mapping: dict, target: str) -> str | None:
    """
    Returns the actual column name in the DataFrame for a given standardized target.
    The cleaning step has already renamed dataframe columns to their
    standardized names, so this helper confirms whether a required field
    was mapped and returns the actual column name to use for DataFrame access.
    """
    # Define alternative names for each target to handle different mapping conventions
    alternatives = {
        "debit": ["debit", "debit_amount"],
        "credit": ["credit", "credit_amount"],
        "account_name": ["account_name", "account_description"],
        "account_code": ["account_code", "account_number"]
    }
    
    valid_targets = alternatives.get(target, [target])
    
    for info in mapping.values():
        if isinstance(info, dict) and info.get("mapped_to") in valid_targets:
            return info.get("mapped_to")  # Return the actual mapped column name
    return None

# trial balance validation functions
def trial_balance_columns_present(mapping: dict) -> dict:
    """
    Checks which of the required trial balance columns exist in this
    mapping. Returns a dict indicating what's available, so the caller
    can decide whether validation is even possible for this file.
    """
    return {
        "debit": get_standardized_field(mapping, "debit"),
        "credit": get_standardized_field(mapping, "credit"),
        "account_name": get_standardized_field(mapping, "account_name"),
        "account_code": get_standardized_field(mapping, "account_code"),
    }

# trial balance validation
def validate_trial_balance(df: pd.DataFrame, mapping: dict) -> dict:
    """
    Validates a cleaned trial balance dataset. Requires both a debit
    and credit column to be mapped, if either is missing, returns a
    clear "not applicable" result rather than guessing or skipping silently.
    Returns a report dict with overall status, summary, per-check results,
    can_proceed flag, and a validation timestamp.
    """
    columns = trial_balance_columns_present(mapping)
    if not columns["debit"] or not columns["credit"]:
        return {
            "applicable": False,
            "status": "not_applicable",
            "can_proceed": False,
            "message": (
                "Trial balance validation requires both a 'Debit' and 'Credit' "
                "column to be mapped. This file does not have both, so this "
                "check has been skipped."
            ),
            "issues": [],
        }
    # Extract the relevant columns from the DataFrame
    debit_col = columns["debit"]
    credit_col = columns["credit"]
    account_name_col = columns["account_name"]
    account_code_col = columns["account_code"]
    # Initialize an empty list to track issues found during validation
    issues = []
    # Convert debit and credit columns to numeric, treating non-numeric values as 0
    debit_values = pd.to_numeric(df[debit_col], errors="coerce").fillna(0)
    credit_values = pd.to_numeric(df[credit_col], errors="coerce").fillna(0)
    # Calculate total debits and credits, rounding to 2 decimal places for comparison
    total_debits = float(debit_values.sum())
    total_credits = float(credit_values.sum())
    difference = round(total_debits - total_credits, 2)
    is_balanced = abs(difference) < 0.01

    # Required columns present
    required_cols_present = bool(columns["debit"] and columns["credit"])
    check_required_columns = {
        "name": "Required Columns",
        "order": 1,
        "status": "PASS" if required_cols_present else "FAIL",
    }

    # Debits equal credits
    if not is_balanced:
        issues.append({
            "check": "debits_equal_credits",
            "severity": "high",
            "message": (
                f"Trial balance does not balance. Total debits ({total_debits:,.2f}) "
                f"and total credits ({total_credits:,.2f}) differ by "
                f"{abs(difference):,.2f}. This may indicate missing entries, "
                f"incorrect classifications, or incomplete data. Review recent "
                f"journal entries or the imported balances before proceeding."
            ),
        })
    check_balance = {
        "name": "Debits Equal Credits",
        "order": 2,
        "status": "PASS" if is_balanced else "FAIL",
    }

    # Duplicate account codes
    duplicate_issues_before = len(issues)
    if account_code_col:
        code_counts = df[account_code_col].astype(str).str.strip()
        duplicated = code_counts[code_counts.duplicated(keep=False) & (code_counts != "")]
        for code in duplicated.unique():
            rows = df[code_counts == code].index.tolist()
            row_numbers = [int(r) + 2 for r in rows]
            issues.append({
                "check": "duplicate_account_code",
                "severity": "medium",
                "message": (
                    f"Account code '{code}' appears in multiple rows ({row_numbers}). "
                    f"Each account should have a unique code, verify these are not "
                    f"duplicate entries for the same account."
                ),
            })
    check_duplicates = {
        "name": "Duplicate Account Codes",
        "order": 3,
        "status": "PASS" if len(issues) == duplicate_issues_before else "FAIL",
    }

    # Missing account names
    missing_name_issues_before = len(issues)
    if account_name_col:
        missing_names = df[df[account_name_col].isna() | (df[account_name_col].astype(str).str.strip() == "")]
        for idx in missing_names.index:
            issues.append({
                "check": "missing_account_name",
                "severity": "high",
                "row": int(idx) + 2,
                "message": f"Row {int(idx) + 2} is missing an account name. Every account must be identified before proceeding.",
            })
    check_missing_names = {
        "name": "Missing Account Names",
        "order": 4,
        "status": "PASS" if len(issues) == missing_name_issues_before else "FAIL",
    }

    # Negative debit/credit issues still tracked in issues list for detail
    negative_debits = df[debit_values < 0]
    for idx in negative_debits.index:
        issues.append({
            "check": "negative_debit",
            "severity": "medium",
            "row": int(idx) + 2,
            "message": f"Row {int(idx) + 2} has a negative debit value. This usually indicates an incorrect entry or presentation.",
        })
    # Negative debit/credit issues still tracked in issues list for detail
    negative_credits = df[credit_values < 0]
    for idx in negative_credits.index:
        issues.append({
            "check": "negative_credit",
            "severity": "medium",
            "row": int(idx) + 2,
            "message": f"Row {int(idx) + 2} has a negative credit value. This usually indicates an incorrect entry or presentation.",
        })
    # Check statuses
    checks = [
        check_required_columns,
        check_balance,
        check_duplicates,
        check_missing_names,
    ]
    # Summarize the results
    checks_passed = sum(1 for c in checks if c["status"] == "PASS")
    checks_failed = sum(1 for c in checks if c["status"] == "FAIL")
    high_issues = [i for i in issues if i["severity"] == "high"]
    overall_passed = checks_failed == 0
    # Return a structured report
    return {
        "type": "trial_balance_validation",
        "applicable": True,
        "status": "passed" if overall_passed else "failed",
        "can_proceed": overall_passed,
        "summary": {
            "checks_run": len(checks),
            "checks_passed": checks_passed,
            "checks_failed": checks_failed,
        },
        "checks": checks,
        "total_debits": total_debits,
        "total_credits": total_credits,
        "difference": difference,
        "is_balanced": is_balanced,
        "total_issues": len(issues),
        "high_issues": len(high_issues),
        "medium_issues": len([i for i in issues if i["severity"] == "medium"]),
        "issues": issues,
        "validated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"),
        "message": (
            "Trial balance passed all checks."
            if overall_passed
            else "Trial balance validation found issues, review before proceeding."
        ),
    }