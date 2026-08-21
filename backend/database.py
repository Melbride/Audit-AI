import os
import json
import logging
import re
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

# Configure logging for normalization warnings
logger = logging.getLogger(__name__)

# Canonical field names - the single source of truth for standard financial field names
CANONICAL_FIELDS = {
    "account_name",
    "debit",
    "credit",
    "date",
    "amount",
    "account_code",
    "unknown",
}

# Alias mapping - maps known field name variants to their canonical forms
# Based on evidence from existing code: account_classifier.py, trial_balance_validator.py
CANONICAL_ALIASES = {
    "account_description": "account_name",
    "debit_amount": "debit",
    "credit_amount": "credit",
    "account_no": "account_code",
    "account_number": "account_code",
}

# Database connection config. Reads from environment variables with fallback defaults for local development
DB_CONFIG = {
    "host": os.getenv("db_host"),
    "user": os.getenv("db_user"),
    "password": os.getenv("db_password"),
    "database": os.getenv("db_name"),
    "use_pure": True,
}

# Open and return a new MySQL connection using the config above
def get_connection():
    return mysql.connector.connect(**DB_CONFIG)

# FastAPI dependency that yields a database connection and closes it after the request is done
def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()

# Initialize all database tables on startup. Can be call repeatedly, uses CREATE TABLE IF NOT EXISTS

