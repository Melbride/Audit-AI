"""
Report export endpoints — its own router, separate from report_routes.py
(the review/approval workflow), matching how main.py wires them in:

    from report_routes import router as report_router
    app.include_router(report_router)

    from report_exports import router as report_export_router
    app.include_router(report_export_router)

Shares the same /api/reports prefix as report_routes.py — FastAPI merges
routes from multiple routers under the same prefix without conflict, as
long as the paths themselves don't collide (they don't here: /export and
/exports/{id}/download aren't claimed by report_routes.py).

File generation itself (PDF/Excel/CSV) lives in report_export.py (singular
— just helper functions, no router), imported below.
"""

import json
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import get_db
from report_export import EXPORT_DIR, FORMAT_BUILDERS

router = APIRouter(prefix="/api/reports", tags=["report-exports"])


class ExportRequest(BaseModel):
    format: str  # "pdf" | "excel" | "csv" — validated against FORMAT_BUILDERS below
    exported_by: Optional[int] = None


def _fetch_current_version(cursor, report_id: str):
    """Same lookup as report_routes.py's private helper of the same name —
    duplicated here rather than imported across routers to keep the two
    files independently deployable."""
    cursor.execute(
        """
        SELECT rv.* FROM report_versions rv
        JOIN reports r ON r.current_version_id = rv.id
        WHERE r.id = %s
        """,
        (report_id,),
    )
    return cursor.fetchone()


@router.post("/{report_id}/export")
def export_report(report_id: str, body: ExportRequest, db=Depends(get_db)):
    """Generate a PDF/Excel/CSV file for the report's current version and
    record it in report_exports. Returns an export_id used to download it."""
    fmt = body.format.lower()
    if fmt not in FORMAT_BUILDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{body.format}'. Must be one of: {', '.join(FORMAT_BUILDERS)}.",
        )

    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    report = cursor.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    version = _fetch_current_version(cursor, report_id)
    if not version:
        raise HTTPException(status_code=404, detail="No current version for this report")

    # Parse the JSON columns into real dicts/lists before handing them to
    # the file builders (they come back from MySQL as strings).
    version = {
        **version,
        "financial_summary": json.loads(version["financial_summary"] or "{}"),
        "ai_insights": json.loads(version["ai_insights"] or "[]"),
    }

    builder_fn, extension, _content_type = FORMAT_BUILDERS[fmt]
    export_id = str(uuid.uuid4())
    file_path = os.path.join(EXPORT_DIR, f"{export_id}.{extension}")

    try:
        builder_fn(report, version, file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate {fmt} export: {str(e)}")

    cursor.execute(
        """INSERT INTO report_exports (id, report_version_id, format, file_url, exported_by, exported_at)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (export_id, version["id"], fmt, file_path, body.exported_by, datetime.utcnow()),
    )
    db.commit()

    return {"export_id": export_id, "format": fmt, "message": f"{fmt.upper()} export generated successfully."}


@router.get("/exports/{export_id}/download")
def download_export(export_id: str, db=Depends(get_db)):
    """
    Serve a previously generated export file for direct download.

    Deliberately NOT behind require_role/get_current_user: the frontend opens
    this via window.open(url, "_blank") (a plain browser navigation), which
    does not carry the Authorization: Bearer header your other endpoints
    require. export_id is an unguessable UUID, so this relies on that instead
    of a session check — the same tradeoff most "signed download link"
    patterns make.
    """
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM report_exports WHERE id = %s", (export_id,))
    export_row = cursor.fetchone()
    if not export_row:
        raise HTTPException(status_code=404, detail="Export not found")

    file_path = export_row["file_url"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file is missing from disk. Please export again.")

    _, extension, content_type = FORMAT_BUILDERS[export_row["format"]]
    filename = f"report_{export_row['report_version_id']}.{extension}"
    return FileResponse(file_path, media_type=content_type, filename=filename)