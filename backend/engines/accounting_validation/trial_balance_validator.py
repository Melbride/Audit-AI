import pandas as pd
from datetime import datetime


def get_standardized_field(mapping: dict, target: str) -> str | None:
    alternatives = {
        "debit": ["debit", "debit_amount"],
        "credit": ["credit", "credit_amount"],
        "account_name": ["account_name", "account_description"],
        "account_code": ["account_code", "account_number"],
    }

    valid_targets = alternatives.get(target, [target])

    for info in mapping.values():
        if not isinstance(info, dict):
            continue

        mapped_to = str(info.get("mapped_to", "")).strip().lower()

        if mapped_to in [x.lower() for x in valid_targets]:
            return info.get("mapped_to")

    return None


def trial_balance_columns_present(mapping: dict) -> dict:
    return {
        "debit": get_standardized_field(mapping, "debit"),
        "credit": get_standardized_field(mapping, "credit"),
        "account_name": get_standardized_field(mapping, "account_name"),
        "account_code": get_standardized_field(mapping, "account_code"),
    }


def _has_values(series: pd.Series) -> bool:
    """
    True if the column contains at least one real value.
    Empty strings, whitespace and NaN are considered missing.
    """
    if series is None:
        return False

    cleaned = series.astype(str).str.strip()

    return (
        series.notna()
        & cleaned.ne("")
        & cleaned.ne("nan")
    ).any()


