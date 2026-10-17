import re
from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from datetime import datetime

_PHONE_RE = re.compile(r"^[\d\s\-\+\(\)]{7,20}$")


class UserProfile(BaseModel):
    id:           int
    name:         str
    email:        Optional[str] = None
    email_verified: bool = False
    role:         str
    phone:        Optional[str]
    phone_verified: bool = False
    location:     Optional[str]
    status:       str
    must_change_password: bool = False
    face_enrolled: bool
    member_since: datetime
    member_id:    Optional[str] = None
    avatar_url:   Optional[str] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name:     Optional[str] = None
    phone:    Optional[str] = None
    location: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if not _PHONE_RE.match(v):
            raise ValueError("Phone number must contain only digits, spaces, +, -, (, ) and be 7-20 characters")
        return v

    @field_validator("location")
    @classmethod
    def validate_location(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 120:
            raise ValueError("Location must be at most 120 characters")
        return v or None


class BiometricStatus(BaseModel):
    enrolled: bool
    message:  str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("New password must be at least 6 characters")
        return v


class ChangePasswordResponse(BaseModel):
    success: bool
    message: str
    id: int
    name: str
    role: Literal["member", "librarian"]
    must_change_password: bool
