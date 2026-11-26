from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal, Optional
from datetime import datetime
from decimal import Decimal


class BorrowRequest(BaseModel):
    user_id: int
    book_id: int
    copy_id: Optional[int] = None


class ReturnRequest(BaseModel):
    inspection_confirmed: Literal[True]
    return_condition: Literal["good", "worn", "damaged", "lost"]
    inspection_reason: Literal["no_issues", "wear_and_tear", "water_damage", "torn_pages", "missing_pages", "binding_damage", "marked_pages", "reported_lost", "reported_stolen", "other"]
    inspection_notes: Optional[str] = Field(default=None, max_length=1000)
    condition_fee: Decimal = Field(default=Decimal("0"), ge=0, max_digits=8, decimal_places=2)
    transaction_id: Optional[int] = None
    user_id: int
    book_id: int
    copy_id: Optional[int] = None

    @field_validator("inspection_notes")
    @classmethod
    def clean_notes(cls, value):
        if value is not None and "\x00" in value:
            raise ValueError("Notes cannot contain null characters.")
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def validate_inspection(self):
        valid_reasons = {
            "good": {"no_issues"}, "worn": {"wear_and_tear"},
            "damaged": {"water_damage", "torn_pages", "missing_pages", "binding_damage", "marked_pages", "other"},
            "lost": {"reported_lost", "reported_stolen", "other"},
        }
        if self.inspection_reason not in valid_reasons[self.return_condition]:
            raise ValueError("Choose a remark that matches the inspected condition.")
        if self.return_condition in ("good", "worn") and self.condition_fee:
            raise ValueError("Damage/loss charges apply only to damaged or lost copies.")
        if self.inspection_reason == "other" and not (self.inspection_notes or "").strip():
            raise ValueError("Describe the damage or loss when choosing Other.")
        return self


class TransactionOut(BaseModel):
    late_fee: Optional[Decimal] = None
    condition_fee: Decimal = Decimal("0")
    return_condition: Optional[str] = None
    inspection_reason: Optional[str] = None
    inspection_notes: Optional[str] = None
    inspected_by_id: Optional[int] = None
    inspected_at: Optional[datetime] = None
    id:          int
    user_id:     int
    book_id:     int
    type:        str
    status:      str
    borrow_date: datetime
    due_date:    Optional[datetime]
    return_date: Optional[datetime]
    fine_amount: Decimal

    # Joined fields (populated manually)
    member_name: Optional[str] = None
    member_id:   Optional[str] = None
    book_title:  Optional[str] = None
    book_qr:     Optional[str] = None
    copy_id:     Optional[int] = None
    copy_qr:     Optional[str] = None
    copy_number: Optional[int] = None

    class Config:
        from_attributes = True


class LoanOut(BaseModel):
    """Active loan from the member's perspective."""
    transaction_id: int
    book_id:        int
    book_title:     str
    book_author:    str
    cover_url:      Optional[str]
    borrow_date:    datetime
    due_date:       datetime
    days_left:      int       # negative = overdue
    fine_amount:    Decimal


class FinesSummary(BaseModel):
    total_fine:    Decimal
    overdue_loans: list[LoanOut]
