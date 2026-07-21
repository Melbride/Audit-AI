"""
Section milestone and review tracking.

Two independent concepts, both scoped to a single audit_sections row:

  Milestones — a FIXED preset list of checkpoints (Planning, Fieldwork,
  Testing, Wrap-up), auto-seeded for every section. Tracks status/due
  date/completion per stage. Independent of the existing 7-role workflow
  (submissions/current_stage) — this is a lighter-weight progress tracker
  layered on top of it.

  Reviews — free-form entries logged against a section: issues found,
  highlights/positive notes, or a request that a task be redone. Each can
  carry a due date ("when work should be done") and an open/resolved
  status. NOT tied to a specific milestone — logged at the section level.

Tables (run this migration before using this router):

    CREATE TABLE section_milestones (
      id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
      section_id INT NOT NULL,
      milestone_name VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL,
      status ENUM('pending','in_progress','done') NOT NULL DEFAULT 'pending',
      due_date DATE NULL,
      completed_at TIMESTAMP NULL,
      completed_by INT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (section_id) REFERENCES audit_sections(section_id) ON DELETE CASCADE,
      FOREIGN KEY (completed_by) REFERENCES users(user_id)
    );

    CREATE TABLE section_reviews (
      id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
      section_id INT NOT NULL,
      review_type ENUM('issue','highlight','redo') NOT NULL,
      notes TEXT NOT NULL,
      due_date DATE NULL,
      status ENUM('open','resolved') NOT NULL DEFAULT 'open',
      raised_by INT NULL,
      resolved_by INT NULL,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (section_id) REFERENCES audit_sections(section_id) ON DELETE CASCADE,
      FOREIGN KEY (raised_by) REFERENCES users(user_id),
      FOREIGN KEY (resolved_by) REFERENCES users(user_id)
    );

Wire this into main.py with:

    from section_tracking import router as section_tracking_router
    app.include_router(section_tracking_router)
"""

import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_db

router = APIRouter(tags=["section-tracking"])

# Fixed preset milestone stages, in order. Same four stages for every
# section — this list is the single source of truth for seeding.
MILESTONE_STAGES = ["Planning", "Fieldwork", "Testing", "Wrap-up"]


# --- Request models -------------------------------------------------------

class MilestoneUpdate(BaseModel):
    status: Optional[str] = None  # 'pending' | 'in_progress' | 'done'
    due_date: Optional[date] = None
    notes: Optional[str] = None
    updated_by: Optional[int] = None  # users.user_id — recorded as completed_by if status becomes 'done'


class ReviewCreate(BaseModel):
    review_type: str  # 'issue' | 'highlight' | 'redo'
    notes: str
    due_date: Optional[date] = None
    raised_by: Optional[int] = None


class ReviewUpdate(BaseModel):
    notes: Optional[str] = None
    due_date: Optional[date] = None
    status: Optional[str] = None  # 'open' | 'resolved'
    resolved_by: Optional[int] = None


# --- Helpers ---------------------------------------------------------------

