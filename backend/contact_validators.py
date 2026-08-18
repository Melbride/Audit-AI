
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberType
from email_validator import validate_email as _validate_email_lib, EmailNotValidError


# --- Phone validation --------------------------------------------------------

# Kenyan mobile network prefixes, used only to label WHICH network a number
# belongs to (cosmetic/informational) — validity itself is decided by
# `phonenumbers`, not this table, so it never needs to be kept in sync with
# the numbering plan for correctness, only for the network label.
_KENYA_NETWORK_PREFIXES = {
    "Safaricom": ("0110", "0111", "0112", "0113", "0114", "0115",
                  "070", "071", "072", "074", "079"),
    "Airtel":    ("0100", "0101", "0102", "0103", "0105", "0106",
                  "073", "078", "0100"),
    "Telkom":    ("077",),
    "Equitel":   ("0763", "0764", "0765"),
}


def _guess_kenya_network(national_number_str: str) -> Optional[str]:
    """Best-effort network label based on the national significant number
    (no country code, no leading 0) — informational only, never affects validity."""
    padded = "0" + national_number_str  # re-add the leading 0 dropped by libphonenumber
    for network, prefixes in _KENYA_NETWORK_PREFIXES.items():
        if padded.startswith(prefixes):
            return network
    return None


@dataclass
class PhoneValidationResult:
    valid: bool
    input: str
    e164: Optional[str] = None          # +254712345678
    national_format: Optional[str] = None  # 0712 345678
    is_mobile: Optional[bool] = None
    network: Optional[str] = None
    reason: Optional[str] = None        # populated only when valid is False

    def to_dict(self) -> dict:
        return asdict(self)


def validate_kenyan_phone(raw_number: str) -> PhoneValidationResult:
    """
    Validate a phone number as a real Kenyan number.

    Accepts any common input format:
        0712345678
        712345678
        +254712345678
        254712345678
        0712 345 678   (spaces/dashes are fine)

    Returns a PhoneValidationResult. `valid` is True only if the number:
      - parses successfully under Kenya's numbering plan, AND
      - is a real, currently-assignable number range (not just "9 digits"), AND
      - actually belongs to Kenya's country code (+254) once parsed.
    """
    if not raw_number or not raw_number.strip():
        return PhoneValidationResult(valid=False, input=raw_number, reason="Empty input.")

    cleaned = raw_number.strip()

    try:
        # region="KE" lets bare national numbers like "0712345678" parse
        # correctly; it's ignored if the string already has a country code.
        parsed = phonenumbers.parse(cleaned, "KE")
    except NumberParseException as e:
        return PhoneValidationResult(valid=False, input=raw_number, reason=f"Could not parse: {e}")

    if not phonenumbers.is_valid_number(parsed):
        return PhoneValidationResult(valid=False, input=raw_number, reason="Not a valid, assignable Kenyan number.")

    if phonenumbers.region_code_for_number(parsed) != "KE":
        return PhoneValidationResult(valid=False, input=raw_number, reason="Number is valid, but not a Kenyan number.")

    number_type = phonenumbers.number_type(parsed)
    is_mobile = number_type in (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE)

    national_significant = str(parsed.national_number)
    network = _guess_kenya_network(national_significant) if is_mobile else None

    return PhoneValidationResult(
        valid=True,
        input=raw_number,
        e164=phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
        national_format=phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL),
        is_mobile=is_mobile,
        network=network,
    )


# --- Email validation --------------------------------------------------------

@dataclass
class EmailValidationResult:
    valid: bool
    input: str
    normalized: Optional[str] = None
    domain: Optional[str] = None
    reason: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def validate_real_email(raw_email: str, check_deliverability: bool = True) -> EmailValidationResult:
    """
    Validate an email address.

    check_deliverability=True (default) does a live DNS lookup for the
    domain's MX records, catching typo'd/fake domains that pass regex but
    can never receive mail (e.g. "user@gnail.com"). Set it to False if you
    need offline/syntax-only validation (e.g. in a sandboxed environment
    with no outbound DNS access, or for speed on bulk lists).
    """
    if not raw_email or not raw_email.strip():
        return EmailValidationResult(valid=False, input=raw_email, reason="Empty input.")

    try:
        result = _validate_email_lib(raw_email.strip(), check_deliverability=check_deliverability)
        return EmailValidationResult(
            valid=True,
            input=raw_email,
            normalized=result.normalized,
            domain=result.domain,
        )
    except EmailNotValidError as e:
        return EmailValidationResult(valid=False, input=raw_email, reason=str(e))


