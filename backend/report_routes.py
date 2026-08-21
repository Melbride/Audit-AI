"""
Report review endpoints.

Uses the same `get_db` dependency as the rest of Audit.py (imported from
database.py), so this shares your app's existing connection handling instead
of opening its own.

Tables (see schema.sql):
  reports(id, client_id, type, period_start, period_end, status, current_stage,
          current_version_id, created_by, created_at)
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
yet -- no /generate endpoint exists in this router. Run:
  ALTER TABLE reports ADD COLUMN engagement_id INT NULL AFTER client_id;
  ALTER TABLE reports ADD CONSTRAINT fk_reports_engagement
    FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id);
  ALTER TABLE reports ADD COLUMN file_id VARCHAR(64) NULL AFTER engagement_id;

NOTE: current_stage tracks the report through its staged approval chain,
replacing the old single-role (Engagement Partner only) approval. Run:
  ALTER TABLE reports ADD COLUMN current_stage VARCHAR(32) NOT NULL DEFAULT 'draft';

The chain:
    draft                        (auditor is still working on it)
      -> pending_audit_manager        (auditor calls /submit-for-approval)
      -> pending_engagement_partner   (audit manager calls /approve)
      -> approved                     (engagement partner calls /approve)
      -> sent_to_client                (engagement partner calls /send-to-client)

request-changes can be called by whichever role currently holds the report
(same stage-role check as approve) and sends it back to 'draft' with a new
version, so the auditor's original content and the reviewer's note both
stay in history.

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
from auth import require_role, get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Which role is allowed to act on a report sitting in each stage. A report
# in 'draft' or 'approved'/'sent_to_client' has no PENDING approval action,
# so those stages intentionally have no entry here -- see _require_stage_role.
STAGE_APPROVER_ROLE = {
    "pending_audit_manager": "Audit Manager",
    "pending_engagement_partner": "Engagement Partner",
}

# Which stage a report moves to once its current stage's approver approves it.
STAGE_NEXT = {
    "pending_audit_manager": "pending_engagement_partner",
    "pending_engagement_partner": "approved",
}


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
    decision (if any) -- this is what powers the "notes" shown in the
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


def _fetch_report_or_404(cursor, report_id: str) -> dict:
    cursor.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    report = cursor.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def _require_stage_role(current_user: dict, stage: str) -> None:
    """
    Confirms current_user's role matches whoever is allowed to act on a
    report currently sitting in `stage`. This is a manual check (rather
    than a static Depends(require_role(...))) because the allowed role
    depends on the report's CURRENT stage, which isn't known until the
    report is looked up inside the endpoint body.

    Raises 400 if the stage has no pending approval action at all (e.g.
    'draft' or 'approved' -- nobody is "pending" on those), and 403 if the
    caller's role doesn't match who the stage is actually waiting on.
    """
    expected_role = STAGE_APPROVER_ROLE.get(stage)
    if expected_role is None:
        raise HTTPException(
            status_code=400,
            detail=f"Report is in stage '{stage}', which has no pending approval action.",
        )
    if current_user.get("role") != expected_role:
        raise HTTPException(
            status_code=403,
            detail=(
                f"This report is awaiting {expected_role} approval. "
                f"Your role ({current_user.get('role')}) cannot act on it right now."
            ),
        )


# --- Endpoints -------------------------------------------------------------

@router.get("")
def list_reports(
    client_id: Optional[int] = None,
    engagement_id: Optional[int] = None,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List reports, optionally filtered to one client and/or one engagement,
    for the browsable list. Filters based on user role."""
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
            r.current_stage,
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
    
    # Role-based filtering
    user_role = current_user.get("role")
    user_id = current_user.get("user_id")
    
    if user_role == "Audit Manager":
        conditions.append("r.current_stage = 'pending_audit_manager'")
    elif user_role == "Engagement Partner":
        conditions.append("r.current_stage = 'pending_engagement_partner'")
    elif user_role == "Auditor":
        conditions.append("r.created_by = %s")
        params.append(user_id)
    # Admin sees all reports (no additional filtering)
    
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


@router.post("/{report_id}/submit-for-approval")
def submit_report_for_approval(
    report_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(require_role("Auditor")),
):
    """
    First step of the approval chain: the auditor moves a draft report out
    of their own hands and into the Audit Manager's queue. Only works on a
    report currently sitting in 'draft' -- can't re-submit something
    that's already in the chain or already sent out.
    """
    cursor = db.cursor(dictionary=True)
    report = _fetch_report_or_404(cursor, report_id)
    if report["current_stage"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Report is already in stage '{report['current_stage']}', not 'draft'.",
        )

    write_cursor = db.cursor()
    write_cursor.execute(
        "UPDATE reports SET current_stage = 'pending_audit_manager' WHERE id = %s",
        (report_id,),
    )

    # Notify Audit Managers assigned to this engagement
    if report["engagement_id"]:
        cursor.execute(
            """
            SELECT u.user_id, u.full_name 
            FROM engagement_team et
            JOIN users u ON et.user_id = u.user_id
            WHERE et.engagement_id = %s AND et.role = 'Audit Manager'
            """,
            (report["engagement_id"],),
        )
        audit_managers = cursor.fetchall()
        for manager in audit_managers:
            write_cursor.execute(
                "INSERT INTO notifications (user_id, message, type, engagement_id) VALUES (%s, %s, %s, %s)",
                (
                    manager["user_id"],
                    f"Report '{report.get('type', 'Report')}' has been submitted for your approval",
                    "report_approval",
                    report["engagement_id"],
                ),
            )

    db.commit()
    return {"ok": True, "current_stage": "pending_audit_manager"}


