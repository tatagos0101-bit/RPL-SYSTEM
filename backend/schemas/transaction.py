from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class BorrowRequest(BaseModel):
    user_id: int
    book_id: int
    copy_id: Optional[int] = None


class ReturnRequest(BaseModel):
    user_id: int
    book_id: int
    copy_id: Optional[int] = None


class TransactionOut(BaseModel):
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
