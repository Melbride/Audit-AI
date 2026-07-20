# Core FastAPI imports for building the API, handling file uploads, and raising errors
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional, Literal

# Auth-related imports for password hashing and JWT tokens
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

# File-reading libraries for PDF and DOCX extraction
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import pdfplumber
from docx import Document

# General-purpose libraries used throughout the file
import pandas as pd
import json
import uuid
import os
import sys
import re
import shutil
import secrets
import hashlib
import io
from dotenv import load_dotenv

# AI detection helpers, used to identify columns and suggest file types
from detector import detect_columns_with_llm, build_detection_result, suggest_file_type

# Database helper functions for mappings, uploads, corrections, snapshots, and acknowledgments
from database import (
    init_db, get_db, save_mapping, get_mapping, save_upload, get_uploads,
    save_cleaning_acknowledgment, get_acknowledged_issue_ids,
    save_cleaning_corrections, get_cleaning_corrections,
    save_fingerprint, get_fingerprint,
    save_cleaning_snapshot, get_cleaning_snapshot,
    save_cleaned_registry, get_cleaned_files_for_client, get_cleaned_file_data,
)

# Cleaning engine, Excel export, and Excel diff logic
from cleaner import clean_dataframe
from excel_export import build_cleaning_workbook
from excel_diff import diff_uploaded_against_snapshot
from dateutil import parser as dateutil_parser
from analyzer import calculate_breakdowns, calculate_monthly_trend, detect_anomalies, generate_ai_insights, generate_financial_ai_insights, determine_analysis_scope

from engines.accounting_validation.trial_balance_validator import validate_trial_balance
from engines.account_mapping.account_classifier import build_account_mapping_result
from database import save_account_mapping, get_account_mapping
from engines.financial_reporting.statement_generator import generate_financial_statements
from engines.financial_reporting.financial_ratios import calculate_financial_ratios
from engines.financial_reporting.financial_analytics import calculate_financial_analytics
from engines.financial_reporting.comparative_analytics import generate_comparative_analytics
# Load environment variables from the .env file
load_dotenv()

# Resolve the backend directory and add it to the Python path so internal imports work correctly
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

# Create the FastAPI app instance
app = FastAPI(title="AuditAI API Running!", debug=True)

# Allow requests from any origin, method, and header (open CORS policy)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the database tables when the app starts up
@app.on_event("startup")
async def startup_event():
    init_db()

# Auth configuration: secret key, hashing algorithm, token lifetime, and password hashing context
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# Folder where uploaded files are stored, created automatically if missing
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# File extensions allowed for upload through the AI pipeline
ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls", "pdf", "docx"}

# Internal columns the system adds for its own bookkeeping that should never be treated as real data and should never reach column detection or mapping
RESERVED_INTERNAL_COLUMNS = {"_row_id", "_is_duplicate"}

# Hash a plain text password for storage
def hash_password(password: str):
    return pwd_context.hash(password)

# Check a plain text password against a stored hash
def verify_password(plain: str, hashed: str):
    return pwd_context.verify(plain, hashed)

# Create a signed JWT access token that expires after ACCESS_TOKEN_EXPIRE_HOURS
def create_token(data: dict):
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    data.update({"exp": expire})
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

# Get the lowercase file extension from a filename
def get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

# Extract tables (or plain text if no tables found) from a PDF file into a dataframe
def extract_pdf(file_path: str):
    tables = []
    full_text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_tables = page.extract_tables()
            for table in page_tables:
                if table:
                    headers = table[0]
                    rows = table[1:]
                    df = pd.DataFrame(rows, columns=headers)
                    tables.append(df)
            full_text += page.extract_text() or ""
    if tables:
        return pd.concat(tables, ignore_index=True), "table"
    lines = [line.strip() for line in full_text.splitlines() if line.strip()]
    if lines:
        return pd.DataFrame({"raw_text": lines}), "text"
    return None, None

# Extract tables (or plain text if no tables found) from a DOCX file into a dataframe
def extract_docx(file_path: str):
    doc = Document(file_path)
    tables = []
    for table in doc.tables:
        headers = [cell.text.strip() for cell in table.rows[0].cells]
        rows = []
        for row in table.rows[1:]:
            rows.append([cell.text.strip() for cell in row.cells])
        df = pd.DataFrame(rows, columns=headers)
        tables.append(df)
    if tables:
        return pd.concat(tables, ignore_index=True), "table"
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    if lines:
        return pd.DataFrame({"raw_text": lines}), "text"
    return None, None

# Read a file from disk into a dataframe based on its extension, cleaning up
# empty columns, whitespace, and reserved internal columns along the way
def read_file_to_df(save_path: str, ext: str):
    if ext == "csv":
        df = pd.read_csv(save_path, dtype=str)
    elif ext in ["xlsx", "xls"]:
        df = pd.read_excel(save_path, dtype=str)
    elif ext == "pdf":
        df, _ = extract_pdf(save_path)
        return df
    elif ext == "docx":
        df, _ = extract_docx(save_path)
        return df
    else:
        return None
    if df is not None:
        df = df.dropna(axis=1, how='all')
        df = df.loc[:, ~(df == '').all()]
        df = df.map(lambda x: x.strip() if isinstance(x, str) else x)
        # Drop any reserved internal column (e.g. _row_id from a previously
        # exported workbook re-uploaded by mistake) before it's ever treated as real data
        df = df.drop(columns=[c for c in df.columns if c in RESERVED_INTERNAL_COLUMNS], errors='ignore')
    return df

# Calculate the fraction of non-empty values in each column of a dataframe
def calculate_fill_rates(df: pd.DataFrame) -> dict:
    fill_rates = {}
    total = len(df)
    for col in df.columns:
        filled = df[col].replace("", float("nan")).dropna().count()
        fill_rates[col] = round(filled / total, 2) if total > 0 else 0.0
    return fill_rates

# Check that each column's declared field_type actually matches its real data. Prevents usersfrom mistakenly marking a text column as numeric/date
# Check that each column's declared field_type actually matches its real data. Prevents users from mistakenly marking a text column as numeric/date

def validate_field_types_against_data(df: pd.DataFrame, mapping: dict) -> list:
    problems = []
    def try_parse_date(val_str: str) -> bool:
        # Strip ordinal suffixes: 1st, 2nd, 3rd, 22nd, 28th ...
        cleaned = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', val_str, flags=re.IGNORECASE).strip()
        # Bare numbers are not dates (e.g. '999', '42')
        if re.fullmatch(r'\d+', cleaned):
            return False
        # dateutil handles any date format without a hardcoded list
        try:
            dateutil_parser.parse(cleaned, default=pd.Timestamp('2000-01-01'))
            return True
        except (ValueError, OverflowError):
            return False

    for original_col, info in mapping.items():
        if not isinstance(info, dict):
            continue
        field_type = info.get("field_type")
        mapped_to = info.get("mapped_to")
        if original_col not in df.columns or field_type in (None, "unknown") or mapped_to in (None, "unknown"):
            continue
        values = df[original_col].dropna().replace("", None).dropna()
        if len(values) == 0:
            continue

        if field_type == "numeric":
            def strip_for_check(v):
                v = str(v).strip()
                # If it's already a plain number, no stripping needed
                try:
                    float(v)
                    return v
                except ValueError:
                    pass
                is_negative = v.startswith("(") and v.endswith(")")
                v = v.strip("()%")
                v = re.sub(r"[^\d.-]", "", v)
                return ("-" + v) if is_negative and not v.startswith("-") else v

            cleaned_values = values.apply(strip_for_check)
            convertible = pd.to_numeric(cleaned_values, errors="coerce")
            failure_rate = convertible.isna().mean()
            if failure_rate > 0.3:
                problems.append(
                    f"'{original_col}' is marked as Number but most of its values "
                    f"aren't numbers (e.g. '{values.iloc[0]}'). Please check the field type."
                )

        elif field_type == "date":
            failures = sum(1 for val in values if not try_parse_date(str(val).strip()))
            failure_rate = failures / len(values)
            if failure_rate > 0.3:
                problems.append(
                    f"'{original_col}' is marked as Date but most of its values "
                    f"don't look like dates (e.g. '{values.iloc[0]}'). Please check the field type."
                )
    return problems

# Compute a stable fingerprint for a set of column names, used to detect when a client uploads a file with the same schema as before
def compute_schema_fingerprint(columns: list) -> str:
    sorted_cols = sorted([col.lower().strip() for col in columns])
    fingerprint = hashlib.md5(json.dumps(sorted_cols).encode()).hexdigest()
    return fingerprint

# Find an uploaded file on disk by its file_id, trying each allowed extension
def locate_uploaded_file(file_id: str):
    for extension in ALLOWED_EXTENSIONS:
        path = os.path.join(UPLOAD_DIR, f"{file_id}.{extension}")
        if os.path.exists(path):
            return path, extension
    return None, None

# Strip the "[UNRESOLVED]" marker from a header label to get its real underlying name
def normalize_header_label(value) -> str:
    label = str(value or "").strip()
    if label.startswith("[UNRESOLVED]"):
        label = label.replace("[UNRESOLVED]", "", 1).strip()
    return label

