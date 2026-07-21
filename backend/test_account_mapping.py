import pandas as pd
from engines.account_mapping.account_classifier import build_account_mapping_result

df = pd.DataFrame({
    "account_name": ["Cash at Bank", "Sales Revenue", "Rent Expense", "Accounts Payable"],
    "debit": [450000, 0, 180000, 0],
    "credit": [0, 700000, 0, 410000],
})
mapping = {
    "account_name": {"mapped_to": "account_name", "field_type": "text"},
    "debit": {"mapped_to": "debit", "field_type": "numeric"},
    "credit": {"mapped_to": "credit", "field_type": "numeric"},
}

result = build_account_mapping_result(df, mapping)
print("Applicable:", result["applicable"])
for acc in result["accounts"]:
    print(f"  {acc['account_name']} -> {acc['suggested_category']} (warning: {acc['warning']})")


# Test 2 — deliberately wrong classification to test the warning
df2 = pd.DataFrame({
    "account_name": ["Cash at Bank"],
    "debit": [0],
    "credit": [500000],  # Cash showing a credit balance — unusual
})
mapping2 = {
    "account_name": {"mapped_to": "account_name", "field_type": "text"},
    "debit": {"mapped_to": "debit", "field_type": "numeric"},
    "credit": {"mapped_to": "credit", "field_type": "numeric"},
}
result2 = build_account_mapping_result(df2, mapping2)
for acc in result2["accounts"]:
    print(f"  {acc['account_name']} -> {acc['suggested_category']} (warning: {acc['warning']})")



