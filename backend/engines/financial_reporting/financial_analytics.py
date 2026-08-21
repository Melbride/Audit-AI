def _safe_pct(numerator, denominator):
    if denominator and denominator != 0:
        return round((numerator / denominator) * 100, 2)
    return None


def _safe_ratio(numerator, denominator):
    if denominator and denominator != 0:
        return round(numerator / denominator, 2)
    return None


def _sum_by_category(items):
    totals = {}
    for item in items:
        category = item.get("category", "Uncategorized")
        amount = float(item.get("amount") or 0)
        totals[category] = round(totals.get(category, 0) + amount, 2)
    return totals


def _with_percentages(totals, base_total):
    return {
        label: {
            "amount": amount,
            "percentage": _safe_pct(amount, base_total),
        }
        for label, amount in totals.items()
    }


def calculate_financial_analytics(financial_statements: dict, financial_ratios: dict) -> dict:
    """
    Builds accounting-aware analytics from generated statements.
    This is intentionally derived only from the classified account statements,
    so Stage 7 can explain Revenue, Expenses, Assets, Liabilities, and Equity
    instead of grouping arbitrary raw columns.
    """
    income_statement = financial_statements.get("income_statement", {})
    balance_sheet = financial_statements.get("balance_sheet", {})

    revenue_items = income_statement.get("revenue", [])
    expense_items = income_statement.get("expenses", [])
    asset_items = balance_sheet.get("assets", [])
    liability_items = balance_sheet.get("liabilities", [])

    total_revenue = float(income_statement.get("total_revenue") or 0)
    total_expenses = float(income_statement.get("total_expenses") or 0)
    net_profit = float(income_statement.get("net_profit") or 0)
    total_assets = float(balance_sheet.get("total_assets") or 0)
    total_liabilities = float(balance_sheet.get("total_liabilities") or 0)
    total_equity = float(balance_sheet.get("total_equity") or 0)

    cost_of_sales = sum(
        float(item.get("amount") or 0)
        for item in expense_items
        if item.get("category") == "Cost of Sales"
    )
    finance_cost = sum(
        float(item.get("amount") or 0)
        for item in expense_items
        if item.get("category") == "Finance Cost"
    )
    operating_expenses = total_expenses - cost_of_sales - finance_cost
    gross_profit = total_revenue - cost_of_sales
    operating_profit = gross_profit - operating_expenses

    current_assets = sum(
        float(item.get("amount") or 0)
        for item in asset_items
        if item.get("category") in {
            "Cash & Cash Equivalents",
            "Trade Receivables",
            "Inventory",
            "Other Current Asset",
        }
    )
    current_liabilities = sum(
        float(item.get("amount") or 0)
        for item in liability_items
        if item.get("category") in {"Trade Payables", "Current Liability"}
    )

    revenue_by_category = _sum_by_category(revenue_items)
    expense_by_category = _sum_by_category(expense_items)
    asset_by_category = _sum_by_category(asset_items)
    liability_by_category = _sum_by_category(liability_items)

    ratios = {
        "current_ratio": financial_ratios.get("current_ratio") or _safe_ratio(current_assets, current_liabilities),
        "debt_ratio": _safe_pct(total_liabilities, total_assets),
        "gross_margin": financial_ratios.get("gross_profit_margin"),
        "operating_margin": _safe_pct(operating_profit, total_revenue),
        "net_margin": financial_ratios.get("net_profit_margin"),
        "debt_to_equity": financial_ratios.get("debt_to_equity"),
    }

    return {
        "basis": "classified_accounts",
        "profit_loss": {
            "total_revenue": round(total_revenue, 2),
            "cost_of_sales": round(cost_of_sales, 2),
            "gross_profit": round(gross_profit, 2),
            "operating_expenses": round(operating_expenses, 2),
            "finance_cost": round(finance_cost, 2),
            "total_expenses": round(total_expenses, 2),
            "operating_profit": round(operating_profit, 2),
            "net_profit": round(net_profit, 2),
            "status": "profit" if net_profit >= 0 else "loss",
        },
        "revenue_breakdown": {
            "by_category": _with_percentages(revenue_by_category, total_revenue),
            "by_account": [
                {
                    "account_name": item.get("account_name"),
                    "category": item.get("category"),
                    "amount": float(item.get("amount") or 0),
                    "percentage": _safe_pct(float(item.get("amount") or 0), total_revenue),
                }
                for item in revenue_items
            ],
        },
        "expense_breakdown": {
            "by_category": _with_percentages(expense_by_category, total_expenses),
            "by_account": [
                {
                    "account_name": item.get("account_name"),
                    "category": item.get("category"),
                    "amount": float(item.get("amount") or 0),
                    "percentage": _safe_pct(float(item.get("amount") or 0), total_expenses),
                }
                for item in expense_items
            ],
        },
        "balance_sheet_summary": {
            "total_assets": round(total_assets, 2),
            "current_assets": round(current_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "current_liabilities": round(current_liabilities, 2),
            "total_equity": round(total_equity, 2),
            "working_capital": round(current_assets - current_liabilities, 2),
            "assets_by_category": _with_percentages(asset_by_category, total_assets),
            "liabilities_by_category": _with_percentages(liability_by_category, total_liabilities),
        },
        "ratios": ratios,
        "notes": [
            "Revenue trends and year comparison require period-level or prior-year statement data.",
            "Current ratio uses categories classified as current assets and current liabilities.",
        ],
    }