# Build a stable hash that uniquely identifies one issue, used to track acknowledgments and avoid duplicate issue records
def issue_fingerprint(file_id: str, client_id: str, file_type: str, issue: dict) -> str:
    raw = "|".join([
        str(file_id),
        str(client_id),
        str(file_type),
        str(issue.get("row_index", "")),
        str(issue.get("column", "")),
        str(issue.get("original_value", "")),
        str(issue.get("issue", "")),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

# Attach a stable issue_id and a default "pending" decision to every issue in a report
def enrich_issues_with_ids(report: dict, file_id: str, client_id: str, file_type: str) -> dict:
    for issue in report.get("issues", []):
        issue["issue_id"] = issue_fingerprint(file_id, client_id, file_type, issue)
        issue["decision"] = "pending"
    return report

# Recalculate all summary counts on a report (flagged rows, clean rows, and
# issue counts by severity) based on whatever issues are currently in the list
def rebuild_report_counts(report: dict) -> dict:
    issues = report.get("issues", [])
    total_rows = report.get("total_rows", 0)

    row_issues = [
        i for i in issues
        if i.get("row_index") not in ("N/A", None)
    ]

    column_issues = [
        i for i in issues
        if i.get("row_index") in ("N/A", None)
    ]
    flagged_rows = len(set(
    i.get("row_index") for i in row_issues
    if i.get("row_index") not in (None, "N/A")
    ))
    report["flagged_rows"] = flagged_rows
    report["clean_rows"] = total_rows - flagged_rows
    report["row_issues"] = len(row_issues)
    report["column_issues"] = len(column_issues)
    report["total_issues"] = len(issues)
    report["high_issues"] = len([i for i in issues if i.get("severity") == "high"])
    report["medium_issues"] = len([i for i in issues if i.get("severity") == "medium"])
    report["info_issues"] = len([i for i in issues if i.get("severity") == "info"])
    return report

# Remove any issue the auditor has already acknowledged, then recompute the report counts
def filter_acknowledged_issues(report: dict, file_id: str, client_id: str, file_type: str) -> dict:
    acknowledged = get_acknowledged_issue_ids(file_id, client_id, file_type)
    if not acknowledged:
        return report
    report["issues"] = [
        issue for issue in report.get("issues", [])
        if issue.get("issue_id") not in acknowledged
    ]
    return rebuild_report_counts(report)

# Apply every saved correction (cell edits, row deletions, column deletions) to
# the source dataframe before cleaning runs, so corrections persist across cleaning cycles
def apply_saved_corrections(df: pd.DataFrame, mapping: dict, corrections: list) -> pd.DataFrame:
    if not corrections:
        return df
    # Build a lookup from standard mapped column names back to their original column names
    standard_to_original = {
        info.get("mapped_to"): original_col
        for original_col, info in mapping.items()
        if isinstance(info, dict) and info.get("mapped_to") not in ("", "unknown", None)
    }
    # Separate the corrections list into rows to drop, columns to drop, and plain value edits
    rows_to_drop = []
    columns_to_drop = []
    value_corrections = []
    for correction in corrections:
        col = correction.get("column_name", correction.get("column"))
        if col == "_row_deleted":
            rows_to_drop.append(int(correction["row_index"]))
        elif col and str(col).startswith("_column_deleted:"):
            original_col_name = col.split(":", 1)[1]
            columns_to_drop.append(original_col_name)
        else:
            value_corrections.append(correction)

    # Apply row deletions
    if rows_to_drop:
        df = df.drop(index=[r for r in rows_to_drop if r in df.index])

    # Apply column deletions, resolving standard names back to original column names where needed
    if columns_to_drop:
        resolved_columns_to_drop = []
        for col_name in columns_to_drop:
            if col_name in df.columns:
                resolved_columns_to_drop.append(col_name)
            else:
                original = standard_to_original.get(col_name)
                if original and original in df.columns:
                    resolved_columns_to_drop.append(original)
        df = df.drop(columns=resolved_columns_to_drop)

    # Apply plain cell value corrections
    for correction in value_corrections:
        row_index = int(correction["row_index"])
        issue_col = correction.get("column_name", correction.get("column"))
        source_col = standard_to_original.get(issue_col, issue_col)
        if source_col in df.columns and row_index in df.index:
            df.at[row_index, source_col] = correction["corrected_value"]
    return df

# Adapt a saved mapping to match whatever column names are present in a newly
# uploaded file, in case columns were renamed since the mapping was last saved
def adapt_mapping_to_uploaded_headers(mapping: dict, columns: list) -> dict:
    adapted = {}
    column_set = set(columns)
    for original_col, info in mapping.items():
        if not isinstance(info, dict):
            adapted[original_col] = info
            continue
        mapped_to = info.get("mapped_to")
        if original_col in column_set:
            adapted[original_col] = info
        elif mapped_to and mapped_to != "unknown" and mapped_to in column_set:
            adapted[mapped_to] = {**info, "mapped_to": mapped_to}
        else:
            adapted[original_col] = info
    return adapted

# Run a full cleaning cycle for a file: read it from disk, apply saved corrections,
# run the cleaning engine, filter out acknowledged issues, and compute final counts
def run_cleaning_cycle(file_id: str, client_id: str, file_type: str, mapping: dict):
    save_path, file_ext = locate_uploaded_file(file_id)
    if not save_path:
        raise HTTPException(status_code=404, detail="File not found. Please upload the file first.")
    try:
        df = read_file_to_df(save_path, file_ext)
        if df is None:
            raise HTTPException(status_code=400, detail="Could not read file.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")

    corrections = get_cleaning_corrections(file_id, client_id, file_type)
    df = apply_saved_corrections(df, mapping, corrections)
    fill_rates = calculate_fill_rates(df)
    try:
        cleaned_df, report = clean_dataframe(df, mapping, fill_rates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {str(e)}")
    report = enrich_issues_with_ids(report, file_id, client_id, file_type)
    report = filter_acknowledged_issues(report, file_id, client_id, file_type)
    report = rebuild_report_counts(report)
    # can_proceed is only true once every issue (high, medium, and info severity) has been resolved
    report["can_proceed"] = report["total_issues"] == 0
    # Save the current cleaned state so the auditor can retun to it and also download
    save_cleaned_registry(file_id, client_id, file_type, cleaned_df, report)
    return cleaned_df, report

def build_financial_analysis_context(cleaned_df: pd.DataFrame, mapping: dict, client_id: str, file_type: str) -> dict:
    breakdowns = calculate_breakdowns(cleaned_df, mapping)
    monthly_trend = calculate_monthly_trend(cleaned_df, mapping)
    anomalies = detect_anomalies(monthly_trend)
    generic_scope = determine_analysis_scope(breakdowns, monthly_trend)

    context = {
        "analysis_scope": generic_scope,
        "analysis_basis": "generic_columns",
        "breakdowns": breakdowns,
        "monthly_trend": monthly_trend,
        "anomalies": anomalies,
        "financial_statements": None,
        "financial_ratios": None,
        "financial_analytics": None,
        "comparative_analytics": None,
        "generic_analysis": {
            "analysis_scope": generic_scope,
            "breakdowns": breakdowns,
            "monthly_trend": monthly_trend,
            "anomalies": anomalies,
        },
    }

    account_mapping = get_account_mapping(client_id, file_type)
    if not account_mapping:
        return context

    statements = generate_financial_statements(cleaned_df, mapping, account_mapping)
    if not statements.get("applicable"):
        return context

    ratios = calculate_financial_ratios(
        statements["income_statement"],
        statements["balance_sheet"],
    )
    statements["financial_ratios"] = ratios

    financial_analytics = calculate_financial_analytics(statements, ratios)
    comparative_analytics = generate_comparative_analytics(
        cleaned_df,
        mapping,
        account_mapping,
        grain="year",
    )
    context.update({
        "analysis_scope": "financial_statements",
        "analysis_basis": "classified_accounts",
        "financial_statements": statements,
        "financial_ratios": ratios,
        "financial_analytics": financial_analytics,
        "comparative_analytics": comparative_analytics,
    })
    return context

# Pydantic model for a client record
class Client(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    industry: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = "Active"
    kra_pin: Literal[True, False] = False

# Pydantic model for creating a user
class User(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    role: Literal["Admin", "Accountant", "Auditor", "Senior Auditor", "Assistant Manager", "Audit Manager", "Engagement Partner", "Quality Reviewer"]
    assigned_client_id: Optional[int] = None
    status: Optional[str] = "Active"

# Pydantic model for updating an existing user (no password field)
class UserUpdate(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    role: Literal["Admin", "Accountant", "Auditor", "Senior Auditor", "Assistant Manager", "Audit Manager", "Engagement Partner", "Quality Reviewer"]
    assigned_client_id: Optional[int] = None
    status: Optional[str] = "Active"

# Pydantic model for a login request
class LoginRequest(BaseModel):
    email: str
    password: str

# Pydantic model for requesting a password reset token
class PasswordResetRequest(BaseModel):
    email: str

# Pydantic model for confirming a password reset with a token and new password
class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

# Pydantic model for a single column mapping record
class ColumnMapping(BaseModel):
    client_id: str
    file_type: Optional[str] = "general"
    original_column: str
    mapped_to: str
    confirmed_by: Optional[str] = None

# Pydantic model for an audit engagement
class Engagement(BaseModel):
    client_id: int
    engagement_name: str
    financial_year: str
    status: Optional[str] = "Planning"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

# Pydantic model for assigning a user to an engagement team
class EngagementTeam(BaseModel):
    engagement_id: int
    user_id: int
    role: str

# Pydantic model for an audit section within an engagement
class AuditSection(BaseModel):
    engagement_id: int
    section_name: str
    status: Optional[str] = "Pending"
    assigned_to: Optional[int] = None

# Pydantic model for a submission of work for review
class Submission(BaseModel):
    engagement_id: int
    section_id: int
    submitted_by: int
    status: Optional[str] = "Draft"
    current_stage: Optional[str] = "Accountant"
    notes: Optional[str] = None

# Pydantic model for updating a submission's status and workflow stage
class SubmissionStatus(BaseModel):
    status: Literal["Draft", "Submitted", "Under Review", "Changes Requested", "Approved", "Cancelled"]
    current_stage: Optional[str] = None
    notes: Optional[str] = None
    updated_by: Optional[int] = None

# Pydantic model for an in-app notification
class Notification(BaseModel):
    user_id: int
    message: str
    type: Optional[str] = "engagement_alert"

# Simple health check endpoint
@app.get("/")
def root():
    return {"message": "Audit AI API is running"}

# Upload a file for the AI pipeline (CSV, Excel, PDF, or DOCX), extract its
# contents into a dataframe, and return a preview along with column info
@app.post("/upload")
async def upload_file_ai(
    file: UploadFile = File(...),
    client_id: str = Form(...)
):
    ext = get_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"File type .{ext} not supported. Upload Excel, CSV, PDF or DOCX file only.")
    MAX_FILE_SIZE = 50
    file_bytes = await file.read()
    file_size_mb = len(file_bytes) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File size exceeds the maximum limit of {MAX_FILE_SIZE} MB. Uploaded file size: {file_size_mb:.2f} MB.")
    file.file.seek(0)
    file_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, f"{file_id}.{ext}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Handle PDF uploads separately since extraction works differently
    if ext == "pdf":
        df, source = extract_pdf(save_path)
        if df is None:
            raise HTTPException(status_code=400, detail="Could not extract any content from PDF.")
        save_upload(file_id, client_id, file.filename, ext, len(df))
        fill_rates = calculate_fill_rates(df)
        return {"file_id": file_id, "client_id": client_id, "filename": file.filename, "source": source,
                "rows": len(df), "columns": list(df.columns), "fill_rates": fill_rates,
                "preview": df.head(5).fillna("").to_dict(orient="records"), "message": f"PDF uploaded — extracted via {source}"}

    # Handle DOCX uploads separately since extraction works differently
    if ext == "docx":
        df, source = extract_docx(save_path)
        if df is None:
            raise HTTPException(status_code=400, detail="Could not extract any content from DOCX.")
        save_upload(file_id, client_id, file.filename, ext, len(df))
        fill_rates = calculate_fill_rates(df)
        return {"file_id": file_id, "client_id": client_id, "filename": file.filename, "source": source,
                "rows": len(df), "columns": list(df.columns), "fill_rates": fill_rates,
                "preview": df.head(5).fillna("").to_dict(orient="records"), "message": f"DOCX uploaded — extracted via {source}"}

    # Handle CSV and Excel uploads
    try:
        df = pd.read_csv(save_path, dtype=str) if ext == "csv" else pd.read_excel(save_path, dtype=str)
        df = df.map(lambda x: x.strip() if isinstance(x, str) else x)
        df = df.dropna(axis=1, how='all')
        df = df.loc[:, ~(df == '').all()]
        # Drop any reserved internal column (e.g. _row_id from a previously
        # exported workbook re-uploaded by mistake through the normal upload
        # flow) before it's ever surfaced for column detection
        df = df.drop(columns=[c for c in df.columns if c in RESERVED_INTERNAL_COLUMNS], errors='ignore')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")
    save_upload(file_id, client_id, file.filename, ext, len(df))
    fill_rates = calculate_fill_rates(df)
    return {"file_id": file_id, "client_id": client_id, "filename": file.filename, "source": "table",
            "rows": len(df), "columns": list(df.columns), "fill_rates": fill_rates,
            "fingerprint": compute_schema_fingerprint(list(df.columns)),
            "preview": df.head(5).fillna("").to_dict(orient="records"), "message": "File uploaded and processed successfully"}

# Detect what each column in an uploaded file means, reusing a saved mapping or
# fingerprint cache when possible, and falling back to LLM detection otherwise
@app.post("/detect-columns")
async def detect_columns_endpoint(
    client_id: str = Form(...),
    file_id: str = Form(...),
    columns: str = Form(...),
    file_type: str = Form("general"),
    fill_rates: str = Form("{}"),
    fingerprint: str = Form("")
):
    try:
        columns_list = json.loads(columns)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid columns format.")

    try:
        fill_rates_dict = json.loads(fill_rates)
    except json.JSONDecodeError:
        fill_rates_dict = {}

    # Locate the previously uploaded file on disk
    save_path = None
    file_ext = None
    for extension in ALLOWED_EXTENSIONS:
        path = os.path.join(UPLOAD_DIR, f"{file_id}.{extension}")
        if os.path.exists(path):
            save_path = path
            file_ext = extension
            break
    if not save_path:
        raise HTTPException(status_code=404, detail="File not found. Please upload the file first.")

    # Read the file and grab one sample value per column to help with detection
    try:
        df = read_file_to_df(save_path, file_ext)
        if df is None:
            raise HTTPException(status_code=400, detail="Could not read file.")
        sample_values = {}
        for col in columns_list:
            if col in df.columns:
                non_empty = df[col].dropna().replace("", float("nan")).dropna()
                sample_values[col] = str(non_empty.iloc[0]) if len(non_empty) > 0 else ""
            else:
                sample_values[col] = ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")

    # Suggest a file type category based on the columns and sample values
    try:
        file_type_suggestion = suggest_file_type(columns_list, sample_values)
    except Exception:
        file_type_suggestion = {"file_type": "other", "file_type_label": "Other"}
    effective_file_type = file_type_suggestion["file_type"]

    # Save this schema's fingerprint so future uploads with the same columns can be recognized
    computed_fingerprint = compute_schema_fingerprint(columns_list)
    save_fingerprint(client_id, computed_fingerprint, effective_file_type, columns_list)
    saved_mapping = get_mapping(client_id, effective_file_type)
    existing_fp = get_fingerprint(client_id, computed_fingerprint, effective_file_type)

    # Fingerprint cache hit: only trust this if every uploaded column actually
    # has a matching entry in the saved mapping, otherwise fall through to detection
    if existing_fp and saved_mapping:
        filtered_mapping = {
            col: saved_mapping.get(col)
            for col in columns_list
            if col in saved_mapping
        }
        if filtered_mapping and len(filtered_mapping) == len(columns_list):
            result = build_detection_result(columns_list, filtered_mapping, sample_values, fill_rates_dict)
            result["file_id"] = file_id
            result["source"] = "fingerprint_cache"
            result["message"] = "Mapping reused from cache."
            result["suggested_file_type"] = file_type_suggestion["file_type"]
            result["suggested_file_type_label"] = file_type_suggestion["file_type_label"]
            return result

    # Saved mapping hit: only trust this if every uploaded column is covered by the saved mapping
    if saved_mapping:
        all_mapped = all(col in saved_mapping for col in columns_list)
        if all_mapped:
            filtered_mapping = {col: saved_mapping[col] for col in columns_list}
            result = build_detection_result(columns_list, filtered_mapping, sample_values, fill_rates_dict)
            result["file_id"] = file_id
            result["source"] = "saved_mapping"
            result["message"] = "Mapping loaded from saved client profile — LLM skipped."
            result["suggested_file_type"] = file_type_suggestion["file_type"]
            result["suggested_file_type_label"] = file_type_suggestion["file_type_label"]
            return result

    # No usable cache found: run LLM detection on the columns
    try:
        mapping = detect_columns_with_llm(columns_list, sample_values, fill_rates_dict)
        if not mapping:
            raise HTTPException(status_code=500, detail="LLM returned empty mapping.")

        result = build_detection_result(columns_list, mapping, sample_values, fill_rates_dict)

        # Demote any column that was mapped to the same target as another column,
        # since two columns sharing one mapped name would crash cleaning later
        dedup_warnings = []
        seen_targets = set()
        for original_col, info in list(result["mapping"].items()):
            if not isinstance(info, dict):
                continue
            target = str(info.get("mapped_to", "")).strip()
            if target in ("", "unknown"):
                continue
            if target in seen_targets:
                suggestion = target
                result["mapping"][original_col] = {
                    "mapped_to": "unknown",
                    "field_type": "unknown",
                    "suggestion": suggestion,
                    "sample_value": info.get("sample_value", ""),
                    "fill_rate": info.get("fill_rate", 1.0),
                }
                dedup_warnings.append(
                    f"'{original_col}' was also mapped to '{target}' — demoted to unknown. "
                    f"Please give it a unique 'Mapped To' name."
                )
            else:
                seen_targets.add(target)

        # Count how many columns still need manual review
        unknown_columns = [
            col for col, info in result["mapping"].items()
            if info.get("mapped_to") == "unknown" or info.get("field_type") == "unknown"
        ]
        result["unknown_count"] = len(unknown_columns)
        result["requires_manual_mapping"] = len(unknown_columns) > 0
        if dedup_warnings:
            if "warnings" in result and isinstance(result["warnings"], list):
                result["warnings"].extend(
                    {"type": "dedup_mapping", "message": w, "action": "Please update the mapped-to field to a unique name."}
                    for w in dedup_warnings
                )
            else:
                result["warnings"] = [
                    {"type": "dedup_mapping", "message": w, "action": "Please update the mapped-to field to a unique name."}
                    for w in dedup_warnings
                ]
        if result.get("warnings"):
            result["warning_count"] = len(result["warnings"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")
    result["file_id"] = file_id
    result["source"] = "llm_detection"
    result["suggested_file_type"] = file_type_suggestion["file_type"]
    result["suggested_file_type_label"] = file_type_suggestion["file_type_label"]
    return result

# Save a confirmed column mapping for a client and file type
@app.post("/save-mapping")
async def save_mapping_endpoint(
    client_id: str = Form(...),
    file_type: str = Form(...),
    mapping: str = Form(...),
    file_id: str = Form(None),
    confirmed_by: str = Form(None)
):
    try:
        mapping_dict = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping format.")
    if not mapping_dict:
        raise HTTPException(status_code=400, detail="Mapping cannot be empty. Please provide a valid mapping.")

    # If we have access to the original file, validate that each column's
    # declared field_type is consistent with its actual data before saving
    if file_id:
        save_path, file_ext = locate_uploaded_file(file_id)
        if save_path:
            try:
                df = read_file_to_df(save_path, file_ext)
                if df is not None:
                    problems = validate_field_types_against_data(df, mapping_dict)
                    if problems:
                        raise HTTPException(
                            status_code=400,
                            detail="Field type mismatch detected: " + " | ".join(problems)
                        )
            except HTTPException:
                raise
            except Exception:
                # If validation itself fails for an unexpected reason, don't block
                # saving entirely — this check is a safety net, not the source of truth
                pass

    save_mapping(client_id, file_type, mapping_dict, confirmed_by)
    return {"client_id": client_id, "file_type": file_type, "columns_saved": len(mapping_dict),
            "message": f"Mapping saved successfully for client {client_id} and file type {file_type}."}

# Retrieve a previously saved column mapping for a client and file type
@app.get("/get-mapping/{client_id}")
async def get_mapping_endpoint(client_id: str, file_type: str = "general"):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        return {"client_id": client_id, "file_type": file_type, "mapping": {},
                "message": "No saved mapping found for this client."}
    return {"client_id": client_id, "file_type": file_type, "mapping": mapping,
            "columns_mapped": len(mapping), "message": "Saved mapping retrieved successfully."}

# List all uploads recorded for a given client
@app.get("/uploads/{client_id}")
async def get_uploads_endpoint(client_id: str):
    uploads = get_uploads(client_id)
    return {"client_id": client_id, "total_uploads": len(uploads), "uploads": uploads}


# Run the cleaning engine on a file and return the cleaned data along with the validation report
@app.post("/clean")
async def clean_file(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general")
) -> dict:
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client. Please detect the columns and confirm the mapping first.")
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    return {"file_id": file_id, "client_id": client_id, "file_type": file_type,
            "cleaned_data": cleaned_df.fillna("").astype(str).map(lambda x: x.strip()).to_dict(orient="records"),
            "validation_report": report,
            "can_proceed": report.get("can_proceed", False),
            "message": "File cleaned successfully."}

# Export the cleaned data as a downloadable Excel workbook, and save a snapshot
# of it so a later corrected upload can be compared against this exact state
@app.get("/clean/export-cleaned/{file_id}")
async def export_cleaned_workbook(file_id: str, client_id: str, file_type: str = "general"):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client. Please detect the columns and confirm the mapping first.")
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    save_cleaning_snapshot(file_id, client_id, file_type, cleaned_df)
    workbook_buffer = build_cleaning_workbook(cleaned_df, report, mapping)
    download_filename = f"{file_id}_cleaned_data.xlsx"
    return StreamingResponse(
        workbook_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
    )

# Accept an auditor-edited Excel file, diff it against the last downloaded
# snapshot, and apply any corrections, deletions, or renames that were found
@app.post("/clean/submit-corrected-excel")
async def submit_corrected_excel(
    file: UploadFile = File(...),
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general"),
    corrected_by: str = Form(None),
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client. Please detect the columns and confirm the mapping first.")

    snapshot_rows = get_cleaning_snapshot(file_id, client_id, file_type)
    if not snapshot_rows:
        raise HTTPException(
            status_code=400,
            detail="No downloaded snapshot found for this file. Please download the cleaned Excel first, edit it, then upload it back."
        )

    # Save the uploaded file to a temporary path so it can be read and diffed
    temp_path = os.path.join(UPLOAD_DIR, f"corrected_{uuid.uuid4()}.xlsx")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        diff_result = diff_uploaded_against_snapshot(temp_path, snapshot_rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        # Clean up the temp file, but never let a cleanup failure crash the request
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except (PermissionError, OSError):
            pass
    corrections = diff_result["corrections"]
    deleted_row_ids = diff_result["deleted_row_ids"]
    deleted_columns = diff_result["deleted_columns"]
    renamed_columns = diff_result["renamed_columns"]
    unresolved_columns = diff_result.get("unresolved_columns", [])

    # Build a warning for any new column the diff couldn't confidently explain,
    # without blocking the rest of the upload from being applied
    unresolved_warning = None
    if unresolved_columns:
        names = ", ".join(f"'{c}'" for c in unresolved_columns)
        unresolved_warning = (
            f"Could not confidently determine what happened to {names} — this usually "
            f"means either it's a genuinely new column we don't recognize, or its rename "
            f"couldn't be told apart from another change in this upload with confidence. "
            f"Everything else in this upload was applied. If {names} was meant to be a "
            f"rename, please try renaming just that one column by itself in a follow-up "
            f"upload."
        )

    # Check that the proposed renames don't collide with each other, or with a
    # different column's existing mapped name, before applying anything
    if renamed_columns:
        new_name_targets = {}
        for old_name, new_name in renamed_columns.items():
            new_name_targets.setdefault(new_name, []).append(old_name)
        mutual_collisions = {n: olds for n, olds in new_name_targets.items() if len(olds) > 1}
        if mutual_collisions:
            descriptions = "; ".join(
                f"{', '.join(repr(o) for o in olds)} were all renamed to '{n}'"
                for n, olds in mutual_collisions.items()
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot apply these renames: {descriptions}. Each column needs a "
                    f"unique name. Please give each one a different name and re-upload."
                )
            )

        for old_name, new_name in renamed_columns.items():
            colliding_column = next(
                (
                    original_col for original_col, info in mapping.items()
                    if isinstance(info, dict)
                    and info.get("mapped_to") == new_name
                    and info.get("mapped_to") != old_name
                ),
                None,
            )
            if colliding_column:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot rename '{old_name}' to '{new_name}': that name is already used "
                        f"by column '{colliding_column}'. Please choose a different name for "
                        f"one of these two columns and re-upload."
                    )
                )

    # If nothing changed at all in the uploaded file, there's nothing to apply
    if not corrections and not deleted_row_ids and not deleted_columns and not renamed_columns:
        raise HTTPException(
            status_code=400,
            detail="No changes were detected in the uploaded file compared to what was downloaded."
        )

    # Save plain cell value corrections
    if corrections:
        save_cleaning_corrections(file_id, client_id, file_type, corrections, corrected_by)

    # Save row deletions
    if deleted_row_ids:
        deletion_records = [
            {"row_index": row_id, "column": "_row_deleted",
             "original_value": "present", "corrected_value": "deleted_by_auditor"}
            for row_id in deleted_row_ids
        ]
        save_cleaning_corrections(file_id, client_id, file_type, deletion_records, corrected_by)

    # Save column deletions
    if deleted_columns:
        column_deletion_records = [
            {"row_index": -1, "column": f"_column_deleted:{col}",
             "original_value": "present", "corrected_value": "deleted_by_auditor"}
            for col in deleted_columns
        ]
        save_cleaning_corrections(file_id, client_id, file_type, column_deletion_records, corrected_by)

    # Apply every confidently-resolved rename to the saved mapping. old_name from
    # the diff may be either the original raw column key (if it was unresolved)
    # or the mapped_to value (if it was already resolved), so the actual mapping key has to be looked up before being updated
    if renamed_columns:
        updated_mapping = dict(mapping)
        for old_name, new_name in renamed_columns.items():
            original_key = next(
                (oc for oc, info in updated_mapping.items()
                 if isinstance(info, dict) and info.get("mapped_to") == old_name),
                None,
            )
            if original_key is None:
                original_key = old_name

            existing_info = updated_mapping.get(original_key, {})
            updated_mapping[original_key] = {
                **(existing_info if isinstance(existing_info, dict) else {}),
                "mapped_to": new_name,
                "field_type": (
                    existing_info.get("field_type")
                    if isinstance(existing_info, dict) and existing_info.get("field_type") not in (None, "unknown")
                    else "text"
                ),
            }
        save_mapping(client_id, file_type, updated_mapping, corrected_by)
        mapping = updated_mapping

    # Re-clean the file with all corrections applied, then refresh the snapshot
    # so the next diff round compares against this latest state
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    save_cleaning_snapshot(file_id, client_id, file_type, cleaned_df)

    if renamed_columns:
        rename_descriptions = "; ".join(f"'{o}' renamed to '{n}'" for o, n in renamed_columns.items())
        rename_summary = f", {rename_descriptions} in the mapping"
    else:
        rename_summary = ""
    response = {
        "file_id": file_id,
        "client_id": client_id,
        "file_type": file_type,
        "cleaned_data": cleaned_df.fillna("").astype(str).map(lambda x: x.strip()).to_dict(orient="records"),
        "validation_report": report,
        "can_proceed": report.get("can_proceed", False),
        "corrections_applied": len(corrections),
        "rows_deleted": deleted_row_ids,
        "columns_deleted": deleted_columns,
        "columns_renamed": renamed_columns,
        "unresolved_columns": unresolved_columns,
        "message": (
            f"{len(corrections)} correction(s), {len(deleted_row_ids)} row deletion(s), "
            f"and {len(deleted_columns)} column deletion(s) applied from the uploaded file"
            f"{rename_summary}. File re-cleaned successfully."
        )
    }
    if unresolved_warning:
        response["warning"] = unresolved_warning
    return response

# Record that an auditor has accepted an issue as valid as-is, then re-clean the file
@app.post("/clean/acknowledge-issue")
async def acknowledge_issue_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general"),
    issue: str = Form(...),
    acknowledged_by: str = Form(None),
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client.")
    try:
        issue_dict = json.loads(issue)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid issue format.")
    issue_id = issue_dict.get("issue_id") or issue_fingerprint(file_id, client_id, file_type, issue_dict)
    save_cleaning_acknowledgment(issue_id, file_id, client_id, file_type, issue_dict, acknowledged_by)
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    return {
        "file_id": file_id, "client_id": client_id, "file_type": file_type,
        "cleaned_data": cleaned_df.fillna("").astype(str).map(lambda x: x.strip()).to_dict(orient="records"),
        "validation_report": report,
        "can_proceed": report.get("can_proceed", False),
        "message": "Issue acknowledged."
    }

# Save inline cell edits made directly in the web app (not via Excel re-upload), then re-clean
@app.post("/clean/submit-inline-corrections")
async def submit_inline_corrections_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general"),
    corrections: str = Form(...),
    corrected_by: str = Form(None),
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client.")
    try:
        corrections_list = json.loads(corrections)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid corrections format.")
    if not corrections_list:
        raise HTTPException(status_code=400, detail="No corrections provided.")
    save_cleaning_corrections(file_id, client_id, file_type, corrections_list, corrected_by)
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    return {
        "file_id": file_id, "client_id": client_id, "file_type": file_type,
        "cleaned_data": cleaned_df.fillna("").astype(str).map(lambda x: x.strip()).to_dict(orient="records"),
        "validation_report": report,
        "can_proceed": report.get("can_proceed", False),
        "message": f"{len(corrections_list)} correction(s) saved and re-cleaned."
    }

# List every file for a client that has a cleaned version saved, most recently updated first. Lets the auditor come back later and see what's ready.
@app.get("/clients/{client_id}/cleaned-files")
async def list_cleaned_files(client_id: str):
    files = get_cleaned_files_for_client(client_id)
    return {"client_id": client_id, "total": len(files), "files": files}

# Download the current cleaned version of a file directly, plain and clean.
@app.get("/cleaned-files/{file_id}/download")
async def download_cleaned_file(file_id: str, client_id: str, file_type: str = "general"):
    record = get_cleaned_file_data(file_id, client_id, file_type)
    if not record:
        raise HTTPException(
            status_code=404,
            detail="No cleaned version found for this file. Please run cleaning first."
        )

    df = pd.DataFrame(record["cleaned_data"])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Cleaned Data")
    output.seek(0)
    # Use the original uploaded filename if available, otherwise default to a generic name
    download_filename = record.get("filename") or f"{file_id}_cleaned.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
    )

# Return the cleaned data as JSON for viewing inline in the browser
@app.get("/cleaned-files/{file_id}/view")
async def view_cleaned_file(file_id: str, client_id: str, file_type: str = ""):
    record = get_cleaned_file_data(file_id, client_id, file_type)
    if not record:
        raise HTTPException(
            status_code=404,
            detail="No cleaned version found for this file. Please run cleaning first."
        )
    return {
        "file_id": file_id,
        "client_id": client_id,
        "file_type": file_type,
        "filename": record.get("filename"),
        "cleaned_data": record["cleaned_data"],
        "total_issues": record.get("total_issues", 0),
        "can_proceed": bool(record.get("can_proceed")),
        "updated_at": str(record.get("updated_at")),
    }

# Standardize a near-duplicate value across an entire column in one action.
# Finds every row where the column matches from_value and replaces it with
# to_value, saving one correction record per affected row, then re-cleans.
@app.post("/clean/standardize-value")
async def standardize_value_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general"),
    column: str = Form(...),
    from_value: str = Form(...),
    to_value: str = Form(...),
    corrected_by: str = Form(None),
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(status_code=400, detail="No saved mapping found for this client.")

    save_path, file_ext = locate_uploaded_file(file_id)
    if not save_path:
        raise HTTPException(status_code=404, detail="File not found. Please upload the file first.")

    try:
        df = read_file_to_df(save_path, file_ext)
        if df is None:
            raise HTTPException(status_code=400, detail="Could not read file.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")

    # Apply any previously saved corrections first, so we're matching against
    # the current state of the data, not the raw original file
    existing_corrections = get_cleaning_corrections(file_id, client_id, file_type)
    df = apply_saved_corrections(df, mapping, existing_corrections)

    # Translate the standard column name back to the original column name in df
    standard_to_original = {
        info.get("mapped_to"): original_col
        for original_col, info in mapping.items()
        if isinstance(info, dict) and info.get("mapped_to") not in ("", "unknown", None)
    }
    source_col = standard_to_original.get(column, column)

    if source_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column}' not found in file.")

    # Find every row where this column currently matches from_value
    matching_rows = df.index[df[source_col].astype(str).str.strip() == from_value].tolist()

    if not matching_rows:
        raise HTTPException(
            status_code=400,
            detail=f"No rows found with value '{from_value}' in column '{column}'. It may have already been corrected."
        )

    # Create one correction record per affected row
    standardize_records = [
        {
            "row_index": int(row_idx),
            "column": column,
            "original_value": from_value,
            "corrected_value": to_value,
        }
        for row_idx in matching_rows
    ]
    save_cleaning_corrections(file_id, client_id, file_type, standardize_records, corrected_by)

    # Re-clean with the standardization applied
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    save_cleaning_snapshot(file_id, client_id, file_type, cleaned_df)

    return {
        "file_id": file_id,
        "client_id": client_id,
        "file_type": file_type,
        "cleaned_data": cleaned_df.fillna("").astype(str).map(lambda x: x.strip()).to_dict(orient="records"),
        "validation_report": report,
        "can_proceed": report.get("can_proceed", False),
        "rows_updated": len(matching_rows),
        "message": f"Standardized {len(matching_rows)} row(s) in '{column}' from '{from_value}' to '{to_value}'."
    }

# Run the Financial Engine on a client's cleaned data using pandas calculations
@app.post("/analyze/{client_id}")
async def analyze_financials(
    client_id: str,
    file_id: str = Form(...),
    file_type: str = Form("general")
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="No saved mapping found for this client. Please complete column mapping first."
        )
    # Run the cleaning cycle to ensure the data is up-to-date and valid before analysis
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    if not report.get("can_proceed", False):
        raise HTTPException(
            status_code=400,
            detail="This file still has unresolved issues. Please finish cleaning before running analysis."
        )
    analysis_context = build_financial_analysis_context(cleaned_df, mapping, client_id, file_type)

    return {
        "client_id": client_id,
        "file_id": file_id,
        "file_type": file_type,
        **analysis_context,
        "message": "Financial analysis completed successfully."
    }

# Run the AI Insights Engine on already-calculated financial data.
@app.post("/analyze/{client_id}/insights")
async def analyze_insights(
    client_id: str,
    file_id: str = Form(...),
    file_type: str = Form("general")
):
    # Ensure that a mapping exists for this client and file type before proceeding
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="No saved mapping found for this client. Please complete column mapping first."
        )
    # Run the cleaning cycle to ensure the data is up-to-date and valid before generating insights
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    # Check if the cleaned data is valid and ready for analysis
    if not report.get("can_proceed", False):
        raise HTTPException(
            status_code=400,
            detail="This file still has unresolved issues. Please finish cleaning before generating insights."
        )
    analysis_context = build_financial_analysis_context(cleaned_df, mapping, client_id, file_type)
    # Generate AI insights based on the calculated financial data
    try:
        if analysis_context.get("financial_analytics"):
            insights = generate_financial_ai_insights(
                analysis_context.get("financial_statements"),
                analysis_context.get("financial_ratios"),
                analysis_context.get("financial_analytics"),
                analysis_context.get("comparative_analytics"),
                analysis_context.get("generic_analysis"),
            )
        else:
            insights = generate_ai_insights(
                analysis_context.get("breakdowns", {}),
                analysis_context.get("monthly_trend", {}),
                analysis_context.get("anomalies", []),
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insight generation failed: {str(e)}")
    # Return the AI insights along with a success message
    return {
        "client_id": client_id,
        "file_id": file_id,
        "file_type": file_type,
        "analysis_scope": analysis_context.get("analysis_scope"),
        "analysis_basis": analysis_context.get("analysis_basis"),
        "ai_insights": insights,
        "message": "AI insights generated successfully."
    }


# Validates a trial balance / general ledger file after cleaning.
@app.post("/validate-trial-balance")
async def validate_trial_balance_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general")
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="No saved mapping found for this client. Please complete column mapping first."
        )
    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    if not report.get("can_proceed", False):
        raise HTTPException(
            status_code=400,
            detail="This file still has unresolved cleaning issues. Please finish cleaning before validating the trial balance."
        )
    validation_result = validate_trial_balance(cleaned_df, mapping)
    return {
        "client_id": client_id,
        "file_id": file_id,
        "file_type": file_type,
        "trial_balance_validation": validation_result,
    }

# Suggest standard category classifications
@app.post("/detect-account-mapping")
async def detect_account_mapping_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general")
):
    # Get mapping 
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="No saved mapping found for this client. Please complete column mapping first."
        )

    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)
    if not report.get("can_proceed", False):
        raise HTTPException(
            status_code=400,
            detail="This file still has unresolved cleaning issues. Please finish cleaning first."
        )
    saved_account_mapping = get_account_mapping(client_id, file_type)
    result = build_account_mapping_result(cleaned_df, mapping, saved_account_mapping)
    return {
        "client_id": client_id,
        "file_id": file_id,
        "file_type": file_type,
        "account_mapping": result,
    }