# --- Combined convenience helper ---------------------------------------------

def validate_contact(phone: str = None, email: str = None, check_email_deliverability: bool = True) -> dict:
    """
    Validate a phone/email pair in one call — handy for form submissions
    where you want a single pass/fail plus per-field detail.
    """
    result = {"valid": True, "phone": None, "email": None}

    if phone is not None:
        phone_result = validate_kenyan_phone(phone)
        result["phone"] = phone_result.to_dict()
        if not phone_result.valid:
            result["valid"] = False

    if email is not None:
        email_result = validate_real_email(email, check_deliverability=check_email_deliverability)
        result["email"] = email_result.to_dict()
        if not email_result.valid:
            result["valid"] = False

    return result


# --- Password validation ------------------------------------------------------

import re

MIN_PASSWORD_LENGTH = 8

# Anything from the standard US keyboard punctuation set counts as a symbol.
# Kept as its own constant so the rule is easy to see/adjust in one place.
_SYMBOL_PATTERN = re.compile(r"[!@#$%^&*()\-_=+\[\]{};:'\",.<>/?\\|`~]")
_LETTER_PATTERN = re.compile(r"[A-Za-z]")
_DIGIT_PATTERN = re.compile(r"[0-9]")


@dataclass
class PasswordValidationResult:
    valid: bool
    reasons: list  # every rule that failed, not just the first — lets the UI show a full checklist

    def to_dict(self) -> dict:
        return asdict(self)


def validate_password_strength(password: str) -> PasswordValidationResult:
    """
    Validate password strength. Requires ALL of:
      - at least MIN_PASSWORD_LENGTH (8) characters
      - at least one letter (a-z or A-Z)
      - at least one digit (0-9)
      - at least one symbol (punctuation — see _SYMBOL_PATTERN)

    Returns every failing rule (not just the first one hit), so a signup
    form can show a live checklist ("✓ 8+ characters, ✗ needs a symbol")
    instead of forcing the user to fix one issue at a time.
    """
    if password is None:
        password = ""

    reasons = []

    if len(password) < MIN_PASSWORD_LENGTH:
        reasons.append(f"Must be at least {MIN_PASSWORD_LENGTH} characters long.")
    if not _LETTER_PATTERN.search(password):
        reasons.append("Must contain at least one letter.")
    if not _DIGIT_PATTERN.search(password):
        reasons.append("Must contain at least one number.")
    if not _SYMBOL_PATTERN.search(password):
        reasons.append("Must contain at least one symbol (e.g. ! @ # $ % & *).")

    return PasswordValidationResult(valid=len(reasons) == 0, reasons=reasons)


if __name__ == "__main__":
    import json

    print("=== Phone validation ===")
    test_numbers = [
        "0712345678",       # valid Safaricom
        "0112345678",       # valid Safaricom (newer 011 range)
        "0733123456",       # valid Airtel
        "0771234567",       # valid Telkom
        "+254712345678",    # valid, E.164 input
        "254712345678",     # valid, no plus
        "0712 345 678",     # valid, spaced
        "0012345678",       # invalid prefix
        "071234",           # too short
        "07123456789",      # too long
        "+15551234567",     # valid number, but NOT Kenyan
        "not a number",     # garbage
        "",                 # empty
    ]
    for n in test_numbers:
        r = validate_kenyan_phone(n)
        print(f"{n!r:25} -> {r.to_dict()}")

    print("\n=== Email validation (syntax-only, no network calls) ===")
    test_emails = [
        "regina@example.com",
        "regina.dev+audit@example.co.ke",
        "not-an-email",
        "missing@domain",
        "spaces in@email.com",
        "",
    ]
    for e in test_emails:
        r = validate_real_email(e, check_deliverability=False)
        print(f"{e!r:35} -> {r.to_dict()}")

    print("\n=== Password validation ===")
    test_passwords = [
        "Passw0rd!",       # valid: 9 chars, letter+digit+symbol
        "Str0ng#Pass",      # valid
        "short1!",          # too short (7 chars)
        "alllettersnodigits!",  # missing digit
        "12345678!",        # missing letter
        "NoSymbolsHere1",    # missing symbol
        "",                  # empty
    ]
    for p in test_passwords:
        r = validate_password_strength(p)
        print(f"{p!r:25} -> {r.to_dict()}")