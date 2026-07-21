from engines.financial_reporting.financial_ratios import calculate_financial_ratios

income_statement = {
    "total_revenue": 2140000,
    "total_expenses": 2000000,
    "net_profit": 140000,
    "expenses": [
        {"account_name": "Cost Of Sales", "category": "Cost of Sales", "amount": 1100000},
        {"account_name": "Rent Expense", "category": "Operating Expense", "amount": 180000},
        {"account_name": "Salaries & Wages", "category": "Operating Expense", "amount": 720000},
    ],
}
balance_sheet = {
    "total_liabilities": 1910000,
    "total_equity": 1800000,
}

result = calculate_financial_ratios(income_statement, balance_sheet)
print("Gross Profit Margin:", result["gross_profit_margin"], "%")
print("Net Profit Margin:", result["net_profit_margin"], "%")
print("Debt to Equity:", result["debt_to_equity"])
print("Expense Breakdown:", result["expense_breakdown_pct"])