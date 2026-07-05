from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ReservationRequest(BaseModel):
    book_id: int


class ReservationOut(BaseModel):
    id:             int
    book_id:        int
    book_title:     str
    book_author:    str
    cover_url:      Optional[str]
    status:         str
    queue_position: Optional[int]
    reserved_at:    datetime
    expires_at:     Optional[datetime]

    class Config:
        from_attributes = True