def _ensure_section_exists(cursor, section_id: int):
    cursor.execute("SELECT section_id FROM audit_sections WHERE section_id = %s", (section_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Audit section not found")


def _seed_milestones_if_missing(cursor, db, section_id: int):
    cursor.execute("SELECT COUNT(*) AS c FROM section_milestones WHERE section_id = %s", (section_id,))
    if cursor.fetchone()["c"] > 0:
        return
    for i, name in enumerate(MILESTONE_STAGES, start=1):
        cursor.execute(
            """INSERT INTO section_milestones (id, section_id, milestone_name, sort_order, status)
               VALUES (%s, %s, %s, %s, 'pending')""",
            (str(uuid.uuid4()), section_id, name, i),
        )
    db.commit()


# --- Milestone endpoints ----------------------------------------------------

@router.get("/audit-sections/{section_id}/milestones")
def list_milestones(section_id: int, db=Depends(get_db)):
    """List this section's milestones, seeding the preset stages on first access."""
    cursor = db.cursor(dictionary=True)
    _ensure_section_exists(cursor, section_id)
    _seed_milestones_if_missing(cursor, db, section_id)

    cursor.execute(
        """
        SELECT m.*, u.full_name AS completed_by_name
        FROM section_milestones m
        LEFT JOIN users u ON m.completed_by = u.user_id
        WHERE m.section_id = %s
        ORDER BY m.sort_order ASC
        """,
        (section_id,),
    )
    return cursor.fetchall()


@router.put("/milestones/{milestone_id}")
def update_milestone(milestone_id: str, body: MilestoneUpdate, db=Depends(get_db)):
    """Update a milestone's status/due date/notes. Marking status='done' stamps completed_at/completed_by."""
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM section_milestones WHERE id = %s", (milestone_id,))
    milestone = cursor.fetchone()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    if body.status is not None and body.status not in ("pending", "in_progress", "done"):
        raise HTTPException(status_code=400, detail="status must be one of pending, in_progress, done")

    fields, params = [], []
    if body.status is not None:
        fields.append("status = %s")
        params.append(body.status)
        if body.status == "done":
            fields.append("completed_at = %s")
            params.append(datetime.utcnow())
            fields.append("completed_by = %s")
            params.append(body.updated_by)
        else:
            fields.append("completed_at = NULL")
            fields.append("completed_by = NULL")
    if body.due_date is not None:
        fields.append("due_date = %s")
        params.append(body.due_date)
    if body.notes is not None:
        fields.append("notes = %s")
        params.append(body.notes)

    if not fields:
        return {"ok": True, "message": "Nothing to update."}

    params.append(milestone_id)
    cursor.execute(f"UPDATE section_milestones SET {', '.join(fields)} WHERE id = %s", tuple(params))
    db.commit()
    return {"ok": True}


# --- Review endpoints --------------------------------------------------------

@router.get("/audit-sections/{section_id}/reviews")
def list_reviews(section_id: int, status: Optional[str] = None, db=Depends(get_db)):
    """List review entries (issues/highlights/redo requests) for a section, most recent first."""
    cursor = db.cursor(dictionary=True)
    _ensure_section_exists(cursor, section_id)

    query = """
        SELECT r.*, ru.full_name AS raised_by_name, rv.full_name AS resolved_by_name
        FROM section_reviews r
        LEFT JOIN users ru ON r.raised_by = ru.user_id
        LEFT JOIN users rv ON r.resolved_by = rv.user_id
        WHERE r.section_id = %s
    """
    params = [section_id]
    if status in ("open", "resolved"):
        query += " AND r.status = %s"
        params.append(status)
    query += " ORDER BY r.created_at DESC"

    cursor.execute(query, tuple(params))
    return cursor.fetchall()


@router.post("/audit-sections/{section_id}/reviews")
def create_review(section_id: int, body: ReviewCreate, db=Depends(get_db)):
    """Log a new issue, highlight, or redo request against a section."""
    if body.review_type not in ("issue", "highlight", "redo"):
        raise HTTPException(status_code=400, detail="review_type must be one of issue, highlight, redo")

    cursor = db.cursor(dictionary=True)
    _ensure_section_exists(cursor, section_id)

    review_id = str(uuid.uuid4())
    cursor.execute(
        """INSERT INTO section_reviews (id, section_id, review_type, notes, due_date, status, raised_by, created_at)
           VALUES (%s, %s, %s, %s, %s, 'open', %s, %s)""",
        (review_id, section_id, body.review_type, body.notes, body.due_date, body.raised_by, datetime.utcnow()),
    )
    db.commit()
    return {"ok": True, "id": review_id}


@router.put("/reviews/{review_id}")
def update_review(review_id: str, body: ReviewUpdate, db=Depends(get_db)):
    """Edit a review entry, or resolve it (status='resolved' stamps resolved_at/resolved_by)."""
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM section_reviews WHERE id = %s", (review_id,))
    review = cursor.fetchone()
    if not review:
        raise HTTPException(status_code=404, detail="Review entry not found")

    if body.status is not None and body.status not in ("open", "resolved"):
        raise HTTPException(status_code=400, detail="status must be one of open, resolved")

    fields, params = [], []
    if body.notes is not None:
        fields.append("notes = %s")
        params.append(body.notes)
    if body.due_date is not None:
        fields.append("due_date = %s")
        params.append(body.due_date)
    if body.status is not None:
        fields.append("status = %s")
        params.append(body.status)
        if body.status == "resolved":
            fields.append("resolved_at = %s")
            params.append(datetime.utcnow())
            fields.append("resolved_by = %s")
            params.append(body.resolved_by)
        else:
            fields.append("resolved_at = NULL")
            fields.append("resolved_by = NULL")

    if not fields:
        return {"ok": True, "message": "Nothing to update."}

    params.append(review_id)
    cursor.execute(f"UPDATE section_reviews SET {', '.join(fields)} WHERE id = %s", tuple(params))
    db.commit()
    return {"ok": True}


@router.delete("/reviews/{review_id}")
def delete_review(review_id: str, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM section_reviews WHERE id = %s", (review_id,))
    db.commit()
    return {"ok": True}