"""
engagement_notifications.py
=============================
Notifies the audit team once every in-scope section of an engagement has
been approved, so an auditor knows the engagement is ready for the combined
(final) analysis. Call notify_if_ready_for_final_analysis(db, engagement_id)
after any submission status change to 'Approved' -- it's cheap to call on
every approval since it short-circuits immediately if the engagement isn't
fully approved yet.

Dedup: fires at most once per engagement. Checks for an existing
notification of type 'ready_for_final_analysis' tied to this engagement_id
before inserting new ones, so re-checking on every section approval doesn't
spam the team with duplicate notifications.
"""

# Roles considered "auditor-type" for this notification -- the same role
# set already used for review notifications elsewhere in main.py (see
# submit_uploaded_file), reused here instead of a second, inconsistent list.
AUDITOR_ROLES = (
    "Auditor", "Senior Auditor", "Assistant Manager",
    "Audit Manager", "Engagement Partner", "Quality Reviewer",
)

NOTIFICATION_TYPE = "ready_for_final_analysis"


def _engagement_sections_fully_approved(db, engagement_id: int) -> bool:
    """True only if the engagement has at least one section AND every
    section's latest submission is 'Approved' -- same window-function
    pattern already used in fetch_engagement_progress()."""
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT COUNT(*) AS total FROM audit_sections WHERE engagement_id = %s",
        (engagement_id,),
    )
    total = cursor.fetchone()["total"]
    if total == 0:
        return False

    cursor.execute(
        """
        SELECT COUNT(*) AS approved
        FROM (
            SELECT section_id, status,
                   ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY created_at DESC) AS rn
            FROM submissions
            WHERE engagement_id = %s
        ) latest
        WHERE rn = 1 AND status = 'Approved'
        """,
        (engagement_id,),
    )
    approved = cursor.fetchone()["approved"]
    return approved == total


def _already_notified(db, engagement_id: int) -> bool:
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT 1 FROM notifications WHERE engagement_id = %s AND type = %s LIMIT 1",
        (engagement_id, NOTIFICATION_TYPE),
    )
    return cursor.fetchone() is not None


def notify_if_ready_for_final_analysis(db, engagement_id: int) -> bool:
    """
    Checks whether every in-scope section of engagement_id is now Approved,
    and if so -- and nobody has been notified about THIS engagement yet --
    notifies every engagement_team member with an auditor-type role.

    Returns True if a notification was sent, False otherwise (either not
    fully approved yet, or already notified once before).
    """
    if not _engagement_sections_fully_approved(db, engagement_id):
        return False
    if _already_notified(db, engagement_id):
        return False

    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT engagement_name FROM engagements WHERE engagement_id = %s", (engagement_id,))
    eng = cursor.fetchone()
    engagement_name = eng["engagement_name"] if eng else f"Engagement {engagement_id}"

    placeholders = ",".join(["%s"] * len(AUDITOR_ROLES))
    cursor.execute(
        f"""
        SELECT DISTINCT u.user_id FROM users u
        INNER JOIN engagement_team et ON u.user_id = et.user_id
        WHERE et.engagement_id = %s
          AND COALESCE(NULLIF(et.role, ''), u.role) IN ({placeholders})
        """,
        (engagement_id, *AUDITOR_ROLES),
    )
    recipients = cursor.fetchall()
    if not recipients:
        return False

    message = (
        f"All sections for '{engagement_name}' are approved. "
        f"Ready to generate the final combined analysis."
    )
    write_cursor = db.cursor()
    for row in recipients:
        write_cursor.execute(
            "INSERT INTO notifications (user_id, message, type, engagement_id) VALUES (%s, %s, %s, %s)",
            (row["user_id"], message, NOTIFICATION_TYPE, engagement_id),
        )
    db.commit()
    return True