import pandas as pd
import re
from typing import Tuple, Dict, Optional, List

# Generic structural keywords (low weight)
GENERIC_KEYWORDS = {
    'name', 'description', 'title', 'label', 'type', 'category', 'class',
    'amount', 'total', 'sum', 'date', 'period', 'year', 'month',
    'reference', 'ref', 'id', 'quantity', 'qty', 'unit', 'price'
}

# Accounting-specific keywords (higher weight)
ACCOUNTING_KEYWORDS = {
    'account', 'code', 'number', 'no', 'acct', 'gl', 'ledger',
    'debit', 'credit', 'dr', 'cr',
    'opening', 'closing', 'current', 'movement',
    'balance', 'salary', 'wages', 'tax', 'vat',
    'vendor', 'customer', 'client', 'supplier',
    'invoice', 'receipt', 'payment',
    'asset', 'liability', 'equity', 'revenue', 'expense'
}

# Accounting combinations (strong indicators)
ACCOUNTING_COMBINATIONS = [
    ('debit', 'credit'),
    ('opening', 'closing'),
    ('account', 'balance'),
    ('gl', 'account'),
    ('trial', 'balance'),
    ('general', 'ledger'),
]

def _is_generic_term(text: str) -> bool:
    """Check if text contains generic structural keywords."""
    if not text or not isinstance(text, str):
        return False
    text_lower = text.lower().strip()
    words = re.findall(r'\b\w+\b', text_lower)
    return any(word in GENERIC_KEYWORDS for word in words)

def _is_accounting_term(text: str) -> bool:
    """Check if text contains accounting-related keywords."""
    if not text or not isinstance(text, str):
        return False
    text_lower = text.lower().strip()
    words = re.findall(r'\b\w+\b', text_lower)
    return any(word in ACCOUNTING_KEYWORDS for word in words)

def _detect_accounting_combinations(row_data: List) -> float:
    """
    Detect accounting keyword combinations in a row.
    Returns a normalized score (0-1) based on combinations present.
    """
    if not row_data:
        return 0.0
    
    row_text = ' '.join(str(cell).lower().strip() for cell in row_data if pd.notna(cell) and str(cell).strip())
    words = set(re.findall(r'\b\w+\b', row_text))
    
    combination_score = 0.0
    for combo in ACCOUNTING_COMBINATIONS:
        if all(word in words for word in combo):
            # Each combination contributes, but normalize by total possible
            combination_score += 1.0
    
    # Normalize to 0-1 range
    max_combinations = len(ACCOUNTING_COMBINATIONS)
    if max_combinations > 0:
        combination_score = min(combination_score / max_combinations, 1.0)
    
    return combination_score

def _calculate_row_score(row_data: List, row_index: int, df_sample: pd.DataFrame, file_type: Optional[str] = None) -> float:
    """
    Calculate a score for how likely a row is to be a table header.
    Higher score = more likely to be a header.
    
    Scoring modes:
    - file_type=None: Generic structural detection (no accounting keywords)
    - file_type in ["trial_balance", "general_ledger"]: Accounting-aware detection
    
    Score components for generic mode:
    1. Populated cell ratio (0-1) - 50%
    2. Data density in subsequent rows (0-1) - 30%
    3. Cell uniqueness (0-1) - 20%
    
    Score components for accounting mode:
    1. Accounting combinations (0-1) - 40%
    2. Accounting term matches (0-1) - 20%
    3. Populated cell ratio (0-1) - 30%
    4. Data density in subsequent rows (0-1) - 10%
    """
    if not row_data:
        return 0.0
    
    # Common components
    non_empty_count = sum(1 for cell in row_data if pd.notna(cell) and str(cell).strip() != '')
    total_cells = len(row_data)
    populated_ratio = non_empty_count / total_cells if total_cells > 0 else 0.0
    
    # Data density in subsequent rows
    data_density_score = 0.0
    try:
        subsequent_rows_count = min(5, len(df_sample) - row_index - 1)
        if subsequent_rows_count > 0:
            dense_rows = 0
            for i in range(row_index + 1, min(row_index + 1 + subsequent_rows_count, len(df_sample))):
                if i < len(df_sample):
                    row = df_sample.iloc[i]
                    row_non_empty = sum(1 for cell in row if pd.notna(cell) and str(cell).strip() != '')
                    if row_non_empty / len(row) >= 0.5:
                        dense_rows += 1
            data_density_score = dense_rows / subsequent_rows_count
    except Exception:
        data_density_score = 0.0
    
    # Cell uniqueness
    unique_values = len(set(str(cell).lower().strip() for cell in row_data if pd.notna(cell) and str(cell).strip() != ''))
    uniqueness_ratio = unique_values / non_empty_count if non_empty_count > 0 else 0.0
    
    # Mode-specific scoring
    if file_type in ["trial_balance", "general_ledger"]:
        # Accounting-aware mode
        accounting_combinations = _detect_accounting_combinations(row_data)
        accounting_matches = sum(1 for cell in row_data if _is_accounting_term(str(cell)))
        accounting_ratio = accounting_matches / total_cells if total_cells > 0 else 0.0
        
        score = (
            0.40 * accounting_combinations +
            0.20 * accounting_ratio +
            0.30 * populated_ratio +
            0.10 * data_density_score
        )
    else:
        # Generic structural mode (no accounting keywords)
        score = (
            0.50 * populated_ratio +
            0.30 * data_density_score +
            0.20 * uniqueness_ratio
        )
    
    return score

