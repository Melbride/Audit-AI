"""
Generates the actual PDF/Excel/CSV files for a report version.

Kept separate from report_routes.py so the export endpoint stays thin: it
just fetches the version, calls one of these, and stores the result.

financial_summary values can be either a plain number/string, or a dict
like {"label": ..., "value": ..., "delta": ..., "up": bool} — ReportReview.jsx
renders both shapes, so metric_label_value() normalizes them the same way.
"""

import os

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

EXPORT_DIR = "exports"
os.makedirs(EXPORT_DIR, exist_ok=True)


def flatten_financial_summary(fs: dict) -> list[tuple[str, str]]:
    """
    Turns financial_summary into a flat list of (label, value) rows for
    the PDF table / Excel-CSV frame, regardless of which shape it's in:
      - ledger-style: {"financial_statements": {...}, "breakdowns": {...}}
      - generic:      {"metric_key": value_or_dict, ...}
    """
    statements = fs.get("financial_statements") if isinstance(fs, dict) else None

    if statements and statements.get("applicable"):
        rows = []
        bs = statements.get("balance_sheet") or {}
        rows.append(("Total Assets", bs.get("total_assets", "")))
        rows.append(("Total Liabilities", bs.get("total_liabilities", "")))
        rows.append(("Total Equity", bs.get("total_equity", "")))
        for a in bs.get("assets", []):
            rows.append((f"Asset: {a.get('account_name')}", a.get("amount", "")))
        for l in bs.get("liabilities", []):
            rows.append((f"Liability: {l.get('account_name')}", l.get("amount", "")))
        for eq in bs.get("equity", []):
            rows.append((f"Equity: {eq.get('account_name')}", eq.get("amount", "")))

        income = statements.get("income_statement") or {}
        for r in income.get("revenue", []):
            rows.append((f"Revenue: {r.get('account_name')}", r.get("amount", "")))
        for e in income.get("expenses", []):
            rows.append((f"Expense: {e.get('account_name')}", e.get("amount", "")))
        if income.get("net_profit") is not None:
            rows.append(("Net Profit", income.get("net_profit")))

        ratios = statements.get("financial_ratios") or {}
        for key, val in ratios.items():
            if isinstance(val, dict):
                for subkey, subval in val.items():
                    rows.append((f"{key.replace('_', ' ').title()}: {subkey.replace('_', ' ').title()}", subval))
            else:
                rows.append((key.replace("_", " ").title(), val))

        return rows

    # Generic/breakdowns-only shape — flat dict of metrics
    breakdowns = fs.get("breakdowns") if isinstance(fs, dict) and "breakdowns" in fs else fs
    rows = []
    for key, val in (breakdowns or {}).items():
        if isinstance(val, dict):
            label = val.get("label", key.replace("_", " ").title())
            value = val.get("value", "")
        else:
            label = key.replace("_", " ").title()
            value = val
        rows.append((label, value))
    return rows


def build_pdf(report: dict, version: dict, path: str) -> None:
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    story = []

    report_type = (report.get("type") or "").title() or "Custom"
    story.append(Paragraph(f"{report_type} Audit Report", styles["Title"]))
    story.append(Paragraph(f"Period: {report.get('period_start')} to {report.get('period_end')}", styles["Normal"]))
    story.append(Paragraph(
        f"Version: v{version.get('version_number')}  |  Status: {report.get('status')}", styles["Normal"]
    ))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Financial Summary", styles["Heading2"]))
    fs = version.get("financial_summary") or {}
    flat_rows = flatten_financial_summary(fs)
    if flat_rows:
        rows = [["Metric", "Value"]]
        for label, value in flat_rows:
            rows.append([label, str(value) if value is not None else "—"])
        table = Table(rows, colWidths=[3 * inch, 2.5 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        story.append(table)
    else:
        story.append(Paragraph("No financial metrics recorded.", styles["Normal"]))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Commentary", styles["Heading2"]))
    commentary = (version.get("commentary") or "No commentary provided.").replace("\n", "<br/>")
    story.append(Paragraph(commentary, styles["Normal"]))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Observations & AI Insights", styles["Heading2"]))
    insights = version.get("ai_insights") or []
    if insights:
        for ins in insights:
            severity = str(ins.get("severity", "")).upper()
            story.append(Paragraph(f"<b>[{severity}]</b> {ins.get('text', '')}", styles["Normal"]))
            story.append(Spacer(1, 6))
    else:
        story.append(Paragraph("No insights recorded.", styles["Normal"]))

    doc.build(story)


def _summary_and_insights_frames(version: dict):
    fs = version.get("financial_summary") or {}
    rows = flatten_financial_summary(fs)
    fs_df = pd.DataFrame(rows, columns=["Metric", "Value"])

    insights = version.get("ai_insights") or []
    if insights:
        insights_df = pd.DataFrame(insights)
        for col in ("severity", "text"):
            if col not in insights_df.columns:
                insights_df[col] = ""
        insights_df = insights_df[["severity", "text"]]
    else:
        insights_df = pd.DataFrame(columns=["severity", "text"])

    return fs_df, insights_df


def build_excel(report: dict, version: dict, path: str) -> None:
    fs_df, insights_df = _summary_and_insights_frames(version)
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        fs_df.to_excel(writer, sheet_name="Financial Summary", index=False)
        insights_df.to_excel(writer, sheet_name="AI Insights", index=False)


def build_csv(report: dict, version: dict, path: str) -> None:
    # CSV is a single flat table by nature — financial summary only,
    # since insights don't share the same shape as the metrics table.
    fs_df, _ = _summary_and_insights_frames(version)
    fs_df.to_csv(path, index=False)


FORMAT_BUILDERS = {
    "pdf": (build_pdf, "pdf", "application/pdf"),
    "excel": (build_excel, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "csv": (build_csv, "csv", "text/csv"),
}