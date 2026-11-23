from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from services.passwords import validate_login_password


class LibrarianAccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=180)
    current_password: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Enter the librarian's full name.")
        return value

    @field_validator("current_password")
    @classmethod
    def password_length(cls, value):
        return validate_login_password(value)


class LibrarianAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    member_id: str | None
    name: str
    email: str | None
    status: str
    created_at: datetime | None
    must_change_password: bool
    is_main_librarian: bool


class LibrarianAccountsPage(BaseModel):
    items: list[LibrarianAccountOut]
    total: int
    page: int
    page_size: int


class CredentialDelivery(BaseModel):
    channel: str
    status: str


class LibrarianAccountCreated(BaseModel):
    account: LibrarianAccountOut
    password_delivery: CredentialDelivery
    temporary_password: str | None