# Saves the auditor's confirmed account category classifications.
@app.post("/save-account-mapping")
async def save_account_mapping_endpoint(
    client_id: str = Form(...),
    file_type: str = Form(...),
    accounts: str = Form(...),
    confirmed_by: str = Form(None)
):
    try:
        accounts_list = json.loads(accounts)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid accounts format.")
    if not accounts_list:
        raise HTTPException(status_code=400, detail="No accounts provided.")

    save_account_mapping(client_id, file_type, accounts_list, confirmed_by)
    return {
        "client_id": client_id,
        "file_type": file_type,
        "accounts_saved": len(accounts_list),
        "message": "Account mapping saved successfully."
    }

# Generates the Income Statement and Balance Sheet from confirmed account classifications. Requires account mapping to have been
# saved first — pure aggregation, no AI involved at this stage.
@app.post("/generate-financial-statements")
async def generate_financial_statements_endpoint(
    file_id: str = Form(...),
    client_id: str = Form(...),
    file_type: str = Form("general")
):
    mapping = get_mapping(client_id, file_type)
    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="No saved mapping found for this client. Please complete column mapping first."
        )

    cleaned_df, report = run_cleaning_cycle(file_id, client_id, file_type, mapping)

    if not report.get("can_proceed", False):
        raise HTTPException(
            status_code=400,
            detail="This file still has unresolved cleaning issues. Please finish cleaning first."
        )

    account_mapping = get_account_mapping(client_id, file_type)
    if not account_mapping:
        raise HTTPException(
            status_code=400,
            detail="No account mapping found for this client. Please complete account mapping first."
        )

    result = generate_financial_statements(cleaned_df, mapping, account_mapping)
    if result.get("applicable"):
        result["financial_ratios"] = calculate_financial_ratios(
            result["income_statement"],
            result["balance_sheet"],
        )

    return {
        "client_id": client_id,
        "file_id": file_id,
        "file_type": file_type,
        "financial_statements": result,
        "financial_ratios": result.get("financial_ratios"),
    }
    
