import pandas as pd
from engines.accounting_validation.trial_balance_validator import validate_trial_balance

# Test 1 — balanced, clean trial balance
df = pd.DataFrame({
    "account_name": ["Cash", "Sales", "Rent"],
    "account_code": ["1001", "4001", "5001"],
    "debit": [50000, 0, 20000],
    "credit": [0, 70000, 0],
})
mapping = {
    "account_name": {"mapped_to": "account_name", "field_type": "text"},
    "account_code": {"mapped_to": "account_code", "field_type": "text"},
    "debit": {"mapped_to": "debit", "field_type": "numeric"},
    "credit": {"mapped_to": "credit", "field_type": "numeric"},
}
result = validate_trial_balance(df, mapping)
print("Test 1 (balanced):", result["status"], "| Debits:", result["total_debits"], "| Credits:", result["total_credits"])

# Test 2 — unbalanced, with a missing account name and duplicate code
df2 = pd.DataFrame({
    "account_name": ["Cash", "", "Rent"],
    "account_code": ["1001", "1001", "5001"],
    "debit": [50000, 0, 20000],
    "credit": [0, 60000, 0],
})
result2 = validate_trial_balance(df2, mapping)
print("Test 2 (issues):", result2["status"], "| Total issues:", result2["total_issues"])
for issue in result2["issues"]:
    print("  -", issue["check"], ":", issue["message"])