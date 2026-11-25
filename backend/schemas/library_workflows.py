from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

TERMS_VERSION = "2026-11-25"
AccountReason = Literal["late_return", "damaged_book", "lost_book", "repeated_violations", "conduct", "resolved", "librarian_review", "other"]


def clean_note(value):
    if value is not None and "\x00" in value:
        raise ValueError("Notes cannot contain null characters.")
    return (value.strip() or None) if value is not None else None


class AccountActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["warning", "suspend", "blacklist", "reactivate"]
    reason: AccountReason
    notes: str | None = Field(None, max_length=1000)
    _clean_notes = field_validator("notes")(clean_note)


class ApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = Field(None, max_length=180)
    location: str = Field(min_length=1, max_length=120)
    accept_terms: Literal[True]

    @field_validator("name", "location")
    @classmethod
    def clean_text(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError("Enter a valid name and address without control characters.")
        return value


class ApplicationReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]
    identity_checked: bool = False
    reason: Literal["details_verified", "incomplete_details", "duplicate", "ineligible", "other"]
    notes: str | None = Field(None, max_length=1000)
    _clean_notes = field_validator("notes")(clean_note)


class CopyConditionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    condition: Literal["good", "worn", "damaged", "lost"]
    reason: Literal["repaired", "found", "stock_inspection", "other"]
    notes: str = Field(min_length=1, max_length=1000)

    @field_validator("notes")
    @classmethod
    def meaningful_notes(cls, value):
        if not clean_note(value):
            raise ValueError("Describe the inspection.")
        return value.strip()
