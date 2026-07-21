import pandas as pd
from engines.financial_reporting.statement_generator import generate_financial_statements

df = pd.DataFrame({
    "account_name": [
        "Cash at Bank (KCB)", "Accounts Receivable", "Inventory", "Motor Vehicles",
        "Accounts Payable", "Equity Bank Loan", "Share Capital",
        "Sales Revenue", "Cost of Sales", "Rent Expense", "Salaries & Wages"
    ],
    "debit": [450000, 320000, 680000, 2400000, 0, 0, 0, 0, 1100000, 180000, 720000],
    "credit": [0, 0, 0, 0, 410000, 1500000, 1800000, 2140000, 0, 0, 0],
})
mapping = {
    "account_name": {"mapped_to": "account_name", "field_type": "text"},
    "debit": {"mapped_to": "debit", "field_type": "numeric"},
    "credit": {"mapped_to": "credit", "field_type": "numeric"},
}
account_mapping = {
    "Cash at Bank (KCB)": {"category": "Cash & Cash Equivalents"},
    "Accounts Receivable": {"category": "Trade Receivables"},
    "Inventory": {"category": "Inventory"},
    "Motor Vehicles": {"category": "Fixed Asset"},
    "Accounts Payable": {"category": "Trade Payables"},
    "Equity Bank Loan": {"category": "Long-term Liability"},
    "Share Capital": {"category": "Share Capital"},
    "Sales Revenue": {"category": "Revenue"},
    "Cost of Sales": {"category": "Cost of Sales"},
    "Rent Expense": {"category": "Operating Expense"},
    "Salaries & Wages": {"category": "Administrative Expense"},
}

result = generate_financial_statements(df, mapping, account_mapping)
print("Income Statement:")
print("  Total Revenue:", result["income_statement"]["total_revenue"])
print("  Total Expenses:", result["income_statement"]["total_expenses"])
print("  Net Profit:", result["income_statement"]["net_profit"])
print("\nBalance Sheet:")
print("  Total Assets:", result["balance_sheet"]["total_assets"])
print("  Total Liabilities:", result["balance_sheet"]["total_liabilities"])
print("  Total Equity:", result["balance_sheet"]["total_equity"])
print("  Difference:", result["balance_sheet"]["difference"])
print("  Note:", result["balance_sheet"]["note"])