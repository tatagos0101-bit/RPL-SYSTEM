from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class DashboardStats(BaseModel):
    visitors_today:        int
    active_loans:          int
    overdue_count:         int
    due_soon_count:        int       # due within 3 days
    total_members:         int
    pending_registrations: int       # members with no face enrolled yet
    total_books:           int
    available_books:       int


class BorrowTrendPoint(BaseModel):
    month:  str    # e.g. "Jan 2026"
    borrows: int


class DueBookOut(BaseModel):
    transaction_id: int
    user_id:        int
    book_id:        int
    member_name:    str
    member_id:      str
    book_title:     str
    book_qr:        Optional[str]
    borrow_date:    datetime
    due_date:       datetime
    days_left:      int          # negative = overdue
    fine_amount:    Decimal
    status:         str          # "overdue" | "due-soon" | "active"


class EntryLogOut(BaseModel):
    id:          int
    member_name: Optional[str]   # None if unknown visitor
    member_id:   Optional[str]
    entry_type:  str
    granted:     bool
    is_inside:   bool = False
    note:        Optional[str]
    accessed_at: datetime          # time_in — first detection this session
    time_out:    Optional[datetime] = None  # time_out — last detection this session


class LibMemberOut(BaseModel):
    id:           int
    member_id:    str
    name:         str
    email:        Optional[str]
    phone:        Optional[str]
    email_verified: bool = False
    phone_verified: bool = False
    location:     Optional[str]
    status:       str
    face_enrolled: bool
    active_loans: int
    total_loans:  int
    joined_at:    datetime


class MemberStatusUpdate(BaseModel):
    status: str   # "active" | "suspended"


class LibMemberStats(BaseModel):
    total:     int
    active:    int
    suspended: int
    enrolled:  int   # face enrolled


class NotificationOut(BaseModel):
    id:             int
    message:        str
    type:           str
    member_name:    Optional[str]
    book_title:     Optional[str]
    reservation_id: Optional[int]
    is_read:        bool
    created_at:     datetime


class LibReservationOut(BaseModel):
    id:             int
    member_name:    str
    member_id:      str
    book_title:     str
    book_author:    str
    cover_url:      Optional[str]
    status:         str          # "pending" | "ready"
    queue_position: Optional[int]
    reserved_at:    datetime
    expires_at:     Optional[datetime]


class MemberReservationOut(BaseModel):
    id:             int
    book_id:        int
    book_title:     str
    book_author:    str
    book_qr:        Optional[str]
    cover_url:      Optional[str]
    status:         str          # "pending" | "ready"
    queue_position: Optional[int]
    reserved_at:    datetime
    expires_at:     Optional[datetime]


class MemberActiveLoanOut(BaseModel):
    transaction_id: int
    book_id:        int
    copy_id:        Optional[int] = None
    copy_qr:        Optional[str] = None
    copy_number:    Optional[int] = None
    book_title:     str
    book_author:    str
    cover_url:      Optional[str]
    borrow_date:    datetime
    due_date:       Optional[datetime]
    days_left:      int
    fine_amount:    Decimal
    status:         str   # "active" | "overdue"