def init_db():
    conn = get_connection()
    # Use dictionary=True so fetchone() returns dict instead of tuple — needed for the ALTER TABLE column checks below
    cursor = conn.cursor(dictionary=True)

    # Column mappings table. Stores confirmed AI or manual mapping per client per file type.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS column_mappings (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            client_id       VARCHAR(255) NOT NULL,
            file_type       VARCHAR(100) NOT NULL DEFAULT 'general',
            original_column VARCHAR(255) NOT NULL,
            mapped_to       VARCHAR(255) NOT NULL,
            field_type      VARCHAR(100) NOT NULL DEFAULT 'unknown',
            reviewed_unknown TINYINT(1) NOT NULL DEFAULT 0,
            required        TINYINT(1) NOT NULL DEFAULT 1,
            confirmed_by    VARCHAR(255),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_column_mapping (client_id, file_type, original_column)
        )
    """)
    # FIX: this check was missing, field_type itself needs the same existing-table migration
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'column_mappings' AND column_name = 'field_type'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD COLUMN field_type VARCHAR(100) NOT NULL DEFAULT 'unknown'")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'column_mappings' AND column_name = 'reviewed_unknown'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD COLUMN reviewed_unknown TINYINT(1) NOT NULL DEFAULT 0")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'column_mappings' AND column_name = 'required'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD COLUMN required TINYINT(1) NOT NULL DEFAULT 1")
    
    # Add fingerprint column for file-specific mapping isolation
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'column_mappings' AND column_name = 'fingerprint'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD COLUMN fingerprint VARCHAR(255) NULL AFTER confirmed_by")
    
    # Add file_id column for true file-specific mapping association
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'column_mappings' AND column_name = 'file_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD COLUMN file_id VARCHAR(255) NULL AFTER fingerprint")
    
    # Update uniqueness constraint to use file_id instead of file_type for file-specific isolation
    # First drop the old uniqueness constraint if it exists
    try:
        cursor.execute("ALTER TABLE column_mappings DROP INDEX uq_column_mapping")
    except Exception:
        pass  # Index may not exist or may have already been dropped
    
    # Add new uniqueness constraint with file_id
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = %s AND table_name = 'column_mappings' AND index_name = 'uq_column_mapping'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE column_mappings ADD UNIQUE KEY uq_column_mapping (client_id, file_id, original_column)")

    # Clients table. Stores company information for each audit client
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clients (
            client_id INT AUTO_INCREMENT PRIMARY KEY,
            company_name VARCHAR(255) NOT NULL,
            contact_person VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(50),
            industry VARCHAR(255),
            address VARCHAR(255),
            status VARCHAR(50) DEFAULT 'Active',
            kra_pin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Schema fingerprints table. file_type stores the REAL file_type category (e.g. "accounts_payable"),
    # not a file extension, saved from /detect-columns, which is the only place the real category is known.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_fingerprints (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id VARCHAR(255) NOT NULL,
            fingerprint VARCHAR(255) NOT NULL,
            file_type VARCHAR(100) NOT NULL DEFAULT 'general',
            columns_snapshot TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_fingerprint (client_id, fingerprint, file_type)
        )
    """)

    # Users table. Stores system users including auditors, accountants and admins.
    # Email must be unique. Password is stored as a hash, never plain text.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            role VARCHAR(50) NOT NULL,
            assigned_client_id INT,
            status VARCHAR(50) DEFAULT 'Active',
            login_locked TINYINT(1) DEFAULT 0,
            failed_attempts INT DEFAULT 0,
            last_login DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'users' AND column_name = 'login_locked'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE users ADD COLUMN login_locked TINYINT(1) DEFAULT 0")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'users' AND column_name = 'failed_attempts'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE users ADD COLUMN failed_attempts INT DEFAULT 0")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'users' AND column_name = 'last_login'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE users ADD COLUMN last_login DATETIME")

    # Password resets table. Stores temporary tokens for password reset requests.
    # Token must be unique. Expires after 1 hour.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            reset_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Login history table. Tracks login attempts with IP/device metadata.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS login_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip_address VARCHAR(100),
            device VARCHAR(255),
            status VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'login_history' AND column_name = 'ip_address'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE login_history ADD COLUMN ip_address VARCHAR(100)")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'login_history' AND column_name = 'device'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE login_history ADD COLUMN device VARCHAR(255)")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'login_history' AND column_name = 'status'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE login_history ADD COLUMN status VARCHAR(50) NOT NULL")

    # Engagements table. Represents an audit engagement for a client for a specific financial year
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS engagements (
            engagement_id INT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NOT NULL,
            engagement_name VARCHAR(255) NOT NULL,
            financial_year VARCHAR(50) NOT NULL,
            status VARCHAR(50) DEFAULT 'Planning',
            start_date DATE,
            end_date DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Audit sections table. Each engagement has multiple sections like Revenue, Expenses, Inventory.
    # Sections can be assigned to a specific user and tracked by status.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_sections (
            section_id INT AUTO_INCREMENT PRIMARY KEY,
            engagement_id INT NOT NULL,
            section_name VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'Pending',
            assigned_to INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Engagement team table. Links users to engagements with a role.
    # UNIQUE KEY prevents the same user being added to the same engagement twice.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS engagement_team (
            team_id INT AUTO_INCREMENT PRIMARY KEY,
            engagement_id INT NOT NULL,
            user_id INT NOT NULL,
            role VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_engagement_team (engagement_id, user_id)
        )
    """)

    # Submissions table. Tracks work submitted by auditors for review within an engagement section.
    # current_stage tracks which role the submission is currently with in the approval workflow.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            submission_id INT AUTO_INCREMENT PRIMARY KEY,
            engagement_id INT NOT NULL,
            section_id INT NOT NULL,
            submitted_by INT NOT NULL,
            status VARCHAR(50) DEFAULT 'Draft',
            current_stage VARCHAR(100) DEFAULT 'Accountant',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add current_stage to existing submissions tables that predate this column
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'submissions' AND column_name = 'current_stage'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE submissions ADD COLUMN current_stage VARCHAR(100) DEFAULT 'Accountant'")

    # Add file_id to submissions table for file-scoped submissions
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'submissions' AND column_name = 'file_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE submissions ADD COLUMN file_id VARCHAR(255) NULL")

    # Add sheet_name to submissions table for Excel multi-sheet support
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'submissions' AND column_name = 'sheet_name'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE submissions ADD COLUMN sheet_name VARCHAR(255) NULL")

    # Notifications table. Stores in-app alerts sent to users when submissions are ready for review.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(100) DEFAULT 'engagement_alert',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_id VARCHAR(255),
            client_id INT
        )
    """)

    # Add file_id and client_id columns if they don't exist (for existing databases)
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'notifications' AND column_name = 'file_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE notifications ADD COLUMN file_id VARCHAR(255)")

    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'notifications' AND column_name = 'client_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE notifications ADD COLUMN client_id INT")

    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'notifications' AND column_name = 'engagement_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE notifications ADD COLUMN engagement_id INT")

    # Uploads table. Tracks every file uploaded per client for audit trail.
    # file_id is a UUID generated at upload time and must be unique.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS uploads (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            file_id     VARCHAR(255) NOT NULL UNIQUE,
            client_id   VARCHAR(255) NOT NULL,
            filename    VARCHAR(255) NOT NULL,
            file_name   VARCHAR(255),
            file_type   VARCHAR(100) NOT NULL,
            file_path   VARCHAR(500),
            row_count   INT,
            status      VARCHAR(50) DEFAULT 'uploaded',
            upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Safety checks: add columns to uploads table if they were missing from an older schema version
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'row_count'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN row_count INT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'file_name'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN file_name VARCHAR(255) NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'header_row_index'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN header_row_index INT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'sheet_name'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN sheet_name VARCHAR(255) NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'file_path'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN file_path VARCHAR(500) NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'upload_date'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'section_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN section_id INT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'engagement_id'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN engagement_id INT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'uploaded_by'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN uploaded_by INT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'uploads' AND column_name = 'selected_sheets'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE uploads ADD COLUMN selected_sheets TEXT NULL")

    # Auditor acknowledgments for issues that are valid as-is.
    # Stores full issue detail columns so each acknowledgment is self-describing without needing a JOIN.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cleaning_acknowledgments (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            issue_id        VARCHAR(64) NOT NULL UNIQUE,
            file_id         VARCHAR(255) NOT NULL,
            client_id       VARCHAR(255) NOT NULL,
            file_type       VARCHAR(100) NOT NULL,
            row_index       VARCHAR(50),
            excel_row       VARCHAR(50),
            column_name     VARCHAR(255),
            original_value  TEXT,
            issue_message   TEXT,
            acknowledged_by VARCHAR(255),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Inline corrections (also used for row/column deletion markers from the Excel re-upload flow).
    # One row per corrected cell, the UNIQUE KEY on (file_id, client_id, file_type, row_index, column_name)
    # means re-correcting the same cell upserts rather than duplicates.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cleaning_corrections (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            file_id        VARCHAR(255) NOT NULL,
            client_id      VARCHAR(255) NOT NULL,
            file_type      VARCHAR(100) NOT NULL,
            row_index      INT NOT NULL,
            column_name    VARCHAR(255) NOT NULL,
            original_value TEXT,
            corrected_value TEXT,
            corrected_by   VARCHAR(255),
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_cleaning_correction (file_id(64), client_id(64), file_type(64), row_index, column_name(191))
        )
    """)
    # Cleaned files registry. Stores the final cleaned data for a file after the auditor has finished editing.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cleaned_files_registry (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            file_id         VARCHAR(255) NOT NULL,
            client_id       VARCHAR(255) NOT NULL,
            file_type       VARCHAR(100) NOT NULL,
            filename        VARCHAR(255),
            cleaned_data    LONGTEXT NOT NULL,
            total_issues    INT DEFAULT 0,
            can_proceed     TINYINT(1) DEFAULT 0,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_cleaned_file (file_id, client_id, file_type)
        )
    """)
    # Account mappings table to store confirmed account category classifications
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS account_mappings (
            id  INT AUTO_INCREMENT PRIMARY KEY,
            client_id  VARCHAR(255) NOT NULL,
            file_type  VARCHAR(100) NOT NULL DEFAULT 'general',
            account_name    VARCHAR(255) NOT NULL,
            category        VARCHAR(255) NOT NULL,
            warning_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
            confirmed_by    VARCHAR(255),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_account_mapping (client_id, file_type, account_name)
        )
    """)
    # Cleaning snapshots table. Stores the cleaned data exactly as it looked when the Excel was downloaded,
    # so a later re-uploaded corrected file can be compared against what the auditor started editing from.
    # Composite PK (file_id, client_id, file_type) means only one snapshot per file at a time — each new
    # export overwrites the previous one.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cleaning_snapshots (
            file_id       VARCHAR(255) NOT NULL,
            client_id     VARCHAR(255) NOT NULL,
            file_type     VARCHAR(100) NOT NULL,
            snapshot_data LONGTEXT NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (file_id, client_id, file_type)
        )
    """)

    # Report generator tables (Month 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id VARCHAR(255) PRIMARY KEY,
            client_id INT NOT NULL,
            engagement_id INT,
            file_id VARCHAR(64),
            type VARCHAR(100),
            period_start DATE,
            period_end DATE,
            status VARCHAR(50),
            current_version_id VARCHAR(255),
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS report_versions (
            id VARCHAR(255) PRIMARY KEY,
            report_id VARCHAR(255) NOT NULL,
            version_number INT NOT NULL,
            financial_summary LONGTEXT,
            ai_insights LONGTEXT,
            commentary TEXT,
            chart_refs LONGTEXT,
            generated_by VARCHAR(50),
            edited_by INT,
            status VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS report_approvals (
            id VARCHAR(255) PRIMARY KEY,
            report_version_id VARCHAR(255) NOT NULL,
            approver_id INT,
            decision VARCHAR(50),
            notes TEXT,
            decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS report_exports (
            id VARCHAR(255) PRIMARY KEY,
            report_version_id VARCHAR(255) NOT NULL,
            format VARCHAR(50),
            file_url VARCHAR(500),
            exported_by INT,
            exported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Saved analyses table (was missing entirely — save_analysis()/get_saved_analyses()
    # below already query this table, but nothing ever created it, hence the
    # "Table 'ai_audit.saved_analyses' doesn't exist" error. client_id is VARCHAR to
    # match how it's passed everywhere else in this file (uploads, mappings, etc.),
    # so no FK to clients.client_id (which is INT) — same pattern as the uploads table.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS saved_analyses (
            analysis_id     INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL,
            client_id       VARCHAR(255) NOT NULL,
            engagement_id   INT NULL,
            file_id         VARCHAR(255) NOT NULL,
            file_type       VARCHAR(100) NOT NULL DEFAULT 'general',
            analysis_data   LONGTEXT,
            insights_data   LONGTEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id)
        )
    """)

    # Engagement final analysis table. Stores the final analysis snapshot for an engagement.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS engagement_final_analysis (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            engagement_id   INT NOT NULL,
            saved_by        INT NOT NULL,
            analysis_data   LONGTEXT,
            insights_data   LONGTEXT,
            included_sections LONGTEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id),
            FOREIGN KEY (saved_by) REFERENCES users(user_id)
        )
    """)

    # Auditor workspaces table. Provides dedicated personal workspace view per auditor, engagement, and section.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auditor_workspaces (
            workspace_id    INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL,
            engagement_id   INT NOT NULL,
            section_id      INT NULL,
            file_id         VARCHAR(255) NULL,
            status          VARCHAR(50) DEFAULT 'active',
            notes           TEXT,
            progress_data   LONGTEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_eng_sec (user_id, engagement_id, section_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (engagement_id) REFERENCES engagements(engagement_id),
            FOREIGN KEY (section_id) REFERENCES audit_sections(section_id)
        )
    """)

    # Workflow stages table. Tracks the current stage of the audit workflow for each file.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workflow_stages (
            id                          INT AUTO_INCREMENT PRIMARY KEY,
            file_id                     VARCHAR(255) NOT NULL,
            client_id                   VARCHAR(255) NOT NULL,
            file_type                   VARCHAR(100) NOT NULL DEFAULT 'general',
            current_stage               VARCHAR(100) DEFAULT 'clean',
            tb_validation_completed     TINYINT(1) DEFAULT 0,
            account_mapping_completed   TINYINT(1) DEFAULT 0,
            financial_analysis_completed TINYINT(1) DEFAULT 0,
            tb_validation_result        LONGTEXT NULL,
            tb_validation_checked_at    DATETIME NULL,
            created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_workflow_stage (file_id, client_id)
        )
    """)
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'workflow_stages' AND column_name = 'tb_validation_result'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE workflow_stages ADD COLUMN tb_validation_result LONGTEXT NULL")
    cursor.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = %s AND table_name = 'workflow_stages' AND column_name = 'tb_validation_checked_at'", (DB_CONFIG["database"],))
    if cursor.fetchone()["count"] == 0:
        cursor.execute("ALTER TABLE workflow_stages ADD COLUMN tb_validation_checked_at DATETIME NULL")

    conn.commit()
    conn.close()