# List all clients
@app.get("/clients")
def get_clients(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM clients")
    return cursor.fetchall()

# Get a single client by id
@app.get("/clients/{client_id}")
def get_client(client_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM clients WHERE client_id = %s", (client_id,))
    client = cursor.fetchone()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

# Create a new client
@app.post("/clients")
def create_client(c: Client, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """INSERT INTO clients (company_name, contact_person, email, phone, industry, address, status, kra_pin)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (c.company_name, c.contact_person, c.email, c.phone, c.industry, c.address, c.status, c.kra_pin)
    )
    db.commit()
    return {"client_id": cursor.lastrowid, "message": "Client created"}

# Update an existing client
@app.put("/clients/{client_id}")
def update_client(client_id: int, c: Client, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """UPDATE clients SET company_name=%s, contact_person=%s, email=%s,
           phone=%s, industry=%s, address=%s, status=%s, kra_pin=%s WHERE client_id=%s""",
        (c.company_name, c.contact_person, c.email, c.phone, c.industry, c.address, c.status, c.kra_pin, client_id)
    )
    db.commit()
    return {"message": "Client updated"}

# Delete a client along with every record that depends on it (engagements,
# sections, team assignments, submissions, uploads), and unassign any users
@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT engagement_id FROM engagements WHERE client_id = %s", (client_id,))
        rows = cursor.fetchall()
        engagement_ids = [r['engagement_id'] for r in rows] if rows else []
        if engagement_ids:
            placeholders = ','.join(['%s'] * len(engagement_ids))
            cursor.execute(f"DELETE FROM submissions WHERE engagement_id IN ({placeholders})", tuple(engagement_ids))
            cursor.execute(f"DELETE FROM audit_sections WHERE engagement_id IN ({placeholders})", tuple(engagement_ids))
            cursor.execute(f"DELETE FROM engagement_team WHERE engagement_id IN ({placeholders})", tuple(engagement_ids))
            cursor.execute(f"DELETE FROM engagements WHERE engagement_id IN ({placeholders})", tuple(engagement_ids))
        cursor.execute("DELETE FROM uploads WHERE client_id = %s", (str(client_id),))
        cursor.execute("UPDATE users SET assigned_client_id = NULL WHERE assigned_client_id = %s", (client_id,))
        cursor.execute("DELETE FROM clients WHERE client_id = %s", (client_id,))
        if cursor.rowcount == 0:
            db.rollback()
            raise HTTPException(status_code=404, detail="Client not found")
        db.commit()
        return {"message": "Client and dependent records deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Could not delete client: {str(e)}")

# List all users along with their assigned client's company name
@app.get("/users")
def get_users(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.status,
               u.assigned_client_id, u.created_at, c.company_name
        FROM users u LEFT JOIN clients c ON u.assigned_client_id = c.client_id
    """)
    return cursor.fetchall()

# Get a single user by id, with the password hash removed from the response
@app.get("/users/{user_id}")
def get_user(user_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("password_hash", None)
    return user

# Create a new user with a hashed password
@app.post("/users")
def create_user(u: User, db=Depends(get_db)):
    hashed = hash_password(u.password)
    cursor = db.cursor()
    try:
        cursor.execute(
            """INSERT INTO users (full_name, email, password_hash, phone, role, assigned_client_id, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (u.full_name, u.email, hashed, u.phone, u.role, u.assigned_client_id, u.status)
        )
        db.commit()
        return {"user_id": cursor.lastrowid, "message": "User created"}
    except Exception:
        raise HTTPException(status_code=400, detail="Email already exists")

# Update an existing user's details (does not change the password)
@app.put("/users/{user_id}")
def update_user(user_id: int, u: UserUpdate, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """UPDATE users SET full_name=%s, email=%s, phone=%s,
           role=%s, assigned_client_id=%s, status=%s WHERE user_id=%s""",
        (u.full_name, u.email, u.phone, u.role, u.assigned_client_id, u.status, user_id)
    )
    db.commit()
    return {"message": "User updated"}

# Delete a user
@app.delete("/users/{user_id}")
def delete_user(user_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
    db.commit()
    return {"message": "User deleted"}

# Assign a user to a client
@app.put("/users/{user_id}/assign/{client_id}")
def assign_user_to_client(user_id: int, client_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("UPDATE users SET assigned_client_id=%s WHERE user_id=%s", (client_id, user_id))
    db.commit()
    return {"message": "User assigned to client"}

# Log in a user with email and password, returning a JWT access token on success
@app.post("/auth/login")
def login(req: LoginRequest, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (req.email,))
    user = cursor.fetchone()
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user["status"] != "Active":
        raise HTTPException(status_code=403, detail="Account is inactive")
    token = create_token({"user_id": user["user_id"], "email": user["email"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer",
            "user": {"user_id": user["user_id"], "full_name": user["full_name"],
                     "email": user["email"], "role": user["role"]}}

GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("app_password")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

def send_reset_email(to_email: str, token: str):
    reset_link = f"{FRONTEND_URL}/password-reset/confirm/{token}"
    msg = MIMEMultipart()
    msg["From"] = GMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = "Password Reset Request - Audit AI"
    body = f"""Hello,

You requested a password reset for your Audit AI account.

Click the link below to reset your password:
{reset_link}

This link will expire in 1 hour.

If you did not request this, please ignore this email.

Best regards,
The Audit AI Team"""
    msg.attach(MIMEText(body, "plain"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_USER, to_email, msg.as_string())

# Return everything needed to resume work on a file from the Client Details page.
# Reads the actual file from disk to get columns and fill_rates so MappingPage
# can run detection correctly on resume, exactly as a fresh upload would.
@app.get("/files/{file_id}/resume-state")
def get_resume_state(file_id: str, client_id: str, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)

    # Get the upload record
    cursor.execute("SELECT * FROM uploads WHERE file_id = %s AND client_id = %s", (file_id, client_id))
    upload = cursor.fetchone()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    file_type = upload.get("file_type") or "other"
    filename = upload.get("filename") or upload.get("file_name") or ""

    # Read the actual file from disk to get columns and fill_rates
    columns = []
    fill_rates = {}
    fingerprint = ""
    row_count = upload.get("row_count") or 0
    save_path, file_ext = locate_uploaded_file(file_id)
    if save_path:
        try:
            df = read_file_to_df(save_path, file_ext)
            if df is not None:
                columns = list(df.columns)
                fill_rates = calculate_fill_rates(df)
                fingerprint = compute_schema_fingerprint(columns)
                row_count = len(df)
        except Exception:
            pass

    # The uploads table stores the file extension (e.g. 'xlsx'), not the mapped
    # category (e.g. 'general_ledger'). Resolve the real file_type by finding
    # which column_mappings entry covers the most columns from this file.
    if columns:
        placeholders = ",".join(["%s"] * len(columns))
        cursor.execute(
            f"SELECT file_type, COUNT(*) AS cnt FROM column_mappings "
            f"WHERE client_id = %s AND original_column IN ({placeholders}) "
            f"GROUP BY file_type ORDER BY cnt DESC LIMIT 1",
            (client_id, *columns)
        )
        ft_row = cursor.fetchone()
        if ft_row:
            file_type = ft_row["file_type"]

    # Check if a mapping exists
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM column_mappings WHERE client_id = %s AND file_type = %s",
        (client_id, file_type)
    )
    has_mapping = cursor.fetchone()["cnt"] > 0

    # Check cleaned registry
    cursor.execute(
        "SELECT total_issues, can_proceed, updated_at FROM cleaned_files_registry WHERE file_id = %s AND client_id = %s AND file_type = %s",
        (file_id, client_id, file_type)
    )
    cleaned = cursor.fetchone()

    # Check if any corrections exist — tells us the auditor was on CorrectedResultsPage
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM cleaning_corrections WHERE file_id = %s AND client_id = %s AND file_type = %s",
        (file_id, client_id, file_type)
    )
    has_corrections = cursor.fetchone()["cnt"] > 0

    # Determine stage
    if cleaned and cleaned["can_proceed"]:
        stage = "clean"
    elif cleaned and not cleaned["can_proceed"]:
        stage = "cleaning_in_progress"
    elif has_mapping:
        stage = "mapped"
    else:
        stage = "uploaded"

    return {
        "file_id": file_id,
        "client_id": client_id,
        "filename": filename,
        "file_type": file_type,
        "row_count": row_count,
        "columns": columns,
        "fill_rates": fill_rates,
        "fingerprint": fingerprint,
        "upload_time": str(upload.get("upload_time") or ""),
        "stage": stage,
        "has_mapping": has_mapping,
        "has_corrections": has_corrections,
        "total_issues": cleaned["total_issues"] if cleaned else None,
        "can_proceed": bool(cleaned["can_proceed"]) if cleaned else False,
        "last_cleaned_at": str(cleaned["updated_at"]) if cleaned else None,
    }

# Generate a password reset token for a user's email and store it with a one hour expiry
@app.post("/auth/password-reset-request")
def password_reset_request(req: PasswordResetRequest, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (req.email,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)
    cursor2 = db.cursor()
    cursor2.execute("INSERT INTO password_resets (user_id, token, expires_at) VALUES (%s, %s, %s)",
                    (user["user_id"], token, expires_at))
    db.commit()
    try:
        send_reset_email(user["email"], token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token generated but email could not be sent: {str(e)}")
    return {"message": "Password reset link sent to your email"}

# Confirm a password reset using a valid, unexpired token and set the new password
@app.post("/auth/password-reset-confirm")
def password_reset_confirm(req: PasswordResetConfirm, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM password_resets WHERE token = %s AND expires_at > UTC_TIMESTAMP()", (req.token,))
    reset = cursor.fetchone()
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    hashed = hash_password(req.new_password)
    cursor2 = db.cursor()
    cursor2.execute("UPDATE users SET password_hash = %s WHERE user_id = %s", (hashed, reset["user_id"]))
    cursor2.execute("DELETE FROM password_resets WHERE token = %s", (req.token,))
    db.commit()
    return {"message": "Password reset successful"}

# List every column mapping record in the system
@app.get("/column-mappings")
def get_all_mappings(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM column_mappings")
    return cursor.fetchall()

# List column mapping records for a single client
@app.get("/column-mappings/{client_id}")
def get_client_mappings(client_id: str, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM column_mappings WHERE client_id = %s", (client_id,))
    return cursor.fetchall()

# Create a single column mapping record directly (separate from the AI mapping save flow)
@app.post("/column-mappings")
def create_mapping(m: ColumnMapping, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """INSERT INTO column_mappings (client_id, file_type, original_column, mapped_to, confirmed_by)
           VALUES (%s, %s, %s, %s, %s)""",
        (m.client_id, m.file_type, m.original_column, m.mapped_to, m.confirmed_by)
    )
    db.commit()
    return {"id": cursor.lastrowid, "message": "Column mapping created"}

# Update a single column mapping record by id
@app.put("/column-mappings/{mapping_id}")
def update_mapping(mapping_id: int, m: ColumnMapping, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """UPDATE column_mappings SET client_id=%s, file_type=%s, original_column=%s,
           mapped_to=%s, confirmed_by=%s WHERE id=%s""",
        (m.client_id, m.file_type, m.original_column, m.mapped_to, m.confirmed_by, mapping_id)
    )
    db.commit()
    return {"message": "Column mapping updated"}

# Delete a single column mapping record by id
@app.delete("/column-mappings/{mapping_id}")
def delete_mapping(mapping_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM column_mappings WHERE id = %s", (mapping_id,))
    db.commit()
    return {"message": "Column mapping deleted"}

# List all engagements with their client's company name, most recent first
@app.get("/engagements")
def get_engagements(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT e.*, c.company_name FROM engagements e
        LEFT JOIN clients c ON e.client_id = c.client_id
        ORDER BY e.created_at DESC
    """)
    return cursor.fetchall()

# Get a single engagement by id, with its client's company name
@app.get("/engagements/{engagement_id}")
def get_engagement(engagement_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT e.*, c.company_name FROM engagements e
        LEFT JOIN clients c ON e.client_id = c.client_id
        WHERE e.engagement_id = %s
    """, (engagement_id,))
    engagement = cursor.fetchone()
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return engagement

# Create a new engagement and automatically create its four default audit sections
@app.post("/engagements")
def create_engagement(e: Engagement, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """INSERT INTO engagements (client_id, engagement_name, financial_year, status, start_date, end_date)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (e.client_id, e.engagement_name, e.financial_year, e.status, e.start_date, e.end_date)
    )
    engagement_id = cursor.lastrowid
    for section in ["Revenue", "Expenses", "Inventory", "Cash & Bank"]:
        cursor.execute("INSERT INTO audit_sections (engagement_id, section_name) VALUES (%s, %s)",
                       (engagement_id, section))
    db.commit()
    return {"engagement_id": engagement_id, "message": "Engagement created with default audit sections"}

# Update an existing engagement
@app.put("/engagements/{engagement_id}")
def update_engagement(engagement_id: int, e: Engagement, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """UPDATE engagements SET client_id=%s, engagement_name=%s, financial_year=%s,
           status=%s, start_date=%s, end_date=%s WHERE engagement_id=%s""",
        (e.client_id, e.engagement_name, e.financial_year, e.status, e.start_date, e.end_date, engagement_id)
    )
    db.commit()
    return {"message": "Engagement updated"}

# Delete an engagement along with its audit sections and team assignments
@app.delete("/engagements/{engagement_id}")
def delete_engagement(engagement_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM audit_sections WHERE engagement_id = %s", (engagement_id,))
    cursor.execute("DELETE FROM engagement_team WHERE engagement_id = %s", (engagement_id,))
    cursor.execute("DELETE FROM engagements WHERE engagement_id = %s", (engagement_id,))
    db.commit()
    return {"message": "Engagement deleted"}

# List the team members assigned to an engagement
@app.get("/engagements/{engagement_id}/team")
def get_engagement_team(engagement_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT et.*, u.full_name, u.email, u.role FROM engagement_team et
        LEFT JOIN users u ON et.user_id = u.user_id
        WHERE et.engagement_id = %s
    """, (engagement_id,))
    return cursor.fetchall()

# Add a team member to an engagement
@app.post("/engagements/{engagement_id}/team")
def add_team_member(engagement_id: int, t: EngagementTeam, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("INSERT INTO engagement_team (engagement_id, user_id, role) VALUES (%s, %s, %s)",
                   (engagement_id, t.user_id, t.role))
    db.commit()
    return {"team_id": cursor.lastrowid, "message": "Team member added"}

# Remove a team member from an engagement
@app.delete("/engagements/{engagement_id}/team/{user_id}")
def remove_team_member(engagement_id: int, user_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM engagement_team WHERE engagement_id=%s AND user_id=%s",
                   (engagement_id, user_id))
    db.commit()
    return {"message": "Team member removed"}

# List the audit sections for an engagement, with the assigned user's name
@app.get("/engagements/{engagement_id}/sections")
def get_audit_sections(engagement_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.*, u.full_name as assigned_to_name FROM audit_sections s
        LEFT JOIN users u ON s.assigned_to = u.user_id
        WHERE s.engagement_id = %s
    """, (engagement_id,))
    return cursor.fetchall()

# Add a new audit section to an engagement
@app.post("/engagements/{engagement_id}/sections")
def add_audit_section(engagement_id: int, s: AuditSection, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO audit_sections (engagement_id, section_name, status, assigned_to) VALUES (%s, %s, %s, %s)",
        (engagement_id, s.section_name, s.status, s.assigned_to)
    )
    db.commit()
    return {"section_id": cursor.lastrowid, "message": "Audit section added"}

# Update an audit section
@app.put("/audit-sections/{section_id}")
def update_audit_section(section_id: int, s: AuditSection, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        "UPDATE audit_sections SET section_name=%s, status=%s, assigned_to=%s WHERE section_id=%s",
        (s.section_name, s.status, s.assigned_to, section_id)
    )
    db.commit()
    return {"message": "Audit section updated"}

# Delete an audit section
@app.delete("/audit-sections/{section_id}")
def delete_audit_section(section_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM audit_sections WHERE section_id = %s", (section_id,))
    db.commit()
    return {"message": "Audit section deleted"}

# Get the most recent submission for a single audit section, or none if it has never been submitted
@app.get("/audit-sections/{section_id}/latest-submission")
def get_section_latest_submission(section_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT s.*, u.full_name as submitted_by_name "
        "FROM submissions s "
        "LEFT JOIN users u ON s.submitted_by = u.user_id "
        "WHERE s.section_id = %s "
        "ORDER BY s.created_at DESC LIMIT 1",
        (section_id,)
    )
    row = cursor.fetchone()
    return row if row else None

# List every submission across all engagements, most recent first
@app.get("/submissions")
def get_all_submissions(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.*, u.full_name as submitted_by_name, e.engagement_name, sec.section_name
        FROM submissions s
        LEFT JOIN users u ON s.submitted_by = u.user_id
        LEFT JOIN engagements e ON s.engagement_id = e.engagement_id
        LEFT JOIN audit_sections sec ON s.section_id = sec.section_id
        ORDER BY s.created_at DESC
    """)
    return cursor.fetchall()

# Get a single submission by id
@app.get("/submissions/{submission_id}")
def get_submission(submission_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.*, u.full_name as submitted_by_name, e.engagement_name, sec.section_name
        FROM submissions s
        LEFT JOIN users u ON s.submitted_by = u.user_id
        LEFT JOIN engagements e ON s.engagement_id = e.engagement_id
        LEFT JOIN audit_sections sec ON s.section_id = sec.section_id
        WHERE s.submission_id = %s
    """, (submission_id,))
    submission = cursor.fetchone()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission

# Create a new submission, and notify the relevant users if it has moved past the first workflow stage
@app.post("/submissions")
def create_submission(s: Submission, db=Depends(get_db)):
    insert_cursor = db.cursor()
    insert_cursor.execute(
        """INSERT INTO submissions (engagement_id, section_id, submitted_by, status, current_stage, notes)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (s.engagement_id, s.section_id, s.submitted_by, s.status, s.current_stage, s.notes)
    )
    submission_id = insert_cursor.lastrowid
    cursor = db.cursor(dictionary=True)
    if s.current_stage and s.current_stage != "Accountant":
        cursor.execute("""
            SELECT e.engagement_name, sec.section_name FROM engagements e
            LEFT JOIN audit_sections sec ON sec.engagement_id = e.engagement_id
            WHERE sec.section_id = %s
        """, (s.section_id,))
        info = cursor.fetchone()
        if info:
            message = f"{info['section_name']} for {info['engagement_name']} is now {s.status}"
            cursor.execute("""
                SELECT u.user_id FROM users u
                INNER JOIN engagement_team et ON u.user_id = et.user_id
                WHERE et.engagement_id = %s AND u.role = %s
            """, (s.engagement_id, s.current_stage))
            for auditor in cursor.fetchall():
                cursor.execute("INSERT INTO notifications (user_id, message, type) VALUES (%s, %s, %s)",
                               (auditor['user_id'], message, 'engagement_alert'))
    db.commit()
    return {"submission_id": submission_id, "message": "Submission created"}

# Update a submission's status and workflow stage, and notify the relevant users of the change
@app.put("/submissions/{submission_id}/status")
def update_submission_status(submission_id: int, s: SubmissionStatus, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT sub.*, e.engagement_name, e.engagement_id, sec.section_name
        FROM submissions sub
        LEFT JOIN engagements e ON sub.engagement_id = e.engagement_id
        LEFT JOIN audit_sections sec ON sub.section_id = sec.section_id
        WHERE sub.submission_id = %s
    """, (submission_id,))
    sub = cursor.fetchone()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    cursor2 = db.cursor(dictionary=True)
    if s.updated_by:
        cursor2.execute(
            "UPDATE submissions SET status=%s, current_stage=%s, notes=%s, submitted_by=%s WHERE submission_id=%s",
            (s.status, s.current_stage, s.notes, s.updated_by, submission_id)
        )
    else:
        cursor2.execute(
            "UPDATE submissions SET status=%s, current_stage=%s, notes=%s WHERE submission_id=%s",
            (s.status, s.current_stage, s.notes, submission_id)
        )

    # Decide who should be notified: the new current stage's role, or every workflow role if the submission was just approved or cancelled
    target_roles = []
    if s.current_stage:
        target_roles = [s.current_stage]
    elif s.status in ("Approved", "Cancelled"):
        target_roles = ["Accountant", "Auditor", "Senior Auditor", "Assistant Manager",
                        "Audit Manager", "Engagement Partner", "Quality Reviewer"]

    if target_roles:
        message = f"{sub['section_name']} for {sub['engagement_name']} is now {s.status}"
        cursor2.execute(f"""
            SELECT u.user_id FROM users u
            INNER JOIN engagement_team et ON u.user_id = et.user_id
            WHERE et.engagement_id = %s AND u.role IN ({','.join(['%s']*len(target_roles))})
        """, (sub['engagement_id'], *target_roles))
        for row in cursor2.fetchall():
            cursor2.execute("INSERT INTO notifications (user_id, message, type) VALUES (%s, %s, %s)",
                            (row['user_id'], message, "engagement_alert"))

    db.commit()
    return {"message": f"Submission status updated to {s.status}"}

# Delete a submission
@app.delete("/submissions/{submission_id}")
def delete_submission(submission_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM submissions WHERE submission_id = %s", (submission_id,))
    db.commit()
    return {"message": "Submission deleted"}

# List all notifications for a user, most recent first
@app.get("/notifications/{user_id}")
def get_user_notifications(user_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
    return cursor.fetchall()

# List only the unread notifications for a user, most recent first
@app.get("/notifications/{user_id}/unread")
def get_unread_notifications(user_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM notifications WHERE user_id = %s AND is_read = FALSE ORDER BY created_at DESC",
                   (user_id,))
    return cursor.fetchall()

# Mark a single notification as read
@app.put("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("UPDATE notifications SET is_read = TRUE WHERE notification_id = %s", (notification_id,))
    db.commit()
    return {"message": "Notification marked as read"}

# Mark every notification for a user as read
@app.put("/notifications/{user_id}/read-all")
def mark_all_read(user_id: int, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = %s", (user_id,))
    db.commit()
    return {"message": "All notifications marked as read"}

# Upload a general client document (separate from the AI pipeline upload), storing it on disk and recording it in the uploads table
@app.post("/clients/{client_id}/upload")
def upload_client_file(client_id: int, file: UploadFile = File(...), db=Depends(get_db)):
    allowed_types = ["xlsx", "xls", "csv", "pdf", "tiff", "tif", "jpg", "jpeg", "png", "xml", "json", "txt"]
    file_ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail="File format not allowed.")
    file_path = f"{UPLOAD_DIR}/{client_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    cursor = db.cursor()
    cursor.execute("INSERT INTO uploads (client_id, file_name, file_type, file_path) VALUES (%s, %s, %s, %s)",
                   (client_id, file.filename, file_ext.upper(), file_path))
    db.commit()
    return {"file_id": cursor.lastrowid, "filename": file.filename, "type": file_ext.upper(),
            "message": "File uploaded successfully"}

# List all files uploaded for a single client
@app.get("/clients/{client_id}/files")
def get_client_files(client_id: int, db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM uploads WHERE client_id = %s", (client_id,))
    return cursor.fetchall()

# List every file uploaded across all clients, with the client's company name
@app.get("/files")
def get_all_files(db=Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT f.*, c.company_name FROM uploads f
        LEFT JOIN clients c ON f.client_id = c.client_id
        ORDER BY f.upload_date DESC
    """)
    return cursor.fetchall()

# Run the app directly with uvicorn when this file is executed as a script
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