def validate_trial_balance(df: pd.DataFrame, mapping: dict) -> dict:

    if df is None:
        return {
            "type": "trial_balance_validation",
            "applicable": True,
            "status": "failed",
            "can_proceed": False,
            "message": "Trial Balance validation could not run because no cleaned data was supplied.",
            "issues": [],
        }

    columns = trial_balance_columns_present(mapping)

    debit_col = columns["debit"]
    credit_col = columns["credit"]
    account_name_col = columns["account_name"]
    account_code_col = columns["account_code"]

    # ---------------------------------------------------------
    # Required Debit / Credit mapping
    # ---------------------------------------------------------

    if not debit_col or not credit_col:

        missing = []

        if not debit_col:
            missing.append("Debit")

        if not credit_col:
            missing.append("Credit")

        return {
            "type": "trial_balance_validation",
            "applicable": True,
            "status": "failed",
            "can_proceed": False,
            "message": (
                "Trial Balance validation requires both Debit and Credit "
                f"columns to be mapped. Missing: {', '.join(missing)}."
            ),
            "issues": [{
                "check": "required_amount_columns",
                "severity": "high",
                "message": (
                    f"Required Trial Balance column(s) not mapped: "
                    f"{', '.join(missing)}."
                ),
            }],
            "total_issues": 1,
            "high_issues": 1,
            "medium_issues": 0,
        }

    # ---------------------------------------------------------
    # Check that both amount columns actually contain data
    # ---------------------------------------------------------

    debit_has_values = (
        debit_col in df.columns
        and _has_values(df[debit_col])
    )

    credit_has_values = (
        credit_col in df.columns
        and _has_values(df[credit_col])
    )

    missing_amount_columns = []

    if not debit_has_values:
        missing_amount_columns.append("Debit")

    if not credit_has_values:
        missing_amount_columns.append("Credit")

    if missing_amount_columns:

        return {
            "type": "trial_balance_validation",
            "applicable": True,
            "status": "failed",
            "can_proceed": False,
            "summary": {
                "checks_run": 1,
                "checks_passed": 0,
                "checks_failed": 1,
            },
            "checks": [{
                "name": "Required Amount Data",
                "order": 1,
                "status": "FAIL",
            }],
            "total_debits": 0.0,
            "total_credits": 0.0,
            "difference": 0.0,
            "is_balanced": False,
            "total_issues": 1,
            "high_issues": 1,
            "medium_issues": 0,
            "issues": [{
                "check": "missing_amount_data",
                "severity": "high",
                "message": (
                    "The Trial Balance has no data in the required "
                    f"{', '.join(missing_amount_columns)} column(s). "
                    "Review the uploaded file and confirm the correct "
                    "amount data is present."
                ),
            }],
            "validated_at": datetime.utcnow().strftime(
                "%Y-%m-%dT%H:%M:%S"
            ),
            "message": (
                "Trial Balance validation failed because the "
                f"{', '.join(missing_amount_columns)} column(s) "
                "contain no data."
            ),
        }

    # ---------------------------------------------------------
    # Convert amounts to numeric
    # ---------------------------------------------------------

    debit_values = pd.to_numeric(
        df[debit_col],
        errors="coerce"
    ).fillna(0)

    credit_values = pd.to_numeric(
        df[credit_col],
        errors="coerce"
    ).fillna(0)

    total_debits = float(debit_values.sum())
    total_credits = float(credit_values.sum())

    difference = round(
        total_debits - total_credits,
        2
    )

    is_balanced = abs(difference) < 0.01

    issues = []

    # ---------------------------------------------------------
    # Required columns
    # ---------------------------------------------------------

    check_required_columns = {
        "name": "Required Columns",
        "order": 1,
        "status": "PASS",
    }

    # ---------------------------------------------------------
    # Debit = Credit
    # ---------------------------------------------------------

    if not is_balanced:

        issues.append({
            "check": "debits_equal_credits",
            "severity": "high",
            "message": (
                f"Trial balance does not balance. Total debits "
                f"({total_debits:,.2f}) and total credits "
                f"({total_credits:,.2f}) differ by "
                f"{abs(difference):,.2f}. Review the imported "
                "balances before proceeding."
            ),
        })

    check_balance = {
        "name": "Debits Equal Credits",
        "order": 2,
        "status": "PASS" if is_balanced else "FAIL",
    }

    # ---------------------------------------------------------
    # Duplicate account codes
    # ---------------------------------------------------------

    duplicate_issues_before = len(issues)

    if (
        account_code_col
        and account_code_col in df.columns
    ):

        codes = df[account_code_col].astype(str).str.strip()

        valid_codes = codes[
            codes.ne("")
            & codes.ne("nan")
        ]

        duplicated = valid_codes[
            valid_codes.duplicated(keep=False)
        ]

        for code in duplicated.unique():

            rows = df[
                codes == code
            ].index.tolist()

            row_numbers = [
                int(r) + 2
                for r in rows
            ]

            issues.append({
                "check": "duplicate_account_code",
                "severity": "medium",
                "message": (
                    f"Account code '{code}' appears in multiple "
                    f"rows ({row_numbers}). Verify whether these "
                    "are duplicate entries."
                ),
            })

    check_duplicates = {
        "name": "Duplicate Account Codes",
        "order": 3,
        "status": (
            "PASS"
            if len(issues) == duplicate_issues_before
            else "FAIL"
        ),
    }

    # ---------------------------------------------------------
    # Missing account names
    # ---------------------------------------------------------

    missing_name_issues_before = len(issues)

    if (
        account_name_col
        and account_name_col in df.columns
    ):

        missing_names = df[
            df[account_name_col].isna()
            | (
                df[account_name_col]
                .astype(str)
                .str.strip()
                .eq("")
            )
        ]

        for idx in missing_names.index:

            issues.append({
                "check": "missing_account_name",
                "severity": "high",
                "row": int(idx) + 2,
                "message": (
                    f"Row {int(idx) + 2} is missing an account name. "
                    "Every account must be identified before proceeding."
                ),
            })

    check_missing_names = {
        "name": "Missing Account Names",
        "order": 4,
        "status": (
            "PASS"
            if len(issues) == missing_name_issues_before
            else "FAIL"
        ),
    }

    # ---------------------------------------------------------
    # Negative Debit
    # ---------------------------------------------------------

    negative_debits = df[
        debit_values < 0
    ]

    for idx in negative_debits.index:

        issues.append({
            "check": "negative_debit",
            "severity": "medium",
            "row": int(idx) + 2,
            "message": (
                f"Row {int(idx) + 2} has a negative debit value. "
                "Verify the entry."
            ),
        })

    # ---------------------------------------------------------
    # Negative Credit
    # ---------------------------------------------------------

    negative_credits = df[
        credit_values < 0
    ]

    for idx in negative_credits.index:

        issues.append({
            "check": "negative_credit",
            "severity": "medium",
            "row": int(idx) + 2,
            "message": (
                f"Row {int(idx) + 2} has a negative credit value. "
                "Verify the entry."
            ),
        })

    checks = [
        check_required_columns,
        check_balance,
        check_duplicates,
        check_missing_names,
    ]

    checks_passed = sum(
        1 for check in checks
        if check["status"] == "PASS"
    )

    checks_failed = sum(
        1 for check in checks
        if check["status"] == "FAIL"
    )

    high_issues = [
        issue for issue in issues
        if issue["severity"] == "high"
    ]

    medium_issues = [
        issue for issue in issues
        if issue["severity"] == "medium"
    ]

    overall_passed = checks_failed == 0

    return {
        "type": "trial_balance_validation",
        "applicable": True,
        "status": (
            "passed"
            if overall_passed
            else "failed"
        ),
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
        "medium_issues": len(medium_issues),
        "issues": issues,
        "validated_at": datetime.utcnow().strftime(
            "%Y-%m-%dT%H:%M:%S"
        ),
        "message": (
            "Trial balance passed all checks."
            if overall_passed
            else "Trial balance validation found issues. "
                 "Review before proceeding."
        ),
    }