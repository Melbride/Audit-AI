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


def metric_label_value(key: str, val):
    if isinstance(val, dict):
        label = val.get("label", key.replace("_", " ").title())
        value = val.get("value", "")
    else:
        label = key.replace("_", " ").title()
        value = val
    return label, value


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
    if fs:
        rows = [["Metric", "Value"]]
        for k, v in fs.items():
            label, value = metric_label_value(k, v)
            rows.append([label, str(value)])
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
    rows = [metric_label_value(k, v) for k, v in fs.items()]
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