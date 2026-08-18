import pandas as pd
import re
from datetime import datetime
from difflib import SequenceMatcher

# Boolean/status value groups that should be consistent.Flag if mixed
BOOLEAN_VALUE_GROUPS = [
    {'yes', 'no'},
    {'y', 'n'},
    {'true', 'false'},
    {'paid', 'unpaid'},
    {'active', 'inactive'},
]

# Summary row indicators - words that suggest a row is a total/subtotal/summary
SUMMARY_INDICATORS = {
    'total', 'subtotal', 'grand total', 'sum', 'net', 'balance', 'closing',
    'total assets', 'total liabilities', 'total equity', 'total revenue',
    'total expenses', 'net income', 'gross profit', 'operating profit'
}

def is_summary_row(row: pd.Series, mapping: dict, file_type: str = None) -> bool:
    """
    Determines if a row is a summary/total/subtotal row rather than a normal account record.
    Uses multiple pieces of evidence to avoid false positives on legitimate accounts
    that happen to contain words like "Total" in their description.
    
    Evidence considered:
    1. Account/code field is empty or None
    2. Description/label contains summary indicators
    3. Most accounting/numeric fields are blank or zero
    4. File type is accounting-related (trial_balance, general_ledger)
    
    Returns True if the row appears to be a summary row, False otherwise.
    """
    # Identify common account/code and description columns
    account_code_cols = []
    description_cols = []
    numeric_cols = []
    
    for original_col, info in mapping.items():
        if not isinstance(info, dict):
            continue
        mapped_to = info.get("mapped_to", "").lower()
        field_type = info.get("field_type", "")
        
        # Account/code columns
        if any(term in mapped_to for term in ['account_code', 'account_number', 'account_no', 'gl_code', 'code']):
            account_code_cols.append(mapped_to)
        # Description/label columns
        elif any(term in mapped_to for term in ['account_name', 'account_description', 'description', 'particulars', 'label']):
            description_cols.append(mapped_to)
        # Numeric/accounting columns
        elif field_type == 'numeric' and mapped_to not in ('debit', 'credit'):
            numeric_cols.append(mapped_to)
    
    # If we can't identify the structure, be conservative and don't classify as summary
    if not account_code_cols and not description_cols:
        return False
    
    # Evidence 1: Account/code field should be empty or None for summary rows
    has_empty_code = False
    for col in account_code_cols:
        if col in row.index:
            val = row.get(col)
            if pd.isna(val) or str(val).strip() == "":
                has_empty_code = True
                break
    
    # Evidence 2: Description should contain summary indicators
    has_summary_indicator = False
    for col in description_cols:
        if col in row.index:
            val = row.get(col)
            if pd.notna(val) and str(val).strip():
                val_lower = str(val).strip().lower()
                # Check if any summary indicator is a standalone word or at the start
                for indicator in SUMMARY_INDICATORS:
                    if val_lower == indicator or val_lower.startswith(indicator + ' ') or val_lower.endswith(' ' + indicator):
                        has_summary_indicator = True
                        break
        if has_summary_indicator:
            break
    
    # Evidence 3: Most numeric fields should be blank or zero for summary rows
    numeric_fields_blank_or_zero = 0
    total_numeric_fields = 0
    for col in numeric_cols:
        if col in row.index:
            total_numeric_fields += 1
            val = row.get(col)
            if pd.isna(val) or str(val).strip() == "" or float(val) == 0:
                numeric_fields_blank_or_zero += 1
    
    # Make the determination
    # For accounting files, be more lenient (require fewer evidence points)
    is_accounting_file = file_type in ('trial_balance', 'general_ledger')
    
    if is_accounting_file:
        # Accounting file: Need at least 2 of 3 evidence points
        evidence_count = sum([
            has_empty_code,
            has_summary_indicator,
            (total_numeric_fields > 0 and numeric_fields_blank_or_zero / total_numeric_fields >= 0.7)
        ])
        return evidence_count >= 2
    else:
        # Non-accounting file: Need all 3 evidence points to be conservative
        return has_empty_code and has_summary_indicator and (
            total_numeric_fields == 0 or numeric_fields_blank_or_zero / total_numeric_fields >= 0.8
        )

