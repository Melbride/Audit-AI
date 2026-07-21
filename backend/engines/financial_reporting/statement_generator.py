import pandas as pd


# Which standard categories belong to which statement, and which section of that statement they fall under.
INCOME_STATEMENT_CATEGORIES = {
    "Revenue": "revenue",
    "Other Income": "revenue",
    "Cost of Sales": "expense",
    "Operating Expense": "expense",
    "Administrative Expense": "expense",
    "Finance Cost": "expense",
}

BALANCE_SHEET_CATEGORIES = {
    "Cash & Cash Equivalents": "asset",
    "Trade Receivables": "asset",
    "Inventory": "asset",
    "Other Current Asset": "asset",
    "Fixed Asset": "asset",
    "Trade Payables": "liability",
    "Current Liability": "liability",
    "Long-term Liability": "liability",
    "Share Capital": "equity",
    "Retained Earnings": "equity",
}
# Function to generate financial statements from a trial balance DataFrame and account mapping.
def generate_financial_statements(df: pd.DataFrame, mapping: dict, account_mapping: dict) -> dict:
    """
    Generates the Income Statement and Balance Sheet from a cleaned trial balance and its confirmed account category classifications.
    Only accounts with a category that has been explicitly confirmed (not "unknown") are included. Returns each statement's line items,
    the required totals, and a note on any accounts that were excluded because they were never classified.
    """
    # Find the columns in the mapping that correspond to account name, debit, and credit.
    account_name_col = None
    debit_col = None
    credit_col = None
    # Loop through the mapping to identify which columns correspond to account name, debit, and credit.
    for info in mapping.values():
        if isinstance(info, dict):
            if info.get("mapped_to") == "account_name":
                account_name_col = "account_name"
            elif info.get("mapped_to") == "debit":
                debit_col = "debit"
            elif info.get("mapped_to") == "credit":
                credit_col = "credit"
    # When the columns are identified, check if all three are present. If any are missing, return a result indicating that the statements cannot be generated.
    if not account_name_col or not debit_col or not credit_col:
        return {
            "applicable": False,
            "message": (
                "Financial statements require 'Account Name', 'Debit', and 'Credit' "
                "columns to be mapped."
            ),
        }
    # Convert the debit and credit columns to numeric values, coercing errors to NaN and filling them with 0.
    debit_values = pd.to_numeric(df[debit_col], errors="coerce").fillna(0)
    credit_values = pd.to_numeric(df[credit_col], errors="coerce").fillna(0)
    # Group the DataFrame by account name and sum the debit and credit values for each account.
    grouped = pd.DataFrame({
        "account_name": df[account_name_col],
        "debit": debit_values,
        "credit": credit_values,
    }).groupby("account_name", as_index=False).sum()
    # Initialize lists to hold unclassified accounts and categorized items for the income statement and balance sheet.
    unclassified_accounts = []
    # Initialize lists to hold categorized items for the income statement and balance sheet.
    revenue_items = []
    expense_items = []
    asset_items = []
    liability_items = []
    equity_items = []
    # Loop through each row in the grouped DataFrame to classify accounts and calculate their net amounts.
    for _, row in grouped.iterrows():
        name = row["account_name"]
        saved = account_mapping.get(name)
        category = saved["category"] if saved else None
        # If the account has no category or is classified as "unknown", add it to the unclassified accounts list and skip further processing for this account.
        if not category or category == "unknown":
            unclassified_accounts.append(name)
            continue
        # Net balance for this account, expenses/assets show as their debit total, revenue/liability/equity show as their credit total,
        # since that's each category's normal balance direction
        net_debit = float(row["debit"])
        net_credit = float(row["credit"])
        net_amount = net_debit if net_debit > net_credit else net_credit
        # Determine which statement and section the account belongs to based on its category, and add it to the appropriate list of items.
        if category in INCOME_STATEMENT_CATEGORIES:
            section = INCOME_STATEMENT_CATEGORIES[category]
            item = {"account_name": name, "category": category, "amount": net_amount}
            if section == "revenue":
                revenue_items.append(item)
            else:
                expense_items.append(item)
        # If the account belongs to the balance sheet categories, determine its section and add it to the appropriate list of items.
        elif category in BALANCE_SHEET_CATEGORIES:
            section = BALANCE_SHEET_CATEGORIES[category]
            item = {"account_name": name, "category": category, "amount": net_amount}
            if section == "asset":
                asset_items.append(item)
            elif section == "liability":
                liability_items.append(item)
            elif section == "equity":
                equity_items.append(item)
    # Calculate totals for revenue, expenses, assets, liabilities, and equity, as well as the net profit and balance sheet difference.
    total_revenue = sum(i["amount"] for i in revenue_items)
    total_expenses = sum(i["amount"] for i in expense_items)
    net_profit = round(total_revenue - total_expenses, 2)
    # Calculate totals for assets, liabilities, and equity.
    total_assets = sum(i["amount"] for i in asset_items)
    total_liabilities = sum(i["amount"] for i in liability_items)
    total_equity = sum(i["amount"] for i in equity_items)
    # Calculate the difference between total assets and the sum of total liabilities and total equity, rounding to two decimal places.
    balance_sheet_difference = round(total_assets - (total_liabilities + total_equity), 2)
    # Return a dictionary containing the generated financial statements, categorized items, totals, and any unclassified accounts.
    return {
        "applicable": True,
        "income_statement": {
            "revenue": revenue_items,
            "expenses": expense_items,
            "total_revenue": total_revenue,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
        },
        "balance_sheet": {
            "assets": asset_items,
            "liabilities": liability_items,
            "equity": equity_items,
            "total_assets": total_assets,
            "total_liabilities": total_liabilities,
            "total_equity": total_equity,
            "difference": balance_sheet_difference,
            "note": (
                "Note: Total Assets do not equal Total Liabilities plus Equity "
                f"(difference of {balance_sheet_difference:,.2f}). This Balance "
                "Sheet does not include this period's Net Profit/Loss in "
                "Retained Earnings. If this trial balance is a complete, "
                "properly balanced set of accounts, this difference would "
                "typically correspond to the period's Net Profit or Loss, "
                "please verify against the Income Statement rather than "
                "assuming this automatically."
            ) if balance_sheet_difference != 0 else None,
        },
        "unclassified_accounts": unclassified_accounts,
        "message": (
            f"Financial statements generated. {len(unclassified_accounts)} "
            f"account(s) were excluded because they have not been classified yet."
            if unclassified_accounts else
            "Financial statements generated successfully."
        ),
    }