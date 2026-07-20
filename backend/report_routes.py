"""
Report review endpoints.

Uses the same `get_db` dependency as the rest of Audit.py (imported from
database.py), so this shares your app's existing connection handling instead
of opening its own.

Tables (see schema.sql):
  reports(id, client_id, type, period_start, period_end, status, current_version_id, created_by, created_at)
  report_versions(id, report_id, version_number, financial_summary, ai_insights,
                  commentary, chart_refs, generated_by, edited_by, status, created_at)
  report_approvals(id, report_version_id, approver_id, decision, notes, decided_at)
  report_exports(id, report_version_id, format, file_url, exported_by, exported_at)

NOTE: client_id was added to `reports` so reports can be filtered/listed per
client (mirrors the old flat-schema `generated_reports.client_id`). Matches
the INT type used for client_id everywhere else (engagements.client_id,
users.assigned_client_id). Run:
  ALTER TABLE reports ADD COLUMN client_id INT NOT NULL AFTER id;
before this router will work against your live DB.

NOTE: engagement_id and file_id link a report back to the specific
engagement and uploaded source file it was generated from (previously a
report was only tied to a client, with no way to tell which engagement or
which upload produced it). Both are nullable since nothing populates them
yet — no /generate endpoint exists in this router. Run:
  ALTER TABLE reports ADD COLUMN engagement_id INT NULL AFTER client_id;
  ALTER TABLE reports ADD CONSTRAINT fk_reports_engagement
    FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id);
  ALTER TABLE reports ADD COLUMN file_id VARCHAR(64) NULL AFTER engagement_id;

Wire this into Audit.py with:

    from report_routes import router as report_router
    app.include_router(report_router)
"""

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_db
from auth import require_role

router = APIRouter(prefix="/api/reports", tags=["reports"])

REPORT_APPROVAL_ROLE = "Engagement Partner"  # same restriction as Send to Client


# --- Request/response models --------------------------------------------
class CommentaryUpdate(BaseModel):
    commentary: str
    edited_by: int  # users.user_id


class InsightsUpdate(BaseModel):
    insights: list[dict]  # [{"id": "...", "severity": "...", "text": "..."}]
    edited_by: int  # users.user_id


class DecisionRequest(BaseModel):
    notes: Optional[str] = None


# --- Helpers -------------------------------------------------------------
def _fetch_current_version(cursor, report_id: str):
    cursor.execute(
        """
        SELECT rv.* FROM report_versions rv
        JOIN reports r ON r.current_version_id = rv.id
        WHERE r.id = %s
        """,
        (report_id,),
    )
    return cursor.fetchone()


def _fetch_history(cursor, report_id: str):
    """
    Version history, each row enriched with its most recent approval
    decision (if any) — this is what powers the "notes" shown in the
    Version History timeline in ReportReview.jsx.
    """
    cursor.execute(
        """
        SELECT
            rv.version_number, rv.status, rv.generated_by, rv.edited_by, rv.created_at,
            ra.decision, ra.notes, ra.approver_id, ra.decided_at,
            u.full_name AS approver_name
        FROM report_versions rv
        LEFT JOIN report_approvals ra ON ra.id = (
            SELECT ra2.id FROM report_approvals ra2
            WHERE ra2.report_version_id = rv.id
            ORDER BY ra2.decided_at DESC
            LIMIT 1
        )
        LEFT JOIN users u ON ra.approver_id = u.user_id
        WHERE rv.report_id = %s
        ORDER BY rv.version_number DESC
        """,
        (report_id,),
    )
    return cursor.fetchall()


# --- Endpoints -------------------------------------------------------------

