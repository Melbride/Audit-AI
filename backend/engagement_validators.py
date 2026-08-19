

from fastapi import HTTPException
from datetime import datetime, date
from typing import Optional


# Used only when audit_sections is completely empty (fresh database, first
# engagement ever created). Once any engagement exists, this constant is
# never read again — get_valid_section_catalog() pulls from real data instead.
DEFAULT_SECTION_CATALOG = ["Revenue", "Expenses", "Inventory", "Cash & Bank"]


# --- Date validation -----------------------------------------------------

def _parse_date(value) -> Optional[date]:
    """Accepts a date, datetime, or 'YYYY-MM-DD' string. Returns None if
    value is None/empty. Raises HTTPException on an unparseable string,
    since a malformed date should never be silently ignored."""
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format: '{value}'. Expected YYYY-MM-DD.",
        )


def validate_engagement_dates(start_date, end_date) -> None:
    """Rejects an engagement whose start_date is after its end_date. Either
    side may be None (open-ended engagements are allowed) — only rejects
    when BOTH are present and out of order."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if start and end and start > end:
        raise HTTPException(
            status_code=400,
            detail="Start date cannot be after end date.",
        )


# --- Required-field validation --------------------------------------------

def validate_required_engagement_fields(client_id, engagement_name, financial_year) -> None:
    """Rejects empty/whitespace-only required fields. Pydantic already
    enforces these fields are present as strings, but not that they're
    non-blank — '   ' passes a plain `str` type check."""
    if client_id is None:
        raise HTTPException(status_code=400, detail="client_id is required.")
    if not engagement_name or not str(engagement_name).strip():
        raise HTTPException(status_code=400, detail="engagement_name cannot be empty.")
    if not financial_year or not str(financial_year).strip():
        raise HTTPException(status_code=400, detail="financial_year cannot be empty.")


# --- Client existence ------------------------------------------------------

def validate_client_exists(db, client_id: int) -> None:
    """Confirms client_id actually refers to a real client row before an
    engagement gets created/updated against it — a bare foreign key
    constraint would also catch this, but a clear 400 here is far more
    useful to the frontend than a raw DB integrity error."""
    cursor = db.cursor()
    cursor.execute("SELECT 1 FROM clients WHERE client_id = %s", (client_id,))
    if cursor.fetchone() is None:
        raise HTTPException(status_code=400, detail=f"Client {client_id} does not exist.")


# --- Engagement existence (for update/submit flows) ------------------------

def validate_engagement_exists(db, engagement_id: int) -> dict:
    """Confirms the engagement exists before an update/submission proceeds,
    and returns its row. Currently update_engagement() runs its UPDATE
    unconditionally, so a bad engagement_id silently affects zero rows
    instead of returning a 404 — this closes that gap."""
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM engagements WHERE engagement_id = %s", (engagement_id,))
    engagement = cursor.fetchone()
    if not engagement:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found.")
    return engagement


# --- Section selection validation -------------------------------------------

def get_valid_section_catalog(db) -> set:
    """Live catalog of known section names, drawn from real data (every
    distinct section_name ever used across all engagements), not a
    hardcoded list. Falls back to DEFAULT_SECTION_CATALOG only when the
    table is completely empty (brand-new database, first engagement ever)."""
    cursor = db.cursor()
    cursor.execute("SELECT DISTINCT section_name FROM audit_sections")
    existing = {row[0] for row in cursor.fetchall()}
    return existing if existing else set(DEFAULT_SECTION_CATALOG)


def validate_selected_sections(db, section_names: list) -> None:
    """
    Validates a list of section names proposed for a new/updated engagement:
      - at least one section must be selected
      - no duplicates
      - every name must exist in the live section catalog (see above) —
        this is what prevents a typo'd or made-up section name from
        silently becoming a new "valid" section with no real definition.
    """
    if not section_names:
        raise HTTPException(status_code=400, detail="At least one section must be selected.")

    seen = set()
    duplicates = set()
    for name in section_names:
        if name in seen:
            duplicates.add(name)
        seen.add(name)
    if duplicates:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate sections selected: {', '.join(sorted(duplicates))}.",
        )

    catalog = get_valid_section_catalog(db)
    unknown = [name for name in section_names if name not in catalog]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown section(s): {', '.join(unknown)}. "
                f"Valid sections are: {', '.join(sorted(catalog))}."
            ),
        )


# --- Assigned user validation ------------------------------------------------

def validate_assigned_users_exist(db, user_ids: list) -> None:
    """Confirms every user_id proposed for engagement assignment actually
    exists (and is Active), before any engagement_team rows reference them."""
    if not user_ids:
        return  # assigning users is optional; nothing to check
    placeholders = ",".join(["%s"] * len(user_ids))
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        f"SELECT user_id, status FROM users WHERE user_id IN ({placeholders})",
        tuple(user_ids),
    )
    found = {row["user_id"]: row["status"] for row in cursor.fetchall()}
    missing = [uid for uid in user_ids if uid not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Assigned user(s) do not exist: {', '.join(str(m) for m in missing)}.",
        )
    inactive = [uid for uid, status in found.items() if status != "Active" and uid in user_ids]
    if inactive:
        raise HTTPException(
            status_code=400,
            detail=f"Assigned user(s) are not active: {', '.join(str(i) for i in inactive)}.",
        )


# --- Single entry point for engagement creation -----------------------------

def validate_engagement_creation(
    db,
    client_id: int,
    engagement_name: str,
    financial_year: str,
    start_date,
    end_date,
    section_names=None,
    assigned_user_ids=None,
) -> None:
    """
    Runs every relevant check from Section #2 of the validation architecture
    doc, in order, for a new engagement. Raises HTTPException on the first
    failure. Call this before any INSERT happens.

    section_names / assigned_user_ids are optional because the current
    create_engagement() endpoint doesn't accept them yet — pass them in once
    you extend the Engagement request model to include them (see the
    accompanying integration notes).
    """
    validate_required_engagement_fields(client_id, engagement_name, financial_year)
    validate_client_exists(db, client_id)
    validate_engagement_dates(start_date, end_date)
    if section_names is not None:
        validate_selected_sections(db, section_names)
    if assigned_user_ids is not None:
        validate_assigned_users_exist(db, assigned_user_ids)


def validate_engagement_update(
    db,
    engagement_id: int,
    client_id: int,
    engagement_name: str,
    financial_year: str,
    start_date,
    end_date,
) -> dict:
    """
    Same as validate_engagement_creation, plus confirms the engagement
    actually exists first (the gap in the current update_engagement()).
    Returns the existing engagement row so the caller doesn't need a
    second query.
    """
    existing = validate_engagement_exists(db, engagement_id)
    validate_required_engagement_fields(client_id, engagement_name, financial_year)
    validate_client_exists(db, client_id)
    validate_engagement_dates(start_date, end_date)
    return existing