import pandas as pd

from engines.financial_reporting.statement_generator import generate_financial_statements
from engines.financial_reporting.financial_ratios import calculate_financial_ratios


PERIOD_NAME_HINTS = ("date", "period", "month", "year", "financial_year", "fiscal_year")


def _pct_change(current, previous):
    if previous in (None, 0):
        return None
    return round(((current - previous) / abs(previous)) * 100, 2)


def _point_change(current, previous):
    if current is None or previous is None:
        return None
    return round(current - previous, 2)


def _find_period_column(df: pd.DataFrame, mapping: dict):
    mapped_fields = []
    for info in mapping.values():
        if not isinstance(info, dict):
            continue
        mapped_to = str(info.get("mapped_to") or "").strip()
        field_type = info.get("field_type")
        if mapped_to in ("", "unknown") or mapped_to not in df.columns:
            continue
        mapped_fields.append((mapped_to, field_type))

    for mapped_to, field_type in mapped_fields:
        if field_type == "date":
            return mapped_to, "date"

    for mapped_to, field_type in mapped_fields:
        lowered = mapped_to.lower()
        if field_type in ("text", "numeric") and any(hint in lowered for hint in PERIOD_NAME_HINTS):
            return mapped_to, "period"

    return None, None


def _period_series(df: pd.DataFrame, column: str, column_kind: str, grain: str):
    if column_kind == "date":
        parsed = pd.to_datetime(df[column], errors="coerce")
        if grain == "month":
            return parsed.dt.to_period("M").astype(str)
        if grain == "quarter":
            return parsed.dt.to_period("Q").astype(str)
        return parsed.dt.year.astype("Int64").astype(str).replace("<NA>", None)

    values = df[column].astype(str).str.strip()
    extracted_year = values.str.extract(r"(\d{4})", expand=False)
    if extracted_year.notna().any():
        return extracted_year
    return values.replace("", None)


def _statement_summary(period, statements, ratios):
    income_statement = statements.get("income_statement", {})
    balance_sheet = statements.get("balance_sheet", {})
    total_revenue = float(income_statement.get("total_revenue") or 0)
    total_expenses = float(income_statement.get("total_expenses") or 0)
    net_profit = float(income_statement.get("net_profit") or 0)

    cost_of_sales = sum(
        float(item.get("amount") or 0)
        for item in income_statement.get("expenses", [])
        if item.get("category") == "Cost of Sales"
    )
    gross_profit = total_revenue - cost_of_sales

    return {
        "period": str(period),
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(net_profit, 2),
        "gross_profit": round(gross_profit, 2),
        "total_assets": round(float(balance_sheet.get("total_assets") or 0), 2),
        "total_liabilities": round(float(balance_sheet.get("total_liabilities") or 0), 2),
        "total_equity": round(float(balance_sheet.get("total_equity") or 0), 2),
        "gross_margin": ratios.get("gross_profit_margin"),
        "net_margin": ratios.get("net_profit_margin"),
        "debt_to_equity": ratios.get("debt_to_equity"),
    }


def _compare_latest_periods(period_summaries):
    if len(period_summaries) < 2:
        return None

    previous = period_summaries[-2]
    current = period_summaries[-1]
    return {
        "current_period": current["period"],
        "previous_period": previous["period"],
        "revenue_change": round(current["total_revenue"] - previous["total_revenue"], 2),
        "revenue_change_pct": _pct_change(current["total_revenue"], previous["total_revenue"]),
        "expense_change": round(current["total_expenses"] - previous["total_expenses"], 2),
        "expense_change_pct": _pct_change(current["total_expenses"], previous["total_expenses"]),
        "net_profit_change": round(current["net_profit"] - previous["net_profit"], 2),
        "net_profit_change_pct": _pct_change(current["net_profit"], previous["net_profit"]),
        "gross_margin_change": _point_change(current["gross_margin"], previous["gross_margin"]),
        "net_margin_change": _point_change(current["net_margin"], previous["net_margin"]),
        "assets_change": round(current["total_assets"] - previous["total_assets"], 2),
        "liabilities_change": round(current["total_liabilities"] - previous["total_liabilities"], 2),
        "equity_change": round(current["total_equity"] - previous["total_equity"], 2),
    }


def generate_comparative_analytics(df: pd.DataFrame, mapping: dict, account_mapping: dict, grain: str = "year") -> dict:
    period_col, period_col_kind = _find_period_column(df, mapping)
    if not period_col:
        return {
            "available": False,
            "reason": "No mapped date, period, or year column found.",
        }

    working_df = df.copy()
    working_df["_analysis_period"] = _period_series(working_df, period_col, period_col_kind, grain)
    working_df = working_df.dropna(subset=["_analysis_period"])
    if working_df.empty:
        return {
            "available": False,
            "period_column": period_col,
            "reason": "The mapped period column could not be parsed into usable periods.",
        }

    period_summaries = []
    statements_by_period = {}
    for period, period_df in working_df.groupby("_analysis_period"):
        statements = generate_financial_statements(period_df.drop(columns=["_analysis_period"]), mapping, account_mapping)
        if not statements.get("applicable"):
            continue
        ratios = calculate_financial_ratios(statements["income_statement"], statements["balance_sheet"])
        statements["financial_ratios"] = ratios
        statements_by_period[str(period)] = statements
        period_summaries.append(_statement_summary(period, statements, ratios))

    period_summaries = sorted(period_summaries, key=lambda item: item["period"])
    if not period_summaries:
        return {
            "available": False,
            "period_column": period_col,
            "reason": "No period-level statements could be generated.",
        }

    return {
        "available": len(period_summaries) >= 2,
        "period_column": period_col,
        "period_basis": grain,
        "periods": [item["period"] for item in period_summaries],
        "period_summaries": period_summaries,
        "statements_by_period": statements_by_period,
        "latest_period_comparison": _compare_latest_periods(period_summaries),
        "reason": None if len(period_summaries) >= 2 else "Only one period was found; comparison needs at least two periods.",
    }
