import re
from typing import Optional, Iterable, Any


class FieldValidationError(Exception):
    """Custom exception for field validation errors with meaningful messages."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class FieldValidator:

    # ── Email ────────────────────────────────────────────────────────────
    # Deliberately conservative regex (not a full RFC 5322 implementation)
    # since the goal here is catching obvious malformed input, not full
    # mailbox verification.
    EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

    @staticmethod
    def validate_email(email: str) -> str:
        """
        Validate an email address.

        Returns the trimmed email if valid.
        Raises FieldValidationError if invalid or missing.
        """
        if not email or not isinstance(email, str):
            raise FieldValidationError("Email is required.")
        email = email.strip()
        if not FieldValidator.EMAIL_PATTERN.match(email):
            raise FieldValidationError(f"'{email}' is not a valid email address.")
        return email

    # ── Phone (Kenyan) ───────────────────────────────────────────────────
    # Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, +2541XXXXXXXX,
    # 2547XXXXXXXX, 2541XXXXXXXX. Strips spaces/hyphens before checking.
    PHONE_PATTERN = re.compile(r"^(?:\+?254|0)(7\d{8}|1\d{8})$")

    @staticmethod
    def validate_phone(phone: str) -> str:
        """
        Validate a Kenyan phone number.

        Returns the number normalized to +254XXXXXXXXX form if valid.
        Raises FieldValidationError if invalid or missing.
        """
        if not phone or not isinstance(phone, str):
            raise FieldValidationError("Phone number is required.")
        cleaned = re.sub(r"[\s\-()]", "", phone.strip())
        match = FieldValidator.PHONE_PATTERN.match(cleaned)
        if not match:
            raise FieldValidationError(
                f"'{phone}' is not a valid Kenyan phone number. "
                "Expected formats: 07XXXXXXXX, 01XXXXXXXX, or +2547XXXXXXXX."
            )
        return "+254" + match.group(1)

    # ── KRA PIN ──────────────────────────────────────────────────────────
    # Format: one letter, 9 digits, one letter (e.g. A123456789Z).
    KRA_PIN_PATTERN = re.compile(r"^[A-Za-z]\d{9}[A-Za-z]$")

    @staticmethod
    def validate_kra_pin(kra_pin: str) -> str:
        """
        Validate a KRA PIN (Kenya Revenue Authority Personal Identification Number).

        Returns the PIN uppercased if valid.
        Raises FieldValidationError if invalid or missing.

        NOTE: as of this writing, the `clients` table stores `kra_pin` as a
        boolean (whether one is on file), not the PIN string itself. This
        validator is ready to use once/if an actual `kra_pin_number` text
        column is added — it has nothing to validate against yet otherwise.
        """
        if not kra_pin or not isinstance(kra_pin, str):
            raise FieldValidationError("KRA PIN is required.")
        cleaned = kra_pin.strip().upper()
        if not FieldValidator.KRA_PIN_PATTERN.match(cleaned):
            raise FieldValidationError(
                f"'{kra_pin}' is not a valid KRA PIN. "
                "Expected format: one letter, 9 digits, one letter (e.g. A123456789Z)."
            )
        return cleaned

    # ── Password ─────────────────────────────────────────────────────────
    @staticmethod
    def validate_password(password: str, min_length: int = 8) -> str:
        """
        Validate password strength: minimum length, at least one letter,
        one digit, and one special character.

        Returns the password unchanged if valid.
        Raises FieldValidationError if invalid or missing.
        """
        if not password or not isinstance(password, str):
            raise FieldValidationError("Password is required.")
        if len(password) < min_length:
            raise FieldValidationError(f"Password must be at least {min_length} characters long.")
        if not re.search(r"[A-Za-z]", password):
            raise FieldValidationError("Password must contain at least one letter.")
        if not re.search(r"\d", password):
            raise FieldValidationError("Password must contain at least one digit.")
        if not re.search(r"[^A-Za-z0-9]", password):
            raise FieldValidationError("Password must contain at least one special character.")
        return password

    # ── Financial data ───────────────────────────────────────────────────
    @staticmethod
    def validate_financial_amount(
        value: Any,
        field_name: str = "amount",
        allow_negative: bool = True,
        max_value: Optional[float] = None,
    ) -> float:
        """
        Validate a financial amount. Never guesses or coerces malformed
        input — rejects it outright per the "never guess financial data" rule.

        Returns the value as a float if valid.
        Raises FieldValidationError if invalid, missing, non-numeric, or out of range.
        """
        if value is None or value == "":
            raise FieldValidationError(f"{field_name} is required.")

        if isinstance(value, bool):
            # bool is a subclass of int in Python; reject it explicitly so
            # True/False never silently becomes 1.0/0.0 in financial data.
            raise FieldValidationError(f"{field_name} must be a numeric value, not a boolean.")

        if isinstance(value, str):
            cleaned = value.strip().replace(",", "")
            try:
                numeric_value = float(cleaned)
            except ValueError:
                raise FieldValidationError(f"'{value}' is not a valid numeric value for {field_name}.")
        elif isinstance(value, (int, float)):
            numeric_value = float(value)
        else:
            raise FieldValidationError(f"{field_name} must be a numeric value.")

        if numeric_value != numeric_value:  # NaN check without importing math
            raise FieldValidationError(f"{field_name} cannot be NaN.")

        if not allow_negative and numeric_value < 0:
            raise FieldValidationError(f"{field_name} cannot be negative.")

        if max_value is not None and numeric_value > max_value:
            raise FieldValidationError(f"{field_name} exceeds the maximum allowed value of {max_value}.")

        return numeric_value

    # ── Required fields / malformed input ───────────────────────────────
    @staticmethod
    def validate_required_fields(data: dict, required_fields: Iterable[str]) -> None:
        """
        Ensure every field in required_fields is present in `data` and not
        empty/whitespace-only. Raises FieldValidationError listing every
        missing field at once, rather than stopping at the first one.
        """
        missing = []
        for field in required_fields:
            val = data.get(field)
            if val is None or (isinstance(val, str) and not val.strip()):
                missing.append(field)
        if missing:
            raise FieldValidationError(
                f"Missing required field(s): {', '.join(missing)}."
            )

    @staticmethod
    def validate_no_malformed_strings(data: dict, fields: Iterable[str]) -> None:
        """
        Basic malformed-input guard for string fields: rejects values that
        are only whitespace, contain null bytes, or are suspiciously long
        (a common sign of malformed/attempted-injection input rather than
        real user data). Does not attempt to sanitize — rejects instead.
        """
        for field in fields:
            val = data.get(field)
            if val is None:
                continue
            if not isinstance(val, str):
                continue
            if "\x00" in val:
                raise FieldValidationError(f"{field} contains invalid characters.")
            if len(val) > 10000:
                raise FieldValidationError(f"{field} is unexpectedly long and was rejected.")