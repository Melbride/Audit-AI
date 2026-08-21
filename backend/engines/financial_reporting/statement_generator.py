import pandas as pd


# Standard category definitions
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
    "Restricted Net Assets": "equity",
    "Unrestricted Net Assets": "equity",
}


def _build_balance_sheet_note(balance_sheet_difference: float, net_profit: float, unclassified_count: int, currency: str = "KSH") -> str | None:
    """
    Build a context-aware balance sheet note using KSH currency.
    """
    if balance_sheet_difference == 0:
        return None

    direction = "higher" if balance_sheet_difference > 0 else "lower"
    lines = [
        f"Balance sheet check: assets are {currency} {abs(balance_sheet_difference):,.2f} {direction} than liabilities plus equity."
    ]

    if unclassified_count > 0:
        lines.append(
            f"{unclassified_count} account(s) were excluded because they are still unclassified in Account Mapping."
        )

    if net_profit > 0:
        lines.append(
            f"The income statement shows a net profit of {currency} {net_profit:,.2f}."
        )
        lines.append(
            "If closing entries have not yet been posted, part of this gap may still need to be rolled into retained earnings."
        )
    elif net_profit < 0:
        lines.append(
            f"The income statement shows a net loss of {currency} {abs(net_profit):,.2f}."
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


def generate_financial_statements(df: pd.DataFrame, mapping: dict, account_mapping: dict, currency: str = "KSH") -> dict:
    """
    Generates the Income Statement and Balance Sheet with KSH formatting.
    """
    account_name_col = None
    debit_col = None
    credit_col = None

    for info in mapping.values():
        if isinstance(info, dict):
            if info.get("mapped_to") == "account_name":
                account_name_col = "account_name"
            elif info.get("mapped_to") == "debit":
                debit_col = "debit"
            elif info.get("mapped_to") == "credit":
                credit_col = "credit"
    
    if not account_name_col or not debit_col or not credit_col:
        return {
            "applicable": False,
            "message": "Financial statements require 'Account Name', 'Debit', and 'Credit' columns to be mapped.",
        }
    
    if account_name_col not in df.columns or debit_col not in df.columns or credit_col not in df.columns:
        return {
            "applicable": False,
            "message": "Financial statements require 'Account Name', 'Debit', and 'Credit' columns to exist in the data file.",
        }
    
    debit_values = pd.to_numeric(df[debit_col], errors="coerce").fillna(0)
    credit_values = pd.to_numeric(df[credit_col], errors="coerce").fillna(0)
    
    temp_df = pd.DataFrame({
        "account_name": df[account_name_col].astype(str).str.strip(),
        "debit": debit_values,
        "credit": credit_values,
    })
    
    temp_df = temp_df[temp_df["account_name"] != ""]
    temp_df = temp_df.dropna(subset=["account_name"])
    
    if temp_df.empty:
        return {
            "applicable": False,
            "message": "No valid account names found in the data.",
        }
    
    grouped = temp_df.groupby("account_name", as_index=False).sum()
    
    unclassified_accounts = []
    revenue_items = []
    expense_items = []
    asset_items = []
    liability_items = []
    equity_items = []
    
    for _, row in grouped.iterrows():
        name = row["account_name"]
        saved = account_mapping.get(name) or {}
        category = saved.get("category") if isinstance(saved, dict) else None
        
        if not category or category == "unknown":
            unclassified_accounts.append(name)
            continue
        
        net_debit = float(row["debit"] or 0)
        net_credit = float(row["credit"] or 0)
        
        if category in INCOME_STATEMENT_CATEGORIES:
            section = INCOME_STATEMENT_CATEGORIES[category]
            net_amount = (net_debit - net_credit) if section == "expense" else (net_credit - net_debit)
            
            item = {"account_name": name, "category": category, "amount": net_amount}
            if section == "revenue":
                revenue_items.append(item)
            else:
                expense_items.append(item)
                
        elif category in BALANCE_SHEET_CATEGORIES:
            section = BALANCE_SHEET_CATEGORIES[category]
            net_amount = (net_debit - net_credit) if section == "asset" else (net_credit - net_debit)
            
            item = {"account_name": name, "category": category, "amount": net_amount}
            if section == "asset":
                asset_items.append(item)
            elif section == "liability":
                liability_items.append(item)
            elif section == "equity":
                equity_items.append(item)

    total_revenue = sum(i["amount"] for i in revenue_items)
    total_expenses = sum(i["amount"] for i in expense_items)
    net_profit = round(total_revenue - total_expenses, 2)
    
    total_assets = sum(i["amount"] for i in asset_items)
    total_liabilities = sum(i["amount"] for i in liability_items)
    total_equity = sum(i["amount"] for i in equity_items) + net_profit
    
    balance_sheet_difference = round(total_assets - (total_liabilities + total_equity), 2)
    
    return {
        "applicable": True,
        "currency": currency,
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
                currency=currency,
            ),
        },
        "unclassified_accounts": unclassified_accounts,
        "message": (
            f"Financial statements generated. {len(unclassified_accounts)} account(s) were excluded because they have not been classified yet."
            if unclassified_accounts else
            "Financial statements generated successfully."
        ),
    }