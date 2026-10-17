from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from typing import Optional
from datetime import datetime


class ReservationRequest(BaseModel):
    book_id: int = Field(gt=0)
    accept_queue: bool = False


class ReservationConfirmRequest(BaseModel):
    request_id: UUID
    selections: list[ReservationRequest] = Field(min_length=1, max_length=5)

    @field_validator("selections")
    @classmethod
    def distinct_books(cls, values):
        if len({item.book_id for item in values}) != len(values):
            raise ValueError("Select distinct titles")
        return values


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
