from openpyxl import load_workbook

ROW_ID_COLUMN = "_row_id"


def values_differ(original_value, uploaded_value) -> bool:
    """
    Compare two cell values for a real difference, tolerant of numeric formatting
    differences (e.g. 45000000.0 vs 45000000) that aren't actual edits made by the auditor.
    """
    orig_str = "" if original_value is None else str(original_value).strip()
    up_str = "" if uploaded_value is None else str(uploaded_value).strip()

    if orig_str == up_str:
        return False

    # Try numeric comparison so formatting differences aren't treated as real edits
    try:
        if float(orig_str) == float(up_str):
            return False
    except (ValueError, TypeError):
        pass

    return True


def diff_uploaded_against_snapshot(uploaded_file_path: str, snapshot_rows: list) -> dict:
    """
    Read a re-uploaded, auditor-edited Excel file (from the cleaning workbook export) and
    compare it against the saved snapshot of what was originally downloaded.

    Rows are matched by the hidden "_row_id" column written into every export, NOT by
    position. This means the auditor can freely delete rows (e.g. a row they judged to be
    unreliable or unnecessary) and the system still correctly identifies exactly which
    original row is missing, rather than misaligning the comparison or rejecting the file
    outright just because the row count changed.

    COLUMN RENAME RULE: a single column rename is recognized whenever exactly one new
    column name appears in the upload that wasn't in the snapshot, AND its data can be
    confidently traced back to exactly one missing column's data (matched by comparing
    cell values for rows present in both, not by position). This lets a rename coexist
    in the same upload with any number of genuinely unrelated column deletions — e.g. the
    auditor renames one column and deletes a different one in the same editing session —
    without that being treated as ambiguous, since the value-matching tells us precisely
    which missing name the new name replaces, leaving the rest as ordinary deletions.

    Only ONE rename is supported per upload. If more than one new column name appears at
    once, we cannot safely tell which old name each one is meant to replace without
    guessing, so this is reported as `ambiguous_changes` instead. Likewise, if a new
    name's values don't strongly match any missing column's data (below a 90% match
    threshold), it's treated as an unexplained new column rather than guessed as a rename.

    Renames are deliberately NOT inferred from column position. An earlier version of this
    function paired old/new names by index, which broke as soon as the live schema drifted
    from the snapshot for any other reason — e.g. resolving one column can introduce a new
    derived column (such as a tax_amount field that only exists once a column is mapped),
    which shifts every later column's index and caused completely unrelated, untouched
    columns to be misreported as renamed.

    Returns a dict with:
      "corrections": list of {row_index, column, original_value, corrected_value} for every
        data cell that actually changed, keyed by the ORIGINAL (snapshot) column name.
      "deleted_row_ids": list of original row indices present in the snapshot but missing
        from the uploaded file — rows the auditor removed.
      "deleted_columns": list of column names present in the snapshot but missing from the
        uploaded file, where no rename was recognized — i.e. genuine deletions only.
      "renamed_columns": dict of {old_name: new_name} for the single column rename
        recognized this round, if any (empty dict if none, or if ambiguous_changes is True).
        The caller should apply this directly to the column mapping (set mapped_to to the
        new name) regardless of whether the column was previously unknown or already mapped.
      "ambiguous_changes": True if more than one column's identity changed at once (more
        than one name missing and/or more than one name added), meaning no rename could be
        safely inferred. The caller should ask the auditor to re-download a fresh workbook
        rather than guess.
      "new_row_ids": list of row ids found in the uploaded file that were never in the
        snapshot — this should not normally happen since the hidden id column is locked
        from being repurposed, but is reported for safety.
    """
    wb = load_workbook(uploaded_file_path, data_only=True)
    if "Cleaned Data" not in wb.sheetnames:
        raise ValueError("Uploaded file does not contain a 'Cleaned Data' sheet. Please upload the file exactly as it was downloaded.")
    ws = wb["Cleaned Data"]

    raw_headers = [cell.value for cell in ws[1]]
    if not raw_headers or raw_headers[0] != ROW_ID_COLUMN:
        raise ValueError(
            "Uploaded file is missing its row tracking column. Please upload the file "
            "exactly as downloaded, without removing or modifying the hidden first column."
        )

    # Strip any remaining [UNRESOLVED] prefix to get each column's real underlying name.
    clean_headers = []
    for h in raw_headers[1:]:
        if h == "Issues":
            continue
        if h and str(h).startswith("[UNRESOLVED]"):
            clean_headers.append(str(h).replace("[UNRESOLVED]", "", 1).strip())
        else:
            clean_headers.append(h)

    # Reject immediately if the uploaded file has two columns with the same header
    # name. This is the case where a rename collides with an EXISTING column — e.g.
    # renaming "department" to "department_name" when "department_name" already
    # exists elsewhere in the file. That case is invisible to the set-difference
    # logic below (the new name was never "new" relative to the snapshot, since it
    # already existed), so without this explicit check the renamed column's data
    # silently falls into deleted_columns with no error at all, and the dict-building
    # step below would also silently lose data via key overwrite. Catching it here,
    # directly from the duplicate header text itself, is the only reliable signal —
    # it doesn't depend on knowing anything about the snapshot.
    seen_headers = {}
    duplicate_headers = set()
    for h in clean_headers:
        if h in seen_headers:
            duplicate_headers.add(h)
        seen_headers[h] = True
    if duplicate_headers:
        names = ", ".join(f"'{h}'" for h in sorted(duplicate_headers))
        raise ValueError(
            f"The uploaded file has more than one column named {names}. This usually "
            f"happens when a column was renamed to a name that another column already "
            f"uses. Please give each column a unique name and upload again."
        )

    # Build a lookup of uploaded rows keyed by their row id, reading every data row
    uploaded_rows_by_id = {}
    for row_cells in ws.iter_rows(min_row=2, values_only=False):
        row_id_value = row_cells[0].value
        if row_id_value is None:
            continue  # skip any fully blank trailing row
        row_id = int(row_id_value)
        row_data = {}
        for col_offset, col_name in enumerate(clean_headers, start=1):
            row_data[col_name] = row_cells[col_offset].value
        uploaded_rows_by_id[row_id] = row_data

    # Close the workbook now that every value needed has been read out of it. On Windows,
    # openpyxl keeps the underlying file handle open until close() is called explicitly —
    # without this, the caller's attempt to delete the temp upload file right after this
    # function returns fails with PermissionError: file in use by another process.
    wb.close()

    # Snapshot columns (excluding the internal _row_index key)
    snapshot_columns = set()
    snapshot_rows_by_id = {}
    for snap_row in snapshot_rows:
        row_id = snap_row["_row_index"]
        snapshot_rows_by_id[row_id] = snap_row
        snapshot_columns.update(k for k in snap_row.keys() if k != "_row_index")

    uploaded_columns = set(clean_headers)

    # Names missing from the upload and names newly present in the upload, by SET.
    missing_names = snapshot_columns - uploaded_columns
    added_names = uploaded_columns - snapshot_columns

    # A rename and pure deletions can legitimately happen in the SAME upload (e.g. the
    # auditor renames one column and deletes a different, unrelated one in the same
    # editing session) — that should not be treated as ambiguous. The real ambiguity
    # only arises when MORE THAN ONE new name appears, since then we can't tell which
    # old name each new name is meant to replace without guessing.
    #
    # With at most one added name, we still need to figure out WHICH missing name (if
    # several are missing) it actually replaces, versus the rest being genuine
    # deletions. Name-set membership alone can't tell us that when len(missing) > 1, so
    # we use the data itself: a rename keeps the same cell VALUES under a new header,
    # while a genuine deletion's values simply disappear. We compare the new column's
    # values (for shared row ids) against each missing column's values and treat the
    # best, sufficiently-strong match as the rename target. If no missing column's
    # values line up well enough, we don't guess — the new column is reported as an
    # unexplained addition via ambiguous_changes instead.
    renamed_columns = {}
    ambiguous_changes = False

    if len(added_names) > 1:
        # Multiple new names at once — cannot safely tell which old name each one
        # replaces without guessing. Reported as ambiguous rather than paired by
        # position (which previously misattributed renames during schema drift).
        ambiguous_changes = True
    elif len(added_names) == 1:
        new_name = next(iter(added_names))

        if len(missing_names) == 0:
            # A genuinely new column with nothing missing to pair it with — not a
            # rename of anything, just an unexplained addition. Treated as ambiguous
            # so the caller can ask what this new column is, rather than silently
            # accepting an unplanned schema change.
            ambiguous_changes = True
        elif len(missing_names) == 1:
            # Simple case: exactly one missing, one added — same as before, no need
            # to check values, there's only one possible pairing.
            renamed_columns[next(iter(missing_names))] = new_name
        else:
            # Multiple missing names, one added name — use cell values (for rows
            # present in both snapshot and upload) to find which missing column the
            # new column's data actually matches. This is what lets a rename and one
            # or more unrelated deletions coexist safely in the same upload.
            shared_row_ids = set(snapshot_rows_by_id.keys()) & set(uploaded_rows_by_id.keys())
            best_match = None
            best_match_score = -1
            for candidate_old_name in missing_names:
                compared = 0
                matched = 0
                for row_id in shared_row_ids:
                    old_value = snapshot_rows_by_id[row_id].get(candidate_old_name)
                    new_value = uploaded_rows_by_id[row_id].get(new_name)
                    old_is_blank = old_value is None or str(old_value).strip() == ""
                    new_is_blank = new_value is None or str(new_value).strip() == ""
                    if old_is_blank and new_is_blank:
                        # Both sides blank for this row — this tells us nothing about
                        # whether these two columns are the same column renamed (every
                        # other all-empty column in the file would "match" too). Skip
                        # rather than counting it as a match.
                        continue
                    compared += 1
                    if not values_differ(old_value, new_value):
                        matched += 1
                # A candidate with compared == 0 (e.g. an entirely empty column, with
                # nothing to compare in any shared row) provides NO positive evidence
                # either way and must not be allowed to win — score=0 here means
                # "no information", not "confirmed mismatch", and treating the two the
                # same way previously let an empty candidate win by coin-flip against
                # another equally-uninformative candidate (non-deterministic, and not
                # actually justified by any evidence).
                if compared == 0:
                    continue
                score = matched / compared
                if score > best_match_score:
                    best_match_score = score
                    best_match = candidate_old_name

            # Require a strong match (at least 90% of compared values identical) before
            # trusting it as a rename — a weak match means this is more likely a
            # genuinely new column that happens to share a few coincidental values,
            # not a rename, and guessing wrong here is worse than asking. If no
            # candidate had any comparable data at all (best_match stays None), we
            # also don't guess — same reasoning.
            if best_match is not None and best_match_score >= 0.9:
                renamed_columns[best_match] = new_name
            else:
                ambiguous_changes = True

    if ambiguous_changes:
        deleted_columns = []
    else:
        deleted_columns = sorted(missing_names - set(renamed_columns.keys()))

    # Rows present in the snapshot but missing from the upload entirely = deliberately deleted rows
    deleted_row_ids = sorted(set(snapshot_rows_by_id.keys()) - set(uploaded_rows_by_id.keys()))

    # Rows present in the upload that were never in the snapshot — should not normally
    # happen since the id column is locked, reported for safety/debugging
    new_row_ids = sorted(set(uploaded_rows_by_id.keys()) - set(snapshot_rows_by_id.keys()))

    # Diff cell values only for rows that exist in both. For columns, use the snapshot's
    # name for any column unchanged or recognized as a rename, so corrections key against
    # the name the mapping/dataframe still uses today (pre-rename), not the new label.
    diffable_columns = {}  # snapshot_name -> uploaded_name
    for col_name in snapshot_columns & uploaded_columns:
        diffable_columns[col_name] = col_name
    for old_name, new_name in renamed_columns.items():
        diffable_columns[old_name] = new_name

    corrections = []
    for row_id, snap_row in snapshot_rows_by_id.items():
        if row_id not in uploaded_rows_by_id:
            continue  # this row was deleted, already captured in deleted_row_ids
        uploaded_row = uploaded_rows_by_id[row_id]
        for snapshot_col, uploaded_col in diffable_columns.items():
            original_value = snap_row.get(snapshot_col)
            uploaded_value = uploaded_row.get(uploaded_col)
            if values_differ(original_value, uploaded_value):
                corrections.append({
                    "row_index": row_id,
                    "column": snapshot_col,
                    "original_value": "" if original_value is None else str(original_value),
                    "corrected_value": "" if uploaded_value is None else str(uploaded_value),
                })

    return {
        "corrections": corrections,
        "deleted_row_ids": deleted_row_ids,
        "deleted_columns": deleted_columns,
        "renamed_columns": renamed_columns,
        "ambiguous_changes": ambiguous_changes,
        "new_row_ids": new_row_ids,
    }