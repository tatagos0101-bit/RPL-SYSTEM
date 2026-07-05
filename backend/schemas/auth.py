import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Any, Optional, Literal

_PHONE_RE = re.compile(r"^[\d\s\-\+\(\)]{7,20}$")


class LoginRequest(BaseModel):
    email:    str  # accepts email address or Member ID (e.g. RPL-K7X2M)
    password: str

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) > 128:
            raise ValueError("Password too long")
        return v


class SignupRequest(BaseModel):
    name:      str
    email:     EmailStr
    password:  str
    role:      Literal["member", "librarian"] = "member"
    phone:     Optional[str] = None
    location:  Optional[str] = None
    auth_code: Optional[str] = None  # Required when role = "librarian"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
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
        if len(v) > 200:
            raise ValueError("Location must be at most 200 characters")
        return v or None

    @field_validator("auth_code")
    @classmethod
    def validate_auth_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Auth code too long")
        return v or None


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    name:         str
    role:         str
    must_change_password: bool = False


class PasswordResetRequest(BaseModel):
    identifier: str
    channel: Optional[Literal["email", "sms"]] = None

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Email, phone, or Member ID is required")
        if len(v) > 180:
            raise ValueError("Identifier is too long")
        return v


class PasswordResetRequestResponse(BaseModel):
    success: bool
    message: str
    delivery_channel: Optional[str] = None
    requires_librarian_help: bool = False
    debug_code: Optional[str] = None


class PasswordResetConfirmRequest(BaseModel):
    identifier: str
    code: str
    new_password: str

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Email, phone, or Member ID is required")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("Reset code must be 6 digits")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("New password must be at least 6 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v


class PasswordResetConfirmResponse(BaseModel):
    success: bool
    message: str


class FaceAuthRequest(BaseModel):
    """Base64-encoded JPEG frame from the webcam."""
    image: str   # "data:image/jpeg;base64,/9j/4AAQ..."

    @field_validator("image")
    @classmethod
    def validate_image(cls, v: str) -> str:
        # Must be a data URI or raw base64; enforce size limit (~2MB base64 ≈ 1.5MB image)
        if len(v) > 2_500_000:
            raise ValueError("Image data too large (max ~2 MB)")
        if not (v.startswith("data:image/") or v.startswith("/9j/") or v[:4] in ("/9j/", "iVBO", "R0lG", "UklG")):
            # Allow data URIs (data:image/...) and common raw base64 prefixes
            # Don't be too strict — just block obviously wrong input
            if not v.replace("+", "").replace("/", "").replace("=", "").replace("\n", "").replace(" ", "").isalnum():
                raise ValueError("Invalid image format")
        return v


class FaceBox(BaseModel):
    top: float
    left: float
    width: float
    height: float


class FaceRecognitionResult(BaseModel):
    matched: bool
    user_id: Optional[int] = None
    member_id: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    engine: Optional[str] = None
    score: Optional[float] = None
    face_box: Optional[FaceBox] = None
    quality: Optional[dict[str, Any]] = None
    session_action: Optional[str] = None
    message: str = ""


class FaceAuthResponse(BaseModel):
    matched:  bool
    user_id:  Optional[int]  = None
    member_id: Optional[str] = None
    name:     Optional[str]  = None
    role:     Optional[str]  = None
    engine:   Optional[str]  = None
    score:    Optional[float] = None
    face_box: Optional[FaceBox] = None
    quality:  Optional[dict[str, Any]] = None
    faces:    list[FaceRecognitionResult] = Field(default_factory=list)
    token:    Optional[str]  = None   # JWT returned only for login flow
    message:  str = ""


class FaceLookupResponse(BaseModel):
    """Used by borrow/return modal — identifies member but does NOT issue a token."""
    matched:  bool
    user_id:  Optional[int] = None
    name:     Optional[str] = None
    member_id: Optional[str] = None   # e.g. "RPL-00042"
    active_loans: Optional[int] = None
    engine:   Optional[str] = None
    score:    Optional[float] = None
    quality:  Optional[dict[str, Any]] = None
    message:  str = ""


class EnrollFaceRequest(BaseModel):
    """Enroll or re-enroll a face for the currently authenticated user."""
    image: str   # base64 JPEG

    @field_validator("image")
    @classmethod
    def validate_image(cls, v: str) -> str:
        if len(v) > 2_500_000:
            raise ValueError("Image data too large (max ~2 MB)")
        return v