# Function to detect ambiguous date strings
def detect_ambiguous_date_string(val_str: str):
    """
    Detects date strings where the day/month order is genuinely ambiguous —
    i.e. both numeric parts could validly be a day or a month (each <= 12),
    such as '01/05/2024' (1 May or 5 January?) or '03/04/2024' (3 April or
    4 March?). Only numeric slash/dash-separated formats are ambiguous this
    way; formats with a named month (e.g. '16 Jan 2024', 'Jan 20 2024') or
    an explicit 4-digit year leading the string (e.g. '2024-01-07', which is
    unambiguously YYYY-MM-DD) are not flagged.

    Returns a tuple (day_first_reading, month_first_reading) as ISO strings
    if the string is ambiguous, or None if it is not ambiguous (either
    because it's unambiguous, or because one or both numeric parts are out
    of range for the other reading to even be valid).
    """
    val_str = val_str.strip()
    # Matches D/M/YYYY, DD/MM/YYYY, D-M-YYYY etc. — first two numeric groups
    # must each be 1-2 digits, separated by '/' or '-', followed by a 4-digit year.
    # This deliberately excludes YYYY-MM-DD (year-first) since that format is
    # already unambiguous and is handled elsewhere via the dayfirst-detection logic.
    match = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', val_str)
    if not match:
        return None

    first, second, year = int(match.group(1)), int(match.group(2)), match.group(3)

    # If either number is > 12, only one reading is possible (it must be the day). So there's no real ambiguity, e.g. '23/01/2024' can only be 23 Jan.
    if first > 12 or second > 12:
        return None

    # If first == second (e.g. '05/05/2024'), both readings give the same date. Not ambiguous in any way that matters.
    if first == second:
        return None
    # Otherwise, both readings are possible.
    day_first_reading = f"{year}-{second:02d}-{first:02d}"   # DD/MM/YYYY
    month_first_reading = f"{year}-{first:02d}-{second:02d}" # MM/DD/YYYY
    return day_first_reading, month_first_reading

# Function to normalize amount strings
def normalize_amount_str(s: str) -> str:
    # Remove spaces used as thousand separators e.g. "7 200" -> "7200"
    s = re.sub(r'(\d)\s+(\d)', r'\1\2', s)
    # Remove all non-numeric chars except dot and minus
    s = re.sub(r'[^\d.-]', '', s)
    # Collapse multiple dots
    s = re.sub(r'\.(?=.*\.)', '', s)
    return s

# Function to detect if two or more original columns were mapped to the same standard field name.
# This is a real bug source: after rename_columns, the dataframe would end up with two columns
# sharing one name, and every df.at[idx, col] lookup downstream returns a Series instead of a
# single value, causing "truth value of a Series is ambiguous" crashes deep inside cleaning.
# Returns a dict of {mapped_to: [original_col1, original_col2, ...]} for every collision found.
def detect_duplicate_mappings(mapping: dict) -> dict:
    seen = {}
    for original_col, info in mapping.items():
        if not isinstance(info, dict):
            continue
        mapped_to = str(info.get("mapped_to", "")).strip()
        # "unknown" is allowed to repeat, those columns are never renamed, so they never collide
        if mapped_to in ("", "unknown"):
            continue
        seen.setdefault(mapped_to, []).append(original_col)
    return {standard_name: cols for standard_name, cols in seen.items() if len(cols) > 1}

