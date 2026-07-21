import pandas as pd
import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# This function will be used to discover numeric, date or text columns exist in that spcific file
def get_columns_by_type(mapping: dict, df: pd.DataFrame, field_type: str) -> list:
    """
    Returns the list of standard (mapped_to) column names in df that have
    the given field_type in the mapping . It will be used to discover numeric, date or text columns exist in that spcific file
    """
    return [
        info["mapped_to"] for info in mapping.values()
        if isinstance(info, dict)
        and info.get("field_type") == field_type
        and info.get("mapped_to") not in (None, "unknown")
        and info.get("mapped_to") in df.columns
    ]


# Calculate breakdowns
def calculate_breakdowns(df: pd.DataFrame, mapping: dict, max_unique_ratio: float = 0.5) -> dict:
    """
    Dynamically groups every numeric column by every text column found 
    in this file, but only for text columns that actually represent 
    categories, not identifier-style columns like transaction_id or 
    invoice_number where almost every row has a unique value.
    max_unique_ratio: if more than this fraction of rows have a unique 
    value in that column, it's treated as an identifier, not a category.
    """
    numeric_columns = get_columns_by_type(mapping, df, "numeric")
    text_columns = get_columns_by_type(mapping, df, "text")

    total_rows = len(df)
    breakdowns = {}

    for text_col in text_columns:
        unique_count = df[text_col].nunique()

        # Skip columns with too few values to group, or too many unique 
        # values relative to total rows (identifier-style columns)
        if unique_count <= 1:
            continue
        if total_rows > 0 and (unique_count / total_rows) > max_unique_ratio:
            continue

        for num_col in numeric_columns:
            key = f"{num_col}_by_{text_col}"
            try:
                grouped = df.groupby(text_col)[num_col].sum()
                breakdowns[key] = grouped.to_dict()
            except Exception:
                continue

    return breakdowns

# Monthly trend calculation
def calculate_monthly_trend(df: pd.DataFrame, mapping: dict) -> dict:
    """
    For every date column and every numeric column found, groups by month.
    Returns empty dict if no date column or numeric column exists in the file.
    """
    date_columns = get_columns_by_type(mapping, df, "date")
    numeric_columns = get_columns_by_type(mapping, df, "numeric")

    if not date_columns or not numeric_columns:
        return {}

    trends = {}
    for date_col in date_columns:
        try:
            parsed_dates = pd.to_datetime(df[date_col], errors="coerce")
            month_series = parsed_dates.dt.to_period("M").astype(str)
        except Exception:
            continue

        for num_col in numeric_columns:
            key = f"{num_col}_by_{date_col}_month"
            try:
                temp = pd.DataFrame({
                    "month": month_series,
                    "value": df[num_col]
                }).dropna(subset=["month"])
                grouped = temp.groupby("month")["value"].sum().sort_index()
                trends[key] = [
                    {"period": period, "total": float(total)}
                    for period, total in grouped.items()
                ]
            except Exception:
                continue

    return trends


def detect_anomalies(monthly_trend: dict, threshold: float = 1.5) -> list:
    """
    Looks at each monthly trend series and flags any month where the value
    is unusually far from the average using standard deviation.
    Returns a list of anomaly records with enough detail for AI Insights explanations
    """
    anomalies = []
    for key, series in monthly_trend.items():
        if len(series) < 3:
            #Not enough data points to meaningfully detect an anomaly
            continue
        values = [point["total"] for point in series]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std_dev = variance ** 0.5

        if std_dev == 0:
            # All values identical, nothing unusual by definition
            continue

        for point in series:
            z_score = (point["total"] - mean) / std_dev
            if abs(z_score) >= threshold:
                anomalies.append({
                    "field": key,
                    "period": point["period"],
                    "value": point["total"],
                    "average": round(mean, 2),
                    "direction": "spike" if z_score > 0 else "drop",
                    "z_score": round(z_score, 2)
                })
    return anomalies