def normalize_mapped_to(mapped_to: str) -> str:
    """
    Normalize a mapped_to value to its canonical form.
    
    Rules:
    - Empty/missing values → "unknown"
    - Convert to lowercase, trim whitespace, replace spaces with underscores
    - Already canonical → unchanged
    - Known alias → canonical form
    - Unknown value → preserved as-is with warning logged
    
    This ensures that both AI-generated and user-edited mappings are
    normalized to a consistent canonical vocabulary before database storage.
    """
    if not mapped_to or mapped_to.strip() == "":
        return "unknown"
    
    # Normalize: lowercase, trim, replace spaces with underscores (consistent with frontend)
    normalized = re.sub(r'\s+', '_', mapped_to.strip().lower())
    
    # If already canonical, return as-is
    if normalized in CANONICAL_FIELDS:
        return normalized
    
    # Check if it's a known alias
    if normalized in CANONICAL_ALIASES:
        canonical = CANONICAL_ALIASES[normalized]
        return canonical
    
    # Unknown mapping - preserve as-is but log for vocabulary review
    logger.warning(
        f"Unrecognized mapped_to value: '{mapped_to}' => '{normalized}'. "
        f"Consider adding to CANONICAL_ALIASES if this is a valid field name variant."
    )
    return normalized


# Save a confirmed column mapping for a client to the database.
# Mapping is a dict of { "original_column": { "mapped_to": "amount", "field_type": "numeric" } }
# Deletes old mappings for this client+file_id first, then re-inserts — this is intentional so
# removed columns don't linger from a previous mapping round.
def save_mapping(client_id: str, file_type: str, mapping: dict, confirmed_by: str = None, fingerprint: str = None, file_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    
    # Use file_id for deletion if provided (file-specific mapping), otherwise fall back to fingerprint or file_type
    if file_id:
        cursor.execute(
            "DELETE FROM column_mappings WHERE client_id = %s AND file_id = %s",
            (client_id, file_id)
        )
    elif fingerprint:
        cursor.execute(
            "DELETE FROM column_mappings WHERE client_id = %s AND fingerprint = %s",
            (client_id, fingerprint)
        )
    else:
        cursor.execute(
            "DELETE FROM column_mappings WHERE client_id = %s AND file_type = %s",
            (client_id, file_type)
        )
        
    for original_column, info in mapping.items():
        # Handle both old format (string) and new format (dict) for backwards compatibility
        if isinstance(info, dict):
            raw_mapped_to    = str(info.get("mapped_to", "unknown"))
            mapped_to        = normalize_mapped_to(raw_mapped_to)  # Normalize to canonical form
            field_type       = str(info.get("field_type", "unknown"))
            reviewed_unknown = 1 if info.get("reviewed_unknown") else 0
            required         = 1 if info.get("required", True) else 0
        else:
            raw_mapped_to    = str(info)
            mapped_to        = normalize_mapped_to(raw_mapped_to)  # Normalize to canonical form
            field_type       = "unknown"
            reviewed_unknown = 0
            required         = 1
        
        # Use fingerprint if provided, otherwise use file_type as fallback
        effective_fingerprint = fingerprint if fingerprint else f"{file_type}_default"
        
        cursor.execute("""
            INSERT INTO column_mappings
                (client_id, file_type, original_column, mapped_to, field_type, reviewed_unknown, required, confirmed_by, updated_at, fingerprint, file_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s, %s)
            ON DUPLICATE KEY UPDATE
                mapped_to        = VALUES(mapped_to),
                field_type       = VALUES(field_type),
                reviewed_unknown = VALUES(reviewed_unknown),
                required         = VALUES(required),
                confirmed_by     = VALUES(confirmed_by),
                updated_at       = CURRENT_TIMESTAMP
        """, (client_id, file_type, original_column, mapped_to, field_type, reviewed_unknown, required, confirmed_by, effective_fingerprint, file_id))
    conn.commit()
    conn.close()


# Function to Save all the account mappings in the database 
def save_account_mapping(client_id: str, file_type: str, accounts: list, confirmed_by: str = None):
    """
    Saves a confirmed category classifications and also deletes existing entries for this client)
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM account_mappings WHERE client_id = %s AND file_type = %s",
        (client_id, file_type)
    )
    for acc in accounts:
        cursor.execute("""
            INSERT INTO account_mappings
                (client_id, file_type, account_name, category, warning_acknowledged, confirmed_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            client_id, file_type, acc["account_name"], acc["category"],
            1 if acc.get("warning_acknowledged") else 0, confirmed_by
        ))
    conn.commit()
    conn.close()
    