@router.post("/{report_id}/approve")
def approve_report(
    report_id: str,
    body: DecisionRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Stage-aware approval -- replaces the old single-role (Engagement
    Partner only) version of this endpoint. The role required to approve
    depends on the report's CURRENT stage:

        pending_audit_manager       -> requires Audit Manager
                                        -> advances to pending_engagement_partner
        pending_engagement_partner  -> requires Engagement Partner
                                        -> advances to approved (final)

    Logs every decision in report_approvals regardless of which stage it
    was made at, so the full chain of who-approved-what is preserved.
    """
    approver_id = current_user["user_id"]

    cursor = db.cursor(dictionary=True)
    report = _fetch_report_or_404(cursor, report_id)
    _require_stage_role(current_user, report["current_stage"])
    next_stage = STAGE_NEXT[report["current_stage"]]

    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="No current version for this report")

    is_final_approval = next_stage == "approved"

    write_cursor = db.cursor()
    if is_final_approval:
        write_cursor.execute(
            "UPDATE report_versions SET status = 'approved' WHERE id = %s",
            (version["id"],),
        )
    write_cursor.execute(
        """
        INSERT INTO report_approvals (id, report_version_id, approver_id, decision, notes, decided_at)
        VALUES (UUID(), %s, %s, 'approved', %s, %s)
        """,
        (version["id"], approver_id, body.notes, datetime.utcnow()),
    )
    write_cursor.execute(
        "UPDATE reports SET current_stage = %s, status = %s WHERE id = %s",
        (next_stage, "approved" if is_final_approval else "draft", report_id),
    )

    # Notify next stage approver (Engagement Partner when Audit Manager approves)
    if report["engagement_id"] and next_stage == "pending_engagement_partner":
        cursor.execute(
            """
            SELECT u.user_id, u.full_name 
            FROM engagement_team et
            JOIN users u ON et.user_id = u.user_id
            WHERE et.engagement_id = %s AND et.role = 'Engagement Partner'
            """,
            (report["engagement_id"],),
        )
        partners = cursor.fetchall()
        for partner in partners:
            write_cursor.execute(
                "INSERT INTO notifications (user_id, message, type, engagement_id) VALUES (%s, %s, %s, %s)",
                (
                    partner["user_id"],
                    f"Report '{report.get('type', 'Report')}' has been approved by Audit Manager and awaits your review",
                    "report_approval",
                    report["engagement_id"],
                ),
            )

    db.commit()
    return {"ok": True, "current_stage": next_stage}


@router.post("/{report_id}/request-changes")
def request_changes(
    report_id: str,
    body: DecisionRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send the current version back for revision. Whichever role currently
    holds the report (Audit Manager or Engagement Partner, per its current
    stage) can request changes -- same stage-role check as approve.

    Creates a new draft version (incrementing version_number) so the
    reviewer's note and the prior content both stay in history, and resets
    current_stage back to 'draft' so it re-enters the chain from the top
    once the auditor resubmits it.
    """
    approver_id = current_user["user_id"]

    cursor = db.cursor(dictionary=True)
    report = _fetch_report_or_404(cursor, report_id)
    _require_stage_role(current_user, report["current_stage"])

    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="Report not found")

    write_cursor = db.cursor()
    write_cursor.execute(
        """
        INSERT INTO report_approvals (id, report_version_id, approver_id, decision, notes, decided_at)
        VALUES (UUID(), %s, %s, 'changes_requested', %s, %s)
        """,
        (version["id"], approver_id, body.notes, datetime.utcnow()),
    )
    write_cursor.execute(
        "UPDATE report_versions SET status = 'changes_requested' WHERE id = %s",
        (version["id"],),
    )

    write_cursor.execute(
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

    write_cursor.execute(
        "UPDATE reports SET status = 'draft', current_stage = 'draft', current_version_id = %s WHERE id = %s",
        (new_version_id, report_id),
    )
    db.commit()
    return {"ok": True, "status": "changes_requested", "current_stage": "draft", "new_version_id": new_version_id}


@router.post("/{report_id}/send-to-client")
def send_report_to_client(
    report_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Final step of the chain: the Engagement Partner sends a fully-approved
    report out to the client. Only works once current_stage == 'approved'
    -- a report still anywhere earlier in the chain cannot be sent out.
    """
    if current_user.get("role") != "Engagement Partner":
        raise HTTPException(
            status_code=403,
            detail="Only an Engagement Partner can send a report to the client.",
        )

    cursor = db.cursor(dictionary=True)
    report = _fetch_report_or_404(cursor, report_id)
    if report["current_stage"] != "approved":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Report must be fully approved before sending to the client "
                f"(current stage: '{report['current_stage']}')."
            ),
        )

    write_cursor = db.cursor()
    write_cursor.execute(
        "UPDATE reports SET current_stage = 'sent_to_client' WHERE id = %s",
        (report_id,),
    )
    db.commit()
    return {"ok": True, "current_stage": "sent_to_client"}