def _extract_metadata_from_rows(df: pd.DataFrame, header_row_index: int) -> Dict[str, str]:
    """
    Extract report metadata from rows above the detected header.
    Returns dict with company, report_type, period, currency, etc.
    """
    metadata = {}
    
    if header_row_index <= 0:
        return metadata
    
    # Look at rows above the header for metadata patterns
    for i in range(min(header_row_index, 10)):  # Check up to 10 rows above header
        if i >= len(df):
            break
        row = df.iloc[i]
        row_text = ' '.join(str(cell).strip() for cell in row if pd.notna(cell) and str(cell).strip())
        
        if not row_text:
            continue
        
        # Company name patterns (usually first row, all caps or title case)
        if i == 0 and len(row_text) > 3:
            if row_text.isupper() or (row_text[0].isupper() and ' ' in row_text):
                metadata['company'] = row_text
        
        # Report type patterns
        report_keywords = ['trial balance', 'general ledger', 'balance sheet', 'income statement', 
                          'profit and loss', 'cash flow', 'aged', 'payroll', 'fixed assets', 'inventory']
        row_lower = row_text.lower()
        for keyword in report_keywords:
            if keyword in row_lower:
                metadata['report_type'] = row_text
                break
        
        # Period patterns
        period_patterns = [
            r'for\s+(the\s+)?(year|month|quarter|period)\s+(ended|ending)?\s*(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}|q[1-4]\s+\d{4})',
            r'(fy|financial\s+year)\s*:?\s*(\d{4})',
            r'(\d{4})\s*-\s*(\d{4})',
        ]
        for pattern in period_patterns:
            match = re.search(pattern, row_lower)
            if match:
                metadata['period'] = row_text
                break
        
        # Currency patterns
        currency_patterns = [r'\b(KSH|kes|gbp|eur|zar|naira|ghs|ugx|tzs|rwf|bif|mwk|zmw|szl|nad|bwp|lsl|zar)\b', r'\(\$|£|€|ksh|rtgs|naira|₦|gh₵|ugx|tzs|rwf|bif|mwk|zmw|szl|nad|bwp|lsl|r\)']
        for pattern in currency_patterns:
            match = re.search(pattern, row_lower)
            if match:
                metadata['currency'] = match.group(1) if match.lastindex else match.group(0)
                break
    
    return metadata