# Function to retrieve saved account mappings for a client and file type
def get_account_mapping(client_id: str, file_type: str = "general") -> dict:
    """
    Retrieve saved account mappings for a client and file type.
    Returns {account_name: {"category": ..., "warning_acknowledged": bool}}.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT account_name, category, warning_acknowledged
        FROM account_mappings
        WHERE client_id = %s AND file_type = %s
    """, (client_id, file_type))
    rows = cursor.fetchall()
    conn.close()
    return {
        row["account_name"]: {
            "category": row["category"],
            "warning_acknowledged": bool(row["warning_acknowledged"]),
        }
        for row in rows
    }
# Save a schema fingerprint, keyed by client + fingerprint + REAL file_type category.
# ON DUPLICATE KEY UPDATE id = id is intentional, we only want to record that a fingerprint was
# seen, not overwrite it with a newer timestamp on repeated uploads of the same schema.
def save_fingerprint(client_id: str, fingerprint: str, file_type: str, columns: list):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO schema_fingerprints
            (client_id, fingerprint, file_type, columns_snapshot)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE id = id
    """, (client_id, fingerprint, file_type, json.dumps(columns)))
    conn.commit()
    conn.close()

# Check if a schema fingerprint already exists for a client and a file type.
def get_fingerprint(client_id: str, fingerprint: str, file_type: str = "general") -> bool:
    """
    Check if a schema fingerprint already exists for a client AND file type.
    Filtering by file_type prevents two different file types that happen to share
    the same column-name structure from incorrectly matching each other's cache entry.
    Returns True if found, False otherwise.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id FROM schema_fingerprints
            WHERE client_id = %s AND fingerprint = %s AND file_type = %s
        """, (client_id, fingerprint, file_type))
        result = cursor.fetchone()
        return result is not None
    except Exception:
        return False
    finally:
        conn.close()

# Retrieve the saved column mapping for a client and file type.
def get_mapping(client_id: str, file_type: str = "general", fingerprint: str = None, file_id: str = None) -> dict:
    """
    Retrieve the saved column mapping for a client and file type/fingerprint/file_id.
    Returns a dict of { "original_column": { "mapped_to": ..., "field_type": ..., "reviewed_unknown": ..., "required": ... } }
    Returns empty dict if no mapping has been saved for this client yet.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Use file_id for file-specific mapping retrieval if provided
    if file_id:
        cursor.execute("""
            SELECT original_column, mapped_to, field_type, reviewed_unknown, required
            FROM column_mappings
            WHERE client_id = %s AND file_id = %s
        """, (client_id, file_id))
    elif fingerprint:
        cursor.execute("""
            SELECT original_column, mapped_to, field_type, reviewed_unknown, required
            FROM column_mappings
            WHERE client_id = %s AND fingerprint = %s
        """, (client_id, fingerprint))
    else:
        cursor.execute("""
            SELECT original_column, mapped_to, field_type, reviewed_unknown, required
            FROM column_mappings
            WHERE client_id = %s AND file_type = %s
        """, (client_id, file_type))
    rows = cursor.fetchall()
    conn.close()
    if not rows:
        return {}
    return {
        row["original_column"]: {
            "mapped_to":        row["mapped_to"],
            "field_type":       row["field_type"],
            "reviewed_unknown": bool(row.get("reviewed_unknown", 0)),
            "required":         bool(row.get("required", 1)),
        }
        for row in rows
    }


