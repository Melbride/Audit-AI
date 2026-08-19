

from fastapi import HTTPException

from error_responses import error_detail


def get_section_for_engagement(db, section_id: int) -> dict:
    """
    Fetches a single audit_sections row by id, or raises 404. Small shared
    helper so both validate_section_in_engagement_scope() and any future
    caller don't duplicate the same SELECT.
    """
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT section_id, engagement_id, section_name, status, in_scope "
        "FROM audit_sections WHERE section_id = %s",
        (section_id,),
    )
    section = cursor.fetchone()
    if not section:
        raise HTTPException(
            status_code=404,
            detail=error_detail(
                f"Audit section {section_id} does not exist.",
                error_code="NOT_FOUND",
                details={"section_id": section_id},
            ),
        )
    return section


def validate_section_in_engagement_scope(db, engagement_id: int, section_id: int) -> dict:
    """
    Confirms, in order:
      1. the section exists
      2. it belongs to the stated engagement (not some other engagement)
      3. it is currently in scope for that engagement

    Raises HTTPException on the first failure. Returns the section row on
    success so callers that need section_name/status don't have to
    re-query.

    Rule from the doc: "If the section isn't part of the engagement scope:
    Reject the request. Do not automatically add that section to the
    engagement." This function only ever reads and rejects — it never
    writes to audit_sections.
    """
    section = get_section_for_engagement(db, section_id)

    if section["engagement_id"] != engagement_id:
        raise HTTPException(
            status_code=400,
            detail=error_detail(
                f"Section {section_id} ('{section['section_name']}') belongs to a "
                f"different engagement and is not in scope for engagement {engagement_id}.",
                error_code="OUT_OF_SCOPE",
                details={
                    "section_id": section_id,
                    "section_name": section["section_name"],
                    "submitted_engagement_id": engagement_id,
                    "actual_engagement_id": section["engagement_id"],
                },
            ),
        )

    # in_scope may be NULL on rows created before the scoping feature
    # existed — treat missing/NULL the same as explicitly out of scope
    # rather than assuming it's fine.
    if not section.get("in_scope"):
        raise HTTPException(
            status_code=400,
            detail=error_detail(
                f"Section '{section['section_name']}' is not in scope for this "
                "engagement, so it cannot receive submissions. Add it to scope "
                "first if this is a mistake.",
                error_code="OUT_OF_SCOPE",
                details={
                    "section_id": section_id,
                    "section_name": section["section_name"],
                    "engagement_id": engagement_id,
                },
            ),
        )

    return section