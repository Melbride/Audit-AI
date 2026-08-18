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


def _build_balance_sheet_note(balance_sheet_difference: float, net_profit: float, unclassified_count: int) -> str | None:
    """
    Build a context-aware balance sheet note that matches the numbers on the page.
    The note stays descriptive and avoids implying an error when the difference may
    simply reflect an unclosed period result or excluded accounts.
    """
    if balance_sheet_difference == 0:
        return None

    direction = "higher" if balance_sheet_difference > 0 else "lower"
    lines = [
        f"Balance sheet check: assets are {abs(balance_sheet_difference):,.2f} {direction} than liabilities plus equity."
    ]

    if unclassified_count > 0:
        lines.append(
            f"{unclassified_count} account(s) were excluded because they are still unclassified in Account Mapping."
        )

    if net_profit > 0:
        lines.append(
            f"The income statement shows a net profit of {net_profit:,.2f}."
        )
        lines.append(
            "If closing entries have not yet been posted, part of this gap may still need to be rolled into retained earnings."
        )
    elif net_profit < 0:
        lines.append(
            f"The income statement shows a net loss of {abs(net_profit):,.2f}."
        )
        lines.append(
            "If closing entries have not yet been posted, part of this gap may still need to be reflected in retained earnings."
        )
    else:
        lines.append(
            "The income statement currently shows no net profit or loss to explain the gap."
        )

    lines.append(
        "Review the income statement and account mapping together before treating this as an error."
    )
    return " ".join(lines)


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
    
    # Check if the columns actually exist in the dataframe
    if account_name_col not in df.columns or debit_col not in df.columns or credit_col not in df.columns:
        return {
            "applicable": False,
            "message": (
                "Financial statements require 'Account Name', 'Debit', and 'Credit' "
                "columns to exist in the data file."
            ),
        }
    
    # Convert the debit and credit columns to numeric values, coercing errors to NaN and filling them with 0.
    debit_values = pd.to_numeric(df[debit_col], errors="coerce").fillna(0)
    credit_values = pd.to_numeric(df[credit_col], errors="coerce").fillna(0)
    
    # Group the DataFrame by account name and sum the debit and credit values for each account.
    # Handle empty account names gracefully
    temp_df = pd.DataFrame({
        "account_name": df[account_name_col].astype(str).str.strip(),
        "debit": debit_values,
        "credit": credit_values,
    })
    
    # Remove rows with empty account names
    temp_df = temp_df[temp_df["account_name"] != ""]
    temp_df = temp_df.dropna(subset=["account_name"])
    
    if temp_df.empty:
        return {
            "applicable": False,
            "message": "No valid account names found in the data.",
        }
    
    grouped = temp_df.groupby("account_name", as_index=False).sum()
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
            "note": _build_balance_sheet_note(
                balance_sheet_difference,
                net_profit,
                len(unclassified_accounts),
            ),
        },
        "unclassified_accounts": unclassified_accounts,
        "message": (
            f"Financial statements generated. {len(unclassified_accounts)} "
            f"account(s) were excluded because they have not been classified yet."
            if unclassified_accounts else
            "Financial statements generated successfully."
        ),
    }