# Save an upload record to the database after a file is successfully uploaded.
# ON DUPLICATE KEY UPDATE prevents duplicate records if the same file_id is uploaded twice.
def save_upload(file_id: str, client_id: str, filename: str, file_type: str, rows: int, section_id: int = None, header_row_index: int = None, sheet_name: str = None, engagement_id: int = None, uploaded_by: int = None, selected_sheets: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO uploads (file_id, client_id, filename, file_type, row_count, section_id, header_row_index, sheet_name, engagement_id, uploaded_by, selected_sheets)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            filename = VALUES(filename),
            file_type = VALUES(file_type),
            row_count = VALUES(row_count),
            section_id = VALUES(section_id),
            header_row_index = VALUES(header_row_index),
            sheet_name = VALUES(sheet_name),
            engagement_id = VALUES(engagement_id),
            uploaded_by = VALUES(uploaded_by),
            selected_sheets = VALUES(selected_sheets),
            upload_time = CURRENT_TIMESTAMP,
            upload_date = CURRENT_TIMESTAMP
        """,
        (file_id, client_id, filename, file_type, rows, section_id, header_row_index, sheet_name, engagement_id, uploaded_by, selected_sheets)
    )
    conn.commit()
    conn.close()


# Get a single upload record by file_id, including header parsing configuration
def get_upload(file_id: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM uploads WHERE file_id = %s LIMIT 1", (file_id,))
    row = cursor.fetchone()
    conn.close()
    return row

# Get all upload records for a client ordered by most recent first.
# Returns an empty list if the client has no uploads yet.
def get_uploads(client_id: str) -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.*, c.company_name
        FROM uploads u
        LEFT JOIN clients c ON u.client_id = c.client_id
        WHERE u.client_id = %s
        ORDER BY u.upload_time DESC
    """, (client_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# Save an auditor acknowledgment for a specific issue in a file.
def save_cleaning_acknowledgment(
    issue_id: str,
    file_id: str,
    client_id: str,
    file_type: str,
    issue: dict,
    acknowledged_by: str = None,
):
    """
    Persist an auditor acknowledgment for an issue they've accepted as valid.
    Stores individual columns (not a JSON blob) so rows are queryable and self-describing.
    ON DUPLICATE KEY UPDATE lets the auditor re-acknowledge an issue without creating a duplicate.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO cleaning_acknowledgments
            (issue_id, file_id, client_id, file_type, row_index, excel_row, column_name,
             original_value, issue_message, acknowledged_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            acknowledged_by = VALUES(acknowledged_by),
            created_at = CURRENT_TIMESTAMP
    """, (
        issue_id,
        file_id,
        client_id,
        file_type,
        str(issue.get("row_index", "")),
        str(issue.get("row", "")),
        issue.get("column"),
        str(issue.get("original_value", "")),
        issue.get("issue"),
        acknowledged_by,
    ))
    conn.commit()
    conn.close()

# Retrieve all acknowledged issue IDs for a specific file and client.
def get_acknowledged_issue_ids(file_id: str, client_id: str, file_type: str) -> set:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT issue_id FROM cleaning_acknowledgments
            WHERE file_id = %s AND client_id = %s AND file_type = %s
        """, (file_id, client_id, file_type))
        return {row["issue_id"] for row in cursor.fetchall()}
    except Exception:
        return set()
    finally:
        conn.close()

# Save all auditor corrections for a file in a single batch.
def save_cleaning_corrections(
    file_id: str,
    client_id: str,
    file_type: str,
    corrections: list,
    corrected_by: str = None,
):
    """
    Persist per-cell corrections made by the auditor (inline edits, row deletions, column deletions).
    One DB row per corrected cell — the UNIQUE KEY means re-correcting the same cell upserts in place,
    so corrections accumulate safely across multiple editing rounds without duplication.
    """
    conn = get_connection()
    cursor = conn.cursor()
    for correction in corrections:
        cursor.execute("""
            INSERT INTO cleaning_corrections
                (file_id, client_id, file_type, row_index, column_name, original_value,
                 corrected_value, corrected_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                original_value  = VALUES(original_value),
                corrected_value = VALUES(corrected_value),
                corrected_by    = VALUES(corrected_by),
                updated_at      = CURRENT_TIMESTAMP
        """, (
            file_id,
            client_id,
            file_type,
            int(correction["row_index"]),
            correction["column"],
            str(correction.get("original_value", "")),
            str(correction.get("corrected_value", "")),
            corrected_by,
        ))
    conn.commit()
    conn.close()

# Retrieve all saved corrections for a file, to apply them before running cleaning again.
def get_cleaning_corrections(file_id: str, client_id: str, file_type: str) -> list:
    """
    Return all saved corrections for a file as a list of dicts with row_index, column_name,
    corrected_value. The caller (apply_saved_corrections) uses these to patch the dataframe
    before cleaning runs.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT row_index, column_name, corrected_value
            FROM cleaning_corrections
            WHERE file_id = %s AND client_id = %s AND file_type = %s
        """, (file_id, client_id, file_type))
        return [dict(row) for row in cursor.fetchall()]
    except Exception:
        return []
    finally:
        conn.close()

# Save a snapshot of the cleaned data for a file, to compare against a later re-uploaded corrected file.
def save_cleaning_snapshot(file_id: str, client_id: str, file_type: str, cleaned_df):
    """
    Save the cleaned data exactly as it looked at the moment an Excel export was generated.
    Row indices are preserved via reset_index so the diff can match rows correctly.
    Overwrites any previous snapshot for this file_id + client_id + file_type.
    """
    conn = get_connection()
    cursor = conn.cursor()
    snapshot_json = cleaned_df.reset_index().rename(columns={"index": "_row_index"}).to_json(orient="records")
    cursor.execute("""
        INSERT INTO cleaning_snapshots (file_id, client_id, file_type, snapshot_data)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            snapshot_data = VALUES(snapshot_data),
            created_at = CURRENT_TIMESTAMP
    """, (file_id, client_id, file_type, snapshot_json))
    conn.commit()
    conn.close()

# Retrieve a saved cleaning snapshot, loading it back from JSON into a list of dicts.
def get_cleaning_snapshot(file_id: str, client_id: str, file_type: str):
    """
    Retrieve the saved cleaned-data snapshot for comparison against a re-uploaded corrected file.
    Returns a list of row dicts (with _row_index), or None if no snapshot was ever saved.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT snapshot_data FROM cleaning_snapshots
            WHERE file_id = %s AND client_id = %s AND file_type = %s
        """, (file_id, client_id, file_type))
        row = cursor.fetchone()
        if not row:
            return None
        return json.loads(row["snapshot_data"])
    except Exception:
        return None
    finally:
        conn.close()

# Check if all audit sections for an engagement are completed
def check_all_sections_completed(engagement_id: int) -> dict:
    
    """
    Check if all audit sections for an engagement are completed.

    "Completed" is derived from the latest submission per section having
    status 'Approved' — the same signal fetch_engagement_progress() uses
    for the engagement's display_status — NOT from audit_sections.status,
    which is a free-text field only ever set by a human via the manual
    section-edit endpoint and is not tied to the actual approval workflow.
    A section with no submissions at all is treated as pending.

    Sections marked in_scope=0 are excluded from all_completed/pending —
    they are never required for report generation — and are reported
    separately in excluded_sections so callers can still show them
    (e.g. "Cash & Bank — Not in Scope") rather than silently dropping them.

    Returns a dict with:
    - all_completed: bool indicating if all IN-SCOPE sections are approved
    - completed_sections: list of approved, in-scope section names
    - pending_sections: list of not-yet-approved, in-scope section names
    - excluded_sections: list of out-of-scope section names (not required)
    - total_sections: total number of in-scope sections
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT sec.section_name,
               sec.in_scope,
               latest.status AS latest_status
        FROM audit_sections sec
        LEFT JOIN (
            SELECT section_id, status,
                   ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY created_at DESC) AS rn
            FROM submissions
            WHERE engagement_id = %s
        ) latest ON latest.section_id = sec.section_id AND latest.rn = 1
        WHERE sec.engagement_id = %s
    """, (engagement_id, engagement_id))

    sections = cursor.fetchall()
    conn.close()

    in_scope_sections = [s for s in sections if s['in_scope']]
    excluded_sections = [s['section_name'] for s in sections if not s['in_scope']]

    completed_sections = [s['section_name'] for s in in_scope_sections if s['latest_status'] == 'Approved']
    pending_sections = [s['section_name'] for s in in_scope_sections if s['latest_status'] != 'Approved']

    return {
        'all_completed': len(in_scope_sections) > 0 and len(pending_sections) == 0,
        'completed_sections': completed_sections,
        'pending_sections': pending_sections,
        'excluded_sections': excluded_sections,
        'total_sections': len(in_scope_sections)
    }

# Get all section data for an engagement (for combined report generation)
def get_all_sections_data(engagement_id: int) -> dict:
    """
    Get all section data for an engagement to use in combined report generation.
    Returns a dict with section names as keys and their latest submission data as values.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT sec.section_name, s.status, s.current_stage, s.notes, s.created_at
        FROM audit_sections sec
        LEFT JOIN submissions s ON sec.section_id = s.section_id
        WHERE sec.engagement_id = %s
        ORDER BY sec.section_name, s.created_at DESC
    """, (engagement_id,))
    
    rows = cursor.fetchall()
    conn.close()
    
    # Group by section name and take the latest submission for each
    sections_data = {}
    for row in rows:
        section_name = row['section_name']
        if section_name not in sections_data:
            sections_data[section_name] = {
                'section_name': section_name,
                'status': row['status'] or 'Pending',
                'current_stage': row['current_stage'],
                'notes': row['notes'],
                'latest_submission_date': row['created_at']
            }
    
    return sections_data

# Save the final cleaned version of a file to the cleaned_files_registry table.
def save_cleaned_registry(file_id: str, client_id: str, file_type: str, cleaned_df, report: dict, filename: str = None):
    """
    Saves (or overwrites) the current cleaned version of a file. Called every
    time cleaning finishes, from inside run_cleaning_cycle, so it always
    reflects the latest state regardless of which correction path was used.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cleaned_json = json.dumps(cleaned_df.fillna("").astype(str).to_dict(orient="records"))
    total_issues = report.get("total_issues", 0)
    can_proceed = 1 if report.get("can_proceed", False) else 0

    cursor.execute("""
        INSERT INTO cleaned_files_registry
            (file_id, client_id, file_type, filename, cleaned_data, total_issues, can_proceed)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            cleaned_data = VALUES(cleaned_data),
            total_issues = VALUES(total_issues),
            can_proceed = VALUES(can_proceed),
            filename = COALESCE(VALUES(filename), filename),
            updated_at = CURRENT_TIMESTAMP
    """, (file_id, client_id, file_type, filename, cleaned_json, total_issues, can_proceed))
    conn.commit()
    conn.close()

# Retrieve a list of all files that have a cleaned version saved for a client, most recently updated first.
def get_cleaned_files_for_client(client_id: str) -> list:
    """
    Returns every file that has a cleaned version saved for this client,
    most recently updated first. Does not include the full cleaned_data
    (too large for a list view) — use get_cleaned_file_data for that.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT file_id, client_id, file_type, filename, total_issues, can_proceed, updated_at
        FROM cleaned_files_registry
        WHERE client_id = %s
        ORDER BY updated_at DESC
    """, (client_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows

# Retrieve the full cleaned data for a specific file, or None if no cleaned version exists.
def get_cleaned_file_data(file_id: str, client_id: str, file_type: str):
    """
    Returns the full cleaned data (as a list of row dicts) for one specific
    file, or None if no cleaned version has been saved for it yet.
    """
    import json
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT filename, cleaned_data, total_issues, can_proceed, updated_at
        FROM cleaned_files_registry
        WHERE file_id = %s AND client_id = %s AND file_type = %s
    """, (file_id, client_id, file_type))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    row["cleaned_data"] = json.loads(row["cleaned_data"])
    return row

# Save a financial analysis result to the database
def save_analysis(user_id: int, client_id: str, engagement_id: int, file_id: str, file_type: str, analysis_data: dict, insights_data: list = None):
    conn = get_connection()
    cursor = conn.cursor()
    analysis_json = json.dumps(analysis_data) if analysis_data else None
    insights_json = json.dumps(insights_data) if insights_data else None
    
    cursor.execute("""
        INSERT INTO saved_analyses (user_id, client_id, engagement_id, file_id, file_type, analysis_data, insights_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (user_id, client_id, engagement_id, file_id, file_type, analysis_json, insights_json))
    
    conn.commit()
    conn.close()
    return cursor.lastrowid

# Get all saved analyses for a user, most recent first
def get_saved_analyses(user_id: int) -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sa.*, c.company_name, e.engagement_name
        FROM saved_analyses sa
        LEFT JOIN clients c ON sa.client_id = c.client_id
        LEFT JOIN engagements e ON sa.engagement_id = e.engagement_id
        WHERE sa.user_id = %s
        ORDER BY sa.created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    # Parse JSON fields
    for row in rows:
        if row.get('analysis_data'):
            row['analysis_data'] = json.loads(row['analysis_data'])
        if row.get('insights_data'):
            row['insights_data'] = json.loads(row['insights_data'])
    
    return rows

# Get all saved analyses for an engagement, most recent first — this is
# team-scoped rather than user-scoped: every snapshot saved by anyone for
# this engagement is returned, along with who saved it (saved_by_name), so
# the caller can group by file_id and show a per-file history with
# attribution ("who changed what, and when").
def get_saved_analyses_for_engagement(engagement_id: int) -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sa.*, c.company_name, e.engagement_name, u.full_name AS saved_by_name
        FROM saved_analyses sa
        LEFT JOIN clients c ON sa.client_id = c.client_id
        LEFT JOIN engagements e ON sa.engagement_id = e.engagement_id
        LEFT JOIN users u ON sa.user_id = u.user_id
        WHERE sa.engagement_id = %s
        ORDER BY sa.file_id, sa.created_at DESC
    """, (engagement_id,))
    rows = cursor.fetchall()
    conn.close()

    for row in rows:
        if row.get('analysis_data'):
            row['analysis_data'] = json.loads(row['analysis_data'])
        if row.get('insights_data'):
            row['insights_data'] = json.loads(row['insights_data'])

    return rows

# Get saved analyses for a specific engagement AND specific file — this is
# what an auditor needs when working on a particular file within an engagement.
# Returns all analysis snapshots for that file, with attribution showing who
# saved each one and when, so they can see the history for just that file.
# Matches analyses saved for this specific engagement OR analyses saved without
# an engagement (for backward compatibility).
def get_saved_analyses_for_file(engagement_id: int, file_id: str) -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sa.*, c.company_name, e.engagement_name, u.full_name AS saved_by_name
        FROM saved_analyses sa
        LEFT JOIN clients c ON sa.client_id = c.client_id
        LEFT JOIN engagements e ON sa.engagement_id = e.engagement_id
        LEFT JOIN users u ON sa.user_id = u.user_id
        WHERE sa.file_id = %s AND (sa.engagement_id = %s OR sa.engagement_id IS NULL)
        ORDER BY sa.created_at DESC
    """, (file_id, engagement_id))
    rows = cursor.fetchall()
    conn.close()

    for row in rows:
        if row.get('analysis_data'):
            row['analysis_data'] = json.loads(row['analysis_data'])
        if row.get('insights_data'):
            row['insights_data'] = json.loads(row['insights_data'])

    return rows


# Get a specific saved analysis by ID
def get_saved_analysis(analysis_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sa.*, c.company_name, e.engagement_name
        FROM saved_analyses sa
        LEFT JOIN clients c ON sa.client_id = c.client_id
        LEFT JOIN engagements e ON sa.engagement_id = e.engagement_id
        WHERE sa.analysis_id = %s
    """, (analysis_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        if row.get('analysis_data'):
            row['analysis_data'] = json.loads(row['analysis_data'])
        if row.get('insights_data'):
            row['insights_data'] = json.loads(row['insights_data'])
    
    return row

# Delete a saved analysis
def delete_saved_analysis(analysis_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM saved_analyses WHERE analysis_id = %s", (analysis_id,))
    conn.commit()
    conn.close()


# Workflow stages helper functions
def get_workflow_stage(file_id: str, client_id: str, file_type: str = "general") -> dict:
    """
    Get the current workflow stage for a file.
    Returns None if no workflow record exists.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT current_stage, tb_validation_completed, account_mapping_completed, financial_analysis_completed,
               tb_validation_result, tb_validation_checked_at
        FROM workflow_stages
        WHERE file_id = %s AND client_id = %s
    """, (file_id, client_id))
    result = cursor.fetchone()
    conn.close()
    if result and result.get("tb_validation_result") and isinstance(result["tb_validation_result"], str):
        try:
            result["tb_validation_result"] = json.loads(result["tb_validation_result"])
        except Exception:
            pass
    return result

def update_workflow_stage(file_id: str, client_id: str, file_type: str, stage: str):
    """
    Update the current workflow stage for a file.
    Creates record if it doesn't exist.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO workflow_stages (file_id, client_id, file_type, current_stage)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE file_type = %s, current_stage = %s, updated_at = CURRENT_TIMESTAMP
    """, (file_id, client_id, file_type, stage, file_type, stage))
    conn.commit()
    conn.close()

def save_tb_validation_result(file_id: str, client_id: str, file_type: str, validation_result: dict):
    """
    Persist the latest TB validation result so the page can be restored after
    a refresh or interruption.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO workflow_stages (
            file_id, client_id, file_type, current_stage,
            tb_validation_result, tb_validation_checked_at
        )
        VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            file_type = VALUES(file_type),
            current_stage = VALUES(current_stage),
            tb_validation_result = VALUES(tb_validation_result),
            tb_validation_checked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """,
        (file_id, client_id, file_type, "tb_validation", json.dumps(validation_result))
    )
    conn.commit()
    conn.close()

def clear_tb_validation_result(file_id: str, client_id: str, file_type: str):
    """
    Clear the cached TB validation snapshot when a corrected upload changes
    the file structure and the previous result is no longer trustworthy.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO workflow_stages (file_id, client_id, file_type, current_stage)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            file_type = VALUES(file_type),
            current_stage = VALUES(current_stage),
            tb_validation_result = NULL,
            tb_validation_checked_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        """,
        (file_id, client_id, file_type, "uploaded")
    )
    conn.commit()
    conn.close()

def mark_workflow_step_completed(file_id: str, client_id: str, file_type: str, step: str):
    """
    Mark a specific workflow step as completed.
    step can be: 'tb_validation', 'account_mapping', 'financial_analysis'
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    if step == 'tb_validation':
        cursor.execute("""
            INSERT INTO workflow_stages (file_id, client_id, file_type, tb_validation_completed)
            VALUES (%s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE file_type = %s, tb_validation_completed = 1, updated_at = CURRENT_TIMESTAMP
        """, (file_id, client_id, file_type, file_type))
    elif step == 'account_mapping':
        cursor.execute("""
            INSERT INTO workflow_stages (file_id, client_id, file_type, account_mapping_completed)
            VALUES (%s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE file_type = %s, account_mapping_completed = 1, updated_at = CURRENT_TIMESTAMP
        """, (file_id, client_id, file_type, file_type))
    elif step == 'financial_analysis':
        cursor.execute("""
            INSERT INTO workflow_stages (file_id, client_id, file_type, financial_analysis_completed)
            VALUES (%s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE file_type = %s, financial_analysis_completed = 1, updated_at = CURRENT_TIMESTAMP
        """, (file_id, client_id, file_type, file_type))
    
    conn.commit()
    conn.close()

def initialize_workflow_stage(file_id: str, client_id: str, file_type: str):
    """
    Initialize workflow stage when a file is cleaned.
    Sets the appropriate starting stage based on file_type.
    Only bails out if stage has genuinely progressed past 'mapped' —
    'mapped' is treated as a pre-cleaning placeholder that can be overwritten.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT current_stage FROM workflow_stages 
        WHERE file_id = %s AND client_id = %s
    """, (file_id, client_id))
    existing = cursor.fetchone()

    # 'mapped' is just the pre-cleaning placeholder /save-mapping writes —
    # treat it the same as "no row yet", not as an already-progressed stage
    if existing and existing["current_stage"] != "mapped":
        conn.close()
        return

    cursor.execute("""
        SELECT can_proceed FROM cleaned_files_registry 
        WHERE file_id = %s AND client_id = %s AND file_type = %s
    """, (file_id, client_id, file_type))
    cleaned = cursor.fetchone()

    if file_type == 'trial_balance':
        starting_stage = 'tb_validation'
    elif file_type in ['general_ledger', 'accounts_receivable', 'accounts_payable']:
        starting_stage = 'account_mapping'
    else:
        can_proceed = cleaned['can_proceed'] if cleaned else False
        starting_stage = 'financial_analysis' if can_proceed else 'clean'

    cursor.execute("""
        INSERT INTO workflow_stages (file_id, client_id, file_type, current_stage)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE current_stage = VALUES(current_stage), updated_at = CURRENT_TIMESTAMP
    """, (file_id, client_id, file_type, starting_stage))

    conn.commit()
    conn.close()


# Auditor Workspaces helper functions
def get_or_create_workspace(user_id: int, engagement_id: int, section_id: int = None, file_id: str = None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    if section_id:
        cursor.execute("""
            SELECT w.*, e.engagement_name, c.company_name, s.section_name, u.full_name as user_name
            FROM auditor_workspaces w
            JOIN engagements e ON w.engagement_id = e.engagement_id
            JOIN clients c ON e.client_id = c.client_id
            LEFT JOIN audit_sections s ON w.section_id = s.section_id
            JOIN users u ON w.user_id = u.user_id
            WHERE w.user_id = %s AND w.engagement_id = %s AND w.section_id = %s
        """, (user_id, engagement_id, section_id))
    else:
        cursor.execute("""
            SELECT w.*, e.engagement_name, c.company_name, s.section_name, u.full_name as user_name
            FROM auditor_workspaces w
            JOIN engagements e ON w.engagement_id = e.engagement_id
            JOIN clients c ON e.client_id = c.client_id
            LEFT JOIN audit_sections s ON w.section_id = s.section_id
            JOIN users u ON w.user_id = u.user_id
            WHERE w.user_id = %s AND w.engagement_id = %s AND w.section_id IS NULL
        """, (user_id, engagement_id))
        
    workspace = cursor.fetchone()
    
    if not workspace:
        default_progress = json.dumps({
            "mapping_completed": False,
            "cleaning_completed": False,
            "analysis_completed": False,
            "submitted_for_review": False
        })
        cursor.execute("""
            INSERT INTO auditor_workspaces (user_id, engagement_id, section_id, file_id, status, notes, progress_data)
            VALUES (%s, %s, %s, %s, 'active', '', %s)
        """, (user_id, engagement_id, section_id, file_id, default_progress))
        conn.commit()
        ws_id = cursor.lastrowid
        
        cursor.execute("""
            SELECT w.*, e.engagement_name, c.company_name, s.section_name, u.full_name as user_name
            FROM auditor_workspaces w
            JOIN engagements e ON w.engagement_id = e.engagement_id
            JOIN clients c ON e.client_id = c.client_id
            LEFT JOIN audit_sections s ON w.section_id = s.section_id
            JOIN users u ON w.user_id = u.user_id
            WHERE w.workspace_id = %s
        """, (ws_id,))
        workspace = cursor.fetchone()
    elif file_id and workspace.get('file_id') != file_id:
        cursor.execute("UPDATE auditor_workspaces SET file_id = %s WHERE workspace_id = %s", (file_id, workspace['workspace_id']))
        conn.commit()
        workspace['file_id'] = file_id

    # Auto-resolve file_id from uploads table if file_id is missing
    if workspace and not workspace.get('file_id'):
        if workspace.get('section_id'):
            # Prefer the file actually tagged for this section
            cursor.execute("""
                SELECT file_id, filename, file_type 
                FROM uploads 
                WHERE section_id = %s
                ORDER BY upload_date DESC LIMIT 1
            """, (workspace['section_id'],))
            latest_file = cursor.fetchone()
        else:
            latest_file = None

        if not latest_file:
            cursor.execute("""
                SELECT f.file_id, f.filename, f.file_type 
                FROM uploads f
                JOIN engagements e ON CAST(f.client_id AS CHAR) = CAST(e.client_id AS CHAR)
                WHERE e.engagement_id = %s
                ORDER BY f.upload_date DESC LIMIT 1
            """, (workspace['engagement_id'],))
            latest_file = cursor.fetchone()

        if latest_file:
            auto_file_id = latest_file['file_id']
            cursor.execute("UPDATE auditor_workspaces SET file_id = %s WHERE workspace_id = %s", (auto_file_id, workspace['workspace_id']))
            conn.commit()
            workspace['file_id'] = auto_file_id
            workspace['filename'] = latest_file.get('filename')
            workspace['file_type'] = latest_file.get('file_type')

    # Fetch filename and file_type if file_id is set
    if workspace and workspace.get('file_id') and not workspace.get('filename'):
        cursor.execute("SELECT filename, file_type FROM uploads WHERE file_id = %s LIMIT 1", (workspace['file_id'],))
        f_info = cursor.fetchone()
        if f_info:
            workspace['filename'] = f_info.get('filename')
            workspace['file_type'] = f_info.get('file_type')

    conn.close()

    if workspace and workspace.get('progress_data'):
        try:
            if isinstance(workspace['progress_data'], str):
                workspace['progress_data'] = json.loads(workspace['progress_data'])
        except Exception:
            pass

    return workspace


def get_workspace_by_id(workspace_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT w.*, e.engagement_name, e.financial_year, c.company_name, c.client_id, s.section_name, u.full_name as user_name
        FROM auditor_workspaces w
        JOIN engagements e ON w.engagement_id = e.engagement_id
        JOIN clients c ON e.client_id = c.client_id
        LEFT JOIN audit_sections s ON w.section_id = s.section_id
        JOIN users u ON w.user_id = u.user_id
        WHERE w.workspace_id = %s
    """, (workspace_id,))
    workspace = cursor.fetchone()

    if workspace:
        if not workspace.get('file_id'):
            cursor.execute("""
                SELECT f.file_id, f.filename, f.file_type, f.client_id as upload_client_id 
                FROM uploads f
                JOIN engagements e ON CAST(f.client_id AS CHAR) = CAST(e.client_id AS CHAR)
                WHERE e.engagement_id = %s
                ORDER BY f.upload_date DESC LIMIT 1
            """, (workspace['engagement_id'],))
            latest_file = cursor.fetchone()
            if latest_file:
                auto_file_id = latest_file['file_id']
                cursor.execute("UPDATE auditor_workspaces SET file_id = %s WHERE workspace_id = %s", (auto_file_id, workspace['workspace_id']))
                conn.commit()
                workspace['file_id'] = auto_file_id
                workspace['filename'] = latest_file.get('filename')
                workspace['file_type'] = latest_file.get('file_type')
                workspace['client_id'] = latest_file.get('upload_client_id')  # Use the upload client_id (VARCHAR)
        
        # If workspace has file_id but client_id is still INT from clients table, update it to match uploads table
        if workspace.get('file_id'):
            cursor.execute("SELECT client_id FROM uploads WHERE file_id = %s LIMIT 1", (workspace['file_id'],))
            upload_client = cursor.fetchone()
            if upload_client:
                workspace['client_id'] = upload_client['client_id']  # Use the upload client_id (VARCHAR)
        
        if workspace.get('file_id') and not workspace.get('filename'):
            cursor.execute("SELECT filename, file_type, client_id FROM uploads WHERE file_id = %s LIMIT 1", (workspace['file_id'],))
            f_info = cursor.fetchone()
            if f_info:
                workspace['filename'] = f_info.get('filename')
                workspace['file_type'] = f_info.get('file_type')
                workspace['client_id'] = f_info.get('client_id')  # Use the upload client_id (VARCHAR)

    conn.close()

    if workspace and workspace.get('progress_data'):
        try:
            if isinstance(workspace['progress_data'], str):
                workspace['progress_data'] = json.loads(workspace['progress_data'])
        except Exception:
            pass

    return workspace


def update_workspace_data(workspace_id: int, status: str = None, notes: str = None, progress_data: dict = None, file_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    updates = []
    params = []

    if status is not None:
        updates.append("status = %s")
        params.append(status)
    if notes is not None:
        updates.append("notes = %s")
        params.append(notes)
    if progress_data is not None:
        updates.append("progress_data = %s")
        params.append(json.dumps(progress_data))
    if file_id is not None:
        updates.append("file_id = %s")
        params.append(file_id)

    if updates:
        query = f"UPDATE auditor_workspaces SET {', '.join(updates)} WHERE workspace_id = %s"
        params.append(workspace_id)
        cursor.execute(query, tuple(params))
        conn.commit()

    conn.close()


def get_engagement_workspaces(engagement_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT w.*, s.section_name, u.full_name as user_name, u.role as user_role
        FROM auditor_workspaces w
        LEFT JOIN audit_sections s ON w.section_id = s.section_id
        JOIN users u ON w.user_id = u.user_id
        WHERE w.engagement_id = %s
        ORDER BY w.updated_at DESC
    """, (engagement_id,))
    workspaces = cursor.fetchall()
    conn.close()

    for ws in workspaces:
        if ws.get('progress_data'):
            try:
                if isinstance(ws['progress_data'], str):
                    ws['progress_data'] = json.loads(ws['progress_data'])
            except Exception:
                pass

    return workspaces

def get_user_workspaces(user_id: int):
    """
    Returns every workspace belonging to a single user, across all
    engagements — used for the Auditor's "My Workspaces" dashboard so they
    can resume any in-progress file without needing the original notification.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT w.*, e.engagement_name, e.financial_year, c.company_name, s.section_name
        FROM auditor_workspaces w
        JOIN engagements e ON w.engagement_id = e.engagement_id
        JOIN clients c ON e.client_id = c.client_id
        LEFT JOIN audit_sections s ON w.section_id = s.section_id
        WHERE w.user_id = %s
        ORDER BY w.updated_at DESC
    """, (user_id,))
    workspaces = cursor.fetchall()
    conn.close()

    for ws in workspaces:
        if ws.get('progress_data'):
            try:
                if isinstance(ws['progress_data'], str):
                    ws['progress_data'] = json.loads(ws['progress_data'])
            except Exception:
                pass

    return workspaces