def detect_excel_header(file_path: str, sheet_name: Optional[str] = None, file_type: Optional[str] = None) -> Tuple[int, pd.DataFrame, Dict[str, str]]:
    """
    Detect the actual table header row in an Excel file and extract metadata.
    
    Args:
        file_path: Path to the Excel file
        sheet_name: Optional sheet name (if None, uses first sheet)
        file_type: Optional file type context ("trial_balance", "general_ledger", or None for generic)
    
    Returns:
        Tuple of (header_row_index, canonical_dataframe, metadata_dict)
        - header_row_index: 0-based index of the detected header row
        - canonical_dataframe: DataFrame with header row as column names
        - metadata_dict: Extracted report metadata (company, period, etc.)
    """
    try:
        # Read the Excel file to examine rows
        if sheet_name:
            excel_file = pd.ExcelFile(file_path)
            if sheet_name not in excel_file.sheet_names:
                sheet_name = excel_file.sheet_names[0]
            df_raw = pd.read_excel(file_path, sheet_name=sheet_name, header=None, dtype=str)
        else:
            df_raw = pd.read_excel(file_path, header=None, dtype=str)
    except Exception as e:
        # Fallback to default behavior if detection fails
        df_raw = pd.read_excel(file_path, dtype=str)
        return 0, df_raw, {}
    
    if df_raw.empty:
        return 0, df_raw, {}
    
    # Clean the raw data for detection
    df_clean = df_raw.map(lambda x: x.strip() if isinstance(x, str) else x)
    
    # Scan the first 25 rows to find the best header candidate
    max_scan_rows = min(25, len(df_clean))
    best_score = 0.0
    best_header_row = 0
    
    for row_idx in range(max_scan_rows):
        row_data = df_clean.iloc[row_idx].tolist()
        score = _calculate_row_score(row_data, row_idx, df_clean, file_type)
        
        # Boost score for rows that have typical header characteristics
        # Headers often have more text than numbers in the first pass
        text_ratio = sum(1 for cell in row_data if isinstance(cell, str) and cell.strip() and not cell.strip().replace('.', '').replace(',', '').replace('-', '').isdigit())
        if text_ratio / len(row_data) > 0.6:
            score *= 1.2  # Boost rows that are mostly text
        
        if score > best_score:
            best_score = score
            best_header_row = row_idx
    
    # Extract metadata from rows above the detected header
    metadata = _extract_metadata_from_rows(df_clean, best_header_row)
    
    # Re-read the file with the detected header row
    try:
        if sheet_name:
            canonical_df = pd.read_excel(file_path, sheet_name=sheet_name, header=best_header_row, dtype=str)
        else:
            canonical_df = pd.read_excel(file_path, header=best_header_row, dtype=str)
    except Exception:
        # Fallback to original if re-read fails
        canonical_df = df_raw
    
    # Clean the canonical DataFrame
    if canonical_df is not None:
        canonical_df = canonical_df.map(lambda x: x.strip() if isinstance(x, str) else x)
        canonical_df = canonical_df.dropna(axis=1, how='all')
        canonical_df = canonical_df.loc[:, ~(canonical_df == '').all()]
    
    return best_header_row, canonical_df, metadata

def detect_csv_header(file_path: str, file_type: Optional[str] = None) -> Tuple[int, pd.DataFrame, Dict[str, str]]:
    """
    Detect the table header in a CSV file (simpler version for CSV).
    Most CSVs have headers on row 0, but we check for obvious metadata blocks.
    
    Args:
        file_path: Path to the CSV file
        file_type: Optional file type context (currently unused for CSV, kept for consistency)
    
    Returns:
        Tuple of (header_row_index, canonical_dataframe, metadata_dict)
    """
    try:
        # Read CSV without header to examine rows
        df_raw = pd.read_csv(file_path, header=None, dtype=str, nrows=10)
    except Exception:
        # Fallback to default behavior
        df_raw = pd.read_csv(file_path, dtype=str)
        return 0, df_raw, {}
    
    if df_raw.empty:
        return 0, df_raw, {}
    
    # For CSV, we're more conservative - only detect non-standard headers if obvious
    # Check if first row looks like metadata (single populated cell, all caps, etc.)
    first_row = df_raw.iloc[0]
    non_empty_count = sum(1 for cell in first_row if pd.notna(cell) and str(cell).strip() != '')
    
    if non_empty_count == 1 and isinstance(first_row.iloc[0], str):
        first_cell = first_row.iloc[0].strip()
        if first_cell.isupper() and len(first_cell) > 5:
            # Likely a title/metadata row, skip to next row
            header_row = 1
            metadata = {'company': first_cell}
        else:
            header_row = 0
            metadata = {}
    else:
        header_row = 0
        metadata = {}
    
    # Re-read with detected header
    try:
        canonical_df = pd.read_csv(file_path, header=header_row, dtype=str)
    except Exception:
        canonical_df = pd.read_csv(file_path, dtype=str)
    
    # Clean the canonical DataFrame
    if canonical_df is not None:
        canonical_df = canonical_df.map(lambda x: x.strip() if isinstance(x, str) else x)
        canonical_df = canonical_df.dropna(axis=1, how='all')
        canonical_df = canonical_df.loc[:, ~(canonical_df == '').all()]
    
    return header_row, canonical_df, metadata