@router.get("")
def list_reports(
    client_id: Optional[int] = None,
    engagement_id: Optional[int] = None,
    db=Depends(get_db),
):
    """List reports, optionally filtered to one client and/or one engagement,
    for the browsable list."""
    cursor = db.cursor(dictionary=True)
    query = """
        SELECT
            r.id,
            r.client_id,
            r.engagement_id,
            eng.engagement_name,
            r.file_id,
            r.type,
            r.period_start,
            r.period_end,
            r.status,
            r.created_at,
            u.full_name AS created_by_name,
            rv.version_number
        FROM reports r
        LEFT JOIN users u ON r.created_by = u.user_id
        LEFT JOIN report_versions rv ON r.current_version_id = rv.id
        LEFT JOIN engagements eng ON r.engagement_id = eng.engagement_id
    """
    conditions = []
    params = []
    if client_id is not None:
        conditions.append("r.client_id = %s")
        params.append(client_id)
    if engagement_id is not None:
        conditions.append("r.engagement_id = %s")
        params.append(engagement_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY r.created_at DESC"
    cursor.execute(query, tuple(params))
    return cursor.fetchall()


@router.get("/{report_id}")
def get_report(report_id: str, db=Depends(get_db)):
    """Fetch the report's current version, ready for the review UI."""
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT r.*, eng.engagement_name
        FROM reports r
        LEFT JOIN engagements eng ON r.engagement_id = eng.engagement_id
        WHERE r.id = %s
        """,
        (report_id,),
    )
    report = cursor.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="No current version for this report")

    history = _fetch_history(cursor, report_id)

    return {
        "report": report,
        "version": {
            **version,
            "financial_summary": json.loads(version["financial_summary"] or "{}"),
            "ai_insights": json.loads(version["ai_insights"] or "[]"),
            "chart_refs": json.loads(version["chart_refs"] or "{}"),
        },
        "history": history,
    }


@router.patch("/{report_id}/commentary")
def update_commentary(report_id: str, body: CommentaryUpdate, db=Depends(get_db)):
    """Edit the commentary on the current (unapproved) version in place."""
    cursor = db.cursor(dictionary=True)
    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="Report not found")
    if version["status"] == "approved":
        raise HTTPException(status_code=400, detail="Cannot edit an approved version")

    cursor.execute(
        "UPDATE report_versions SET commentary = %s, edited_by = %s WHERE id = %s",
        (body.commentary, body.edited_by, version["id"]),
    )
    db.commit()
    return {"ok": True}


@router.patch("/{report_id}/insights")
def update_insights(report_id: str, body: InsightsUpdate, db=Depends(get_db)):
    """Edit the AI insights list on the current (unapproved) version."""
    cursor = db.cursor(dictionary=True)
    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="Report not found")
    if version["status"] == "approved":
        raise HTTPException(status_code=400, detail="Cannot edit an approved version")

    cursor.execute(
        "UPDATE report_versions SET ai_insights = %s, edited_by = %s WHERE id = %s",
        (json.dumps(body.insights), body.edited_by, version["id"]),
    )
    db.commit()
    return {"ok": True}


@router.post("/{report_id}/approve")
def approve_report(
    report_id: str,
    body: DecisionRequest,
    db=Depends(get_db),
    current_user: dict = Depends(require_role(REPORT_APPROVAL_ROLE)),
):
    """Approve the current version. Locks it and logs the approval event.

    Restricted to Engagement Partners, same as Send to Client.
    """
    approver_id = current_user["user_id"]

    cursor = db.cursor(dictionary=True)
    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="Report not found")

    cursor.execute(
        "UPDATE report_versions SET status = 'approved' WHERE id = %s",
        (version["id"],),
    )
    cursor.execute(
        """
        INSERT INTO report_approvals (id, report_version_id, approver_id, decision, notes, decided_at)
        VALUES (UUID(), %s, %s, 'approved', %s, %s)
        """,
        (version["id"], approver_id, body.notes, datetime.utcnow()),
    )
    cursor.execute(
        "UPDATE reports SET status = 'approved' WHERE id = %s",
        (report_id,),
    )
    db.commit()
    return {"ok": True, "status": "approved"}


@router.post("/{report_id}/request-changes")
def request_changes(
    report_id: str,
    body: DecisionRequest,
    db=Depends(get_db),
    current_user: dict = Depends(require_role(REPORT_APPROVAL_ROLE)),
):
    """
    Send the current version back for revision. Creates a new draft version
    (incrementing version_number) so the auditor's note and the prior content
    both stay in history.

    Restricted to Engagement Partners, same as Send to Client.
    """
    approver_id = current_user["user_id"]

    cursor = db.cursor(dictionary=True)
    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="Report not found")

    cursor.execute(
        """
        INSERT INTO report_approvals (id, report_version_id, approver_id, decision, notes, decided_at)
        VALUES (UUID(), %s, %s, 'changes_requested', %s, %s)
        """,
        (version["id"], approver_id, body.notes, datetime.utcnow()),
    )
    cursor.execute(
        "UPDATE report_versions SET status = 'changes_requested' WHERE id = %s",
        (version["id"],),
    )

    cursor.execute(
        """
        INSERT INTO report_versions
            (id, report_id, version_number, financial_summary, ai_insights,
             commentary, chart_refs, generated_by, status, created_at)
        SELECT UUID(), report_id, version_number + 1, financial_summary, ai_insights,
               commentary, chart_refs, 'ai', 'draft', %s
        FROM report_versions WHERE id = %s
        """,
        (datetime.utcnow(), version["id"]),
    )
    db.commit()

    cursor.execute(
        "SELECT id FROM report_versions WHERE report_id = %s ORDER BY version_number DESC LIMIT 1",
        (report_id,),
    )
    new_version_id = cursor.fetchone()["id"]

    cursor.execute(
        "UPDATE reports SET status = 'draft', current_version_id = %s WHERE id = %s",
        (new_version_id, report_id),
    )
    db.commit()
    return {"ok": True, "status": "changes_requested", "new_version_id": new_version_id}