# Main function to clean the dataframe based on the confirmed mapping
def clean_dataframe(df: pd.DataFrame, mapping: dict, fill_rates: dict = None, file_type: str = None) -> tuple:
    """
    Main cleaning function, takes a raw dataframe and confirmed column mapping.
    Mapping structure: {original_col: {"mapped_to": "amount", "field_type": "numeric"}}
    fill_rates: {original_col: float} — proportion of non-empty values per column (0.0 to 1.0).
    Columns with fill rate below 50% get one summary flag instead of per-row missing value flags.
    file_type: Optional file type (e.g., 'trial_balance', 'general_ledger') for summary row detection.
    Returns cleaned dataframe and a validation report.
    Raises ValueError early if the mapping has two original columns mapped to the same
    standard field name — this would otherwise create duplicate column names after renaming
    and crash deep inside cleaning with a confusing pandas error. Catching it here gives a
    clear, actionable message pointing at the actual problem instead.
    """
    duplicates = detect_duplicate_mappings(mapping)
    if duplicates:
        details = "; ".join(
            f"'{standard_name}' is claimed by columns {cols}"
            for standard_name, cols in duplicates.items()
        )
        raise ValueError(
            f"Mapping conflict: two or more original columns are mapped to the same field. {details}. "
            f"Please go back to the mapping step and give each column a unique 'Mapped To' value."
        )
    if fill_rates is None:
        fill_rates = {}

    # Keep a copy of original dataframe for comparison
    original_df = df.copy()
    # Track all issues found
    issues = []

    #Rename columns using confirmed mapping.Must happen first so cleaning functions can find columns by standard names
    df = rename_columns(df, mapping)
    # Clean date columns
    df = clean_dates(df, mapping, issues)
    # Check logical order of dates (e.g. End Date should not be before Start Date)
    check_date_order(df, mapping, issues)
    # Clean amount columns
    df = clean_amounts(df, mapping, issues)
    # Standardize text column casing
    df = standardize_casing(df, mapping, issues)
    # Handle null values — pass fill_rates so sparse columns get a summary flag instead of per-row noise
    df = handle_nulls(df, mapping, issues, fill_rates, file_type)
    # Check text columns for inconsistent boolean/status values
    check_value_consistency(df, mapping, issues)
    # Check for near-duplicate values (same value with minor variations)
    check_near_duplicate_values(df, mapping, issues)
    # Handle duplicates
    df = handle_duplicates(df, mapping, issues)
    # Build the validation report
    report = build_validation_report(df, original_df, issues)
    return df, report

