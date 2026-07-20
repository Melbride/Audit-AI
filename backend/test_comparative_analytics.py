import pandas as pd

from engines.financial_reporting.comparative_analytics import generate_comparative_analytics


df = pd.DataFrame({
    "date": ["2024-12-31", "2024-12-31", "2024-12-31", "2025-12-31", "2025-12-31", "2025-12-31"],
    "account_name": ["Sales Revenue", "Cost of Sales", "Rent Expense", "Sales Revenue", "Cost of Sales", "Rent Expense"],
    "debit": [0, 500000, 100000, 0, 650000, 120000],
    "credit": [1000000, 0, 0, 1300000, 0, 0],
})

mapping = {
    "date": {"mapped_to": "date", "field_type": "date"},
    "account_name": {"mapped_to": "account_name", "field_type": "text"},
    "debit": {"mapped_to": "debit", "field_type": "numeric"},
    "credit": {"mapped_to": "credit", "field_type": "numeric"},
}

account_mapping = {
    "Sales Revenue": {"category": "Revenue"},
    "Cost of Sales": {"category": "Cost of Sales"},
    "Rent Expense": {"category": "Operating Expense"},
}

result = generate_comparative_analytics(df, mapping, account_mapping)
print("Available:", result["available"])
print("Periods:", result["periods"])
print("Revenue Change %:", result["latest_period_comparison"]["revenue_change_pct"])
print("Net Profit Change %:", result["latest_period_comparison"]["net_profit_change_pct"])
