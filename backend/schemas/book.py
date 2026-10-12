import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, computed_field
from typing import Optional
from datetime import datetime

_ISBN_RE = re.compile(r"^[\d\-X]{8,20}$", re.IGNORECASE)
_URL_RE  = re.compile(r"^https?://", re.IGNORECASE)


class BookBase(BaseModel):
    title:            str
    author:           str
    category:         str
    year:             Optional[int]   = None
    isbn:             Optional[str]   = None
    copies_total:     int             = 1
    location_shelf:   Optional[str]   = None
    cover_url:        Optional[str]   = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        if len(v) > 255:
            raise ValueError("Title must be at most 255 characters")
        return v

    @field_validator("author")
    @classmethod
    def validate_author(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Author cannot be empty")
        if len(v) > 180:
            raise ValueError("Author must be at most 180 characters")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Category cannot be empty")
        if len(v) > 80:
            raise ValueError("Category must be at most 80 characters")
        return v

    @field_validator("year")
    @classmethod
    def validate_year(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if not (1000 <= v <= 2200):
            raise ValueError("Year must be between 1000 and 2200")
        return v

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if not _ISBN_RE.match(v):
            raise ValueError("ISBN must be 8-20 characters containing only digits, hyphens, or X")
        return v

    @field_validator("copies_total")
    @classmethod
    def validate_copies(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Copies must be at least 1")
        if v > 10000:
            raise ValueError("Copies cannot exceed 10,000")
        return v

    @field_validator("location_shelf")
    @classmethod
    def validate_location_shelf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 80:
            raise ValueError("Shelf location must be at most 80 characters")
        return v or None

    @field_validator("cover_url")
    @classmethod
    def validate_cover_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 500:
            raise ValueError("Cover URL must be at most 500 characters")
        # Allow relative paths starting with /uploads/ (set by the server itself)
        if not (_URL_RE.match(v) or v.startswith("/uploads/")):
            raise ValueError("Cover URL must be a valid http/https URL")
        return v


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title:            Optional[str]   = None
    author:           Optional[str]   = None
    category:         Optional[str]   = None
    year:             Optional[int]   = None
    isbn:             Optional[str]   = None
    copies_total:     Optional[int]   = None
    copies_available: Optional[int]   = None
    location_shelf:   Optional[str]   = None
    cover_url:        Optional[str]   = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        if len(v) > 255:
            raise ValueError("Title must be at most 255 characters")
        return v

    @field_validator("author")
    @classmethod
    def validate_author(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Author cannot be empty")
        if len(v) > 180:
            raise ValueError("Author must be at most 180 characters")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Category cannot be empty")
        if len(v) > 80:
            raise ValueError("Category must be at most 80 characters")
        return v

    @field_validator("year")
    @classmethod
    def validate_year(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if not (1000 <= v <= 2200):
            raise ValueError("Year must be between 1000 and 2200")
        return v

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if not _ISBN_RE.match(v):
            raise ValueError("ISBN must be 8-20 characters containing only digits, hyphens, or X")
        return v

    @field_validator("copies_total", "copies_available")
    @classmethod
    def validate_copies(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v < 0:
            raise ValueError("Copies cannot be negative")
        if v > 10000:
            raise ValueError("Copies cannot exceed 10,000")
        return v

    @field_validator("location_shelf")
    @classmethod
    def validate_location_shelf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 80:
            raise ValueError("Shelf location must be at most 80 characters")
        return v or None

    @field_validator("cover_url")
    @classmethod
    def validate_cover_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 500:
            raise ValueError("Cover URL must be at most 500 characters")
        if not (_URL_RE.match(v) or v.startswith("/uploads/")):
            raise ValueError("Cover URL must be a valid http/https URL")
        return v


class BookOut(BaseModel):
    id:               int
    title:            str
    author:           str
    category:         str
    year:             Optional[int]
    isbn:             Optional[str]
    copies_total:     int
    copies_available: int
    location_shelf:   Optional[str]
    cover_url:        Optional[str]
    qr_code:          Optional[str]
    created_at:       datetime

    @computed_field
    @property
    def availability_status(self) -> str:
        if self.copies_available == 0:
            return "Not available"
        if self.copies_available < self.copies_total:
            return "Limited"
        return "Available"

    class Config:
        from_attributes = True


class BookListResponse(BaseModel):
    total:  int
    skip:   int
    limit:  int
    items:  list[BookOut]


class BookCopyOut(BaseModel):
    id:          int
    book_id:     int
    copy_number: int
    qr_code:     str
    status:      str

    class Config:
        from_attributes = True


class BookScanOut(BaseModel):
    qr_type:    str
    book:       BookOut
    copy_info:  Optional[BookCopyOut] = Field(default=None, alias="copy")
    can_borrow: bool
    message:    str

    model_config = ConfigDict(populate_by_name=True)


class BookCopyLabelOut(BookCopyOut):
    title:          str
    author:         str
    category:       str
    location_shelf: Optional[str] = None


class BulkUploadResponse(BaseModel):
    added:    int
    skipped:  int
    errors:   list[str]
    message:  str


class InventoryStats(BaseModel):
    total_titles:     int
    total_copies:     int
    available_copies: int
    borrowed_copies:  int
    categories:       int