# Function to rename columns based on the confirmed mapping
def rename_columns(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """
    Rename original columns to their mapped standard names.Extracts mapped_to from the new mapping structure.
    Must be called before any cleaning step so cleaning functions. Can find columns by their standard names.
    Columns mapped to "unknown" are skipped and kept under their original name.
    This prevents multiple unknown columns from colliding into one duplicate "unknown" column.
    """
    # Build a rename dictionary from the new mapping structure.{original_col: mapped_to}
    # Skip "unknown" mappings so each unmapped column keeps its own unique original name
    rename_dict = {
        original_col: info["mapped_to"].strip()
        for original_col, info in mapping.items()
        if isinstance(info, dict) and "mapped_to" in info and info["mapped_to"].strip() != "unknown"
    }
    df = df.rename(columns=rename_dict)
    return df

# Function to clean and standardize date columns
def clean_dates(df: pd.DataFrame, mapping: dict, issues: list) -> pd.DataFrame:
    """
    Find all columns with field_type 'date' using the confirmed mapping.Standardizes all date values to YYYY-MM-DD format.
    Uses DD/MM/YYYY as the standard input format.Flags any dates that cannot be parsed for auditor review.
    Skips columns mapped to "unknown" since those were not renamed and have no standard meaning yet.
    """
    # Find all columns whose field_type is date using the mapping. Look at mapped_to names because columns were already renamed.
    # Skip "unknown" mapped_to since those columns were left under their original name and have no confirmed field_type
    date_columns = [
        info["mapped_to"]
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "date"
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]
    for col in date_columns:
        for idx, value in df[col].items():
            # Skip empty values.
            if pd.isna(value) or str(value).strip() == "":
                continue
            original_value = value
            val_str = str(value).strip()
            cleaned = None

            # Check for genuine day/month ambiguity BEFORE committing to a guess.
            # This catches cases like '01/05/2024' that clean_dates would otherwise
            # silently parse one way with no way for the auditor to know the other
            # reading was just as valid. Unlike the date-order check (which only
            # catches this indirectly, and only when a second date column exists
            # in the same row to disagree with), this flags it directly at parse.Time, on any single date column.
            ambiguity = detect_ambiguous_date_string(val_str)
            if ambiguity:
                day_first_reading, month_first_reading = ambiguity
                issues.append({
                    "row": int(idx) + 2,
                    "column": col,
                    "row_index": idx,
                    "original_value": str(original_value),
                    "issue": (
                        f"Ambiguous date '{original_value}' in '{col}', this could mean "
                        f"{day_first_reading} (DD/MM/YYYY) or {month_first_reading} (MM/DD/YYYY) "
                        f"and there's no way to tell which from the text alone. We've assumed "
                        f"DD/MM/YYYY ({day_first_reading}) for now,please confirm this is correct, "
                        f"or correct the cell to an unambiguous format (e.g. spell out the month, "
                        f"like '5 Jan 2024')."
                    ),
                    "severity": "info"
                })

            try:
                # To avoid UserWarning when format is already ISO (YYYY-MM-DD),
                # only use dayfirst=True for potentially ambiguous strings.
                dayfirst = not (len(val_str) >= 10 and val_str[4] == '-' and val_str[7] == '-')
                dt = pd.to_datetime(val_str, dayfirst=dayfirst, errors='coerce')
                if pd.notna(dt) and dt.year >= 1900:
                    cleaned = dt.strftime("%Y-%m-%d")
            except Exception:
                pass
            if cleaned:
                # Successfully parsed, replace with standardized date
                df.at[idx, col] = cleaned
            else:
                # Could not parse or year missing, flag for auditor
                df.at[idx, col] = original_value
                issues.append({
                    "row": int(idx) + 2,
                    "column": col,
                    "row_index": idx,
                    "original_value": str(original_value),
                    "issue": f"Invalid date '{original_value}' check this cell and correct it to DD/MM/YYYY format (e.g. 15/03/2024)",
                    "severity": "high"
                })
    return df

# Function to clean and standardize amount columns
def clean_amounts(df: pd.DataFrame, mapping: dict, issues: list) -> pd.DataFrame:
    """
    Find all columns with field_type 'numeric' using the confirmed mapping.Standardizes values to float numbers.
    Removes commas, currency symbols and whitespace.Converts accounting negatives e.g.(1,500) to -1500.0.
    Flags values that cannot be converted to a number.
    Skips columns mapped to "unknown" since those were not renamed and have no standard meaning yet.
    """
    # Find all columns whose field_type is numeric using the mapping. Look at mapped_to names because columns were already renamed.
    # Skip "unknown" mapped_to since those columns were left under their original name and have no confirmed field_type
    amount_columns = [
        info["mapped_to"]
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "numeric"
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]
    for col in amount_columns:
        # Amount columns may be read as a pandas string dtype from Excel/CSV.
        # Convert to object before assigning float values so pandas does not reject them.
        if pd.api.types.is_string_dtype(df[col].dtype):
            df[col] = df[col].astype(object)

        for idx, value in df[col].items():
            # Skip empty values.
            if pd.isna(value) or str(value).strip() == "":
                continue
            original_value = value
            # If already a number no cleaning needed, convert to float
            if isinstance(value, (int, float)):
                df.at[idx, col] = float(value)
                continue
            cleaned_str = str(value).strip()
            # Check for accounting negative notation e.g. (1,500)
            is_negative = cleaned_str.startswith("(") and cleaned_str.endswith(")")
            cleaned_str = cleaned_str.strip("()")
            cleaned_str = normalize_amount_str(cleaned_str)

            # Try converting to float
            try:
                amount = float(cleaned_str)
                # Apply negative if value was in brackets
                if is_negative:
                    amount = -amount
                df.at[idx, col] = amount
            except ValueError:
                # Could not convert, flag for auditor
                df.at[idx, col] = original_value
                issues.append({
                    "row": int(idx) + 2,
                    "column": col,
                    "row_index": idx,
                    "original_value": str(original_value),
                    "issue": f"'{original_value}' is not a valid number, correct or remove this value",
                    "severity": "high"
                })
    return df

# Function to standardize text column casing 
def standardize_casing(df: pd.DataFrame, mapping: dict, issues: list) -> pd.DataFrame:
    """
    Find all columns with field_type 'title' using confirmed mapping.
    Standardizes all text values to Title Case.
    Skips empty values and numeric-looking values.
    Skips columns mapped to "unknown" since those were not renamed and have no standard meaning yet.
    """
    # Find all columns whose field_type is text using the mapping.
    # Skip "unknown" mapped_to since those columns were left under their original name and have no confirmed field_type
    text_columns = [
        info["mapped_to"]
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "text"
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]
    # Loop through text columns and standardize to title case, skipping empty and numeric values
    for col in text_columns:
        for idx, value in df[col].items():
            # Skip empty values
            if pd.isna(value) or str(value).strip() == "":
                continue
            # Skip if value is already a number
            if isinstance(value, (int, float)):
                continue
            # Convert to title case
            df.at[idx, col] = str(value).strip().title()
    return df

# Function to check text columns for inconsistent boolean/status values
def check_value_consistency(df: pd.DataFrame, mapping: dict, issues: list) -> None:
    """
    Flags columns that mix multiple boolean/status VOCABULARIES for the same logical
    concept — e.g. some rows say 'Yes'/'No' while others say 'Y'/'N' in the same column.
    A column containing both members of a single group (e.g. 'Y' AND 'N' in
    the same {'y', 'n'} group) is NOT an inconsistency — that's just a normal boolean
    column with both true and false rows. The bug this replaces treated "column contains
    more than one value from a group" as mixed, which meant every healthy boolean column
    (anything with at least one true row and one false row) was flagged as an error with
    no way to resolve it. The correct signal is whether the column's values are entirely
    contained within ONE group's vocabulary — if so, it's consistent, regardless of how
    many distinct values from that group appear.
    """
    text_columns = [
        info["mapped_to"].strip()
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "text"
        and info.get("mapped_to", "").strip() not in ("", "unknown")
        and info.get("mapped_to", "").strip() in df.columns
    ]
    for col in text_columns:
        unique_vals = set(
            str(v).strip().lower()
            for v in df[col].dropna()
            if str(v).strip() != ""
        )
        if not unique_vals:
            continue

        # If the column's values fit entirely within a single known vocabulary group,it's consistent, skip it, no matter how many of that group's values appear.
        is_consistent = any(unique_vals.issubset(group) for group in BOOLEAN_VALUE_GROUPS)
        if is_consistent:
            continue

        # Otherwise, check whether the column straddles two or more different
        # vocabularies (e.g. some rows 'Yes'/'No', others 'Y'/'N'), that IS a real. Inconsistency worth flagging.
        touched_groups = [group for group in BOOLEAN_VALUE_GROUPS if unique_vals & group]
        if len(touched_groups) > 1:
            issues.append({
                "row": "N/A",
                "column": col,
                "row_index": "N/A",
                "original_value": str(unique_vals),
                "issue": (
                    f"Mixed formats in '{col}': {sorted(unique_vals)} — this column mixes "
                    f"different boolean/status formats (e.g. 'Yes'/'No' mixed with 'Y'/'N'). "
                    f"Standardise to one format throughout."
                ),
                "severity": "medium"
            })

# Function to detect near-duplicate values within a single text column
def check_near_duplicate_values(df: pd.DataFrame, mapping: dict, issues: list) -> None:
    text_columns = [
        info["mapped_to"].strip()
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "text"
        and info.get("mapped_to", "").strip() not in ("", "unknown")
        and info.get("mapped_to", "").strip() in df.columns
    ]

    SIMILARITY_THRESHOLD = 0.90
    total_rows = len(df)

    for col in text_columns:
        unique_vals = sorted(set(
            str(v).strip()
            for v in df[col].dropna()
            if str(v).strip() != ""
        ))

        if len(unique_vals) < 2 or len(unique_vals) > 100:
            continue

        # Skip identifier-style columns (invoice numbers, transaction IDs etc.)
        # where most values are unique to their row — fuzzy matching on these
        # produces false positives like "Kpmg-2024-1" vs "Kpmg-2024-2"
        if total_rows > 0 and (len(unique_vals) / total_rows) > 0.5:
            continue

        already_flagged = set()
        for i in range(len(unique_vals)):
            for j in range(i + 1, len(unique_vals)):
                val_a, val_b = unique_vals[i], unique_vals[j]
                if val_a in already_flagged or val_b in already_flagged:
                    continue

                # Skip pairs that differ by a trailing number
                base_a = re.sub(r'\d+$', '', val_a).strip()
                base_b = re.sub(r'\d+$', '', val_b).strip()
                if base_a == base_b and val_a != val_b:
                    continue

                # Skip pairs where one value fully contains the other
                if val_a.lower() in val_b.lower() or val_b.lower() in val_a.lower():
                    continue

                similarity = SequenceMatcher(None, val_a.lower(), val_b.lower()).ratio()
                if not (SIMILARITY_THRESHOLD <= similarity < 1.0):
                    continue

                # Character similarity is high — but now check whether the
                # DIFFERING tokens are themselves meaningful distinct words.
                # If they are, the two values are intentionally different entries
                # that just share a common suffix/prefix (e.g. "Meru National
                # Polytechnic" vs "Nyeri National Polytechnic") and should NOT
                # be flagged. Only flag when the differing part looks like a
                # typo, abbreviation, or minor formatting variation.
                tokens_a = set(val_a.lower().split())
                tokens_b = set(val_b.lower().split())
                only_in_a = tokens_a - tokens_b
                only_in_b = tokens_b - tokens_a
                differing = only_in_a | only_in_b
                # If every differing token is a real word (4+ chars) and the
                # two sides each contribute at least one unique token, the
                # values are genuinely different — skip.
                if differing and all(len(t) >= 4 for t in differing) and only_in_a and only_in_b:
                    # Extra check: the unique tokens on each side should not
                    # themselves be near-duplicates of each other (which would
                    # mean it really is a typo like "Nairobi" vs "Nairob").
                    token_pairs_are_typos = any(
                        SequenceMatcher(None, ta, tb).ratio() >= 0.85
                        for ta in only_in_a for tb in only_in_b
                    )
                    if not token_pairs_are_typos:
                        continue

                issues.append({
                    "row": "N/A",
                    "column": col,
                    "row_index": "N/A",
                    "original_value": f"{val_a} / {val_b}",
                    "issue": (
                        f"Possible duplicate values in '{col}': '{val_a}' and '{val_b}' "
                        f"look like they may refer to the same thing but are spelled "
                        f"differently. Consider standardising to one format so they aren't "
                        f"treated as separate entries in totals and breakdowns."
                    ),
                    "severity": "medium"
                })
                already_flagged.add(val_a)
                already_flagged.add(val_b)
    return None

# Function to check if any date column appears out of order relative to another date column in the same row
def check_date_order(df: pd.DataFrame, mapping: dict, issues: list) -> None:
    date_cols = [
        info["mapped_to"].strip()
        for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "date"
        and info.get("mapped_to", "").strip() not in ("", "unknown")
        and info.get("mapped_to", "").strip() in df.columns
    ]
    if len(date_cols) < 2:
        return

    # Build a lookup of which (row, col) pairs had an ambiguous raw value so
    # we can give a more precise message when the order violation is caused by
    # a wrong dayfirst guess rather than a genuine data entry error.
    ambiguous_cells = set()
    for issue in issues:
        if "Ambiguous date" in issue.get("issue", "") and issue.get("row_index") != "N/A":
            ambiguous_cells.add((issue["row_index"], issue["column"]))

    for idx in df.index:
        parsed = []
        for col in date_cols:
            try:
                val_str = str(df.at[idx, col]).strip()
                if val_str == "" or val_str.lower() == "nan":
                    continue
                dayfirst = not (len(val_str) >= 10 and val_str[4] == '-' and val_str[7] == '-')
                dt = pd.to_datetime(val_str, dayfirst=dayfirst, errors='coerce')
                if pd.notna(dt):
                    parsed.append((col, dt))
            except Exception:
                pass

        for i in range(len(parsed) - 1):
            col_a, date_a = parsed[i]
            col_b, date_b = parsed[i + 1]
            diff_days = (date_a - date_b).days
            # Only flag when the gap is large enough to be impossible in practice.
            # A processing date 1-3 days before a transaction date could be a
            # timezone or batch-processing quirk — not worth flagging. But months
            # apart is never legitimate and is almost always a parse error.
            if diff_days <= 7:
                continue

            # Check if either cell was flagged as ambiguous — if so, the order
            # violation is almost certainly a wrong dayfirst parse, not a data
            # entry error. Point the auditor at the specific ambiguous cell.
            ambiguous_col = None
            if (idx, col_a) in ambiguous_cells:
                ambiguous_col = col_a
            elif (idx, col_b) in ambiguous_cells:
                ambiguous_col = col_b

            if ambiguous_col:
                issues.append({
                    "row": int(idx) + 2,
                    "column": ambiguous_col,
                    "row_index": idx,
                    "original_value": str(df.at[idx, ambiguous_col]),
                    "issue": (
                        f"Date order issue caused by ambiguous date in '{ambiguous_col}' "
                        f"({df.at[idx, ambiguous_col]}) — it was parsed as DD/MM/YYYY but "
                        f"the resulting date puts it out of order with '{col_a if ambiguous_col == col_b else col_b}' "
                        f"({df.at[idx, col_a if ambiguous_col == col_b else col_b]}). "
                        f"Correct '{ambiguous_col}' to an unambiguous format (e.g. '7 Jan 2024') "
                        f"to resolve this."
                    ),
                    "severity": "medium"
                })
            else:
                issues.append({
                    "row": int(idx) + 2,
                    "column": col_b,
                    "row_index": idx,
                    "original_value": str(df.at[idx, col_b]),
                    "issue": (
                        f"Date order issue — '{col_a}' ({df.at[idx, col_a]}) and '{col_b}' "
                        f"({df.at[idx, col_b]}) are out of the expected order. One of these two "
                        f"dates may have been entered or parsed incorrectly (check for ambiguous "
                        f"formats like 01/05/2024, which can mean either 5 Jan or 1 May) — "
                        f"check BOTH cells in this row, not just '{col_b}'."
                    ),
                    "severity": "medium"
                })

# Function to handle null values
def handle_nulls(df: pd.DataFrame, mapping: dict, issues: list, fill_rates: dict = None, file_type: str = None) -> pd.DataFrame:
    """
    Flags two types of issues:
    1. Missing values in confirmed mapped columns — with fill-rate-aware logic:
       - Fill rate < 50%: flag ONCE with the fill rate percentage (per-row flags would be noise)
       - Fill rate >= 50%: flag per-row so each missing value gets auditor attention
       - Summary/total rows are excluded from required-field validation for accounting files
    2. Unknown columns, flagged once per column, never per row. Includes fill rate summary if available.
    Does not drop or fill any values, auditor decides.
    file_type: Optional file type (e.g., 'trial_balance', 'general_ledger') for summary row detection.
    """
    if fill_rates is None:
        fill_rates = {}

    # Classify summary rows for accounting files to exclude them from required-field validation
    summary_row_indices = set()
    if file_type in ('trial_balance', 'general_ledger'):
        for idx in df.index:
            row = df.loc[idx]
            if is_summary_row(row, mapping, file_type):
                summary_row_indices.add(idx)

    # Flag unknown columns once, not per row. Use original_col since unknown columns were never renamed
    for original_col, info in mapping.items():
        if isinstance(info, dict) and info.get("mapped_to") == "unknown":
            reviewed_unknown = bool(info.get("reviewed_unknown"))
            rate = fill_rates.get(original_col)
            # Build a clear message for the auditor based on why the column is unknown and its fill rate
            if rate is not None:
                fill_pct = round(rate * 100)
                missing_pct = 100 - fill_pct
                fill_note = f" {missing_pct}% of its values are empty."
            else:
                fill_note = ""
            if reviewed_unknown:
                base_msg = (
                    f"Column '{original_col}' was left as unknown after review."
                    f"{fill_note}"
                    f" No checks were run on this column — review it carefully and confirm whether it contains relevant data."
                )
            else:
                base_msg = (
                    f"Column '{original_col}' could not be identified."
                    f"{fill_note}"
                    f" This column was excluded from all checks — review it carefully to confirm what it represents."
                )
            issues.append({
                "row": "N/A",
                "column": original_col,
                "row_index": "N/A",
                "original_value": "N/A",
                "issue": base_msg,
                "severity": "info" if reviewed_unknown else "medium"
            })

    # Flag missing values in confirmed columns using fill-rate-aware logic:
    # Sparse columns (fill rate < 50%) → one summary flag, no per-row noise
    # Normal columns (fill rate >= 50%) → per-row flags so each gap gets auditor attention
    # Skip unknown mapped_to since those are already handled above
    confirmed_columns = [
        (original_col, info["mapped_to"])
        for original_col, info in mapping.items()
        if isinstance(info, dict)
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]

    for original_col, col in confirmed_columns:
        if col == "_is_duplicate":
            continue
        if col in ("debit", "credit"):
            continue
        rate = fill_rates.get(original_col, 1.0)  # Default to 1.0 (fully filled) if rate unknown
        if rate < 0.5:
            # Sparse column, flag once with fill rate context instead of flooding the report
            fill_pct = round(rate * 100)
            missing_pct = 100 - fill_pct
            issues.append({
                "row": "N/A",
                "column": col,
                "row_index": "N/A",
                "original_value": "N/A",
                "issue": (
                    f"Column '{col}' is {missing_pct}% empty (only {fill_pct}% filled). "
                    f"Confirm whether this is expected, if the data is missing, obtain the complete records before finalising your work"
                ),
                "severity": "medium"
            })
        else:
            # Normal column, flag each missing value individually so the auditor can address them
            # Skip summary rows for accounting files
            for idx, value in df[col].items():
                if idx in summary_row_indices:
                    continue  # Skip required-field validation for summary rows
                if pd.isna(value) or str(value).strip() == "" or value == "":
                    issues.append({
                        "row": int(idx) + 2,
                        "column": col,
                        "row_index": idx,
                        "original_value": "",
                        "issue": f"Missing value in '{col}', this field should not be empty. Check the source data and fill in the correct value.",
                        "severity": "medium"
                    })

    return df
    
# Function to detect and flag duplicate rows
def handle_duplicates(df: pd.DataFrame, mapping: dict, issues: list) -> pd.DataFrame:
    """
    Detect two issues:
    1. Exact duplicates, all column values identical. Flags and marks for removal.
    2. Suspicious duplicates, same date + amount + vendor but different ID. Flagged for auditor review.
    Does not remove any rows, auditor decides.
    """
    # Initialize marker column to avoid KeyError in suspicious check if no exact duplicates exist
    # Drop any pre-existing _is_duplicate column from the raw data before adding our own marker
    if "_is_duplicate" in df.columns:
        df = df.drop(columns=["_is_duplicate"])
    df["_is_duplicate"] = df.duplicated(keep="first")

    # Find all rows that are completely identical to another row
    exact_duplicates = df[df.duplicated(keep=False)]
    for idx in exact_duplicates.index:
        issues.append({
            "row": int(idx) + 2,
            "column": "all columns",
            "row_index": idx,
            "original_value": str(df.loc[idx].to_dict()),
            "issue": "This row is an exact duplicate of another row, check whether it was entered twice and remove the extra copy.",
            "severity": "high"
        })

    # Find all date and numeric columns using the mapping for suspicious duplicate check
    # Skip "unknown" mapped_to since those columns were left under their original name
    date_cols = [
        info["mapped_to"] for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "date"
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]
    amount_cols = [
        info["mapped_to"] for info in mapping.values()
        if isinstance(info, dict) and info.get("field_type") == "numeric"
        and info.get("mapped_to") != "unknown"
        and info.get("mapped_to") in df.columns
    ]
    # Combine date and numeric columns for suspicious duplicate check
    check_cols = date_cols + amount_cols
    # Only check if we have at least one date and one numeric column
    if date_cols and amount_cols:
        suspicious = df[
            df.duplicated(subset=check_cols, keep=False)
            # Exclude already flagged exact duplicates
            & ~df["_is_duplicate"]
        ]
        # Flag suspicious duplicates for auditor review
        for idx in suspicious.index:
            issues.append({
                "row": int(idx) + 2,
                "column": str(check_cols),
                "row_index": idx,
                "original_value": str(df.loc[idx][check_cols].to_dict()),
                "issue": "Same date and amount as another row, this may be a duplicate payment or entry. Verify before you proceed to analysis.",
                "severity": "medium"
            })
    return df

# Function to build the final validation report
def build_validation_report(df: pd.DataFrame, original_df: pd.DataFrame, issues: list) -> dict:
    """
    Build a summary validation report from all issues found during cleaning.
    Shows total rows, clean rows, flagged rows and a breakdown of issues by type and severity.
    """
    total_rows = len(original_df)
    flagged_rows = len(set(
        issue["row_index"]
        for issue in issues
        if "row_index" in issue and issue.get("severity") != "info" and issue["row_index"] != "N/A"
    ))
    clean_rows = total_rows - flagged_rows

    # Count issues by severity
    high_issues = [i for i in issues if i.get("severity") == "high"]
    medium_issues = [i for i in issues if i.get("severity") == "medium"]
    info_issues = [i for i in issues if i.get("severity") == "info"]
    # Build report dictionary
    return {
        "total_rows": total_rows,
        "clean_rows": clean_rows,
        "flagged_rows": flagged_rows,
        "total_issues": len(issues),
        "high_issues": len(high_issues),
        "medium_issues": len(medium_issues),
        "info_issues": len(info_issues),
        "issues": issues
    }