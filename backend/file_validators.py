
from fastapi import HTTPException
from typing import Optional
import pandas as pd


# --- File type / size validation --------------------------------------------
# (Your /upload endpoint already does inline versions of these two checks —
#  these are here so every endpoint that accepts a file, not just /upload,
#  can reuse the exact same rule instead of re-implementing it slightly
#  differently each time.)

def validate_file_type(filename: str, allowed_extensions: set) -> str:
    """Returns the lowercase extension if allowed, otherwise raises 415."""
    if not filename or "." not in filename:
        raise HTTPException(status_code=400, detail="Filename has no extension.")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=415,
            detail=f"File type .{ext} not supported. Allowed types: {', '.join(sorted(allowed_extensions))}.",
        )
    return ext


def validate_file_size(file_size_bytes: int, max_mb: int = 50) -> None:
    """Raises 413 if the file exceeds max_mb."""
    size_mb = file_size_bytes / (1024 * 1024)
    if size_mb > max_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds the maximum limit of {max_mb} MB. Uploaded file size: {size_mb:.2f} MB.",
        )


# --- Sheet discovery + validation --------------------------------------------

def get_workbook_sheet_names(file_path: str, ext: str) -> list:
    """
    Returns the REAL list of sheet names inside a workbook, read straight
    from the file on disk. Only Excel formats (xlsx/xls) have multiple
    sheets — CSV/PDF/DOCX are treated as a single implicit "sheet" so the
    same validation path works uniformly across file types.
    """
    if ext not in ("xlsx", "xls"):
        # CSV/PDF/DOCX: no real sheet concept, so there's exactly one
        # implicit sheet. Using None as the name keeps the "selected sheet
        # must exist" check meaningful even for non-Excel uploads.
        return [None]
    try:
        excel_file = pd.ExcelFile(file_path)
        return list(excel_file.sheet_names)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read workbook sheets: {str(e)}")


def validate_selected_sheets(file_path: str, ext: str, selected_sheets: Optional[list]) -> list:
    """
    Validates that every sheet name in `selected_sheets` actually exists in
    the uploaded workbook. Returns the real sheet-name list to process.

    Behavior:
      - selected_sheets is None/empty on an Excel file -> defaults to ALL
        real sheets in the workbook (explicit, not a silent "first sheet
        only" default like pandas' out-of-the-box behavior).
      - selected_sheets is provided -> every name must exist in the
        workbook, and duplicates are rejected, exactly like the doc's
        rule: "A user should not be able to submit a sheet name that
        isn't actually inside the uploaded workbook."
      - Non-Excel files ignore selected_sheets entirely (there's nothing
        to select from).
    """
    real_sheets = get_workbook_sheet_names(file_path, ext)

    if ext not in ("xlsx", "xls"):
        return real_sheets  # [None] — nothing to validate for single-sheet formats

    if not selected_sheets:
        # No explicit selection: process every real sheet in the workbook.
        return real_sheets

    seen = set()
    duplicates = set()
    for name in selected_sheets:
        if name in seen:
            duplicates.add(name)
        seen.add(name)
    if duplicates:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate sheet(s) selected: {', '.join(sorted(duplicates))}.",
        )

    unknown = [name for name in selected_sheets if name not in real_sheets]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Sheet(s) not found in the uploaded workbook: {', '.join(unknown)}. "
                f"Available sheets: {', '.join(real_sheets)}."
            ),
        )

    return selected_sheets


# --- Single entry point ------------------------------------------------------

def validate_file_submission(
    filename: str,
    file_size_bytes: int,
    file_path: str,
    allowed_extensions: set,
    selected_sheets: Optional[list] = None,
    max_mb: int = 50,
) -> dict:
    """
    Runs the full Section #3 chain in order:
      validate type -> validate size -> validate selected sheets exist

    Call this AFTER the file has already been saved to disk (file_path),
    since sheet validation needs to actually open the file to know what
    sheets are real.

    Returns {"extension": ..., "sheets_to_process": [...]}, ready to hand
    to your existing read/clean/AI pipeline.
    """
    ext = validate_file_type(filename, allowed_extensions)
    validate_file_size(file_size_bytes, max_mb)
    sheets_to_process = validate_selected_sheets(file_path, ext, selected_sheets)
    return {"extension": ext, "sheets_to_process": sheets_to_process}