def generate_ai_insights(breakdowns: dict, monthly_trend: dict, anomalies: list) -> list:
    """
    Takes the numbers already calculated by the financial Engine (breakdowns,
    monthly trends, anomalies) and asks the LLM to explain them in plain
    language for an auditor. The LLM never sees raw data or does any calculation itself,
    It only narrates numbers that are already correct.
    Returns a list of insight objects the frontend can display as cards.)
    """
    # Nothing to explain if there's no data at all
    if not breakdowns and not monthly_trend and not anomalies:
        return []

    prompt = f"""You are a financial data expert helping an audit firm understand their data.

Here is the calculated financial data for this client:
Breakdowns (totals grouped by category):
{json.dumps(breakdowns, indent=2)}

Monthly trends:
{json.dumps(monthly_trend, indent=2)}

Detected anomalies (statistically unusual months):
{json.dumps(anomalies, indent=2)}

Instructions:
- Write 2-5 short, clear insights an auditor would find useful
- Focus on anomalies first if any exist, explain what happened and by how much
- Mention notable trends (e.g. consistent growth, a category dominating spend)
- Use plain business language, not technical jargon
- Each insight needs a "type" (anomaly, trend, or variance), a "severity" 
  (high, medium, or info) and a "message" (one clear sentence)
- Base every insight ONLY on the numbers provided above, do not invent figures
- Return ONLY a valid JSON array, no text before or after, no markdown

Example output format:
[
  {{"type": "anomaly", "severity": "medium", "message": "Hardware expenses in February were unusually high compared to other months"}},
  {{"type": "trend", "severity": "info", "message": "IT remains the largest expense category, accounting for the majority of total spend"}}
]"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "You are a financial insights assistant for an audit firm. You only return valid JSON. No explanations, no markdown, no backticks."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.3,
        max_tokens=1000,
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        insights = json.loads(raw)
        if not isinstance(insights, list):
            return []
        return insights
    except json.JSONDecodeError:
        return []


def generate_financial_ai_insights(
    financial_statements: dict,
    financial_ratios: dict,
    financial_analytics: dict,
    comparative_analytics: dict = None,
    generic_analysis: dict = None,
) -> list:
    """
    Generates AI insights from accounting-aware statement context.
    The LLM receives calculated statements, ratios, and analytics only;
    it does not calculate from raw data.
    """
    if not financial_statements or not financial_analytics:
        generic_analysis = generic_analysis or {}
        return generate_ai_insights(
            generic_analysis.get("breakdowns", {}),
            generic_analysis.get("monthly_trend", {}),
            generic_analysis.get("anomalies", []),
        )

    prompt = f"""You are a financial insights assistant helping an audit firm understand classified financial statements.

Here is the calculated accounting context for this client:

Income Statement and Balance Sheet:
{json.dumps(financial_statements, indent=2)}

Financial ratios:
{json.dumps(financial_ratios, indent=2)}

Statement-aware analytics:
{json.dumps(financial_analytics, indent=2)}

Comparative analytics:
{json.dumps(comparative_analytics or {}, indent=2)}

Instructions:
- Write 3-6 short, useful insights for an auditor
- Use accounting language correctly: revenue, cost of sales, gross margin, operating expenses, net margin, assets, liabilities, equity, working capital
- Explain causes when the numbers support them, for example margin pressure from cost of sales or leverage from liabilities
- Mention exact figures or percentages from the provided data when helpful
- Mention year-over-year or period movement only when comparative analytics is available
- Do not invent prior-year movement, monthly movement, or drivers that are not in the data
- Each insight needs a "type" (profitability, liquidity, solvency, margin, expense_mix, revenue_mix, comparative, or statement_check), a "severity" (high, medium, or info), and a "message" (one clear sentence)
- Return ONLY a valid JSON array, no text before or after, no markdown

Example output format:
[
  {{"type": "margin", "severity": "medium", "message": "Gross margin is 48.6%, with cost of sales consuming 51.4% of revenue."}},
  {{"type": "solvency", "severity": "info", "message": "Debt to equity is 1.06, indicating liabilities are slightly higher than equity."}}
]"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "You are a financial insights assistant for an audit firm. You only return valid JSON. No explanations, no markdown, no backticks."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.25,
        max_tokens=1200,
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        insights = json.loads(raw)
        if not isinstance(insights, list):
            return []
        return insights
    except json.JSONDecodeError:
        return []


# Determine analysis scope
def determine_analysis_scope(breakdowns: dict, monthly_trend: dict) -> str:
    """
    Reports whether meaningful financial analysis was possible for this file,
    based on what the Financial Engine actually managed to calculate.
    Does not attempt to classify revenue vs expense, purely reflects 
    whether categorical breakdowns and/or time-based trends exist.
    """
    has_breakdowns = bool(breakdowns)
    has_trend = bool(monthly_trend)

    if has_breakdowns and has_trend:
        return "full"
    elif has_breakdowns or has_trend:
        return "partial"
    else:
        return "undetermined"




