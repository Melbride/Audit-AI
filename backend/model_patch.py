from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from validators import validate_kenyan_phone, validate_real_email


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

    @field_validator("phone")
    @classmethod
    def phone_must_be_valid_kenyan(cls, v):
        # Optional field — skip validation entirely if not provided
        if v is None or not v.strip():
            return v
        result = validate_kenyan_phone(v)
        if not result.valid:
            raise ValueError(f"Invalid Kenyan phone number: {result.reason}")
        # Store the normalized +254 format so downstream code never has to
        # deal with mixed formats (0712..., 254712..., +254712... etc.)
        return result.e164

    @field_validator("email")
    @classmethod
    def email_must_be_real(cls, v):
        if v is None or not v.strip():
            return v
        # check_deliverability=False: syntax + domain-format check only, no
        # live DNS lookup. Flip to True if you want to also confirm the
        # domain can actually receive mail (needs outbound network access).
        result = validate_real_email(v, check_deliverability=False)
        if not result.valid:
            raise ValueError(f"Invalid email address: {result.reason}")
        return result.normalized


# Pydantic model for creating a user
class User(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    role: Literal["Admin", "Accountant", "Auditor", "Senior Auditor", "Assistant Manager", "Audit Manager", "Engagement Partner", "Quality Reviewer"]
    assigned_client_id: Optional[int] = None
    status: Optional[str] = "Active"

    @field_validator("phone")
    @classmethod
    def phone_must_be_valid_kenyan(cls, v):
        if v is None or not v.strip():
            return v
        result = validate_kenyan_phone(v)
        if not result.valid:
            raise ValueError(f"Invalid Kenyan phone number: {result.reason}")
        return result.e164

    @field_validator("email")
    @classmethod
    def email_must_be_real(cls, v):
        result = validate_real_email(v, check_deliverability=False)
        if not result.valid:
            raise ValueError(f"Invalid email address: {result.reason}")
        return result.normalized


# Pydantic model for updating an existing user (no password field)
class UserUpdate(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    role: Literal["Admin", "Accountant", "Auditor", "Senior Auditor", "Assistant Manager", "Audit Manager", "Engagement Partner", "Quality Reviewer"]
    assigned_client_id: Optional[int] = None
    status: Optional[str] = "Active"

    @field_validator("phone")
    @classmethod
    def phone_must_be_valid_kenyan(cls, v):
        if v is None or not v.strip():
            return v
        result = validate_kenyan_phone(v)
        if not result.valid:
            raise ValueError(f"Invalid Kenyan phone number: {result.reason}")
        return result.e164

    @field_validator("email")
    @classmethod
    def email_must_be_real(cls, v):
        result = validate_real_email(v, check_deliverability=False)
        if not result.valid:
            raise ValueError(f"Invalid email address: {result.reason}")
        return result.normalized